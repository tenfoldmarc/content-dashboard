import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { creatorPersona } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();

// Transcribe video from Google Drive to understand what it's about
async function transcribeFromDrive(fileId: string): Promise<string | null> {
  if (!OPENAI_KEY) return null;

  try {
    const { getGoogleAccessToken } = await import('@/lib/google-auth');
    const token = await getGoogleAccessToken();
    if (!token) return null;

    // Download video
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();

    // Transcribe with Whisper
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'video/mp4' }), 'video.mp4');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: formData,
    });

    if (!whisperRes.ok) return null;
    return await whisperRes.text();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { driveFileId, title } = await request.json();

    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ caption: '', error: 'ANTHROPIC_API_KEY not configured' });
    }

    const supabase = createAdminClient();

    // Get the creator's recent post captions for voice/style reference
    const { data: recentPosts } = await supabase
      .from('client_posts')
      .select('content')
      .order('posted_at', { ascending: false })
      .limit(15);

    const pastCaptions = (recentPosts || [])
      .map((p: { content: string }) => p.content)
      .filter((c: string) => c && c.length > 20)
      .slice(0, 10);

    // Try to transcribe the video for context
    let transcript = '';
    if (driveFileId) {
      const t = await transcribeFromDrive(driveFileId);
      if (t) transcript = t;
    }

    const prompt = `${creatorPersona()}
You are their social media caption writer.

Here are their recent Instagram captions for style reference:
${pastCaptions.map((c: string, i: number) => `${i + 1}. "${c.slice(0, 300)}"`).join('\n')}

${transcript ? `The video transcript is:\n"${transcript.slice(0, 1500)}"` : `The video title/filename is: "${title || 'Untitled'}"`}

Write a single Instagram caption for this video in their voice and style. Rules:
- Match their tone exactly (see voice above)
- Include a strong hook in the first line
- Use line breaks for readability
- Include a CTA at the end
- Include 3-5 relevant hashtags at the very end
- Keep it under 2200 characters
- Do NOT use emojis unless they use them in their captions

Output ONLY the caption, nothing else.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ caption: '', error: 'Claude API error' });
    }

    const data = await res.json();
    const caption = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '';

    return NextResponse.json({ caption, hasTranscript: !!transcript });
  } catch (error) {
    return NextResponse.json({ caption: '', error: error instanceof Error ? error.message : 'Failed' });
  }
}
