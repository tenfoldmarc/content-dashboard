'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatBox from '@/components/StatBox';
import RevenueOverview from '@/components/RevenueOverview';

interface StripeOverview {
  totalRevenue: number;
  mrr: number;
  fees: number;
  netRevenue?: number;
  revenueByDay?: { date: string; amount: number }[];
}

interface PlatformMetric {
  platform: 'instagram' | 'tiktok' | 'youtube';
  label: string;
  followers: number;
  followers7dChange: number | null;
  views7d: number;
  source: 'live' | 'mock';
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#E1306C',
  tiktok: '#00f2ea',
  youtube: '#FF0000',
};

export default function HomeMetrics() {
  const [stripe, setStripe] = useState<StripeOverview | null>(null);
  const [platforms, setPlatforms] = useState<PlatformMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/stripe/overview?days=30').then((r) => r.json()).catch(() => null),
      fetch('/api/platform-stats').then((r) => r.json()).catch(() => ({ platforms: [] })),
    ]).then(([s, p]) => {
      setStripe(s);
      setPlatforms(p?.platforms ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-7">
      {/* Revenue */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-[1.3rem] tracking-[.5px]">Business Revenue</h2>
          <Link href="/financials" className="text-[.72rem] text-accent font-semibold hover:underline">
            View details &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatBox label="Revenue (This Month)" value={loading ? '—' : money(stripe?.totalRevenue ?? 0)} glow="green" />
          <StatBox label="MRR" value={loading ? '—' : money(stripe?.mrr ?? 0)} />
          <StatBox
            label="Net (after fees)"
            value={loading ? '—' : money((stripe?.totalRevenue ?? 0) - (stripe?.fees ?? 0))}
          />
        </div>
        <div className="mt-4">
          <RevenueOverview />
        </div>
      </section>

      {/* Platform performance */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-[1.3rem] tracking-[.5px]">Last 7 Days · By Platform</h2>
          <Link href="/content" className="text-[.72rem] text-accent font-semibold hover:underline">
            Content performance &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(loading ? [] : platforms).map((p) => {
            const change = p.followers7dChange;
            return (
              <div
                key={p.platform}
                className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-5 hover:-translate-y-[3px] transition-transform"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLOR[p.platform] }} />
                    <span className="font-semibold text-[.9rem]">{p.label}</span>
                  </div>
                  {p.source === 'mock' && (
                    <span className="text-[.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber/15 text-amber border border-amber/30">
                      sample
                    </span>
                  )}
                </div>
                <div className="text-[.68rem] uppercase tracking-[1px] text-muted">Views (7d)</div>
                <div className="font-mono text-[1.8rem] tracking-[1px] text-cream leading-tight">{compact(p.views7d)}</div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <div className="text-[.62rem] uppercase tracking-[1px] text-muted">Followers</div>
                    <div className="font-mono text-[.95rem]">{compact(p.followers)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[.62rem] uppercase tracking-[1px] text-muted">7d growth</div>
                    <div
                      className={`font-mono text-[.95rem] ${
                        change === null ? 'text-muted' : change > 0 ? 'text-accent' : change < 0 ? 'text-red' : 'text-muted'
                      }`}
                    >
                      {change === null ? '—' : `${change > 0 ? '+' : ''}${compact(change)}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {loading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="rounded-card border border-border bg-card/40 p-5 h-[148px] animate-pulse" />
            ))}
        </div>
      </section>
    </div>
  );
}
