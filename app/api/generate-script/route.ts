import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { creatorPersona } from '@/lib/config';

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  try {
    const { idea_id } = await request.json();
    if (!idea_id) {
      return NextResponse.json({ error: 'Missing idea_id' }, { status: 400 });
    }

    const supabase = createClient();

    const { data: idea, error: ideaError } = await supabase
      .from('content_ideas')
      .select('*')
      .eq('id', idea_id)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `Write a ready-to-record Instagram reel script. ${creatorPersona()}

CONTENT IDEA:
Hook: ${idea.hook}
Format: ${idea.format}
Pillar: ${idea.pillar}
Why it's relevant: ${idea.relevance}

RULES:
1. Start with the hook EXACTLY as written
2. Body: 3-5 punchy points or a tight story arc. Short sentences. One idea per line.
3. End with a clear CTA: "Comment X below" or "Follow for more"
4. Length: 45-90 seconds (~120-180 words)
5. Reference real, specific tools and examples relevant to their niche
6. Ground claims in real results — not theory
7. Never start with "Hey guys"

Output a JSON object with:
- title: a 5-8 word title for this script
- body: the full script word-for-word, ready to record
- estimated_seconds: estimated recording length

Output ONLY valid JSON, no markdown.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '{}';

    let parsed: { title: string; body: string; estimated_seconds: number };
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { title: '', body: text, estimated_seconds: 60 };
    }

    const { data: script, error: scriptError } = await supabase
      .from('scripts')
      .insert({
        idea_id,
        title: parsed.title || `Script: ${idea.hook.slice(0, 40)}`,
        body: parsed.body,
        estimated_seconds: parsed.estimated_seconds || 60,
      })
      .select()
      .single();

    if (scriptError) {
      return NextResponse.json({ error: scriptError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, script });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
