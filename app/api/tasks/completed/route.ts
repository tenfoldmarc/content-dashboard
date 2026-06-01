import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ tasks: data || [] });
  } catch (error) {
    return NextResponse.json({ tasks: [], error: error instanceof Error ? error.message : JSON.stringify(error) }, { status: 500 });
  }
}
