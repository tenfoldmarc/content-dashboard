import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST: refresh MY Instagram posts via the IG Graph API. Returns a jobId
// immediately; the actual refresh runs in the background (waitUntil) and updates
// the refresh_jobs row, which the UI polls via /api/content/refresh-status.
//
// Competitor scraping is intentionally NOT done here — the Competitors page has
// its own Refresh button — so this stays fast and reliable.
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = createAdminClient();

  // Don't start a duplicate if one is already running.
  const { data: existing } = await supabase
    .from('refresh_jobs')
    .select('id, started_at')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const STALE_MS = 3 * 60 * 1000;
  if (existing && Date.now() - new Date(existing.started_at).getTime() < STALE_MS) {
    return NextResponse.json({ jobId: existing.id, reused: true });
  }

  const { data: job, error: insertErr } = await supabase
    .from('refresh_jobs')
    .insert({
      status: 'running',
      phase: 'my_posts',
      message: 'Refreshing your Instagram posts…',
      total_steps: 1,
      completed_steps: 0,
    })
    .select('id')
    .single();

  if (insertErr || !job) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to create job' }, { status: 500 });
  }

  const secret = process.env.TRENDING_INGEST_SECRET || process.env.CRON_SECRET || '';

  // Run the refresh in the background so the response returns immediately.
  waitUntil(
    (async () => {
      const admin = createAdminClient();
      try {
        const res = await fetch(`${origin}/api/cron/refresh-my-posts?recentDays=90`, {
          headers: { Authorization: `Bearer ${secret}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `refresh-my-posts ${res.status}`);
        await admin
          .from('refresh_jobs')
          .update({
            status: 'complete',
            phase: 'done',
            message: `Refreshed ${data.insights_refreshed ?? 0} posts`,
            completed_steps: 1,
            completed_at: new Date().toISOString(),
            metadata: { my_posts: data },
          })
          .eq('id', job.id);
      } catch (err) {
        await admin
          .from('refresh_jobs')
          .update({
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
    })()
  );

  return NextResponse.json({ jobId: job.id, reused: false });
}
