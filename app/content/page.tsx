'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import StatBox from '@/components/StatBox';
import PostCard from '@/components/PostCard';
import RefreshProgress, { startRefresh } from '@/components/RefreshProgress';
import { useToast } from '@/components/ToastProvider';

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Round a value up to a clean axis maximum (e.g. 714 → 800) for readable ticks.
function niceCeil(n: number): number {
  if (n <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (n <= s * pow) return s * pow;
  }
  return 10 * pow;
}

type SortKey = 'recent' | 'views' | 'likes' | 'shares' | 'saves';

interface IGPost {
  id: string;
  caption: string;
  mediaType: string;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  views: number;
  shares: number;
  saves: number;
  reach: number;
}

interface FollowerData {
  current: number;
  daily: { date: string; count: number }[];
  weeklyGrowth: number;
  monthlyGrowth: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
];

const GRID_SIZE = 50;

export default function ContentPage() {
  const [sort, setSort] = useState<SortKey>('recent');
  const { showToast } = useToast();

  const [myPosts, setMyPosts] = useState<IGPost[]>([]);
  const [followers, setFollowers] = useState<FollowerData | null>(null);
  const [myLoading, setMyLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const fetchMyContent = async () => {
    setMyLoading(true);
    try {
      const [postsData, followerData] = await Promise.all([
        fetch('/api/content/my-posts?limit=500').then((r) => r.json()),
        fetch('/api/content/followers').then((r) => r.json()),
      ]);
      setMyPosts(postsData.posts || []);
      setLastRefreshed(postsData.lastRefreshed ?? null);
      if (followerData.current !== undefined) setFollowers(followerData);
    } catch {
      showToast('Failed to load Instagram data', 'error');
    } finally {
      setMyLoading(false);
    }
  };

  const formatLastRefreshed = (iso: string | null): string => {
    if (!iso) return 'never';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  useEffect(() => {
    fetchMyContent();
  }, []);

  // The 50 most recent posts WITH view data form the grid; the freshest posts can
  // lag a day before Instagram reports views, so we skip 0-view rows to keep the
  // grid, averages, and outlier math meaningful.
  const recent50 = useMemo(() => {
    return [...myPosts]
      .filter((p) => p.views > 0)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, GRID_SIZE);
  }, [myPosts]);

  // Outlier baseline = median views across the recent set being viewed, so a "3x
  // outlier" means 3x the typical views of your recent posts (the standouts).
  const gridMedian = useMemo(
    () => medianOf(recent50.map((p) => p.views).filter((v) => v > 0)),
    [recent50]
  );

  const gridPosts = useMemo(() => {
    return [...recent50].sort((a, b) => {
      if (sort === 'views') return b.views - a.views;
      if (sort === 'likes') return b.likes - a.likes;
      if (sort === 'shares') return b.shares - a.shares;
      if (sort === 'saves') return b.saves - a.saves;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [recent50, sort]);

  const outlierCount = useMemo(
    () => recent50.filter((p) => gridMedian > 0 && p.views >= 3 * gridMedian).length,
    [recent50, gridMedian]
  );

  // Aggregate metrics across the recent 50 (all the IG Graph API metrics we pull).
  const agg = useMemo(() => {
    const n = recent50.length || 1;
    const sum = (k: keyof IGPost) => recent50.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    return {
      totalViews: sum('views'),
      avgViews: Math.round(sum('views') / n),
      avgReach: Math.round(sum('reach') / n),
      avgLikes: Math.round(sum('likes') / n),
      avgComments: Math.round(sum('comments') / n),
      avgShares: Math.round(sum('shares') / n),
      avgSaves: Math.round(sum('saves') / n),
    };
  }, [recent50]);

  const chartData = useMemo(() => (followers?.daily ?? []).slice(-30), [followers]);
  const chartMax = useMemo(() => {
    if (!chartData.length) return 100;
    const max = Math.max(...chartData.map((d) => d.count));
    return max > 0 ? max : 100;
  }, [chartData]);

  // Cumulative follower total per day: the daily array holds net change per day,
  // so we walk backwards from the current total to reconstruct the running total
  // at the end of each day (what the hover tooltip shows).
  const chartPoints = useMemo(() => {
    if (!followers || !chartData.length) return [] as { date: string; count: number; total: number }[];
    const pts = chartData.map((d) => ({ date: d.date, count: d.count, total: 0 }));
    let running = followers.current;
    for (let i = pts.length - 1; i >= 0; i--) {
      pts[i].total = running;
      running -= pts[i].count;
    }
    return pts;
  }, [chartData, followers]);

  // Y-axis scale (rounded for clean tick labels) + average daily gain for the month.
  const axisMax = useMemo(() => niceCeil(chartMax), [chartMax]);
  const avgDaily = useMemo(() => {
    if (!chartPoints.length) return 0;
    return Math.round(chartPoints.reduce((s, p) => s + p.count, 0) / chartPoints.length);
  }, [chartPoints]);
  const yTicks = useMemo(() => [4, 3, 2, 1, 0].map((i) => Math.round((axisMax / 4) * i)), [axisMax]);

  const [refreshing, setRefreshing] = useState(false);
  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await startRefresh();
      if (!result) {
        showToast('Failed to start refresh', 'error');
        return;
      }
      showToast(result.reused ? 'A refresh is already in progress' : 'Refresh started', result.reused ? 'info' : 'success');
    } finally {
      setTimeout(() => setRefreshing(false), 1500);
    }
  }
  const handleRefreshComplete = useCallback(() => {
    fetchMyContent();
  }, []);

  return (
    <div className="space-y-7 animate-fade-in">
      <RefreshProgress onComplete={handleRefreshComplete} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[2.4rem] tracking-[1.5px]">Content Performance</h1>
          <p className="text-muted text-sm mt-1">Your last {GRID_SIZE} Instagram posts · {outlierCount} are 3x+ outliers</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-[.78rem] font-medium text-muted hover:text-cream hover:border-accent transition-all disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox
          label="Followers"
          value={followers ? fmt(followers.current) : '--'}
          change={followers ? `+${fmt(followers.weeklyGrowth)} this week` : 'Loading...'}
          changeType="up"
          glow="green"
        />
        <StatBox label="Monthly Growth" value={followers ? `+${fmt(followers.monthlyGrowth)}` : '--'} change="Last 30 days" changeType="up" />
        <StatBox label="Avg Views" value={fmt(agg.avgViews)} change={`${recent50.length} posts`} changeType="neutral" />
        <StatBox label="3x+ Outliers" value={String(outlierCount)} change="vs median views" changeType={outlierCount > 0 ? 'up' : 'neutral'} glow={outlierCount > 0 ? 'amber' : undefined} />
      </div>

      {/* Full IG metric breakdown */}
      <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-5">
        <div className="text-[.7rem] uppercase tracking-[1px] text-muted mb-3">All Metrics · avg per post (last {GRID_SIZE})</div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {[
            { l: 'Views', v: agg.avgViews },
            { l: 'Reach', v: agg.avgReach },
            { l: 'Likes', v: agg.avgLikes },
            { l: 'Comments', v: agg.avgComments },
            { l: 'Shares', v: agg.avgShares },
            { l: 'Saves', v: agg.avgSaves },
          ].map((m) => (
            <div key={m.l}>
              <div className="text-[.62rem] uppercase tracking-[1px] text-muted">{m.l}</div>
              <div className="font-mono text-[1.25rem] text-cream">{fmt(m.v)}</div>
            </div>
          ))}
        </div>
        <div className="text-[.62rem] text-muted mt-3">Total views across last {GRID_SIZE}: <span className="font-mono text-cream">{fmt(agg.totalViews)}</span></div>
      </div>

      {/* Follower growth chart */}
      {chartPoints.length > 0 && followers && (
        <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="font-heading text-[1.3rem] tracking-[.5px]">Follower Growth</h2>
              <p className="text-[.7rem] text-muted mt-0.5">Daily net new followers · last 30 days</p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[1.3rem] text-cream leading-none">{followers.current.toLocaleString()}</div>
              <div className="text-[.62rem] text-accent font-semibold mt-1">+{fmt(followers.monthlyGrowth)} this month</div>
            </div>
          </div>

          <div className="flex gap-2.5">
            {/* Left Y-axis — approximate daily followers gained */}
            <div className="flex-shrink-0 w-9 relative h-44">
              {yTicks.map((t, i) => (
                <div
                  key={i}
                  className="absolute right-0 -translate-y-1/2 text-[.55rem] font-mono text-muted leading-none"
                  style={{ top: `${(i / (yTicks.length - 1)) * 100}%` }}
                >
                  {fmt(t)}
                </div>
              ))}
            </div>

            {/* Bars + gridlines */}
            <div className="flex-1">
              <div className="relative">
                {/* gridlines */}
                <div className="absolute inset-x-0 top-0 h-44 pointer-events-none">
                  {yTicks.map((t, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-border/40" style={{ top: `${(i / (yTicks.length - 1)) * 100}%` }} />
                  ))}
                  {/* monthly average line */}
                  {avgDaily > 0 && (
                    <div className="absolute inset-x-0" style={{ top: `${(1 - avgDaily / axisMax) * 100}%` }}>
                      <div className="border-t border-dashed border-accent/70" />
                      <span className="absolute right-0 -top-[7px] text-[.55rem] font-bold text-accent bg-card px-1 rounded leading-none">
                        avg +{avgDaily.toLocaleString()}/day
                      </span>
                    </div>
                  )}
                </div>

                {/* bar columns */}
                <div className="flex items-stretch gap-[3px] relative">
                  {chartPoints.map((p, i) => {
                    const d = new Date(p.date + 'T00:00:00');
                    const day = d.getDate();
                    const isMonthStart = day === 1 || i === 0;
                    const label = isMonthStart ? d.toLocaleDateString('en-US', { month: 'short' }) : String(day);
                    const h = Math.max((p.count / axisMax) * 100, 2);
                    return (
                      <div key={p.date} className="flex-1 group relative flex flex-col">
                        {/* bar */}
                        <div className="h-44 flex items-end">
                          <div
                            className="w-full rounded-t-[5px] transition-all duration-150 group-hover:brightness-110"
                            style={{
                              height: `${h}%`,
                              minHeight: 2,
                              background: p.count > 0
                                ? 'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 40%, transparent))'
                                : 'var(--border)',
                            }}
                          />
                        </div>
                        {/* date label under each bar */}
                        <div
                          className={`mt-2 text-center text-[.55rem] font-mono leading-none transition-colors group-hover:text-cream ${
                            isMonthStart ? 'text-accent font-bold' : 'text-muted'
                          }`}
                        >
                          {label}
                        </div>

                        {/* Hover tooltip — cumulative follower count for that day */}
                        <div
                          className={`absolute bottom-full ${i > chartPoints.length - 5 ? 'right-0' : i < 4 ? 'left-0' : 'left-1/2 -translate-x-1/2'} mb-2 hidden group-hover:block z-20 pointer-events-none`}
                        >
                          <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-2xl whitespace-nowrap text-center">
                            <div className="font-mono text-[1.05rem] text-cream font-bold leading-none">{p.total.toLocaleString()}</div>
                            <div className="text-[.55rem] uppercase tracking-wider text-muted mt-0.5">followers</div>
                            <div className={`text-[.66rem] font-semibold mt-1 ${p.count > 0 ? 'text-accent' : p.count < 0 ? 'text-red' : 'text-muted'}`}>
                              {p.count > 0 ? '+' : ''}{p.count.toLocaleString()} that day
                            </div>
                            <div className="text-[.58rem] text-muted mt-0.5">
                              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sort + grid */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-[1.2rem] tracking-[1px]">YOUR POSTS</h2>
          <span className="font-mono text-[.62rem] uppercase tracking-[1.2px] text-muted">Updated {formatLastRefreshed(lastRefreshed)}</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-3.5 py-1.5 rounded-full text-[.72rem] font-medium border transition-all cursor-pointer ${
                sort === s.key ? 'bg-accent text-white border-accent' : 'border-border text-muted hover:text-cream hover:border-accent'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {myLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-card/60 aspect-square" />
          ))}
        </div>
      ) : gridPosts.length === 0 ? (
        <div className="rounded-card border border-border bg-card/60 p-12 text-center">
          <p className="text-sm text-muted">No posts loaded yet. Check your Instagram token, then hit Refresh.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {gridPosts.map((post, i) => (
            <PostCard
              key={post.id}
              id={post.id}
              url={post.permalink}
              thumbnail={post.thumbnailUrl}
              mediaType={post.mediaType}
              views={post.views}
              likes={post.likes}
              comments={post.comments}
              shares={post.shares}
              saves={post.saves}
              median={gridMedian}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
