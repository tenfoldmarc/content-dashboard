import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Age-tiered refresh windows (in days). Posts are refreshed if their
// last_refreshed_at is older than the interval for their age bucket.
const REFRESH_TIERS = [
  { maxAgeDays: 7, refreshEveryDays: 1 },      // <7d: daily
  { maxAgeDays: 30, refreshEveryDays: 3 },     // 7-30d: every 3 days
  { maxAgeDays: 90, refreshEveryDays: 7 },     // 30-90d: weekly
  { maxAgeDays: Infinity, refreshEveryDays: 30 }, // >90d: monthly
];

interface IGMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

interface IGInsightValue { value: number }
interface IGInsight { name: string; values: IGInsightValue[] }

interface AppUsage { call_count?: number; total_cputime?: number; total_time?: number }

function parseAppUsage(res: Response): AppUsage {
  try {
    const h = res.headers.get('x-app-usage');
    return h ? JSON.parse(h) : {};
  } catch {
    return {};
  }
}
function maxUsage(u: AppUsage): number {
  return Math.max(u.call_count ?? 0, u.total_cputime ?? 0, u.total_time ?? 0);
}

function shouldRefresh(postedAt: string | null, lastRefreshedAt: string | null): boolean {
  if (!lastRefreshedAt) return true;
  const now = Date.now();
  const ageDays = postedAt ? (now - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24) : 0;
  const sinceRefresh = (now - new Date(lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24);
  const tier = REFRESH_TIERS.find((t) => ageDays <= t.maxAgeDays) ?? REFRESH_TIERS[REFRESH_TIERS.length - 1];
  return sinceRefresh >= tier.refreshEveryDays;
}

async function fetchAllMedia(userId: string, token: string, fullBackfill: boolean): Promise<IGMedia[]> {
  const all: IGMedia[] = [];
  let url: string | null = `https://graph.instagram.com/v21.0/${userId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=100&access_token=${token}`;
  let pages = 0;
  const maxPages = fullBackfill ? 50 : 5; // 5000 or 500 posts

  while (url && pages < maxPages) {
    const res: Response = await fetch(url, { cache: 'no-store' });
    if (!res.ok) break;
    const json = await res.json();
    all.push(...(json.data || []));
    url = json.paging?.next ?? null;
    pages++;
  }
  return all;
}

async function fetchInsightsOne(
  media: { id: string; media_type: string },
  token: string
): Promise<{ rec: { views: number; reach: number; shares: number; saves: number } | null; usage: AppUsage }> {
  const isVideo = media.media_type === 'VIDEO' || media.media_type === 'REEL';
  const metrics = isVideo ? 'reach,saved,views,shares' : 'reach,saved,shares';
  const url = `https://graph.instagram.com/v21.0/${media.id}/insights?metric=${metrics}&access_token=${token}`;
  const res = await fetch(url, { cache: 'no-store' });
  const usage = parseAppUsage(res);
  if (!res.ok) return { rec: null, usage };

  const data = (await res.json()) as { data?: IGInsight[] };
  const rec = { views: 0, reach: 0, shares: 0, saves: 0 };
  for (const ins of data.data ?? []) {
    const v = ins.values?.[0]?.value ?? 0;
    if (ins.name === 'views') rec.views = v;
    else if (ins.name === 'shares') rec.shares = v;
    else if (ins.name === 'saved') rec.saves = v;
    else if (ins.name === 'reach') rec.reach = v;
  }
  if (!isVideo && rec.views === 0) rec.views = rec.reach;
  return { rec, usage };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET ?? ''}` && !!process.env.CRON_SECRET;
  const isManual = authHeader === `Bearer ${process.env.TRENDING_INGEST_SECRET ?? ''}` && !!process.env.TRENDING_INGEST_SECRET;
  if (!isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.IG_ACCESS_TOKEN?.trim();
  const userId = process.env.IG_USER_ID?.trim();
  if (!token || !userId) {
    return NextResponse.json({ error: 'IG credentials missing' }, { status: 500 });
  }

  const url = new URL(request.url);
  const fullBackfill = url.searchParams.get('backfill') === '1';
  const force = url.searchParams.get('force') === '1';
  // recentDays=N force-refreshes insights for posts newer than N days (used by the
  // manual "Refresh" button so recent posts always get fresh views/reach/saves).
  const recentDays = parseInt(url.searchParams.get('recentDays') || '0', 10) || 0;

  const supabase = createAdminClient();

  // 1) Pull metadata for all posts (cheap — 1 call per 100 posts, all fields inline)
  const allMedia = await fetchAllMedia(userId, token, fullBackfill);

  // 2) UPSERT metadata (caption, thumbnail, likes, comments) for every post
  //    likes/comments come free with the media endpoint — no insights call needed.
  const metaRows = allMedia.map((m) => ({
    ig_post_id: m.id,
    content: m.caption ?? '',
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
    media_type: m.media_type ?? null,
    permalink: m.permalink ?? '',
    thumbnail_url: m.thumbnail_url ?? m.media_url ?? '',
    posted_at: m.timestamp ?? null,
  }));

  if (metaRows.length > 0) {
    const { error: metaErr } = await supabase
      .from('client_posts')
      .upsert(metaRows, { onConflict: 'ig_post_id' });
    if (metaErr) {
      return NextResponse.json({ error: `meta upsert: ${metaErr.message}` }, { status: 500 });
    }
  }

  // 3) Decide which posts need insights refresh (age-tiered)
  const { data: existing } = await supabase
    .from('client_posts')
    .select('ig_post_id, media_type, posted_at, last_refreshed_at');

  const refreshMap = new Map<string, { postedAt: string | null; lastRefreshedAt: string | null; mediaType: string | null }>();
  for (const row of existing ?? []) {
    refreshMap.set(row.ig_post_id, {
      postedAt: row.posted_at,
      lastRefreshedAt: row.last_refreshed_at,
      mediaType: row.media_type,
    });
  }

  const toRefresh = allMedia.filter((m) => {
    if (force || fullBackfill) return true;
    if (recentDays > 0 && m.timestamp) {
      const ageDays = (Date.now() - new Date(m.timestamp).getTime()) / 86400000;
      if (ageDays <= recentDays) return true;
    }
    const existing = refreshMap.get(m.id);
    if (!existing) return true;
    return shouldRefresh(existing.postedAt, existing.lastRefreshedAt);
  });

  // 4) Fetch insights sequentially with X-App-Usage monitoring.
  // IG Graph API does not support Meta's batch endpoint — calls must be one-at-a-time.
  // Parallelize with a small concurrency to keep wall-clock time reasonable.
  const CONCURRENCY = 5;
  const PACE_MS = 200;
  const refreshedRows: { ig_post_id: string; views: number; reach: number; shares: number; saves: number; last_refreshed_at: string }[] = [];
  let highestUsage = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < toRefresh.length; i += CONCURRENCY) {
    if (highestUsage > 80) break; // stop burning requests; resume on next run

    const chunk = toRefresh.slice(i, i + CONCURRENCY).map((m) => ({
      id: m.id,
      media_type: m.media_type ?? 'IMAGE',
    }));

    const results = await Promise.all(chunk.map((m) => fetchInsightsOne(m, token)));
    const now = new Date().toISOString();

    for (let j = 0; j < results.length; j++) {
      const { rec, usage } = results[j];
      highestUsage = Math.max(highestUsage, maxUsage(usage));
      if (!rec) { failed++; continue; }
      succeeded++;
      refreshedRows.push({
        ig_post_id: chunk[j].id,
        views: rec.views,
        reach: rec.reach,
        shares: rec.shares,
        saves: rec.saves,
        last_refreshed_at: now,
      });
    }

    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  // 5) UPSERT the refreshed insight values
  if (refreshedRows.length > 0) {
    const { error: insErr } = await supabase
      .from('client_posts')
      .upsert(refreshedRows, { onConflict: 'ig_post_id' });
    if (insErr) {
      return NextResponse.json({ error: `insights upsert: ${insErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    full_backfill: fullBackfill,
    posts_found: allMedia.length,
    meta_upserted: metaRows.length,
    insights_refreshed: refreshedRows.length,
    insights_queued: toRefresh.length,
    succeeded,
    failed,
    highest_usage_pct: highestUsage,
    stopped_early: highestUsage > 80,
  });
}
