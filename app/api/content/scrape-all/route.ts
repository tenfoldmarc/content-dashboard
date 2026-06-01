import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Scraping all competitors can take a few minutes

// POST: Re-scrape all competitors
export async function POST() {
  try {
    const supabase = createAdminClient();

    const { data: competitors, error } = await supabase
      .from('competitors')
      .select('instagram_handle')
      .order('created_at');

    if (error) throw error;
    if (!competitors || competitors.length === 0) {
      return NextResponse.json({ message: 'No competitors to scrape', results: [] });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    // Scrape each competitor sequentially to avoid rate limits
    const results = [];
    for (const comp of competitors) {
      try {
        const res = await fetch(`${baseUrl}/api/content/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: comp.instagram_handle }),
        });
        const data = await res.json();
        results.push({ handle: comp.instagram_handle, success: res.ok, postsScraped: data.postsScraped || 0 });
      } catch (err) {
        results.push({ handle: comp.instagram_handle, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }

    return NextResponse.json({ message: 'Scrape complete', results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
