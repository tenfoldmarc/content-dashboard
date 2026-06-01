import { NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/google-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Scheduled content (from content_queue) shown alongside Google Calendar events so
// you can see which days/times already have posts and where the gaps are.
async function fetchScheduledPosts() {
  try {
    const supabase = createAdminClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('content_queue')
      .select('id, title, scheduled_for, platforms, status')
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', todayStart.toISOString())
      .in('status', ['scheduled', 'queued', 'ready', 'pending'])
      .order('scheduled_for', { ascending: true });

    return (data ?? []).map((row: { id: string; title: string | null; scheduled_for: string; platforms: string[] | null; status: string }) => {
      const dt = new Date(row.scheduled_for);
      return {
        id: `post-${row.id}`,
        title: row.title || 'Scheduled post',
        date: row.scheduled_for.split('T')[0],
        startTime: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        endTime: '',
        description: '',
        attendees: [] as string[],
        location: '',
        type: 'post' as const,
        platforms: Array.isArray(row.platforms) ? row.platforms : [],
        status: row.status,
      };
    });
  } catch {
    return [];
  }
}

async function calendarFetch(path: string, options?: RequestInit) {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error('No Google access token');

  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Calendar API ${res.status}`);
  }

  return res.json();
}

export async function GET() {
  try {
    const token = await getGoogleAccessToken();
    if (!token) {
      const posts = await fetchScheduledPosts();
      return NextResponse.json({ events: posts, connected: false, note: 'Google Calendar not configured — showing scheduled posts only.' });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const endRange = new Date(today);
    endRange.setDate(today.getDate() + 14);

    const params = new URLSearchParams({
      timeMin: today.toISOString(),
      timeMax: endRange.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    });

    const data = await calendarFetch(`/calendars/primary/events?${params}`);

    const events = (data.items || []).map((event: {
      id?: string; summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      description?: string; location?: string;
      attendees?: { displayName?: string; email?: string }[];
    }) => ({
      id: event.id || '',
      title: event.summary || 'Untitled Event',
      date: event.start?.date || (event.start?.dateTime ? event.start.dateTime.split('T')[0] : ''),
      startTime: event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : 'All day',
      endTime: event.end?.dateTime
        ? new Date(event.end.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '',
      description: event.description || '',
      attendees: (event.attendees || []).map((a) => a.displayName || a.email || '').filter(Boolean),
      location: event.location || '',
    }));

    const posts = await fetchScheduledPosts();
    const merged = [...events, ...posts].sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ events: merged, connected: true });
  } catch (error) {
    console.error('Calendar error:', error);
    return NextResponse.json({ events: [], connected: false, note: error instanceof Error ? error.message : 'Failed' });
  }
}

export async function POST(request: Request) {
  try {
    const token = await getGoogleAccessToken();
    if (!token) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

    const body = await request.json();
    const { title, date, startTime, endTime, description, attendees } = body;
    if (!title || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'title, date, startTime, and endTime are required' }, { status: 400 });
    }

    const startDt = new Date(`${date}T${startTime}:00`);
    const endDt = new Date(`${date}T${endTime}:00`);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const event: Record<string, unknown> = {
      summary: title,
      start: { dateTime: startDt.toISOString(), timeZone: tz },
      end: { dateTime: endDt.toISOString(), timeZone: tz },
    };
    if (description) event.description = description;
    if (attendees) {
      const list = typeof attendees === 'string'
        ? attendees.split(',').map((e: string) => e.trim()).filter(Boolean)
        : Array.isArray(attendees) ? attendees : [];
      if (list.length > 0) event.attendees = list.map((email: string) => ({ email }));
    }

    const data = await calendarFetch('/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      body: JSON.stringify(event),
    });

    return NextResponse.json({ event: data, success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
