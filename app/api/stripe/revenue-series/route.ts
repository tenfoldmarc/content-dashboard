import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Bucket = 'day' | 'week' | 'month';
const RANGES: Record<string, { days: number; bucket: Bucket }> = {
  '1W': { days: 7, bucket: 'day' },
  '1M': { days: 30, bucket: 'day' },
  '3M': { days: 90, bucket: 'week' },
  '6M': { days: 182, bucket: 'month' },
  '1Y': { days: 365, bucket: 'month' },
};

const ET = 'America/New_York';

function bucketKey(d: Date, bucket: Bucket): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (bucket === 'month') return `${y}-${m}`;
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (bucket === 'day') return `${y}-${m}-${day}`;
  // week → key by the Sunday that starts the week
  const sunday = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()));
  return `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`;
}

function labelFor(key: string, bucket: Bucket): string {
  if (bucket === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Build the full ordered list of bucket keys from start→now so the chart is continuous.
function buildBuckets(startMs: number, bucket: Bucket): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const now = new Date();
  if (bucket === 'month') {
    const cur = new Date(Date.UTC(new Date(startMs).getUTCFullYear(), new Date(startMs).getUTCMonth(), 1));
    const endK = bucketKey(now, 'month');
    while (true) {
      const k = bucketKey(cur, 'month');
      keys.push(k);
      if (k === endK) break;
      cur.setUTCMonth(cur.getUTCMonth() + 1);
      if (keys.length > 24) break;
    }
  } else {
    const step = bucket === 'week' ? 7 : 1;
    let cur = new Date(startMs);
    // align day/week
    if (bucket === 'week') cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() - cur.getUTCDay()));
    const endMs = now.getTime();
    while (cur.getTime() <= endMs) {
      const k = bucketKey(cur, bucket);
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
      cur = new Date(cur.getTime() + step * 86400000);
      if (keys.length > 400) break;
    }
  }
  return keys;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = (searchParams.get('range') || '6M').toUpperCase();
    const cfg = RANGES[range] || RANGES['6M'];

    const stripe = getStripe();
    const startMs = Date.now() - cfg.days * 86400000;
    const startTs = Math.floor(startMs / 1000);

    // Sum succeeded charges per bucket (gross revenue), paginating through Stripe.
    const totals: Record<string, number> = {};
    let startingAfter: string | undefined;
    let guard = 0;
    do {
      const page = await stripe.charges.list({
        limit: 100,
        created: { gte: startTs },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      } as never);
      for (const c of page.data) {
        if (c.status !== 'succeeded') continue;
        const key = bucketKey(new Date(c.created * 1000), cfg.bucket);
        totals[key] = (totals[key] || 0) + c.amount / 100;
      }
      startingAfter = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
      guard++;
    } while (startingAfter && guard < 20);

    const keys = buildBuckets(startMs, cfg.bucket);
    const points = keys.map((k, i) => {
      const value = Math.round((totals[k] || 0) * 100) / 100;
      const prev = i > 0 ? (totals[keys[i - 1]] || 0) : 0;
      const changePct = prev > 0 ? Math.round(((value - prev) / prev) * 1000) / 10 : null;
      return { key: k, label: labelFor(k, cfg.bucket), value, changePct };
    });

    const total = Math.round(points.reduce((s, p) => s + p.value, 0) * 100) / 100;
    const nonZero = points.filter((p) => p.value > 0);
    const avg = nonZero.length ? Math.round((total / nonZero.length) * 100) / 100 : 0;
    // Growth: first vs last bucket that actually had revenue, so a trailing
    // incomplete period (e.g. the current month at $0 so far) doesn't read -100%.
    const firstVal = nonZero[0]?.value ?? 0;
    const lastVal = nonZero[nonZero.length - 1]?.value ?? 0;
    const growthPct = firstVal > 0 && nonZero.length > 1 ? Math.round(((lastVal - firstVal) / firstVal) * 1000) / 10 : null;

    return NextResponse.json({ range, bucket: cfg.bucket, points, total, avg, growthPct, tz: ET });
  } catch (err) {
    return NextResponse.json({ points: [], total: 0, avg: 0, growthPct: null, error: String(err) }, { status: 500 });
  }
}
