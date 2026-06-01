'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import StatBox from '@/components/StatBox';
import Link from 'next/link';

interface StripeOverview {
  totalRevenue: number;
  mrr: number;
  fees: number;
  netRevenue: number;
  revenueByDay?: { date: string; amount: number }[];
}

interface AdsOverview {
  totalSpend: number;
  cpl: number;
  ctr: number;
  impressions: number;
  clicks: number;
  note?: string;
}

interface UsageData {
  totalSpend: number;
  inputTokens: number;
  outputTokens: number;
  billingPeriod: { start: string; end: string };
  note?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  assigned_to_initials?: string;
  due_date?: string;
  label?: string;
}

interface RecentCharge {
  id: string;
  amount: number;
  description: string;
  created: string;
  status: string;
  customer_email: string;
}

interface ContentQueueItem {
  id: string;
  title: string;
  status: string;
  scheduled_for: string | null;
  platforms: string[] | null;
  thumbnail_url: string | null;
}

function formatDueDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, color: 'var(--red)' };
  if (diffDays === 0) return { text: 'Today', color: 'var(--amber)' };
  if (diffDays === 1) return { text: 'Tomorrow', color: 'var(--amber)' };
  return {
    text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    color: 'var(--text-secondary)',
  };
}

function fmtCurrency(n: number) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  if (n > 0 && n < 10) return '$' + n.toFixed(2);
  return '$' + n.toFixed(0);
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Revenue area chart with grid, Y-axis, X-axis ticks, hover tooltip
function RevenueChart({
  data,
  color = 'var(--accent)',
  height = 180,
}: {
  data: { date: string; amount: number }[];
  color?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (data.length < 2) return null;

  const width = 600;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const amounts = data.map((d) => d.amount);
  const rawMax = Math.max(...amounts, 1);
  // Round up to a "nice" number for Y max
  const niceMax = niceCeil(rawMax);
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round((niceMax / yTickCount) * i)
  );

  const xFor = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const yFor = (v: number) => padT + innerH - (v / niceMax) * innerH;

  const linePath =
    'M' +
    data
      .map((d, i) => `${xFor(i).toFixed(1)},${yFor(d.amount).toFixed(1)}`)
      .join(' L');
  const areaPath = `${linePath} L${xFor(data.length - 1).toFixed(1)},${padT + innerH} L${padL},${padT + innerH} Z`;

  // X-axis ticks: ~6 evenly spaced date labels
  const xTickCount = Math.min(6, data.length);
  const xTickIndices = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i / (xTickCount - 1)) * (data.length - 1))
  );

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const relX = Math.max(0, Math.min(innerW, px - padL));
    const idx = Math.round((relX / innerW) * (data.length - 1));
    setHover(idx);
  }

  const hoverPoint = hover !== null ? data[hover] : null;

  // Percentages for HTML overlay positioning (text renders in real pixels, not scaled SVG)
  const yPct = (v: number) => (yFor(v) / height) * 100;
  const xPct = (i: number) => (xFor(i) / width) * 100;
  const leftPadPct = (padL / width) * 100;
  const rightPadPct = (padR / width) * 100;
  const bottomPadPct = (padB / height) * 100;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid lines */}
        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <line
              key={i}
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? '0' : '3 4'}
              opacity={i === 0 ? 0.6 : 0.4}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Area + line */}
        <path d={areaPath} fill="url(#revFill)" />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Hover guide line */}
        {hover !== null && hoverPoint && (
          <line
            pointerEvents="none"
            x1={xFor(hover)}
            x2={xFor(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Last-point dot (HTML so it stays round) */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: `${xPct(data.length - 1)}%`,
          top: `${yPct(data[data.length - 1].amount)}%`,
          width: 8,
          height: 8,
          background: color,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Hover dot (HTML so it stays round) */}
      {hover !== null && hoverPoint && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            left: `${xPct(hover)}%`,
            top: `${yPct(hoverPoint.amount)}%`,
            width: 10,
            height: 10,
            background: 'var(--card, #fff)',
            border: `2px solid ${color}`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Y-axis labels (HTML, crisp) */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 font-mono text-[10px] text-[var(--text-secondary,#9ca3af)]"
        style={{ width: `${leftPadPct}%` }}
      >
        {yTicks.map((v, i) => (
          <div
            key={i}
            className="absolute right-2 -translate-y-1/2 tabular-nums"
            style={{ top: `${yPct(v)}%` }}
          >
            ${formatK(v)}
          </div>
        ))}
      </div>

      {/* X-axis labels (HTML, crisp) */}
      <div
        className="pointer-events-none absolute left-0 right-0 font-mono text-[10px] text-[var(--text-secondary,#9ca3af)]"
        style={{
          bottom: 0,
          height: `${bottomPadPct}%`,
          paddingLeft: `${leftPadPct}%`,
          paddingRight: `${rightPadPct}%`,
        }}
      >
        {xTickIndices.map((idx) => {
          const label = new Date(data[idx].date + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          const relX = (idx / (data.length - 1)) * 100;
          return (
            <div
              key={idx}
              className="absolute top-1 tabular-nums whitespace-nowrap"
              style={{
                left: `${relX}%`,
                transform:
                  idx === 0
                    ? 'translateX(0)'
                    : idx === data.length - 1
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hover !== null && hoverPoint && (
        <div
          className="pointer-events-none absolute rounded-md border border-border bg-card/95 backdrop-blur px-2.5 py-1.5 text-[11px] shadow-lg z-10"
          style={{
            left: `${xPct(hover)}%`,
            top: `${yPct(hoverPoint.amount)}%`,
            transform: 'translate(-50%, calc(-100% - 12px))',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="font-mono text-cream font-semibold tabular-nums">
            ${hoverPoint.amount.toFixed(2)}
          </div>
          <div className="text-muted text-[10px] tabular-nums">
            {new Date(hoverPoint.date + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  let nice: number;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 2.5) nice = 2.5;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function formatK(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${v}`;
}

// Task completion ring
function ProgressRing({ completed, total, size = 44 }: { completed: number; total: number; size?: number }) {
  const pct = total > 0 ? completed / total : 0;
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}

const QUICK_ACTIONS = [
  { label: 'New Task', href: '/tasks', icon: 'M12 4v16m8-8H4', accent: 'var(--accent)' },
  { label: 'Schedule Post', href: '/schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', accent: 'var(--blue)' },
  { label: 'View Financials', href: '/financials', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', accent: '#22C55E' },
  { label: 'Check Email', href: 'https://mail.google.com', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', accent: 'var(--amber)', external: true },
  { label: 'Ad Dashboard', href: '/ads', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', accent: '#8B5CF6' },
  { label: 'Content Hub', href: '/content', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', accent: '#F43F5E' },
];

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  youtube: 'YT',
  facebook: 'FB',
};

export default function OverviewDataClient() {
  const [stripe, setStripe] = useState<StripeOverview | null>(null);
  const [ads, setAds] = useState<AdsOverview | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [emailCount, setEmailCount] = useState(0);
  const [ads7d, setAds7d] = useState<AdsOverview | null>(null);
  const [recentCharges, setRecentCharges] = useState<RecentCharge[]>([]);
  const [contentQueue, setContentQueue] = useState<ContentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch('/api/stripe/overview').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/ads?dateRange=today').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/usage').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/tasks').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/calendar').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/email').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/stripe/charges?limit=5').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/content/queue').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/ads?dateRange=7d').then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);

    if (results[0].status === 'fulfilled' && results[0].value) setStripe(results[0].value);
    if (results[1].status === 'fulfilled' && results[1].value) setAds(results[1].value);
    if (results[2].status === 'fulfilled' && results[2].value) setUsage(results[2].value);
    if (results[3].status === 'fulfilled' && results[3].value) setTasks(results[3].value?.tasks || []);
    if (results[4].status === 'fulfilled' && results[4].value) setEvents(results[4].value?.events || []);
    if (results[5].status === 'fulfilled' && results[5].value) setEmailCount(results[5].value?.emails?.length || 0);
    if (results[6].status === 'fulfilled' && results[6].value) setRecentCharges(results[6].value?.transactions?.slice(0, 5) || []);
    if (results[7].status === 'fulfilled' && results[7].value) setContentQueue(results[7].value?.queue?.filter((q: ContentQueueItem) => q.status === 'scheduled' || q.status === 'ready')?.slice(0, 4) || []);
    if (results[8].status === 'fulfilled' && results[8].value) setAds7d(results[8].value);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for refresh event from OverviewClient
  useEffect(() => {
    function handleRefresh() {
      loadData();
    }
    window.addEventListener('overview-refresh', handleRefresh);
    return () => window.removeEventListener('overview-refresh', handleRefresh);
  }, [loadData]);

  // Tasks due today
  const today = new Date().toISOString().slice(0, 10);
  const tasksDueToday = tasks.filter(
    (t) => t.due_date && t.due_date.slice(0, 10) === today
  );
  const myTasks = tasks.filter(
    (t) => t.assigned_to_initials === 'MC' && t.status !== 'done'
  );
  const completedToday = tasks.filter((t) => t.status === 'done').length;
  const totalTasks = tasks.length;

  // Overdue tasks
  const overdueTasks = tasks.filter((t) => {
    if (!t.due_date || t.status === 'done') return false;
    const dueDate = new Date(t.due_date + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return dueDate < now;
  });

  // Next 3 events
  const upcomingEvents = events.slice(0, 3);

  // Revenue chart data
  const revenueSeries = stripe?.revenueByDay || [];

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-card border border-border bg-card/60 h-28" />
          ))}
        </div>
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-card/60 h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-5 gap-4 animate-fade-in-up">
        <StatBox
          label="Revenue This Month"
          value={stripe ? fmtCurrency(stripe.totalRevenue) : '--'}
          change={stripe ? (stripe.netRevenue > 0 ? `$${stripe.netRevenue.toFixed(0)} net` : stripe.totalRevenue === 0 ? 'No revenue yet' : `$${stripe.netRevenue.toFixed(0)} net`) : ''}
          changeType="up"
          glow="green"
        />
        <StatBox
          label="Ad Spend Today"
          value={ads ? fmtCurrency(ads.totalSpend) : '--'}
          change={ads && ads.cpl > 0 ? `$${ads.cpl.toFixed(2)} CPL` : 'Today'}
          changeType="neutral"
          glow="amber"
        />
        <StatBox
          label="Important Emails"
          value={emailCount.toString()}
          change="Unread"
          changeType={emailCount > 5 ? 'down' : 'neutral'}
          onClick={() => window.open('https://mail.google.com', '_blank')}
        />
        <StatBox
          label="Tasks Due Today"
          value={tasksDueToday.length.toString()}
          change={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : `${tasks.filter((t) => t.status !== 'done').length} total open`}
          changeType={overdueTasks.length > 0 ? 'down' : tasksDueToday.length > 3 ? 'down' : 'neutral'}
        />
        <StatBox
          label="Events Today"
          value={upcomingEvents.length.toString()}
          change="Upcoming"
          changeType="neutral"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-6 gap-3 animate-fade-in-up-1">
        {QUICK_ACTIONS.map((action) => {
          const className = "group flex items-center gap-2.5 rounded-xl border border-border bg-card/40 backdrop-blur-sm px-4 py-3 hover:border-[var(--border-hover)] hover:bg-surface/60 transition-all cursor-pointer";
          const inner = (
            <>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ background: `${action.accent}15` }}
              >
                <svg className="w-4 h-4" style={{ color: action.accent }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                </svg>
              </div>
              <span className="text-[.75rem] font-medium text-[var(--text-secondary)] group-hover:text-cream transition-colors truncate">{action.label}</span>
            </>
          );
          return action.external ? (
            <a key={action.label} href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
              {inner}
            </a>
          ) : (
            <Link key={action.label} href={action.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Revenue Sparkline + Recent Payments */}
      <div className="grid grid-cols-5 gap-5 animate-fade-in-up-2">
        {/* Revenue chart */}
        <div className="col-span-3 rounded-card border border-border bg-card/60 backdrop-blur-xl p-6 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-heading text-[1.2rem] tracking-[1px]">REVENUE TREND</h2>
              <div className="text-[.62rem] uppercase tracking-wider text-muted mt-1">
                Last {revenueSeries.length || 0} days
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-right">
                <div className="text-[.6rem] uppercase tracking-wider text-muted">MRR</div>
                <div className="font-mono text-[1.35rem] text-cream leading-tight">
                  {stripe ? fmtCurrency(stripe.mrr) : '--'}
                </div>
                <div className="text-[.6rem] text-[var(--text-secondary)]">
                  Fees: {stripe ? `$${stripe.fees.toFixed(0)}` : '--'}
                </div>
              </div>
              <Link
                href="/financials"
                className="text-[.72rem] text-accent font-semibold hover:text-accent-hover transition-colors"
              >
                Details
              </Link>
            </div>
          </div>
          <div className="flex-1">
            {revenueSeries.length > 1 ? (
              <RevenueChart data={revenueSeries} height={200} />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[.75rem] text-muted">
                No revenue data yet
              </div>
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="col-span-2 rounded-card border border-border bg-card/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-[1.2rem] tracking-[1px]">RECENT PAYMENTS</h2>
            <Link href="/financials" className="text-[.72rem] text-accent font-semibold hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentCharges.length === 0 ? (
              <p className="text-sm text-muted py-2">No recent payments.</p>
            ) : (
              recentCharges.map((charge) => (
                <div key={charge.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${charge.status === 'succeeded' ? 'bg-accent/10' : 'bg-red/10'}`}>
                    {charge.status === 'succeeded' ? (
                      <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[.78rem] font-medium text-cream truncate">{charge.description || 'Payment'}</div>
                    <div className="text-[.62rem] text-muted">{timeAgo(charge.created)}</div>
                  </div>
                  <div className="text-[.85rem] font-mono font-semibold text-accent">
                    +${charge.amount.toFixed(0)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Events + Tasks + Task Progress */}
      <div className="grid grid-cols-12 gap-5 animate-fade-in-up-3">
        {/* Upcoming Events */}
        <div className="col-span-4 rounded-card border border-border bg-card/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-[1.2rem] tracking-[1px]">UPCOMING EVENTS</h2>
            <Link href="/calendar" className="text-[.72rem] text-accent font-semibold hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          <div className="space-y-2.5">
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted">No upcoming events.</p>
            ) : (
              upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[.82rem] font-semibold truncate">{event.title}</div>
                    <div className="text-[.68rem] text-muted">
                      {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tasks Assigned to You */}
        <div className="col-span-6 rounded-card border border-border bg-card/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-[1.2rem] tracking-[1px]">TASKS ASSIGNED TO YOU</h2>
            <Link href="/tasks" className="text-[.72rem] text-accent font-semibold hover:text-accent-hover transition-colors">
              View board
            </Link>
          </div>
          <div className="space-y-1">
            {myTasks.length === 0 ? (
              <p className="text-sm text-muted">No tasks assigned to you.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-[.68rem] text-muted uppercase tracking-wider">
                    <th className="text-left pb-2 font-medium">Task</th>
                    <th className="text-left pb-2 font-medium w-24">Status</th>
                    <th className="text-left pb-2 font-medium w-24">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {myTasks.slice(0, 8).map((task) => {
                    const statusColor =
                      task.status === 'todo'
                        ? 'text-muted'
                        : task.status === 'in_progress'
                        ? 'text-blue'
                        : task.status === 'review'
                        ? 'text-amber'
                        : 'text-accent';
                    const statusLabel =
                      task.status === 'todo'
                        ? 'To Do'
                        : task.status === 'in_progress'
                        ? 'In Progress'
                        : task.status === 'review'
                        ? 'Review'
                        : task.status;
                    return (
                      <tr key={task.id} className="border-t cursor-pointer hover:bg-surface/50 transition-colors" style={{ borderColor: 'var(--border)' }} onClick={() => window.location.href = '/tasks'}>
                        <td className="py-2 text-[.78rem]">
                          <div className="flex items-center gap-2">
                            {task.label && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  task.label === 'content'
                                    ? 'bg-accent'
                                    : task.label === 'client'
                                    ? 'bg-blue'
                                    : task.label === 'admin'
                                    ? 'bg-amber'
                                    : 'bg-muted'
                                }`}
                              />
                            )}
                            <span className="truncate">{task.title}</span>
                          </div>
                        </td>
                        <td className={`py-2 text-[.68rem] font-medium ${statusColor}`}>{statusLabel}</td>
                        <td className="py-2 text-[.68rem] font-medium" style={{ color: task.due_date ? formatDueDate(task.due_date).color : 'var(--text-secondary)' }}>
                          {task.due_date ? formatDueDate(task.due_date).text : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Task Progress */}
        <div className="col-span-2 rounded-card border border-border bg-card/60 backdrop-blur-xl p-6 flex flex-col items-center justify-center">
          <div className="text-[.65rem] uppercase tracking-wider text-muted mb-3 font-semibold">Task Progress</div>
          <ProgressRing completed={completedToday} total={totalTasks} size={72} />
          <div className="text-center mt-3">
            <div className="font-mono text-[1.2rem] text-cream">{completedToday}/{totalTasks}</div>
            <div className="text-[.6rem] text-[var(--text-secondary)] mt-0.5">tasks done</div>
          </div>
          <div className="w-full mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[.62rem]">
              <span className="text-muted">To Do</span>
              <span className="font-mono text-cream">{tasks.filter(t => t.status === 'todo').length}</span>
            </div>
            <div className="flex items-center justify-between text-[.62rem]">
              <span className="text-muted">In Progress</span>
              <span className="font-mono text-cream">{tasks.filter(t => t.status === 'in_progress').length}</span>
            </div>
            <div className="flex items-center justify-between text-[.62rem]">
              <span className="text-muted">Review</span>
              <span className="font-mono text-cream">{tasks.filter(t => t.status === 'review').length}</span>
            </div>
          </div>
          {overdueTasks.length > 0 && (
            <div className="mt-3 px-2.5 py-1 rounded-full text-[.6rem] font-bold" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>
              {overdueTasks.length} overdue
            </div>
          )}
        </div>
      </div>

      {/* Content Queue + Ad Performance */}
      <div className="grid grid-cols-2 gap-5 animate-fade-in-up-4">
        {/* Content Queue */}
        <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-[1.2rem] tracking-[1px]">CONTENT QUEUE</h2>
            <Link href="/schedule" className="text-[.72rem] text-accent font-semibold hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          <div className="space-y-2.5">
            {contentQueue.length === 0 ? (
              <p className="text-sm text-muted">No content scheduled.</p>
            ) : (
              contentQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface">
                  <div className="w-10 h-10 rounded-lg bg-[#F43F5E]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" style={{ color: '#F43F5E' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[.78rem] font-medium text-cream truncate">{item.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.scheduled_for && (
                        <span className="text-[.62rem] text-muted">
                          {new Date(item.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                      {item.platforms && item.platforms.length > 0 && (
                        <div className="flex gap-1">
                          {item.platforms.map((p) => (
                            <span key={p} className="text-[.55rem] font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                              {PLATFORM_ICONS[p] || p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`text-[.6rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    item.status === 'scheduled'
                      ? 'bg-accent/15 text-accent'
                      : 'bg-amber/15 text-amber'
                  }`}>
                    {item.status === 'scheduled' ? 'Scheduled' : 'Ready'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ad Performance Snapshot — uses 7d data */}
        <div className="rounded-card border border-border bg-card/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-[1.2rem] tracking-[1px]">AD PERFORMANCE</h2>
              <span className="text-[.55rem] font-semibold text-muted uppercase tracking-wider px-2 py-0.5 rounded-full border border-border">7 days</span>
            </div>
            <Link href="/ads" className="text-[.72rem] text-accent font-semibold hover:text-accent-hover transition-colors">
              Details
            </Link>
          </div>
          {ads7d ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl p-3 bg-surface text-center">
                  <div className="text-[.6rem] uppercase tracking-wider text-muted mb-1">Spend</div>
                  <div className="font-mono text-[1.1rem] text-cream">{fmtCurrency(ads7d.totalSpend)}</div>
                </div>
                <div className="rounded-xl p-3 bg-surface text-center">
                  <div className="text-[.6rem] uppercase tracking-wider text-muted mb-1">CPL</div>
                  <div className="font-mono text-[1.1rem] text-cream">{ads7d.cpl > 0 ? '$' + ads7d.cpl.toFixed(2) : '--'}</div>
                </div>
                <div className="rounded-xl p-3 bg-surface text-center">
                  <div className="text-[.6rem] uppercase tracking-wider text-muted mb-1">CTR</div>
                  <div className="font-mono text-[1.1rem] text-cream">{ads7d.ctr > 0 ? ads7d.ctr.toFixed(2) + '%' : '--'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3 bg-surface">
                  <div className="flex items-center justify-between">
                    <span className="text-[.65rem] uppercase tracking-wider text-muted">Impressions</span>
                    <span className="font-mono text-[.85rem] text-cream">{ads7d.impressions > 0 ? (ads7d.impressions >= 1000 ? (ads7d.impressions / 1000).toFixed(1) + 'K' : ads7d.impressions.toString()) : '--'}</span>
                  </div>
                </div>
                <div className="rounded-xl p-3 bg-surface">
                  <div className="flex items-center justify-between">
                    <span className="text-[.65rem] uppercase tracking-wider text-muted">Clicks</span>
                    <span className="font-mono text-[.85rem] text-cream">{ads7d.clicks > 0 ? ads7d.clicks.toLocaleString() : '--'}</span>
                  </div>
                </div>
              </div>
              {stripe && ads7d.totalSpend > 0 && (
                <div className="rounded-xl p-3 bg-surface flex items-center justify-between">
                  <span className="text-[.65rem] uppercase tracking-wider text-muted">Revenue vs Ad Spend</span>
                  <span className={`font-mono text-[.85rem] font-semibold ${stripe.totalRevenue > ads7d.totalSpend ? 'text-accent' : 'text-red'}`}>
                    {(stripe.totalRevenue / ads7d.totalSpend).toFixed(1)}x
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl p-3 bg-surface text-center">
                  <div className="text-[.6rem] uppercase tracking-wider text-muted mb-1">Spend</div>
                  <div className="font-mono text-[1.1rem] text-muted">--</div>
                </div>
                <div className="rounded-xl p-3 bg-surface text-center">
                  <div className="text-[.6rem] uppercase tracking-wider text-muted mb-1">CPL</div>
                  <div className="font-mono text-[1.1rem] text-muted">--</div>
                </div>
                <div className="rounded-xl p-3 bg-surface text-center">
                  <div className="text-[.6rem] uppercase tracking-wider text-muted mb-1">CTR</div>
                  <div className="font-mono text-[1.1rem] text-muted">--</div>
                </div>
              </div>
              <p className="text-[.72rem] text-muted text-center">Connect Meta Ads to see live performance</p>
            </div>
          )}
        </div>
      </div>

      {/* Claude API Usage — compact bar at bottom */}
      <a
        href="https://console.anthropic.com/settings/billing"
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-card border border-border bg-card/60 backdrop-blur-xl px-5 py-3 hover:border-[var(--border-hover)] transition-all"
      >
        <div className="flex items-center gap-4">
          <span className="text-[.72rem] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Claude API</span>
          {usage?.totalSpend ? (
            <div className="flex items-center gap-3 text-[.75rem] font-mono">
              <span className="text-cream">
                Spend: <span className="text-accent">${(usage.totalSpend).toFixed(2)}</span>
              </span>
              <span className="text-muted">|</span>
              <span className="text-cream">
                Input: <span className="text-[var(--text-secondary)]">{fmtTokens(usage.inputTokens || 0)}</span>
              </span>
              <span className="text-muted">|</span>
              <span className="text-cream">
                Output: <span className="text-[var(--text-secondary)]">{fmtTokens(usage.outputTokens || 0)}</span>
              </span>
            </div>
          ) : (
            <span className="text-[.75rem] text-[var(--text-secondary)]">Click to view usage on Anthropic Console</span>
          )}
          <span className="ml-auto text-[.68rem] text-accent font-semibold">View Billing &rarr;</span>
        </div>
      </a>
    </div>
  );
}
