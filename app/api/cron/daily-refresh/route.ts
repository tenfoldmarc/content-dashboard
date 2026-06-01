import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  const results: Record<string, unknown> = {};

  // 1) Refresh your own IG posts
  try {
    const res = await fetch(`${origin}/api/cron/refresh-my-posts`, { headers, cache: 'no-store' });
    results.refresh_my_posts = await res.json();
  } catch (err) {
    results.refresh_my_posts = { error: err instanceof Error ? err.message : String(err) };
  }

  // 2) Scrape competitors — Mondays only (weekly deep pull, last 25 posts each)
  const isMonday = new Date().getUTCDay() === 1;
  if (isMonday) {
    try {
      const res = await fetch(`${origin}/api/cron/scrape-competitors`, { headers, cache: 'no-store' });
      results.scrape_competitors = await res.json();
    } catch (err) {
      results.scrape_competitors = { error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    results.scrape_competitors = { skipped: 'not Monday' };
  }

  return NextResponse.json({ ok: true, results });
}
