import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET: Read-only — fetch all hooks and templates
export async function GET() {
  try {
    const supabase = createAdminClient();

    const [{ data: hooks }, { data: templates }] = await Promise.all([
      supabase
        .from('post_hooks')
        .select('*')
        .order('views', { ascending: false }),
      supabase
        .from('hook_templates')
        .select('*')
        .order('views', { ascending: false }),
    ]);

    return NextResponse.json({
      hooks: hooks || [],
      templates: templates || [],
    });
  } catch (error) {
    return NextResponse.json(
      { hooks: [], templates: [], error: String(error) },
      { status: 500 }
    );
  }
}
