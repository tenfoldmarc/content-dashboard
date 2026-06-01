import { NextResponse } from 'next/server';
import { creatorPersona } from '@/lib/config';

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  try {
    const { message, history } = await request.json();

    const messages = [
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

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
        system: `You are a world-class short-form video script writer. ${creatorPersona()}

WRITING RULES:
1. Write in their EXACT voice (see above)
2. Each script = Hook + Body (3-5 punchy points or story) + CTA
3. Hooks: ≤20 words. Must create immediate tension or curiosity.
4. Body: Short sentences. No fluff. One idea per line.
5. CTAs: "Comment X below" or "Follow for more"
6. Length: 45-90 seconds when read at natural pace (~120-180 words total)
7. Never start with "Hey guys" or any fake-cheery opener
8. Reference real, specific tools and examples relevant to their niche
9. Ground claims in REAL results — not theory`,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    return NextResponse.json({ response: text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
