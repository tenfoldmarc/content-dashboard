import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.position !== undefined) updates.position = body.position;
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
    if (body.assigned_to_initials !== undefined) updates.assigned_to_initials = body.assigned_to_initials;
    if (body.label !== undefined) updates.label = body.label;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('kanban_tasks')
      .update(updates)
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : JSON.stringify(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('kanban_tasks')
      .delete()
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : JSON.stringify(error) },
      { status: 500 }
    );
  }
}
