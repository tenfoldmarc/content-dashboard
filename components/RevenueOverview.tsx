'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Point { key: string; label: string; value: number; changePct: number | null; }
interface Series { range: string; bucket: string; points: Point[]; total: number; avg: number; growthPct: number | null; }

const RANGES = ['1W', '1M', '3M', '6M', '1Y'] as const;
type Range = (typeof RANGES)[number];

function money(n: number, compact = true): string {
  if (compact) {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return '$' + Math.round(n).toLocaleString('en-US');
}

function niceMax(max: number): number {
  if (max <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function RevenueOverview() {
  const [range, setRange] = useState<Range>('6M');
  const [data, setData] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/stripe/revenue-series?range=${range}`)
      .then(r => r.json())
      .then(d => { if (active) { setData(d); setHover(null); } })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  // viewBox geometry. The viewBox is wide so SVG text (sized in viewBox units)
  // renders small and crisp rather than scaling up on wide screens.
  const W = 1280, H = 320;
  const padL = 58, padR = 22, padT = 22, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const geo = useMemo(() => {
    const pts = data?.points ?? [];
    const max = niceMax(Math.max(...pts.map(p => p.value), 1));
    const n = pts.length;
    const xy = pts.map((p, i) => ({
      x: padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW),
      y: padT + plotH - (p.value / max) * plotH,
    }));
    return { pts, max, xy };
  }, [data, plotW, plotH]);

  const linePath = useMemo(() => smoothPath(geo.xy), [geo.xy]);
  const areaPath = useMemo(() => {
    if (!geo.xy.length) return '';
    const base = padT + plotH;
    return `${smoothPath(geo.xy)} L ${geo.xy[geo.xy.length - 1].x} ${base} L ${geo.xy[0].x} ${base} Z`;
  }, [geo.xy, plotH]);

  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 4; i++) ticks.push({ v: (geo.max / 4) * i, y: padT + plotH - (i / 4) * plotH });
    return ticks;
  }, [geo.max, plotH]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || geo.pts.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const rel = (x - padL) / plotW;
    const idx = Math.max(0, Math.min(geo.pts.length - 1, Math.round(rel * (geo.pts.length - 1))));
    setHover(idx);
  }

  function exportCsv() {
    if (!data) return;
    const rows = [['Period', 'Revenue', 'Change %'], ...data.points.map(p => [p.label, p.value.toString(), p.changePct ?? ''])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `revenue-${range}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const hoverPt = hover != null ? geo.pts[hover] : null;
  const hoverXY = hover != null ? geo.xy[hover] : null;
  const labelEvery = Math.ceil(geo.pts.length / 8);

  return (
    <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6 animate-fade-in">
      {/* Header — sized to match other card titles */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-heading text-[1.05rem] tracking-[.5px] text-cream">Revenue Overview</h2>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface border border-border">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 rounded-md text-[.64rem] font-semibold transition-all ${
                  range === r ? 'bg-accent text-white' : 'text-muted hover:text-cream'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1 rounded-md text-[.64rem] font-medium text-muted hover:text-cream transition-all">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            Export
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {loading ? (
          <div className="h-[240px] flex items-center justify-center text-muted text-sm">Loading revenue…</div>
        ) : geo.pts.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-muted text-sm">No revenue in this range.</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.1" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* gridlines + Y labels */}
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="var(--border)" strokeWidth="1" />
                <text x={padL - 10} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{money(t.v)}</text>
              </g>
            ))}

            {/* X labels */}
            {geo.pts.map((p, i) => (i % labelEvery === 0 || i === geo.pts.length - 1) && (
              <text key={i} x={geo.xy[i].x} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{p.label}</text>
            ))}

            {/* area + line */}
            <path d={areaPath} fill="url(#revFill)" />
            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* hover */}
            {hoverXY && (
              <>
                <line x1={hoverXY.x} y1={padT} x2={hoverXY.x} y2={padT + plotH} stroke="var(--border-hover)" strokeWidth="1" />
                <circle cx={hoverXY.x} cy={hoverXY.y} r="5" fill="var(--accent)" stroke="var(--card)" strokeWidth="3" />
              </>
            )}
          </svg>
        )}

        {/* Tooltip — theme-aware */}
        {hoverPt && hoverXY && !loading && (
          <div
            className="absolute pointer-events-none rounded-xl px-3 py-2 shadow-2xl"
            style={{
              left: `${(hoverXY.x / W) * 100}%`,
              top: `${(hoverXY.y / H) * 100}%`,
              transform: `translate(-50%, calc(-100% - 12px))`,
              minWidth: 132,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="text-[.62rem] font-medium" style={{ color: 'var(--text-secondary)' }}>{hoverPt.label}</div>
            <div className="text-[.8rem] font-bold">{money(hoverPt.value, false)}</div>
            {hoverPt.changePct != null && (
              <div className="text-[.62rem] font-semibold" style={{ color: hoverPt.changePct >= 0 ? 'var(--green, #3ecf8e)' : 'var(--red)' }}>
                {hoverPt.changePct >= 0 ? '+' : ''}{hoverPt.changePct}% vs prev
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stat pills */}
      <div className="flex items-center justify-center gap-2.5 mt-4 flex-wrap">
        {[
          { label: 'Total', node: <span className="text-[.78rem] font-bold text-cream">{money(data?.total ?? 0)}</span> },
          {
            label: 'Growth',
            node: (
              <span className="text-[.78rem] font-bold flex items-center gap-1" style={{ color: (data?.growthPct ?? 0) >= 0 ? 'var(--green, #3ecf8e)' : 'var(--red)' }}>
                {data?.growthPct == null ? '—' : `${data.growthPct >= 0 ? '+' : ''}${data.growthPct}%`}
              </span>
            ),
          },
          { label: 'Avg', node: <span className="text-[.78rem] font-bold text-cream">{money(data?.avg ?? 0)}</span> },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface/40">
            <span className="text-[.62rem] text-muted">{s.label}</span>
            {s.node}
          </div>
        ))}
      </div>
    </div>
  );
}
