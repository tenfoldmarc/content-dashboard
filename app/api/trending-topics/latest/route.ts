import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('trending_topics')
      .select('*')
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ brief: data });
  } catch (error) {
    return NextResponse.json({ brief: null, error: String(error) }, { status: 500 });
  }
}
