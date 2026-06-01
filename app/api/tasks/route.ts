import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('kanban_tasks')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ tasks: data || [] });
  } catch (error) {
    return NextResponse.json(
      { tasks: [], error: error instanceof Error ? error.message : JSON.stringify(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Get the max position for the target status column
    const { data: existing } = await supabase
      .from('kanban_tasks')
      .select('position')
      .eq('status', body.status || 'todo')
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

    const { data, error } = await supabase
      .from('kanban_tasks')
      .insert({
        title: body.title,
        description: body.description || null,
        status: body.status || 'todo',
        label: body.label || 'content',
        assigned_to: body.assigned_to || null,
        assigned_to_initials: body.assigned_to_initials || null,
        due_date: body.due_date || null,
        position: nextPosition,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ task: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : JSON.stringify(error) },
      { status: 500 }
    );
  }
}
