import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Returns content scheduled/published within a date window so the content
// calendar (and the scheduling picker) can show, at a glance, which days have
// posts and which are open.
//   ?month=YYYY-MM                       — whole month (default: current month)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD        — explicit range (to is exclusive),
//                                            used by the weekly view that can
//                                            span a month boundary.
// All calendar dates/times are presented in your local timezone (set
// DASHBOARD_TIMEZONE, defaults to America/New_York). We compare local date
// strings so timezone boundaries (e.g. an 11pm post that is next-day UTC)
// land on the correct calendar day.
const ET = process.env.DASHBOARD_TIMEZONE || 'America/New_York';
const etDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }); // YYYY-MM-DD
const etTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit', hour12: true });
const etHmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ET, hour: '2-digit', minute: '2-digit', hour12: false }); // HH:mm

function etParts(iso: string) {
  const d = new Date(iso);
  const date = etDateFmt.format(d);
  const time = etTimeFmt.format(d);
  const [hStr, mStr] = etHmFmt.format(d).split(':');
  let hour = parseInt(hStr, 10);
  if (hour === 24) hour = 0;
  return { date, time, hour, minute: parseInt(mStr, 10) };
}

function addMonth(year: number, month: number): string {
  // month is 1-12; returns first day of the following month as YYYY-MM-DD
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const monthParam = searchParams.get('month'); // YYYY-MM

    let startStr: string; // inclusive ET date
    let endStr: string;   // exclusive ET date
    let label: string;

    if (fromParam && toParam) {
      startStr = fromParam;
      endStr = toParam;
      label = `${fromParam}..${toParam}`;
    } else {
      const now = new Date();
      const [year, month] = monthParam
        ? monthParam.split('-').map(Number)
        : [now.getFullYear(), now.getMonth() + 1];
      startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      endStr = addMonth(year, month);
      label = `${year}-${String(month).padStart(2, '0')}`;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('content_queue')
      .select('id, title, drive_file_id, thumbnail_url, scheduled_for, published_at, platforms, status')
      .neq('status', 'removed');

    if (error) throw error;

    const posts = (data ?? [])
      .map((row) => {
        const iso = row.scheduled_for || row.published_at;
        if (!iso) return null;
        const { date, time, hour, minute } = etParts(iso);
        if (date < startStr || date >= endStr) return null;
        return {
          id: row.id,
          title: row.title || 'Untitled',
          date,
          time,
          hour,
          minute,
          platforms: Array.isArray(row.platforms) ? row.platforms : [],
          status: row.status,
          driveFileId: row.drive_file_id || null,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => (a.date === b.date ? a.hour * 60 + a.minute - (b.hour * 60 + b.minute) : a.date.localeCompare(b.date)));

    return NextResponse.json({ range: label, posts });
  } catch (err) {
    return NextResponse.json({ posts: [], error: String(err) }, { status: 500 });
  }
}
