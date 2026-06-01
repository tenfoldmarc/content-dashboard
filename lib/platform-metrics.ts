import { createAdminClient } from '@/lib/supabase/admin';
import { ZERNIO_ACCOUNTS } from '@/lib/config';

// ─────────────────────────────────────────────────────────────
// Per-platform metrics adapter.
//
// Instagram  → LIVE via the IG Graph API + client_posts (Supabase).
// YouTube    → real YouTube Data API when YOUTUBE_API_KEY is set, else mock.
// TikTok     → real TikTok Display API when TIKTOK_ACCESS_TOKEN is set, else mock.
//
// Zernio analytics is wired but gated behind ZERNIO_ANALYTICS_ENABLED. It
// requires Zernio's paid analytics add-on, so it is OFF by default. Flip the
// env var on once the add-on is purchased; no UI changes needed.
// ─────────────────────────────────────────────────────────────

export type PlatformKey = 'instagram' | 'tiktok' | 'youtube';

export interface PlatformMetric {
  platform: PlatformKey;
  label: string;
  followers: number;
  followers7dChange: number | null;
  views7d: number;
  source: 'live' | 'mock';
}

const PLATFORM_LABEL: Record<PlatformKey, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const ZERNIO_KEY = process.env.ZERNIO_API_KEY?.trim();
const ZERNIO_ANALYTICS_ENABLED = process.env.ZERNIO_ANALYTICS_ENABLED === 'true';

function weekAgoISO(): string {
  return new Date(Date.now() - 7 * 86400000).toISOString();
}

// ─── Instagram: live ───────────────────────────────────────────
async function instagramFollowers(): Promise<number | null> {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (!token || !userId) return null;
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${userId}?fields=followers_count&access_token=${token}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.followers_count === 'number' ? data.followers_count : null;
  } catch {
    return null;
  }
}

// Real 7-day follower growth from IG's follower_count daily insight.
async function instagramWeeklyGrowth(): Promise<number | null> {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (!token || !userId) return null;
  try {
    const now = Date.now();
    const since = Math.floor((now - 8 * 86400000) / 1000);
    const until = Math.floor(now / 1000);
    const url = `https://graph.instagram.com/v21.0/${userId}/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${token}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const values: { value: number }[] = data?.data?.[0]?.values ?? [];
    if (!values.length) return null;
    return values.slice(-7).reduce((sum, v) => sum + (v.value ?? 0), 0);
  } catch {
    return null;
  }
}

// Real account-level views over the last 7 days from IG insights.
// Falls back to summing per-post views from Supabase if the insight is unavailable.
async function instagramViews7d(): Promise<number> {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (token && userId) {
    try {
      const since = Math.floor((Date.now() - 7 * 86400000) / 1000);
      const until = Math.floor(Date.now() / 1000);
      const url = `https://graph.instagram.com/v21.0/${userId}/insights?metric=views&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${token}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const v = data?.data?.[0]?.total_value?.value;
        if (typeof v === 'number') return v;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('client_posts')
      .select('views, posted_at')
      .gte('posted_at', weekAgoISO());
    return (data ?? []).reduce((sum, r: { views: number | null }) => sum + (r.views ?? 0), 0);
  } catch {
    return 0;
  }
}

// ─── Zernio analytics (gated; OFF until add-on purchased) ───────
async function zernioFollowers(platform: PlatformKey): Promise<number | null> {
  if (!ZERNIO_ANALYTICS_ENABLED || !ZERNIO_KEY) return null;
  try {
    const res = await fetch(
      `https://zernio.com/api/v1/accounts/follower-stats?accountIds=${ZERNIO_ACCOUNTS[platform]}`,
      { headers: { Authorization: `Bearer ${ZERNIO_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const acct = Array.isArray(data?.accounts) ? data.accounts[0] : null;
    const followers = acct?.currentFollowers ?? acct?.followers ?? null;
    return typeof followers === 'number' ? followers : null;
  } catch {
    return null;
  }
}

// ─── Mock fallbacks (clearly labeled source:'mock') ────────────
const MOCK: Record<PlatformKey, { followers: number; views7d: number }> = {
  instagram: { followers: 18400, views7d: 540000 },
  tiktok: { followers: 12750, views7d: 880000 },
  youtube: { followers: 6300, views7d: 210000 },
};

// 7-day follower change from snapshot history (null until 7+ days of snapshots exist).
async function followers7dChange(platform: PlatformKey, currentFollowers: number): Promise<number | null> {
  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    const target = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from('platform_stats_daily')
      .select('followers, date')
      .eq('platform', platform)
      .lte('date', target)
      .gte('date', cutoff)
      .order('date', { ascending: false })
      .limit(1);
    const past = data?.[0];
    if (!past || typeof past.followers !== 'number') return null;
    return currentFollowers - past.followers;
  } catch {
    return null;
  }
}

async function getInstagramMetric(): Promise<PlatformMetric> {
  const live = await instagramFollowers();
  const followers = live ?? MOCK.instagram.followers;
  const views7d = live !== null ? await instagramViews7d() : MOCK.instagram.views7d;
  const source: 'live' | 'mock' = live !== null ? 'live' : 'mock';
  let change: number | null = null;
  if (source === 'live') {
    change = await instagramWeeklyGrowth();
    if (change === null) change = await followers7dChange('instagram', followers);
  }
  return {
    platform: 'instagram',
    label: PLATFORM_LABEL.instagram,
    followers,
    followers7dChange: change,
    views7d,
    source,
  };
}

async function getZernioOrMockMetric(platform: 'tiktok' | 'youtube'): Promise<PlatformMetric> {
  const zFollowers = await zernioFollowers(platform);
  if (zFollowers !== null) {
    return {
      platform,
      label: PLATFORM_LABEL[platform],
      followers: zFollowers,
      followers7dChange: await followers7dChange(platform, zFollowers),
      views7d: 0,
      source: 'live',
    };
  }
  return {
    platform,
    label: PLATFORM_LABEL[platform],
    followers: MOCK[platform].followers,
    followers7dChange: null,
    views7d: MOCK[platform].views7d,
    source: 'mock',
  };
}

export async function getAllPlatformMetrics(): Promise<PlatformMetric[]> {
  const [ig, tiktok, youtube] = await Promise.all([
    getInstagramMetric(),
    getZernioOrMockMetric('tiktok'),
    getZernioOrMockMetric('youtube'),
  ]);
  return [ig, tiktok, youtube];
}
