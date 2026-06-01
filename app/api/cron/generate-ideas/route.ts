import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { creatorPersona } from '@/lib/config';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  try {
    const supabase = createAdminClient();

    // Get recent competitor posts for inspiration
    const { data: competitors } = await supabase
      .from('competitor_posts')
      .select('handle, content, likes, shares, views')
      .order('scraped_at', { ascending: false })
      .limit(20);

    // Get the creator's recent posts to avoid repetition
    const { data: myPosts } = await supabase
      .from('client_posts')
      .select('content')
      .order('posted_at', { ascending: false })
      .limit(10);

    const competitorContext = (competitors || [])
      .map((p) => `${p.handle}: "${p.content}" (${p.likes} likes, ${p.shares} shares, ${p.views} views)`)
      .join('\n');

    const myPostsContext = (myPosts || [])
      .map((p) => p.content)
      .join('\n---\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: `You are a content strategist. ${creatorPersona()}

COMPETITOR POSTS PERFORMING WELL RIGHT NOW:
${competitorContext}

THE CREATOR'S RECENT POSTS (avoid repeating these topics):
${myPostsContext}

Generate exactly 6 content ideas for today. For each idea, output a JSON object on its own line with these fields:
- hook: the opening line (max 20 words, must create curiosity or tension)
- format: one of "reel", "carousel", "post"
- pillar: a short content-pillar label relevant to their niche
- relevance: one sentence explaining why this idea works today (reference a competitor trend or gap)

Output ONLY valid JSON array, no markdown, no explanation.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '[]';

    let ideas: Array<{ hook: string; format: string; pillar: string; relevance: string }>;
    try {
      ideas = JSON.parse(text);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\[[\s\S]*\]/);
      ideas = match ? JSON.parse(match[0]) : [];
    }

    let inserted = 0;
    for (const idea of ideas) {
      const { error } = await supabase.from('content_ideas').insert({
        hook: idea.hook,
        format: idea.format || 'reel',
        pillar: idea.pillar || '',
        relevance: idea.relevance || '',
        status: 'pending',
      });

      if (!error) inserted++;
    }

    return NextResponse.json({ success: true, inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
