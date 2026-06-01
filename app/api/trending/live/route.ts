import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// X accounts to watch for AI/Claude/OpenAI chatter.
const X_ACCOUNTS = [
  { handle: 'claudeai', min_views: 0 },
  { handle: 'AnthropicAI', min_views: 0 },
  { handle: 'OpenAI', min_views: 0 },
];

async function xFetch(path: string, token: string) {
  const res = await fetch(`https://api.x.com/2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`X ${res.status}`);
  return res.json();
}

async function fetchXPosts(handle: string, token: string, minViews: number) {
  try {
    const user = await xFetch(`/users/by/username/${handle}`, token);
    const userId = user?.data?.id;
    if (!userId) return [];
    const tweets = await xFetch(
      `/users/${userId}/tweets?max_results=5&tweet.fields=public_metrics,created_at&exclude=retweets,replies`,
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
  } catch {
    return [];
  }
}

async function fetchHackerNews() {
  try {
    const ids: number[] = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      cache: 'no-store',
    }).then((r) => r.json());
    const stories = await Promise.all(
      ids.slice(0, 20).map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => null)
      )
    );
    return stories
      .filter((s): s is Record<string, unknown> => !!s)
      .map((s) => ({
        title: (s.title as string) ?? '',
        score: (s.score as number) ?? 0,
        comments: (s.descendants as number) ?? 0,
        url: (s.url as string) ?? `https://news.ycombinator.com/item?id=${s.id}`,
        hn_url: `https://news.ycombinator.com/item?id=${s.id}`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  } catch {
    return [];
  }
}

// GitHub "trending" proxy via the official Search API: AI-leaning repos pushed
// recently, sorted by stars. No auth needed (60 req/hr unauthenticated).
async function fetchGithubRepos() {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const q = encodeURIComponent(`(AI OR LLM OR agent OR claude OR openai) pushed:>${since}`);
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=8`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'content-dashboard' }, cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((r: Record<string, unknown>) => ({
      name: r.full_name as string,
      description: (r.description as string) ?? '',
      stars: (r.stargazers_count as number) ?? 0,
      language: (r.language as string) ?? null,
      url: r.html_url as string,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const xToken = process.env.X_BEARER_TOKEN;
  const [xResults, hn_stories, github_repos] = await Promise.all([
    xToken
      ? Promise.all(X_ACCOUNTS.map((a) => fetchXPosts(a.handle, xToken, a.min_views)))
      : Promise.resolve([]),
    fetchHackerNews(),
    fetchGithubRepos(),
  ]);
  const x_posts = (xResults as unknown[][]).flat().sort(
    (a, b) => (b as { views: number }).views - (a as { views: number }).views
  );
  return NextResponse.json({
    x_posts: x_posts.slice(0, 8),
    hn_stories,
    github_repos,
    fetched_at: new Date().toISOString(),
  });
}
