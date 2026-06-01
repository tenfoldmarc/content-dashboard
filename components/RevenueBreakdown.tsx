'use client';

import { useMemo, useState } from 'react';

interface Transaction {
  amount: number;
  description: string;
  refunded: boolean;
}

interface RevenueBreakdownProps {
  transactions: Transaction[];
}

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function RevenueBreakdown({ transactions }: RevenueBreakdownProps) {
  const [showAll, setShowAll] = useState(false);

  const sources = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    transactions.forEach(t => {
      if (t.refunded) return;
      const desc = t.description?.trim() || 'Other';
      if (!map[desc]) map[desc] = { total: 0, count: 0 };
      map[desc].total += t.amount;
      map[desc].count += 1;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  const maxTotal = sources.length > 0 ? sources[0].total : 1;
  const grandTotal = sources.reduce((s, src) => s + src.total, 0);
  const visible = showAll ? sources : sources.slice(0, 6);

  // Color palette for bars
  const barColors = [
    'var(--accent)',
    'var(--blue)',
    'var(--cyan)',
    'var(--amber)',
    'var(--violet)',
    'var(--rose)',
  ];

  return (
    <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-heading text-[1.4rem] tracking-[1px]">Revenue by Source</h2>
        <span className="text-xs text-muted font-mono">{sources.length} sources</span>
      </div>

      {sources.length === 0 ? (
        <div className="text-center py-8 text-muted text-sm">No revenue data available.</div>
      ) : (
        <div className="space-y-3">
          {visible.map((src, i) => {
            const pct = maxTotal > 0 ? (src.total / maxTotal) * 100 : 0;
            const sharePct = grandTotal > 0 ? ((src.total / grandTotal) * 100).toFixed(1) : '0';
            const color = barColors[i % barColors.length];

            return (
              <div key={src.name} className="group">
                {/* Label row */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-sm truncate" title={src.name}>{src.name}</span>
                    <span className="text-[.65rem] text-muted shrink-0">{src.count} txn{src.count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-[.68rem] text-muted font-mono">{sharePct}%</span>
                    <span className="font-mono text-sm font-semibold text-cream">{fmtMoney(src.total)}</span>
                  </div>
                </div>

                {/* Bar */}
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500 group-hover:brightness-125"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${color}, ${color}88)`,
                      boxShadow: `0 0 12px ${color}30`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sources.length > 6 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-xs text-accent hover:text-accent-hover transition-colors font-medium"
        >
          {showAll ? 'Show less' : `Show all ${sources.length} sources`}
        </button>
      )}
    </div>
  );
}
