import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: competitors, error: compError } = await supabase
      .from('competitors')
      .select('*')
      .order('created_at', { ascending: true });

    if (compError) throw compError;

    // Fetch recent posts for each competitor
    const competitorsWithPosts = await Promise.all(
      (competitors || []).map(async (comp) => {
        const { data: posts, error: postsError } = await supabase
          .from('competitor_posts')
          .select('*')
          .eq('handle', comp.instagram_handle)
          .order('posted_at', { ascending: false })
          .limit(20);

        if (postsError) {
          return { ...comp, posts: [], avgViews: 0, postsPerWeek: 0, monthlyReach: 0 };
        }

        const postList = posts || [];
        const totalViews = postList.reduce((s: number, p: { views: number }) => s + (p.views || 0), 0);
        const avgViews = postList.length > 0 ? Math.round(totalViews / postList.length) : 0;
        const totalLikes = postList.reduce((s: number, p: { likes: number }) => s + (p.likes || 0), 0);
        const avgLikes = postList.length > 0 ? Math.round(totalLikes / postList.length) : 0;

        // Posting frequency: estimate from the date range of scraped posts
        let postsPerWeek = 0;
        if (postList.length >= 2) {
          const newest = new Date(postList[0].posted_at || postList[0].scraped_at);
          const oldest = new Date(postList[postList.length - 1].posted_at || postList[postList.length - 1].scraped_at);
          const daySpan = Math.max(1, (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
          postsPerWeek = Math.round((postList.length / daySpan) * 7 * 10) / 10;
        }

        return {
          ...comp,
          posts: postList,
          avgViews,
          avgLikes,
          postsPerWeek,
          monthlyReach: totalViews,
        };
      })
    );

    return NextResponse.json({ competitors: competitorsWithPosts });
  } catch (error) {
    return NextResponse.json(
      { competitors: [], error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { handle, displayName } = body;

    if (!handle) {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    const cleanHandle = handle.replace(/^@/, '');

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('competitors')
      .insert({
        instagram_handle: cleanHandle,
        display_name: displayName || cleanHandle,
      })
      .select()
      .single();

    if (error) throw error;

    // Trigger Apify scrape in the background
    // We don't await this — it runs async so the UI responds fast
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    fetch(`${baseUrl}/api/content/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: cleanHandle }),
    }).catch((err) => {
      console.error('Background scrape failed:', err);
    });

    return NextResponse.json({
      competitor: data,
      message: 'Competitor added. Scraping posts in the background — refresh in ~30 seconds.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get the handle before deleting so we can clean up posts
    const { data: comp } = await supabase
      .from('competitors')
      .select('instagram_handle')
      .eq('id', id)
      .single();

    // Delete the competitor
    const { error } = await supabase
      .from('competitors')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Also delete their posts
    if (comp?.instagram_handle) {
      await supabase
        .from('competitor_posts')
        .delete()
        .eq('handle', comp.instagram_handle);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
