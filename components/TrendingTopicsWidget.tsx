'use client';

import { useEffect, useState } from 'react';

interface XPost {
  author: string;
  handle: string;
  text: string;
  views: number;
  url: string;
}
interface HNStory {
  title: string;
  score: number;
  comments: number;
  url: string;
  age: string;
}
interface ClaudeTrend {
  text: string;
  source: string;
  url: string;
}
interface Brief {
  brief_date: string;
  takeaway: string;
  x_posts: XPost[];
  hn_stories: HNStory[];
  claude_trending: ClaudeTrend[];
  created_at: string;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

export default function TrendingTopicsWidget() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trending-topics/latest')
      .then(r => r.json())
      .then(d => { setBrief(d.brief); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-7 animate-pulse">
        <div className="h-8 w-48 bg-border rounded mb-6" />
        <div className="h-24 bg-border/50 rounded-xl mb-7" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="h-64 bg-border/30 rounded-xl" />
          <div className="h-64 bg-border/30 rounded-xl" />
          <div className="h-64 bg-border/30 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="bg-card border border-border rounded-2xl p-7">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-violet grid place-items-center">
            <svg className="w-[18px] h-[18px] stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>
          </div>
          <h2 className="font-heading text-[1.4rem] font-semibold tracking-[.3px] text-cream">Trending Topics</h2>
        </div>
        <p className="text-muted text-sm">No brief yet — first one arrives tomorrow at 7:00 AM EDT.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-7 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-60" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-violet grid place-items-center shadow-[0_4px_20px_var(--accent-glow)]">
            <svg className="w-[18px] h-[18px] stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>
          </div>
          <h2 className="font-heading text-[1.4rem] font-semibold tracking-[.3px] text-cream">Trending Topics</h2>
        </div>
        <div className="flex items-center gap-2.5 text-[.72rem] text-muted font-mono tracking-[.5px]">
          <span className="w-[6px] h-[6px] rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981] animate-live-pulse" />
          <span>{formatDate(brief.brief_date)} · 7:00 AM EDT</span>
        </div>
      </div>

      {/* Takeaway */}
      <div className="bg-gradient-to-br from-accent/[.08] to-violet/[.04] border border-accent/20 rounded-xl px-[22px] py-5 mb-7">
        <div className="font-mono text-[.65rem] font-semibold tracking-[1.2px] text-accent uppercase mb-2.5">
          What matters most for your audience today
        </div>
        <p className="text-[1.02rem] leading-[1.55] text-cream">{brief.takeaway}</p>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* X Posts */}
        <section className="bg-surface border border-border rounded-xl p-[18px]">
          <div className="flex items-center gap-2 mb-3.5 pb-3 border-b border-border">
            <div className="w-[22px] h-[22px] rounded-md bg-black text-white border border-[#333] grid place-items-center text-[.7rem] font-bold">𝕏</div>
            <h3 className="font-heading text-[.82rem] font-semibold tracking-[.3px] uppercase text-[var(--text-secondary)]">Top X Posts</h3>
            <span className="ml-auto font-mono text-[.62rem] px-2 py-0.5 bg-card border border-border rounded text-muted">{brief.x_posts.length}</span>
          </div>
          {brief.x_posts.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noreferrer" className="block -mx-2 px-2 py-3 border-b border-border last:border-0 rounded-md hover:bg-card-hover transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[.78rem] font-semibold text-cream truncate">{p.author} <span className="text-muted font-normal">@{p.handle}</span></span>
                <span className="font-mono text-[.68rem] text-accent font-medium flex-shrink-0">{formatNum(p.views)}</span>
              </div>
              <div className="text-[.82rem] leading-[1.45] text-[var(--text-secondary)] line-clamp-3">{p.text}</div>
            </a>
          ))}
        </section>

        {/* HN */}
        <section className="bg-surface border border-border rounded-xl p-[18px]">
          <div className="flex items-center gap-2 mb-3.5 pb-3 border-b border-border">
            <div className="w-[22px] h-[22px] rounded-md bg-[#FF6600] text-white grid place-items-center text-[.7rem] font-bold">Y</div>
            <h3 className="font-heading text-[.82rem] font-semibold tracking-[.3px] uppercase text-[var(--text-secondary)]">HN Viral</h3>
            <span className="ml-auto font-mono text-[.62rem] px-2 py-0.5 bg-card border border-border rounded text-muted">{brief.hn_stories.length}</span>
          </div>
          {brief.hn_stories.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block -mx-2 px-2 py-2.5 border-b border-border last:border-0 rounded-md hover:bg-card-hover transition-colors">
              <div className="text-[.85rem] text-cream font-medium mb-1 leading-[1.35]">{s.title}</div>
              <div className="font-mono text-[.66rem] text-muted flex gap-2.5">
                <span className="text-amber font-semibold">▲ {s.score.toLocaleString()}</span>
                <span>{s.comments} comments</span>
                <span>{s.age}</span>
              </div>
            </a>
          ))}
        </section>

        {/* Claude trending */}
        <section className="bg-surface border border-border rounded-xl p-[18px]">
          <div className="flex items-center gap-2 mb-3.5 pb-3 border-b border-border">
            <div className="w-[22px] h-[22px] rounded-md bg-[#D97706] text-white grid place-items-center text-[.7rem] font-bold">C</div>
            <h3 className="font-heading text-[.82rem] font-semibold tracking-[.3px] uppercase text-[var(--text-secondary)]">Claude Trending</h3>
            <span className="ml-auto font-mono text-[.62rem] px-2 py-0.5 bg-card border border-border rounded text-muted">{brief.claude_trending.length}</span>
          </div>
          {brief.claude_trending.map((t, i) => (
            <div key={i} className="flex gap-2.5 -mx-2 px-2 py-2.5 border-b border-border last:border-0">
              <span className="font-mono text-[.72rem] text-accent font-semibold flex-shrink-0 pt-px">{String(i + 1).padStart(2, '0')}</span>
              <div className="text-[.82rem] leading-[1.45] text-[var(--text-secondary)]">
                {t.text}{' '}
                <a href={t.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">↗ {t.source}</a>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
