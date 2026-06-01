import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthHalfOver = dayOfMonth > daysInMonth / 2;

    // Fetch all data in parallel
    const [goalsRes, ideasRes, tasksRes] = await Promise.all([
      supabase.from('financial_goals').select('*').eq('month', month),
      supabase.from('content_ideas').select('id').eq('status', 'pending'),
      supabase.from('tasks').select('id').eq('quadrant', 'ui').is('completed_at', null),
    ]);

    // Goals at risk: below 30% progress with month more than half over
    let financials = 0;
    if (monthHalfOver && goalsRes.data) {
      financials = goalsRes.data.filter(g => {
        const pct = g.target > 0 ? g.current / g.target : 0;
        return pct < 0.3;
      }).length;
    }

    const content = ideasRes.data?.length || 0;
    const tasks = tasksRes.data?.length || 0;

    return NextResponse.json({ financials, content, tasks });
  } catch (error) {
    return NextResponse.json({ financials: 0, content: 0, tasks: 0, error: error instanceof Error ? error.message : JSON.stringify(error) }, { status: 500 });
  }
}
