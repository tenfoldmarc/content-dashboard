import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('*, content_ideas(*), scripts(*)')
      .order('scheduled_for', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ posts: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ posts: [], error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idea_id, platform, scheduled_for } = body;

    if (!platform || !scheduled_for) {
      return NextResponse.json(
        { error: 'platform and scheduled_for are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        idea_id: idea_id || null,
        platform,
        scheduled_for,
        status: 'queued',
      })
      .select('*, content_ideas(*), scripts(*)')
      .single();

    if (error) throw error;

    return NextResponse.json({ post: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
