import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get('week_start') || getWeekStart();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('objectives')
      .select('*')
      .eq('week_start', weekStart)
      .order('created_at');
    if (error) throw error;
    return NextResponse.json({ objectives: data || [] });
  } catch (error) {
    return NextResponse.json({ objectives: [], error: error instanceof Error ? error.message : JSON.stringify(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('objectives')
      .insert({
        title: body.title,
        target: body.target,
        current: body.current || 0,
        week_start: body.week_start || getWeekStart(),
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ objective: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : JSON.stringify(error) }, { status: 500 });
  }
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}
