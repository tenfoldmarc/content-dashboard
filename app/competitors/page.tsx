'use client';

import { useEffect, useState, useMemo } from 'react';
import PostCard from '@/components/PostCard';
import { useToast } from '@/components/ToastProvider';

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type SortKey = 'recent' | 'views' | 'likes' | 'shares';

interface CompPost {
  id: string;
  handle: string;
  instagram_handle?: string;
  content: string;
  likes: number;
  shares: number;
  views: number;
  post_url: string;
  posted_at: string;
  scraped_at: string;
  thumbnail_url: string;
}

interface CompetitorData {
  id: string;
  instagram_handle: string;
  display_name: string;
  avgViews: number;
  postsPerWeek: number;
  monthlyReach: number;
  posts: CompPost[];
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
];

export default function CompetitorsPage() {
  const { showToast } = useToast();
  const [competitors, setCompetitors] = useState<CompetitorData[]>([]);
  const [compFilter, setCompFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('views');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchCompetitors = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/content/competitors');
      const data = await res.json();
      setCompetitors(data.competitors || []);
    } catch {
      showToast('Failed to load competitors', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompetitors();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/competitors/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Refreshed — ${data.inserted ?? 0} posts updated/added`);
        await fetchCompetitors();
      } else {
        showToast(data.error || 'Refresh failed', 'error');
      }
    } catch {
      showToast('Refresh failed', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  const filteredPosts = useMemo(() => {
    let posts: CompPost[] = [];
    for (const c of competitors) {
      if (compFilter === 'all' || compFilter === c.instagram_handle) posts = posts.concat(c.posts);
    }
    return [...posts].sort((a, b) => {
      if (sort === 'views') return b.views - a.views;
      if (sort === 'likes') return b.likes - a.likes;
      if (sort === 'shares') return b.shares - a.shares;
      return new Date(b.posted_at || b.scraped_at).getTime() - new Date(a.posted_at || a.scraped_at).getTime();
    });
  }, [competitors, compFilter, sort]);

  const median = useMemo(
    () => medianOf(filteredPosts.map((p) => p.views).filter((v) => v > 0)),
    [filteredPosts]
  );
  const outlierCount = useMemo(
    () => filteredPosts.filter((p) => median > 0 && p.views >= 3 * median).length,
    [filteredPosts, median]
  );

  async function addCompetitor() {
    if (!newHandle.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/content/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: newHandle.trim().replace(/^@/, ''), displayName: newDisplayName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add competitor');
      showToast('Competitor added');
      setShowAddModal(false);
      setNewHandle('');
      setNewDisplayName('');
      await fetchCompetitors();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add competitor';
      setAddError(message);
      showToast(message, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function removeCompetitor(id: string) {
    try {
      await fetch(`/api/content/competitors?id=${id}`, { method: 'DELETE' });
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
      showToast('Competitor removed');
    } catch {
      showToast('Failed to remove', 'error');
    }
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[2.4rem] tracking-[1.5px]">Competitor Intelligence</h1>
          <p className="text-muted text-sm mt-1">{competitors.length} tracked · {outlierCount} outlier posts (3x+ their median)</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-[.78rem] font-medium text-muted hover:text-cream hover:border-accent transition-all disabled:opacity-50"
          title="Pull the latest posts from all competitors (updates performance + adds new posts)"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh posts'}
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setCompFilter('all')}
          className={`px-3.5 py-1.5 rounded-full text-[.72rem] font-medium border transition-all ${
            compFilter === 'all' ? 'bg-accent text-white border-accent' : 'border-border text-muted hover:text-cream hover:border-accent'
          }`}
        >
          All
        </button>
        {competitors.map((c) => (
          <button
            key={c.id}
            onClick={() => setCompFilter(c.instagram_handle)}
            className={`px-3.5 py-1.5 rounded-full text-[.72rem] font-medium border transition-all ${
              compFilter === c.instagram_handle ? 'bg-accent/15 text-accent border-accent' : 'border-border text-muted hover:text-cream hover:border-accent'
            }`}
          >
            @{c.instagram_handle}
          </button>
        ))}
        <button
          onClick={() => { setShowAddModal(true); setAddError(''); }}
          className="px-3.5 py-1.5 rounded-full text-[.72rem] font-medium border border-dashed border-border text-muted hover:text-accent hover:border-accent transition-all"
        >
          + Add Competitor
        </button>
      </div>

      {/* Overview cards */}
      {compFilter === 'all' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {competitors.map((c) => (
            <div key={c.id} className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-5 hover:-translate-y-0.5 hover:border-border-hover transition-all">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[.92rem] font-semibold">@{c.instagram_handle}</div>
                  {c.display_name !== c.instagram_handle && <div className="text-[.68rem] text-muted">{c.display_name}</div>}
                </div>
                <button onClick={() => removeCompetitor(c.id)} className="text-[.68rem] text-muted hover:text-red transition-colors">Remove</button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[.62rem] text-muted uppercase tracking-wider">Posts/wk</div>
                  <div className="font-mono text-[1.1rem] text-cream">{c.postsPerWeek}</div>
                </div>
                <div>
                  <div className="text-[.62rem] text-muted uppercase tracking-wider">Avg Views</div>
                  <div className="font-mono text-[1.1rem] text-cream">{fmt(c.avgViews)}</div>
                </div>
                <div>
                  <div className="text-[.62rem] text-muted uppercase tracking-wider">Mo. Reach</div>
                  <div className="font-mono text-[1.1rem] text-cream">{fmt(c.monthlyReach)}</div>
                </div>
              </div>
            </div>
          ))}
          {!loading && competitors.length === 0 && (
            <div className="col-span-full rounded-card border border-border bg-card/60 p-12 text-center">
              <p className="text-sm text-muted">No competitors yet. Click &ldquo;+ Add Competitor&rdquo; to start tracking.</p>
            </div>
          )}
        </div>
      )}

      {/* Sort + posts grid */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-[1.2rem] tracking-[1px]">{compFilter === 'all' ? 'ALL COMPETITOR POSTS' : `@${compFilter} POSTS`}</h2>
        <div className="flex gap-1.5 flex-wrap">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-3.5 py-1.5 rounded-full text-[.72rem] font-medium border transition-all ${
                sort === s.key ? 'bg-accent text-white border-accent' : 'border-border text-muted hover:text-cream hover:border-accent'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-card/60 aspect-square" />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-card border border-border bg-card/60 p-12 text-center">
          <p className="text-sm text-muted">No competitor posts found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {filteredPosts.slice(0, 60).map((post, i) => (
            <PostCard
              key={post.id}
              id={post.id}
              url={post.post_url}
              thumbnail={post.thumbnail_url}
              mediaType="VIDEO"
              views={post.views}
              likes={post.likes}
              shares={post.shares}
              handle={post.instagram_handle || post.handle}
              median={median}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-card border border-border bg-card p-6 w-full max-w-md space-y-4 animate-fade-in-scale">
            <h3 className="font-heading text-[1.2rem] tracking-[1px]">Add Competitor</h3>
            <div>
              <label className="text-[.72rem] uppercase tracking-wider text-muted block mb-1">Instagram Handle</label>
              <input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCompetitor(); }}
                placeholder="@username"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-accent"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-[.72rem] uppercase tracking-wider text-muted block mb-1">Display Name (optional)</label>
              <input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCompetitor(); }}
                placeholder="Display name"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-accent"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            {addError && <p className="text-[.75rem] text-red">{addError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowAddModal(false); setNewHandle(''); setNewDisplayName(''); setAddError(''); }}
                className="px-4 py-2 rounded-full text-[.78rem] font-medium border border-border text-muted hover:text-cream transition-all"
              >
                Cancel
              </button>
              <button
                onClick={addCompetitor}
                disabled={adding || !newHandle.trim()}
                className="px-5 py-2 rounded-full text-[.78rem] font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
