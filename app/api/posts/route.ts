import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createAdminClient();

  const [competitors, client] = await Promise.all([
    supabase
      .from('competitor_posts')
      .select('*')
      .order('scraped_at', { ascending: false }),
    supabase
      .from('client_posts')
      .select('*')
      .order('posted_at', { ascending: false })
      .limit(25),
  ]);

  return NextResponse.json({
    competitors: competitors.data || [],
    client: client.data || [],
  });
}
