import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Safety net: finds queue rows still stuck on the "Generating caption…" placeholder
// (or freshly inserted with no transcript) and processes them. Replaces the old
// client-only model where captioning would silently never happen if the browser
// tab wasn't open.

const PLACEHOLDER = 'Generating caption…';
const MAX_PER_RUN = 6;       // how many rows to kick off in a single cron tick
const STAGGER_MS = 800;      // small delay between fires so we don't slam Gemini

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: pending, error } = await supabase
    .from('content_queue')
    .select('id, drive_file_id, caption, transcript, updated_at')
    .or(`caption.eq.${PLACEHOLDER},transcript.is.null`)
    .eq('status', 'ready')
    .not('drive_file_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const candidates = (pending || []).filter(row => {
    if (row.transcript && row.transcript.length > 0) return false;
    return row.caption === PLACEHOLDER || row.caption == null || row.caption === '';
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, kicked: 0 });
  }

  const origin = new URL(request.url).origin;

  // Fire each row in its own request so each gets the full 300s maxDuration.
  // We don't await — these run in parallel and write back to supabase when done.
  const kicked: string[] = [];
  for (const row of candidates) {
    kicked.push(row.id);
    fetch(`${origin}/api/content/process?id=${row.id}`, { cache: 'no-store' }).catch(() => { /* server already writes error to row */ });
    await new Promise(r => setTimeout(r, STAGGER_MS));
  }

  return NextResponse.json({ ok: true, kicked: kicked.length, ids: kicked });
}
