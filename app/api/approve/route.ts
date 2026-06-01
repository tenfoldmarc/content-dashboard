import { NextResponse } from 'next/server';
import { updateIdeaStatus, getIdeaById } from '@/lib/queries';

export async function POST(request: Request) {
  try {
    const { id, scheduled_for } = await request.json();

    if (!id || !scheduled_for) {
      return NextResponse.json(
        { success: false, error: 'Missing id or scheduled_for' },
        { status: 400 }
      );
    }

    await updateIdeaStatus(id, 'approved', scheduled_for);

    const idea = await getIdeaById(id);
    const hook = idea?.hook || '';

    // Send to n8n webhook if configured
    if (process.env.N8N_WEBHOOK_URL) {
      await fetch(process.env.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: id, scheduled_for, hook }),
      });
    }

    await updateIdeaStatus(id, 'scheduled', scheduled_for);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
