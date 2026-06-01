'use client';

import { useEffect, useState } from 'react';

interface XPost {
  author: string;
  handle: string;
  text: string;
  views: number;
  likes: number;
  url: string;
}
interface HNStory {
  title: string;
  score: number;
  comments: number;
  url: string;
  hn_url: string;
}
interface Repo {
  name: string;
  description: string;
  stars: number;
  language: string | null;
  url: string;
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function TrendingNow() {
  const [data, setData] = useState<{ x_posts: XPost[]; hn_stories: HNStory[]; github_repos: Repo[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trending/live')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ x_posts: [], hn_stories: [], github_repos: [] }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-heading text-[1.3rem] tracking-[.5px]">What&apos;s Trending in AI</h2>
          <p className="text-muted text-[.78rem] mt-0.5">Live from X, Hacker News, and GitHub</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20">
          <span className="w-[6px] h-[6px] rounded-full bg-accent animate-live-pulse" />
          <span className="text-[.6rem] font-semibold text-accent tracking-[.5px]">LIVE</span>
        </span>
      </div>

      {loading ? (
        <div className="text-muted text-sm py-8 text-center">Loading trends…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* X / Twitter */}
          <div>
            <div className="text-[.7rem] uppercase tracking-[1px] text-muted mb-3 font-semibold">X · Claude / OpenAI</div>
            <div className="space-y-2.5">
              {(data?.x_posts ?? []).slice(0, 5).map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                   className="block p-3 rounded-lg border border-border bg-surface/40 hover:border-accent/40 transition-colors">
                  <div className="text-[.7rem] text-accent font-semibold mb-1">@{p.handle}</div>
                  <p className="text-[.78rem] leading-snug line-clamp-3">{p.text}</p>
                  <div className="text-[.65rem] text-muted mt-1.5">{compact(p.views)} views · {compact(p.likes)} likes</div>
                </a>
              ))}
              {(!data?.x_posts || data.x_posts.length === 0) && (
                <div className="text-muted text-[.75rem] py-3">No X posts available.</div>
              )}
            </div>
          </div>

          {/* Hacker News */}
          <div>
            <div className="text-[.7rem] uppercase tracking-[1px] text-muted mb-3 font-semibold">Hacker News</div>
            <div className="space-y-2.5">
              {(data?.hn_stories ?? []).slice(0, 6).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                   className="block p-3 rounded-lg border border-border bg-surface/40 hover:border-accent/40 transition-colors">
                  <p className="text-[.78rem] leading-snug line-clamp-2">{s.title}</p>
                  <div className="text-[.65rem] text-muted mt-1.5">{s.score} pts · {s.comments} comments</div>
                </a>
              ))}
              {(!data?.hn_stories || data.hn_stories.length === 0) && (
                <div className="text-muted text-[.75rem] py-3">No stories available.</div>
              )}
            </div>
          </div>

          {/* GitHub */}
          <div>
            <div className="text-[.7rem] uppercase tracking-[1px] text-muted mb-3 font-semibold">GitHub · Trending Repos</div>
            <div className="space-y-2.5">
              {(data?.github_repos ?? []).slice(0, 6).map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                   className="block p-3 rounded-lg border border-border bg-surface/40 hover:border-accent/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[.78rem] font-semibold truncate">{r.name}</span>
                    <span className="text-[.65rem] text-amber whitespace-nowrap">★ {compact(r.stars)}</span>
                  </div>
                  {r.description && <p className="text-[.72rem] text-muted leading-snug line-clamp-2 mt-1">{r.description}</p>}
                  {r.language && <div className="text-[.62rem] text-muted mt-1">{r.language}</div>}
                </a>
              ))}
              {(!data?.github_repos || data.github_repos.length === 0) && (
                <div className="text-muted text-[.75rem] py-3">No repos available.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
