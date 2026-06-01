import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACCOUNTS = [
  { handle: 'trq212', min_views: 0 },
  { handle: 'claudeai', min_views: 0 },
  { handle: 'AnthropicAI', min_views: 0 },
  { handle: 'RoundtableSpace', min_views: 50_000 },
  { handle: 'axiaisacat', min_views: 100_000 },
];

async function xFetch(path: string, token: string) {
  const res = await fetch(`https://api.x.com/2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${path}: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchUserPosts(handle: string, token: string, minViews: number) {
  try {
    const user = await xFetch(`/users/by/username/${handle}`, token);
    const userId = user?.data?.id;
    if (!userId) return [];

    const tweets = await xFetch(
      `/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at&exclude=retweets,replies`,
      token
    );
    const name = user?.data?.name ?? handle;

    return (tweets?.data ?? [])
      .map((t: Record<string, unknown>) => {
        const m = (t.public_metrics ?? {}) as Record<string, number>;
        return {
          author: name,
          handle,
          text: (t.text as string) ?? '',
          views: m.impression_count ?? 0,
          likes: m.like_count ?? 0,
          url: `https://x.com/${handle}/status/${t.id}`,
          created_at: (t.created_at as string) ?? null,
        };
      })
      .filter((p: { views: number }) => p.views >= minViews);
  } catch (err) {
    return { error: String(err), handle };
  }
}

async function fetchHackerNews() {
  const ids: number[] = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
    cache: 'no-store',
  }).then((r) => r.json());
  const top = ids.slice(0, 30);
  const stories = await Promise.all(
    top.map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null)
    )
  );
  return stories
    .filter((s): s is Record<string, unknown> => s !== null && s !== undefined)
    .map((s) => ({
      title: (s.title as string) ?? '',
      score: (s.score as number) ?? 0,
      comments: (s.descendants as number) ?? 0,
      url: (s.url as string) ?? `https://news.ycombinator.com/item?id=${s.id}`,
      hn_url: `https://news.ycombinator.com/item?id=${s.id}`,
      age_hours: s.time ? Math.round((Date.now() / 1000 - (s.time as number)) / 3600) : 0,
    }))
    .sort((a, b) => b.score - a.score);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.TRENDING_INGEST_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const xToken = process.env.X_BEARER_TOKEN;
  if (!xToken) {
    return NextResponse.json({ error: 'X_BEARER_TOKEN not set' }, { status: 500 });
  }

  const xResults = await Promise.all(
    ACCOUNTS.map((a) => fetchUserPosts(a.handle, xToken, a.min_views))
  );
  const x_posts = xResults.flat().filter((p) => !(p as { error?: string }).error);

  const hn_all = await fetchHackerNews();
  const hn_stories = hn_all.slice(0, 10);

  return NextResponse.json({ x_posts, hn_stories, fetched_at: new Date().toISOString() });
}
