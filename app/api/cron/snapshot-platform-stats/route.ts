import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllPlatformMetrics } from '@/lib/platform-metrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily snapshot of per-platform followers + 7-day views so the homepage can
// compute accurate 7-day deltas going forward.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const platforms = await getAllPlatformMetrics();
    const today = new Date().toISOString().slice(0, 10);
    const supabase = createAdminClient();

    const rows = platforms.map((p) => ({
      platform: p.platform,
      date: today,
      followers: p.followers,
      total_views: 0,
      views_7d: p.views7d,
      source: p.source,
    }));

    const { error } = await supabase
      .from('platform_stats_daily')
      .upsert(rows, { onConflict: 'platform,date' });

    if (error) throw error;
    return NextResponse.json({ ok: true, snapshotted: rows.length, date: today });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
