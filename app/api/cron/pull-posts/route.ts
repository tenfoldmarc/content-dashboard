import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const IG_API_BASE = 'https://graph.instagram.com';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;

  if (!accessToken || !userId) {
    return NextResponse.json({ error: 'IG credentials not set' }, { status: 500 });
  }

  try {
    // Fetch recent media
    const mediaRes = await fetch(
      `${IG_API_BASE}/${userId}/media?fields=id,caption,timestamp,media_type,thumbnail_url,media_url,permalink&limit=25&access_token=${accessToken}`
    );

    if (!mediaRes.ok) {
      const err = await mediaRes.text();
      return NextResponse.json({ error: `IG API error: ${err}` }, { status: 500 });
    }

    const { data: mediaList } = await mediaRes.json();
    const supabase = createAdminClient();
    let upserted = 0;

    for (const media of mediaList || []) {
      // Get metrics based on media type
      const isVideo = media.media_type === 'VIDEO' || media.media_type === 'REEL';
      // `impressions` deprecated Nov 2024 for non-video — rely on `reach` instead.
      const metricsField = isVideo
        ? 'reach,saved,views,shares,total_interactions'
        : 'reach,saved,shares,total_interactions';

      let likes = 0, shares = 0, views = 0;

      try {
        const insightsRes = await fetch(
          `${IG_API_BASE}/${media.id}/insights?metric=${metricsField}&access_token=${accessToken}`
        );

        if (insightsRes.ok) {
          const { data: insights } = await insightsRes.json();
          for (const metric of insights || []) {
            if (metric.name === 'total_interactions') likes = metric.values?.[0]?.value || 0;
            if (metric.name === 'shares') shares = metric.values?.[0]?.value || 0;
            if (metric.name === 'views') views = metric.values?.[0]?.value || 0;
            if (metric.name === 'reach' && !isVideo) views = metric.values?.[0]?.value || 0;
          }
        }
      } catch {
        // Skip insights for this post
      }

      // thumbnail_url for videos, media_url for images/carousels
      const thumbnail = media.thumbnail_url || media.media_url || '';

      const { error } = await supabase.from('client_posts').upsert(
        {
          ig_post_id: media.id,
          content: (media.caption || '').slice(0, 500),
          likes,
          shares,
          views,
          posted_at: media.timestamp,
          is_outlier: false,
          thumbnail_url: thumbnail,
          permalink: media.permalink || '',
        },
        { onConflict: 'ig_post_id' }
      );

      if (!error) upserted++;
    }

    // Mark outliers (posts with engagement > 2x median)
    const { data: allPosts } = await supabase
      .from('client_posts')
      .select('id, likes')
      .order('posted_at', { ascending: false })
      .limit(25);

    if (allPosts && allPosts.length > 0) {
      const sorted = [...allPosts].sort((a, b) => a.likes - b.likes);
      const median = sorted[Math.floor(sorted.length / 2)].likes;
      const threshold = median * 2;

      for (const post of allPosts) {
        await supabase
          .from('client_posts')
          .update({ is_outlier: post.likes > threshold })
          .eq('id', post.id);
      }
    }

    return NextResponse.json({ success: true, upserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
