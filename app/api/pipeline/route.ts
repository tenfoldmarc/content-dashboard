import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('pipeline_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const { title, column, notes } = body;

  if (!title || !column) {
    return NextResponse.json({ error: 'title and column are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('pipeline_items')
    .insert({ title, column, notes: notes || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
