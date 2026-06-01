import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface JobUpdate {
  phase?: string;
  message?: string;
  completed_steps?: number;
  status?: 'running' | 'complete' | 'failed';
  error?: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
}

async function updateJob(supabase: SupabaseClient, jobId: string, patch: JobUpdate) {
  await supabase.from('refresh_jobs').update(patch).eq('id', jobId);
}

async function callInternal(origin: string, path: string, secret: string): Promise<unknown> {
  const res = await fetch(`${origin}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.WORKER_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = (await request.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  const supabase = createAdminClient();
  const origin = new URL(request.url).origin;
  const cronSecret = process.env.CRON_SECRET || process.env.TRENDING_INGEST_SECRET || '';

  try {
    // Phase 1: Refresh my Instagram posts
    await updateJob(supabase, jobId, {
      phase: 'my_posts',
      message: 'Refreshing your Instagram posts…',
      completed_steps: 0,
    });

    const myResult = await callInternal(
      origin,
      '/api/cron/refresh-my-posts?recentDays=90',
      process.env.TRENDING_INGEST_SECRET || ''
    );

    await updateJob(supabase, jobId, {
      completed_steps: 1,
      metadata: { my_posts: myResult },
    });

    // Phase 2: Scrape competitors via Apify
    await updateJob(supabase, jobId, {
      phase: 'competitors',
      message: 'Scraping competitor posts (this takes 1–3 min)…',
    });

    const compResult = await callInternal(
      origin,
      '/api/cron/scrape-competitors',
      cronSecret
    );

    // Done
    await updateJob(supabase, jobId, {
      phase: 'done',
      status: 'complete',
      message: 'Refresh complete',
      completed_steps: 2,
      completed_at: new Date().toISOString(),
      metadata: { my_posts: myResult, competitors: compResult },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(supabase, jobId, {
      status: 'failed',
      error: message,
      completed_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
