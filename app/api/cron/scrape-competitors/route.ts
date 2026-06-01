import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { persistThumbnail } from '@/lib/thumbnails';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json({ error: 'APIFY_API_TOKEN not set' }, { status: 500 });
    }

    const supabase = createAdminClient();

    // Support single handle parameter for granular control
    const { searchParams } = new URL(request.url);
    const singleHandle = searchParams.get('handle');

    let handles: string[];
    if (singleHandle) {
      handles = [singleHandle];
    } else {
      const { data: competitors } = await supabase
        .from('competitors')
        .select('instagram_handle');
      const all = (competitors || []).map((c: { instagram_handle: string }) => c.instagram_handle);
      const batch = searchParams.get('batch');
      if (batch !== null) {
        const batchNum = parseInt(batch);
        handles = all.slice(batchNum * 2, batchNum * 2 + 2);
      } else {
        handles = all;
      }
    }

    if (handles.length === 0) {
      return NextResponse.json({ success: true, inserted: 0, message: 'No handles' });
    }
    let totalInserted = 0;

    // Scrape ONE handle per Apify run. Multi-URL runs are slower per handle AND
    // drop fields like videoPlayCount ("plays"); single-handle runs (~20s each)
    // return complete, reliable data. A time budget keeps us under the platform's
    // function limit — any handles not reached this run get picked up next time.
    const BATCH = 1;
    const TIME_BUDGET_MS = 240_000;
    const startedAt = Date.now();
    const cleanHandles = handles.map(h => h.replace(/^@/, ''));
    for (let i = 0; i < cleanHandles.length; i += BATCH) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const batchUrls = cleanHandles.slice(i, i + BATCH).map(h => `https://www.instagram.com/${h}/`);
      try {
        const runRes = await fetch(
          'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=' + apifyToken,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              directUrls: batchUrls,
              resultsType: 'posts',
              resultsLimit: 15,
            }),
          }
        );
        if (!runRes.ok) continue;
        const posts = await runRes.json();
        if (!Array.isArray(posts)) continue;

        for (const post of posts) {
          // Match the existing data + the competitors join: bare username (no @).
          const ownerHandle = post.ownerUsername || '';
          const igPostId = String(post.shortCode || post.id || '');
          if (!ownerHandle || !igPostId) continue;
          const persistedThumb = await persistThumbnail(supabase, post.displayUrl || '', post.url || '');
          // Unique constraint is (handle, ig_post_id) — upsert updates existing
          // posts' metrics and inserts new ones.
          const { error } = await supabase.from('competitor_posts').upsert(
            {
              handle: ownerHandle,
              ig_post_id: igPostId,
              content: (post.caption || '').slice(0, 500),
              likes: post.likesCount || 0,
              comments: post.commentsCount || 0,
              shares: post.sharesCount || 0,
              // Prefer videoPlayCount ("plays" — the metric Instagram now shows as
              // views on reels, counts replays) over the deprecated videoViewCount.
              views: post.videoPlayCount || post.videoViewCount || 0,
              post_url: post.url || '',
              thumbnail_url: persistedThumb || post.displayUrl || '',
              posted_at: post.timestamp || null,
              media_type: post.type || null,
              video_url: post.videoUrl || null,
              scraped_at: new Date().toISOString(),
            },
            { onConflict: 'handle,ig_post_id' }
          );
          if (!error) totalInserted++;
        }
      } catch {
        // batch failed (Apify timeout/error) — continue with the next batch
      }
    }

    return NextResponse.json({ success: true, inserted: totalInserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
