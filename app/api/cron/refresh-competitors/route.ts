import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const POSTS_PER_COMPETITOR = 25;

interface BDMedia {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
  video_view_count?: number;
  username?: string;
}

interface AppUsage {
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
}

function parseAppUsage(res: Response): AppUsage {
  try {
    const header = res.headers.get('x-app-usage');
    return header ? JSON.parse(header) : {};
  } catch {
    return {};
  }
}

function maxUsage(u: AppUsage): number {
  return Math.max(u.call_count ?? 0, u.total_cputime ?? 0, u.total_time ?? 0);
}

async function fetchCompetitor(
  handle: string,
  igUserId: string,
  token: string
): Promise<{ posts: BDMedia[]; profile: { followers_count?: number; media_count?: number } | null; usage: AppUsage; error?: string }> {
  // Meta removed video_view_count from Business Discovery in 2024 for competitor privacy.
  // We get likes, comments, and post metadata — views stay frozen at last Apify value.
  const fields = `business_discovery.username(${handle}){id,username,followers_count,media_count,media.limit(${POSTS_PER_COMPETITOR}){id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp,thumbnail_url,username}}`;
  const url = `https://graph.facebook.com/v21.0/${igUserId}?fields=${encodeURIComponent(fields)}&access_token=${token}`;

  const res = await fetch(url, { cache: 'no-store' });
  const usage = parseAppUsage(res);

  if (!res.ok) {
    const body = await res.text();
    return { posts: [], profile: null, usage, error: `${res.status}: ${body.slice(0, 200)}` };
  }

  const data = await res.json();
  const bd = data?.business_discovery;
  if (!bd) return { posts: [], profile: null, usage, error: 'no business_discovery in response' };

  const posts: BDMedia[] = (bd.media?.data ?? []) as BDMedia[];
  return {
    posts,
    profile: { followers_count: bd.followers_count, media_count: bd.media_count },
    usage,
  };
}

function extractPostId(permalink: string | undefined, fallbackId: string): string {
  if (!permalink) return fallbackId;
  const m = permalink.match(/\/(?:p|reel|tv)\/([^/?]+)/);
  return m?.[1] ?? fallbackId;
}

export async function GET(request: Request) {
  // Allow either Vercel cron auth or manual trigger via ingest secret
  const authHeader = request.headers.get('authorization') ?? '';
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET ?? ''}` && !!process.env.CRON_SECRET;
  const isManual = authHeader === `Bearer ${process.env.TRENDING_INGEST_SECRET ?? ''}` && !!process.env.TRENDING_INGEST_SECRET;
  if (!isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // FB Graph API token + IG Business Account ID (different from IG_USER_ID)
  const token = process.env.FB_ACCESS_TOKEN?.trim();
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !igUserId) {
    return NextResponse.json({ error: 'FB_ACCESS_TOKEN or IG_BUSINESS_ACCOUNT_ID missing' }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { data: competitors, error: compErr } = await supabase
    .from('competitors')
    .select('instagram_handle, display_name');
  if (compErr || !competitors) {
    return NextResponse.json({ error: 'Failed to load competitors', detail: compErr?.message }, { status: 500 });
  }

  const results: {
    handle: string;
    inserted: number;
    updated: number;
    error?: string;
    usage_max?: number;
  }[] = [];

  let highestUsage = 0;

  for (const comp of competitors) {
    const handle = comp.instagram_handle?.replace(/^@/, '').trim();
    if (!handle) continue;

    // Respect X-App-Usage — pause if we're over 80%
    if (highestUsage > 80) {
      results.push({ handle, inserted: 0, updated: 0, error: 'skipped: usage over 80%' });
      continue;
    }

    const { posts, usage, error } = await fetchCompetitor(handle, igUserId, token);
    highestUsage = Math.max(highestUsage, maxUsage(usage));

    if (error) {
      results.push({ handle, inserted: 0, updated: 0, error, usage_max: maxUsage(usage) });
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    if (posts.length === 0) {
      results.push({ handle, inserted: 0, updated: 0, usage_max: maxUsage(usage) });
      continue;
    }

    // Meta removed video_view_count from Business Discovery in 2024.
    // Read existing view counts from DB so we DON'T overwrite Apify-captured views with 0.
    const postIds = posts.map((p) => extractPostId(p.permalink, p.id));
    const { data: existingViews } = await supabase
      .from('competitor_posts')
      .select('ig_post_id, views')
      .eq('handle', handle)
      .in('ig_post_id', postIds);
    const viewsByPostId = new Map<string, number>(
      (existingViews ?? []).map((r) => [r.ig_post_id as string, (r.views as number) ?? 0])
    );

    const rows = posts.map((p) => {
      const ig_post_id = extractPostId(p.permalink, p.id);
      return {
        handle,
        ig_post_id,
        content: p.caption ?? '',
        likes: p.like_count ?? 0,
        comments: p.comments_count ?? 0,
        views: viewsByPostId.get(ig_post_id) ?? 0, // preserve last-known views
        shares: 0, // not available via BD
        post_url: p.permalink ?? '',
        thumbnail_url: p.thumbnail_url ?? p.media_url ?? '',
        video_url: p.media_type === 'VIDEO' ? p.media_url ?? '' : '',
        media_type: p.media_type ?? null,
        posted_at: p.timestamp ?? null,
        scraped_at: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
      };
    });

    const { error: upsertErr, count } = await supabase
      .from('competitor_posts')
      .upsert(rows, { onConflict: 'handle,ig_post_id', count: 'exact' });

    if (upsertErr) {
      results.push({ handle, inserted: 0, updated: 0, error: `upsert: ${upsertErr.message}`, usage_max: maxUsage(usage) });
    } else {
      results.push({ handle, inserted: count ?? rows.length, updated: 0, usage_max: maxUsage(usage) });
    }

    // Soft rate limit: ~1 req/sec
    await new Promise((r) => setTimeout(r, 1000));
  }

  return NextResponse.json({
    ok: true,
    competitors_processed: results.length,
    highest_usage_pct: highestUsage,
    results,
  });
}
