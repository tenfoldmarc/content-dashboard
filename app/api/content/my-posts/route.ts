import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('client_posts')
      .select(
        'ig_post_id, content, media_type, thumbnail_url, permalink, posted_at, likes, comments, views, shares, reach, saves, last_refreshed_at'
      )
      .order('posted_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message, posts: [] }, { status: 500 });
    }

    const posts = (data ?? []).map((row) => ({
      id: row.ig_post_id,
      caption: row.content ?? '',
      mediaType: row.media_type ?? 'IMAGE',
      mediaUrl: null,
      thumbnailUrl: row.thumbnail_url || null,
      permalink: row.permalink ?? '',
      timestamp: row.posted_at,
      likes: row.likes ?? 0,
      comments: row.comments ?? 0,
      views: row.views ?? 0,
      shares: row.shares ?? 0,
      saves: row.saves ?? 0,
      reach: row.reach ?? 0,
    }));

    // Surface the oldest last_refreshed_at so UI can show "as of X"
    const lastRefreshed = data && data.length
      ? data.map((r) => r.last_refreshed_at).filter(Boolean).sort()[0]
      : null;

    return NextResponse.json({ posts, lastRefreshed, source: 'supabase' });
  } catch (err) {
    return NextResponse.json({ error: String(err), posts: [] }, { status: 500 });
  }
}
