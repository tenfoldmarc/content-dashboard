import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALL_PAGES = ['overview', 'financials', 'content', 'tasks', 'calendar', 'email', 'ads', 'schedule', 'settings'];
const MEMBER_DEFAULT_PAGES = ['overview', 'tasks', 'calendar'];

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('user_roles')
      .select('id, user_id, email, role, display_name, page_access, created_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, email, role, display_name, page_access } = body;

    if (!user_id || !email || !role) {
      return NextResponse.json(
        { error: 'user_id, email, and role are required' },
        { status: 400 }
      );
    }

    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'role must be "admin" or "member"' },
        { status: 400 }
      );
    }

    const resolvedPageAccess = role === 'admin'
      ? ALL_PAGES
      : (page_access || MEMBER_DEFAULT_PAGES);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('user_roles')
      .upsert(
        {
          user_id,
          email,
          role,
          display_name: display_name || null,
          page_access: resolvedPageAccess,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id query param is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
