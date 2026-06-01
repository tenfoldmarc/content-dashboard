import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { tasks } = await request.json();

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'tasks array is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Bulk update each task's status and position
    const updates = tasks.map((t: { id: string; status: string; position: number }) =>
      supabase
        .from('kanban_tasks')
        .update({ status: t.status, position: t.position, updated_at: new Date().toISOString() })
        .eq('id', t.id)
    );

    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error);
    if (firstError?.error) throw firstError.error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : JSON.stringify(error) },
      { status: 500 }
    );
  }
}
