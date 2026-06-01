import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('financial_goals')
      .select('*')
      .eq('month', month)
      .order('created_at');
    if (error) throw error;
    return NextResponse.json({ goals: data || [] });
  } catch (error) {
    return NextResponse.json({ goals: [], error: error instanceof Error ? error.message : JSON.stringify(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('financial_goals')
      .insert({
        title: body.title,
        target: body.target,
        current: body.current || 0,
        month: body.month || new Date().toISOString().slice(0, 7),
        auto_sync: body.auto_sync || false,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ goal: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : JSON.stringify(error) }, { status: 500 });
  }
}
