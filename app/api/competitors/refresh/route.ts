import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Client-callable competitor refresh. Runs the Apify scrape server-side (which
// upserts on post_url — updating existing posts' metrics AND adding new posts
// since the last scrape) without exposing the cron secret to the browser.
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  try {
    const res = await fetch(`${origin}/api/cron/scrape-competitors`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Refresh failed' }, { status: 500 });
  }
}
