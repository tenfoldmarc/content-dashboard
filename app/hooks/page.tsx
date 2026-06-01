'use client';

import { useEffect, useState, useMemo } from 'react';

type Tab = 'templates' | 'hooks' | 'competitors';
type SortKey = 'views' | 'outlier_ratio' | 'recent';
type HookTypeFilter = 'all' | string;

interface HookTemplate {
  id: string;
  template: string;
  example_hook: string;
  example_handle: string;
  views: number;
  score: number;
  on_screen_text_example: string | null;
  hook_type: string | null;
  source_post_url: string | null;
  outlier_ratio: number | null;
}

interface PostHook {
  id: string;
  post_url: string;
  handle: string;
  is_own: boolean;
  hook_text: string;
  on_screen_text: string | null;
  template: string | null;
  hook_type: string | null;
  why_it_works: string | null;
  content_angle: string | null;
  views: number;
  likes: number;
  shares: number;
  outlier_ratio: number | null;
  is_favorite: boolean;
  posted_at: string | null;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function HookTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const colors: Record<string, string> = {
    'Replace + Kill Claim': 'bg-red-500/15 text-red-400 border-red-500/20',
    'Tool Discovery': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    'Viewer Callout': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    'Contrarian': 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    'Framework': 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    'Listicle': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    'Speed Tutorial': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    'Comparison': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    'POV/Meme': 'bg-gray-500/15 text-gray-400 border-gray-500/20',
    'Controversy/News': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
    'Fear/Warning': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  };
  const style = Object.entries(colors).find(([k]) => type.includes(k))?.[1] || 'bg-accent/10 text-accent border-accent/20';
  return (
    <span className={`px-2 py-0.5 rounded-full text-[.62rem] font-medium border ${style}`}>
      {type}
    </span>
  );
}

function OutlierBadge({ ratio }: { ratio: number | null }) {
  if (!ratio || ratio < 5) return null;
  const intensity = ratio >= 50 ? 'text-red-400' : ratio >= 20 ? 'text-amber-400' : ratio >= 10 ? 'text-blue-400' : 'text-[var(--text-secondary)]';
  return (
    <span className={`font-mono text-[.72rem] font-bold ${intensity}`}>
      {ratio.toFixed(1)}x
    </span>
  );
}

export default function HooksPage() {
  const [tab, setTab] = useState<Tab>('templates');
  const [templates, setTemplates] = useState<HookTemplate[]>([]);
  const [hooks, setHooks] = useState<PostHook[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [typeFilter, setTypeFilter] = useState<HookTypeFilter>('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showOwnOnly, setShowOwnOnly] = useState(false);
  const [expandedHook, setExpandedHook] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/hooks')
      .then(r => r.json())
      .then(d => {
        setTemplates(d.templates || []);
        setHooks(d.hooks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Unique hook types for filter
  const hookTypes = useMemo(() => {
    const types = new Set<string>();
    hooks.forEach(h => { if (h.hook_type) types.add(h.hook_type); });
    return Array.from(types).sort();
  }, [hooks]);

  // Filtered & sorted hooks
  const filteredHooks = useMemo(() => {
    let filtered = [...hooks];
    if (typeFilter !== 'all') filtered = filtered.filter(h => h.hook_type?.includes(typeFilter));
    if (showFavoritesOnly) filtered = filtered.filter(h => h.is_favorite);
    if (showOwnOnly) filtered = filtered.filter(h => h.is_own);

    filtered.sort((a, b) => {
      if (sortKey === 'views') return b.views - a.views;
      if (sortKey === 'outlier_ratio') return (b.outlier_ratio || 0) - (a.outlier_ratio || 0);
      if (sortKey === 'recent') return new Date(b.posted_at || 0).getTime() - new Date(a.posted_at || 0).getTime();
      return 0;
    });
    return filtered;
  }, [hooks, typeFilter, showFavoritesOnly, showOwnOnly, sortKey]);

  // Stats
  const totalHooks = hooks.length;
  const totalTemplates = templates.length;
  const ownHooks = hooks.filter(h => h.is_own).length;
  const favorites = hooks.filter(h => h.is_favorite).length;
  const avgOutlier = hooks.filter(h => h.outlier_ratio).reduce((sum, h) => sum + (h.outlier_ratio || 0), 0) / (hooks.filter(h => h.outlier_ratio).length || 1);

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-[.82rem] text-muted">Loading hook intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-[1.8rem] font-bold tracking-tight">Hook Intelligence</h1>
        <p className="text-[.82rem] text-muted mt-1">Proven viral hooks from your niche — templatized and ready to use</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total Hooks', value: totalHooks, accent: false },
          { label: 'Templates', value: totalTemplates, accent: false },
          { label: 'Your Hooks', value: ownHooks, accent: true },
          { label: 'Favorites', value: favorites, accent: false },
          { label: 'Avg Outlier', value: avgOutlier.toFixed(1) + 'x', accent: false },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-[.68rem] text-muted uppercase tracking-wider">{s.label}</p>
            <p className={`text-[1.4rem] font-bold mt-1 ${s.accent ? 'text-accent' : 'text-[var(--text-primary)]'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-card/60 border border-border mb-6 w-fit">
        {(['templates', 'hooks', 'competitors'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-[.78rem] font-medium transition-all ${
              tab === t
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-[var(--text-primary)]'
            }`}
          >
            {t === 'templates' ? 'Templates' : t === 'hooks' ? 'All Hooks' : 'By Creator'}
          </button>
        ))}
      </div>

      {/* Templates Tab */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {templates.sort((a, b) => b.views - a.views).map((t, i) => (
            <div key={t.id} className="p-5 rounded-xl border border-border bg-card/70 hover:border-[var(--border-hover)] transition-all group">
              <div className="flex items-start gap-4">
                <span className="text-accent font-bold text-[1.1rem] min-w-[28px] font-mono">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[.95rem] font-semibold text-[var(--text-primary)] leading-relaxed font-mono">
                    {t.template}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <HookTypeBadge type={t.hook_type} />
                    {t.outlier_ratio && <OutlierBadge ratio={t.outlier_ratio} />}
                    <span className="text-[.68rem] text-muted">{fmt(t.views)} views</span>
                  </div>
                  <p className="text-[.72rem] text-[var(--text-secondary)] mt-2">
                    &ldquo;{t.example_hook}&rdquo; — <span className="text-accent">@{t.example_handle}</span>
                  </p>
                  {t.on_screen_text_example && (
                    <p className="text-[.68rem] text-muted mt-1">
                      On-screen: <span className="text-[var(--text-secondary)]">&ldquo;{t.on_screen_text_example}&rdquo;</span>
                    </p>
                  )}
                  {t.source_post_url && (
                    <a
                      href={t.source_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-[.65rem] text-accent/70 hover:text-accent transition-colors"
                    >
                      View original post &rarr;
                    </a>
                  )}
                </div>
                <button
                  onClick={() => copyText(t.template, t.id)}
                  className="px-3 py-1.5 rounded-lg border border-border text-[.68rem] text-muted hover:border-accent hover:text-accent transition-all whitespace-nowrap opacity-0 group-hover:opacity-100"
                >
                  {copiedId === t.id ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hooks Tab */}
      {tab === 'hooks' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-1 p-0.5 rounded-lg bg-card/60 border border-border">
              {(['views', 'outlier_ratio', 'recent'] as SortKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSortKey(s)}
                  className={`px-3 py-1.5 rounded-md text-[.68rem] font-medium transition-all ${
                    sortKey === s ? 'bg-accent/15 text-accent' : 'text-muted hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s === 'views' ? 'Views' : s === 'outlier_ratio' ? 'Outlier Ratio' : 'Recent'}
                </button>
              ))}
            </div>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-[.72rem] text-[var(--text-primary)] outline-none"
            >
              <option value="all">All Types</option>
              {hookTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-3 py-1.5 rounded-lg border text-[.68rem] font-medium transition-all ${
                showFavoritesOnly ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-border text-muted hover:text-[var(--text-primary)]'
              }`}
            >
              ⭐ Favorites
            </button>

            <button
              onClick={() => setShowOwnOnly(!showOwnOnly)}
              className={`px-3 py-1.5 rounded-lg border text-[.68rem] font-medium transition-all ${
                showOwnOnly ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-muted hover:text-[var(--text-primary)]'
              }`}
            >
              Mine Only
            </button>

            <span className="text-[.68rem] text-muted ml-auto">{filteredHooks.length} hooks</span>
          </div>

          {/* Hook Cards */}
          <div className="space-y-2">
            {filteredHooks.map(h => {
              const isExpanded = expandedHook === h.id;
              return (
                <div
                  key={h.id}
                  className={`rounded-xl border bg-card/70 transition-all cursor-pointer ${
                    h.is_favorite ? 'border-amber-500/20' : 'border-border'
                  } hover:border-[var(--border-hover)]`}
                  onClick={() => setExpandedHook(isExpanded ? null : h.id)}
                >
                  {/* Compact row */}
                  <div className="p-4 flex items-center gap-3">
                    {h.is_favorite && <span className="text-amber-400 text-[.75rem]">⭐</span>}
                    {h.is_own && (
                      <span className="px-1.5 py-0.5 rounded text-[.58rem] font-bold bg-accent/15 text-accent border border-accent/20">YOU</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[.82rem] text-[var(--text-primary)] truncate">
                        &ldquo;{h.hook_text}&rdquo;
                      </p>
                    </div>
                    <span className="text-[.68rem] text-accent">@{h.handle}</span>
                    <span className="text-[.72rem] font-mono text-[var(--text-secondary)] min-w-[50px] text-right">{fmt(h.views)}</span>
                    <OutlierBadge ratio={h.outlier_ratio} />
                    <HookTypeBadge type={h.hook_type} />
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/50 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        {/* Left column */}
                        <div className="space-y-3">
                          {h.on_screen_text && (
                            <div>
                              <p className="text-[.62rem] uppercase tracking-wider text-muted mb-1">On-Screen Text</p>
                              <p className="text-[.82rem] text-[var(--text-primary)] font-medium">&ldquo;{h.on_screen_text}&rdquo;</p>
                            </div>
                          )}
                          {h.template && (
                            <div>
                              <p className="text-[.62rem] uppercase tracking-wider text-muted mb-1">Template</p>
                              <div className="flex items-center gap-2">
                                <p className="text-[.78rem] text-accent font-mono">{h.template}</p>
                                <button
                                  onClick={e => { e.stopPropagation(); copyText(h.template!, h.id); }}
                                  className="px-2 py-0.5 rounded border border-border text-[.6rem] text-muted hover:text-accent hover:border-accent transition-all"
                                >
                                  {copiedId === h.id ? '✓' : 'Copy'}
                                </button>
                              </div>
                            </div>
                          )}
                          {h.content_angle && (
                            <div>
                              <p className="text-[.62rem] uppercase tracking-wider text-muted mb-1">Content Angle</p>
                              <p className="text-[.75rem] text-[var(--text-secondary)]">{h.content_angle}</p>
                            </div>
                          )}
                        </div>
                        {/* Right column */}
                        <div className="space-y-3">
                          {h.why_it_works && (
                            <div>
                              <p className="text-[.62rem] uppercase tracking-wider text-muted mb-1">Why It Works</p>
                              <p className="text-[.75rem] text-[var(--text-secondary)] italic">{h.why_it_works}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-[.62rem] uppercase tracking-wider text-muted">Views</p>
                              <p className="text-[.9rem] font-bold text-[var(--text-primary)]">{h.views.toLocaleString()}</p>
                            </div>
                            {h.outlier_ratio && (
                              <div>
                                <p className="text-[.62rem] uppercase tracking-wider text-muted">Outlier</p>
                                <p className="text-[.9rem] font-bold text-accent">{h.outlier_ratio.toFixed(1)}x</p>
                              </div>
                            )}
                            {h.posted_at && (
                              <div>
                                <p className="text-[.62rem] uppercase tracking-wider text-muted">Posted</p>
                                <p className="text-[.78rem] text-[var(--text-secondary)]">{timeAgo(h.posted_at)}</p>
                              </div>
                            )}
                          </div>
                          <a
                            href={h.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[.68rem] text-accent/70 hover:text-accent transition-colors"
                          >
                            View on Instagram &rarr;
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competitors Tab */}
      {tab === 'competitors' && (
        <div className="space-y-6">
          {(() => {
            const byCreator = hooks.reduce((acc, h) => {
              const key = h.handle;
              if (!acc[key]) acc[key] = { handle: key, hooks: [], totalViews: 0, maxOutlier: 0, is_own: h.is_own };
              acc[key].hooks.push(h);
              acc[key].totalViews += h.views;
              if (h.outlier_ratio && h.outlier_ratio > acc[key].maxOutlier) acc[key].maxOutlier = h.outlier_ratio;
              return acc;
            }, {} as Record<string, { handle: string; hooks: PostHook[]; totalViews: number; maxOutlier: number; is_own: boolean }>);

            return Object.values(byCreator)
              .sort((a, b) => b.totalViews - a.totalViews)
              .map(creator => (
                <div key={creator.handle} className="rounded-xl border border-border bg-card/60 overflow-hidden">
                  <div className="p-4 flex items-center gap-3 border-b border-border/50">
                    {creator.is_own && (
                      <span className="px-1.5 py-0.5 rounded text-[.58rem] font-bold bg-accent/15 text-accent border border-accent/20">YOU</span>
                    )}
                    <span className="text-accent font-semibold text-[.9rem]">@{creator.handle}</span>
                    <span className="text-[.68rem] text-muted">{creator.hooks.length} hooks</span>
                    <span className="text-[.68rem] text-[var(--text-secondary)]">{fmt(creator.totalViews)} total views</span>
                    {creator.maxOutlier > 0 && (
                      <span className="text-[.68rem] text-muted ml-auto">Best: <OutlierBadge ratio={creator.maxOutlier} /></span>
                    )}
                  </div>
                  <div className="divide-y divide-border/30">
                    {creator.hooks.sort((a, b) => b.views - a.views).slice(0, 5).map(h => (
                      <div key={h.id} className="px-4 py-3 flex items-center gap-3 hover:bg-card/90 transition-colors">
                        {h.is_favorite && <span className="text-[.7rem]">⭐</span>}
                        <p className="flex-1 text-[.78rem] text-[var(--text-primary)] truncate">&ldquo;{h.hook_text}&rdquo;</p>
                        <span className="text-[.68rem] font-mono text-[var(--text-secondary)]">{fmt(h.views)}</span>
                        <OutlierBadge ratio={h.outlier_ratio} />
                        <HookTypeBadge type={h.hook_type} />
                        <a
                          href={h.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[.6rem] text-accent/50 hover:text-accent"
                        >
                          ↗
                        </a>
                      </div>
                    ))}
                    {creator.hooks.length > 5 && (
                      <div className="px-4 py-2 text-center">
                        <span className="text-[.65rem] text-muted">+{creator.hooks.length - 5} more hooks</span>
                      </div>
                    )}
                  </div>
                </div>
              ));
          })()}
        </div>
      )}
    </div>
  );
}
