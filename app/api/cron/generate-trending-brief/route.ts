import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { creatorPersona } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ACCOUNTS = [
  { handle: 'trq212', min_views: 0 },
  { handle: 'claudeai', min_views: 0 },
  { handle: 'AnthropicAI', min_views: 0 },
  { handle: 'RoundtableSpace', min_views: 50_000 },
  { handle: 'axiaisacat', min_views: 100_000 },
];

type XPost = { author: string; handle: string; text: string; views: number; url: string };
type HNStory = { title: string; score: number; comments: number; url: string; hn_url: string; age: string };
type ClaudeTrend = { text: string; source: string; url: string };

async function xFetch(path: string, token: string) {
  const res = await fetch(`https://api.x.com/2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`X API ${path}: ${res.status}`);
  return res.json();
}

async function fetchUserPosts(handle: string, token: string, minViews: number): Promise<XPost[]> {
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
          url: `https://x.com/${handle}/status/${t.id}`,
        };
      })
      .filter((p: XPost) => p.views >= minViews);
  } catch {
    return [];
  }
}

async function fetchHackerNews(): Promise<HNStory[]> {
  const ids: number[] = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
    cache: 'no-store',
  }).then((r) => r.json());
  const stories = await Promise.all(
    ids.slice(0, 30).map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null)
    )
  );
  return stories
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => {
      const ageHours = s.time ? Math.round((Date.now() / 1000 - (s.time as number)) / 3600) : 0;
      return {
        title: (s.title as string) ?? '',
        score: (s.score as number) ?? 0,
        comments: (s.descendants as number) ?? 0,
        url: (s.url as string) ?? `https://news.ycombinator.com/item?id=${s.id}`,
        hn_url: `https://news.ycombinator.com/item?id=${s.id}`,
        age: ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function pickTopX(posts: XPost[], n: number): XPost[] {
  return [...posts].sort((a, b) => b.views - a.views).slice(0, n);
}

async function synthesizeBrief(
  x_posts: XPost[],
  hn_stories: HNStory[],
  anthropicKey: string
): Promise<{ takeaway: string; claude_trending: ClaudeTrend[] }> {
  const xContext = x_posts
    .map((p) => `@${p.handle} (${p.views} views): ${p.text.slice(0, 200)} [${p.url}]`)
    .join('\n');
  const hnContext = hn_stories
    .map((s) => `${s.title} (${s.score} pts) [${s.url}]`)
    .join('\n');

  const prompt = `You're a content strategist briefing a creator. ${creatorPersona()}

TODAY'S TOP X POSTS:
${xContext}

TODAY'S HACKER NEWS TOP STORIES:
${hnContext}

Your job — output strict JSON with two fields:

1. "takeaway" — 2-3 sentences. What matters MOST for their audience today. Reference a specific item from above. Tie it to their niche and angle. Direct, punchy, no corporate speak. If there's a content opportunity, call it out.

2. "claude_trending" — array of exactly 3 objects, each with { "text", "source", "url" }. Pick the 3 items from the X posts and HN stories above that are MOST relevant to their niche and audience. Rewrite each as one clear sentence about what the trend means. Use the REAL url from the source data. "source" is the domain name (e.g. "HN", "TechCrunch", "X") — short.

Output ONLY valid JSON, no markdown fences, no preamble. Shape: {"takeaway": "...", "claude_trending": [{"text":"...","source":"...","url":"..."}, ...]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API: ${res.status} ${await res.text()}`);
  const result = await res.json();
  const text = result.content?.[0]?.text ?? '{}';
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : text);
  return {
    takeaway: parsed.takeaway ?? '',
    claude_trending: parsed.claude_trending ?? [],
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const xToken = process.env.X_BEARER_TOKEN;
  if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  if (!xToken) return NextResponse.json({ error: 'X_BEARER_TOKEN not set' }, { status: 500 });

  try {
    const xRaw = await Promise.all(ACCOUNTS.map((a) => fetchUserPosts(a.handle, xToken, a.min_views)));
    const x_posts = pickTopX(xRaw.flat(), 5);
    const hn_all = await fetchHackerNews();
    const hn_stories = hn_all.slice(0, 3);

    const { takeaway, claude_trending } = await synthesizeBrief(x_posts, hn_all.slice(0, 15), anthropicKey);

    const today = new Date();
    const brief_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('trending_topics')
      .upsert(
        {
          brief_date,
          takeaway,
          x_posts,
          hn_stories,
          claude_trending,
          sources_meta: { generated_at: new Date().toISOString() },
        },
        { onConflict: 'brief_date' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      brief_date,
      counts: { x: x_posts.length, hn: hn_stories.length, claude: claude_trending.length },
      brief: data,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
