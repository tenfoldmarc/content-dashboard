import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { persistThumbnail } from '@/lib/thumbnails';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const APIFY_TOKEN = process.env.APIFY_API_TOKEN?.trim();
const APIFY_ACTOR = 'apify/instagram-scraper';

interface ApifyPost {
  shortCode?: string;
  url?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  displayUrl?: string;
  timestamp?: string;
  type?: string;
  sharesCount?: number;
  videoUrl?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  profilePicUrl?: string;
}

interface ApifyProfile {
  username?: string;
  fullName?: string;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  followersCount?: number;
  postsCount?: number;
  biography?: string;
  latestPosts?: ApifyPost[];
}

async function runApifyActor(input: Record<string, unknown>): Promise<unknown[]> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_TOKEN not configured');

  const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

  const response = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify error (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
}

// POST: Scrape a specific competitor's Instagram
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { handle } = body;

    if (!handle) {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    const cleanHandle = handle.replace(/^@/, '');

    // Step 1: Get profile details first
    let profileData: { fullName: string; profilePicUrl: string; followersCount: number } | null = null;

    try {
      const detailsResult = await runApifyActor({
        directUrls: [`https://www.instagram.com/${cleanHandle}/`],
        resultsType: 'details',
        resultsLimit: 1,
      }) as ApifyProfile[];

      if (detailsResult.length > 0) {
        const profile = detailsResult[0];
        profileData = {
          fullName: profile.fullName || profile.username || cleanHandle,
          profilePicUrl: profile.profilePicUrlHD || profile.profilePicUrl || '',
          followersCount: profile.followersCount || 0,
        };
      }
    } catch (err) {
      console.error('Profile details fetch failed:', err);
    }

    // Step 2: Get posts
    const postsResult = await runApifyActor({
      directUrls: [`https://www.instagram.com/${cleanHandle}/`],
      resultsType: 'posts',
      resultsLimit: 25,
      addParentData: true,
    }) as ApifyPost[];

    // If profile wasn't fetched, try to extract from post data
    if (!profileData && postsResult.length > 0) {
      const firstPost = postsResult[0];
      profileData = {
        fullName: firstPost.ownerFullName || firstPost.ownerUsername || cleanHandle,
        profilePicUrl: firstPost.profilePicUrl || '',
        followersCount: 0,
      };
    }

    // Save to Supabase
    const supabase = createAdminClient();

    // Get existing post URLs so we don't duplicate
    const { data: existingPosts } = await supabase
      .from('competitor_posts')
      .select('post_url')
      .eq('handle', cleanHandle);

    const existingUrls = new Set((existingPosts || []).map((p: { post_url: string }) => p.post_url));

    // Build rows, updating existing posts' metrics and inserting new ones
    if (postsResult.length > 0) {
      const allRows = await Promise.all(
        postsResult.map(async (post) => {
          const postUrl = post.url || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : '');
          const persistedThumb = await persistThumbnail(supabase, post.displayUrl || '', postUrl);
          return {
            handle: cleanHandle,
            content: post.caption || '',
            likes: post.likesCount || 0,
            shares: post.sharesCount || 0,
            comments: post.commentsCount || 0,
            views: post.videoViewCount || post.videoPlayCount || post.likesCount || 0,
            post_url: postUrl,
            thumbnail_url: persistedThumb || post.displayUrl || '',
            video_url: post.videoUrl || '',
            posted_at: post.timestamp ? new Date(post.timestamp).toISOString() : new Date().toISOString(),
            scraped_at: new Date().toISOString(),
          };
        })
      );

      const newPosts = allRows.filter(p => p.post_url && !existingUrls.has(p.post_url));
      const existingToUpdate = allRows.filter(p => p.post_url && existingUrls.has(p.post_url));

      // Insert new posts
      if (newPosts.length > 0) {
        const { error: insertError } = await supabase.from('competitor_posts').insert(newPosts);
        if (insertError) console.error('Failed to insert new posts:', insertError);
      }

      // Update metrics on existing posts (likes, views, shares may have changed)
      for (const post of existingToUpdate) {
        await supabase
          .from('competitor_posts')
          .update({ likes: post.likes, shares: post.shares, comments: post.comments, views: post.views, thumbnail_url: post.thumbnail_url, scraped_at: post.scraped_at })
          .eq('post_url', post.post_url);
      }
    }

    // Update competitor profile info
    if (profileData) {
      await supabase
        .from('competitors')
        .update({
          display_name: profileData.fullName,
          profile_pic_url: profileData.profilePicUrl || null,
        })
        .eq('instagram_handle', cleanHandle);
    }

    return NextResponse.json({
      success: true,
      handle: cleanHandle,
      postsScraped: postsResult.length,
      profile: profileData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
