import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.TRENDING_INGEST_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { brief_date, takeaway, x_posts, hn_stories, claude_trending, sources_meta } = body || {};
  if (!brief_date || !takeaway) {
    return NextResponse.json({ error: 'brief_date and takeaway required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('trending_topics')
    .upsert({
      brief_date,
      takeaway,
      x_posts: x_posts || [],
      hn_stories: hn_stories || [],
      claude_trending: claude_trending || [],
      sources_meta: sources_meta || {},
    }, { onConflict: 'brief_date' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, brief: data });
}
