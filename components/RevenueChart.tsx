'use client';

import { useMemo, useState } from 'react';

interface Transaction {
  amount: number;
  created: string;
  refunded: boolean;
}

interface RevenueChartProps {
  transactions: Transaction[];
}

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

const RANGE_LABELS: Record<Exclude<RangeKey, 'custom'>, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
};

function fmtMoney(n: number, short = false) {
  if (short && n >= 1000) {
    return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayKey(dateStr: string) {
  return dateStr.slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function dateToKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function RevenueChart({ transactions }: RevenueChartProps) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Group by day
  const dailyMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.refunded) return;
      const key = getDayKey(t.created);
      map[key] = (map[key] || 0) + t.amount;
    });
    return map;
  }, [transactions]);

  // Get date range
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === 'custom' && customFrom && customTo) {
      return { startDate: new Date(customFrom + 'T00:00:00'), endDate: new Date(customTo + 'T23:59:59') };
    }

    const days: Record<Exclude<RangeKey, 'custom'>, number> = {
      today: 0,
      yesterday: 1,
      '7d': 6,
      '30d': 29,
      '90d': 89,
    };

    const r = range === 'custom' ? '30d' : range;
    const start = daysAgo(days[r]);
    const end = r === 'yesterday' ? daysAgo(0) : today;

    return { startDate: start, endDate: end };
  }, [range, customFrom, customTo]);

  // Build daily data array filling gaps
  const dailyData = useMemo(() => {
    const result: { date: string; amount: number }[] = [];
    const cursor = new Date(startDate);
    cursor.setHours(12, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(12, 0, 0, 0);

    while (cursor <= end) {
      const key = dateToKey(cursor);
      result.push({ date: key, amount: dailyMap[key] || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [dailyMap, startDate, endDate]);

  // Stats
  const stats = useMemo(() => {
    const amounts = dailyData.map(d => d.amount);
    const total = amounts.reduce((a, b) => a + b, 0);
    const avg = amounts.length > 0 ? total / amounts.length : 0;
    const highest = Math.max(0, ...amounts);
    const highestDay = dailyData.find(d => d.amount === highest);
    return { total, avg, highest, highestDay };
  }, [dailyData]);

  const maxAmount = Math.max(1, ...dailyData.map(d => d.amount));

  // Y-axis labels (5 steps)
  const yLabels = useMemo(() => {
    const steps = 5;
    const stepVal = maxAmount / steps;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round(stepVal * i));
  }, [maxAmount]);

  // X-axis: show every Nth label to avoid crowding
  const xLabelEvery = dailyData.length > 30 ? 7 : dailyData.length > 14 ? 3 : dailyData.length > 7 ? 2 : 1;

  return (
    <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-heading text-[1.4rem] tracking-[1px]">Revenue</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {(Object.keys(RANGE_LABELS) as Exclude<RangeKey, 'custom'>[]).map(key => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                range === key
                  ? 'bg-accent text-white'
                  : 'text-muted border hover:text-cream hover:border-accent'
              }`}
              style={range !== key ? { borderColor: 'var(--border)' } : {}}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
          <button
            onClick={() => setRange('custom')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              range === 'custom'
                ? 'bg-accent text-white'
                : 'text-muted border hover:text-cream hover:border-accent'
            }`}
            style={range !== 'custom' ? { borderColor: 'var(--border)' } : {}}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Custom date picker */}
      {range === 'custom' && (
        <div className="flex gap-3 mb-5 items-center">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none focus:border-accent font-mono"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <span className="text-muted text-xs">to</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none focus:border-accent font-mono"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Total Revenue</div>
          <div className="font-mono text-[1.5rem] text-cream tracking-wide">{fmtMoney(stats.total)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Avg Daily</div>
          <div className="font-mono text-[1.5rem] text-cream tracking-wide">{fmtMoney(Math.round(stats.avg))}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Highest Day</div>
          <div className="font-mono text-[1.5rem] text-cream tracking-wide">{fmtMoney(stats.highest)}</div>
          {stats.highestDay && (
            <div className="text-[.65rem] text-accent mt-0.5">{fmtDate(stats.highestDay.date)}</div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative" style={{ height: '280px' }}>
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ left: '52px', right: '8px' }}>
          {yLabels.slice().reverse().map((val, i) => (
            <div key={i} className="relative w-full" style={{ borderBottom: '1px solid var(--border)' }}>
              <span
                className="absolute text-[.6rem] font-mono text-muted"
                style={{ left: '-52px', top: '-7px', width: '44px', textAlign: 'right' }}
              >
                {fmtMoney(val, true)}
              </span>
            </div>
          ))}
        </div>

        {/* Bars */}
        <div
          className="absolute bottom-0 flex items-end gap-[2px]"
          style={{ left: '56px', right: '8px', top: '0', paddingBottom: '24px' }}
        >
          {dailyData.map((day, i) => {
            const pct = maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0;
            const isHovered = hoveredBar === i;
            const barWidth = dailyData.length > 60 ? 'calc(100% - 1px)' : undefined;
            return (
              <div
                key={day.date}
                className="relative flex-1 flex flex-col items-center justify-end"
                style={{ height: 'calc(100% - 24px)' }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div
                    className="absolute z-20 px-3 py-2 rounded-lg text-center whitespace-nowrap pointer-events-none"
                    style={{
                      bottom: `calc(${Math.max(pct, 5)}% + 12px)`,
                      background: 'rgba(15,23,42,.95)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid var(--border-hover)',
                      boxShadow: '0 8px 32px rgba(0,0,0,.5)',
                    }}
                  >
                    <div className="font-mono text-sm font-semibold text-accent">
                      {fmtMoney(day.amount)}
                    </div>
                    <div className="text-[.6rem] text-muted mt-0.5">{fmtDate(day.date)}</div>
                  </div>
                )}

                {/* Bar */}
                <div
                  className="w-full rounded-t-sm transition-all duration-200 cursor-pointer"
                  style={{
                    height: `${Math.max(pct, 1)}%`,
                    minHeight: day.amount > 0 ? '3px' : '1px',
                    maxWidth: barWidth,
                    background: isHovered
                      ? 'linear-gradient(to top, #4ADE80, rgba(74,222,128,.4))'
                      : 'linear-gradient(to top, var(--accent), rgba(34,197,94,.2))',
                    boxShadow: isHovered ? '0 0 24px rgba(34,197,94,.35)' : 'none',
                    opacity: day.amount === 0 ? 0.15 : 1,
                  }}
                />

                {/* X-axis label */}
                {i % xLabelEvery === 0 && (
                  <span
                    className="absolute text-[.55rem] font-mono text-muted whitespace-nowrap"
                    style={{ bottom: '0', transform: 'translateY(100%)' }}
                  >
                    {fmtDate(day.date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {dailyData.length === 0 && (
        <div className="text-center py-12 text-muted text-sm">
          No revenue data for this period.
        </div>
      )}
    </div>
  );
}
