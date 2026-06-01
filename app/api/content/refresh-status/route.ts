import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Vercel function maxDuration is 300s. If a job sits in "running" past that
// (plus a buffer for clock skew + final DB write), the worker definitely died
// silently. Mark it failed so polling clients get a definitive answer.
const STALE_THRESHOLD_MS = 6 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('refresh_jobs')
    .select('id, status, phase, message, completed_steps, total_steps, started_at, completed_at, error')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'job not found' }, { status: 404 });

  // Auto-fail stale jobs so the UI doesn't spin forever
  if (data.status === 'running') {
    const ageMs = Date.now() - new Date(data.started_at).getTime();
    if (ageMs > STALE_THRESHOLD_MS) {
      const errMsg = `Worker timed out after ${Math.round(ageMs / 1000)}s (Vercel max is 300s). Data may be partially refreshed — try again.`;
      const completedAt = new Date().toISOString();
      await supabase
        .from('refresh_jobs')
        .update({ status: 'failed', error: errMsg, completed_at: completedAt })
        .eq('id', id)
        .eq('status', 'running'); // race-safe: only update if still running
      return NextResponse.json({
        job: { ...data, status: 'failed', error: errMsg, completed_at: completedAt },
      });
    }
  }

  return NextResponse.json({ job: data });
}
