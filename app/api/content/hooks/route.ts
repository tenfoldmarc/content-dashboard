import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CREATOR } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();

// Extract hook from text: first sentence (before . ! ? or newline)
function extractHook(text: string): string {
  if (!text) return '';
  const match = text.match(/^(.+?)[.!?\n]/);
  if (match) return match[1].trim();
  const words = text.split(/\s+/).slice(0, 20).join(' ');
  return words.trim();
}

// Transcribe a video URL via OpenAI Whisper
async function transcribeVideoUrl(videoUrl: string): Promise<string> {
  if (!OPENAI_KEY || !videoUrl) return '';
  try {
    // Download video
    const res = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return '';
    const buffer = await res.arrayBuffer();
    const sizeMB = buffer.byteLength / (1024 * 1024);
    if (sizeMB > 25) return ''; // Whisper limit

    // Transcribe
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'video/mp4' }), 'video.mp4');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: formData,
    });
    if (!whisperRes.ok) return '';
    return await whisperRes.text();
  } catch { return ''; }
}

// Use Claude to generate hook templates from top hooks
async function generateTemplates(hooks: { hook: string; handle: string; views: number }[]): Promise<{ template: string; exampleHook: string; exampleHandle: string; views: number }[]> {
  if (!ANTHROPIC_KEY || hooks.length === 0) return [];

  const prompt = `You are a viral content analyst. Analyze these top-performing Instagram reel hooks (sorted by views) and extract reusable TEMPLATE STRUCTURES.

A template replaces specific details with [X] or [TOPIC] placeholders while keeping the structure.

Example:
- Hook: "Can Claude Code replace an entire SEO agency? Of course it can, let me show you how"
- Template: "Can [TOOL] replace an entire [PROFESSION/INDUSTRY]? Of course it can, let me show you how"

Top hooks:
${hooks.map((h, i) => `${i + 1}. [${h.views.toLocaleString()} views] @${h.handle}: "${h.hook}"`).join('\n')}

Generate 5-8 unique template structures. For each template:
1. The template pattern with [PLACEHOLDERS]
2. Which hook it was derived from

Respond as JSON array only:
[{"template": "Can [TOOL] replace [PROFESSION]? Of course it can, let me show you how", "example_hook": "Can Claude Code replace...", "example_handle": "cooper.simson", "views": 245000}]`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!res.ok) {
      console.error('Template generation: Anthropic API error', res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = await res.json();
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '[]';
    console.log('Template generation raw response:', text.slice(0, 200));
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Template generation: No JSON array found in response');
      return [];
    }
    const results = JSON.parse(jsonMatch[0]);
    console.log('Template generation: parsed', results.length, 'templates');
    return results.map((r: { template: string; example_hook: string; example_handle: string; views: number }) => ({
      template: r.template,
      exampleHook: r.example_hook,
      exampleHandle: r.example_handle,
      views: r.views || 0,
    }));
  } catch (err) {
    console.error('Template generation error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// GET: Fetch stored hooks and templates
export async function GET() {
  try {
    const supabase = createAdminClient();

    const [{ data: hooks }, { data: templates }] = await Promise.all([
      supabase.from('post_hooks').select('*').order('views', { ascending: false }).limit(50),
      supabase.from('hook_templates').select('*').order('score', { ascending: false }).limit(10),
    ]);

    return NextResponse.json({
      hooks: hooks || [],
      templates: templates || [],
    });
  } catch (error) {
    return NextResponse.json({ hooks: [], templates: [], error: String(error) });
  }
}

// POST: Analyze top posts and extract hooks + generate templates
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    const supabase = createAdminClient();

    if (action === 'analyze') {
      // Get top 10 performing posts from both own and competitor posts
      const [{ data: ownPosts }, { data: compPosts }] = await Promise.all([
        supabase.from('client_posts').select('*').order('views', { ascending: false }).limit(10),
        supabase.from('competitor_posts').select('*').order('views', { ascending: false }).limit(20),
      ]);

      // Also get transcribed content from content_queue (your Drive uploads with Whisper transcripts)
      const { data: queuePosts } = await supabase
        .from('content_queue')
        .select('transcript, title, drive_file_url')
        .not('transcript', 'is', null)
        .neq('transcript', '');

      const allPosts = [
        ...(ownPosts || []).map((p: { post_url: string; content: string; views: number; likes: number; shares: number }) => ({
          post_url: p.post_url || `own-${p.views}`,
          handle: CREATOR.handle,
          is_own: true,
          content: p.content,
          video_url: '',
          views: p.views,
          likes: p.likes,
          shares: p.shares,
        })),
        // Add transcribed hooks from your own Drive uploads (spoken hooks)
        ...(queuePosts || []).map((p: { transcript: string; title: string; drive_file_url: string }) => ({
          post_url: p.drive_file_url || `queue-${p.title}`,
          handle: CREATOR.handle,
          is_own: true,
          content: p.transcript,
          video_url: '',
          views: 0,
          likes: 0,
          shares: 0,
        })),
        ...(compPosts || []).map((p: { post_url: string; handle: string; content: string; views: number; likes: number; shares: number; video_url?: string }) => ({
          post_url: p.post_url,
          handle: p.handle,
          is_own: false,
          content: p.content,
          video_url: p.video_url || '',
          views: p.views,
          likes: p.likes,
          shares: p.shares,
        })),
      ].sort((a, b) => b.views - a.views).slice(0, 30);

      // Check which posts already have hooks
      const { data: existingHooks } = await supabase.from('post_hooks').select('post_url').in('post_url', allPosts.map(p => p.post_url));
      const existingUrls = new Set((existingHooks || []).map((h: { post_url: string }) => h.post_url));

      const newPosts = allPosts.filter(p => p.post_url && !existingUrls.has(p.post_url));

      let extracted = 0;
      let transcribed = 0;

      // Process max 5 videos per call to stay within Vercel's 60s limit
      // Caption extraction is instant, video transcription takes ~5-10s each
      const MAX_TRANSCRIPTIONS = 5;

      for (const post of newPosts) {
        let hookText = '';
        let transcript = '';

        // Try transcribing if we haven't hit the limit and post has video
        if (post.video_url && transcribed < MAX_TRANSCRIPTIONS) {
          console.log(`Transcribing: ${post.handle} — ${post.post_url}`);
          transcript = await transcribeVideoUrl(post.video_url);
          if (transcript) {
            hookText = extractHook(transcript);
            transcribed++;
          }
        }

        // Fall back to caption
        if (!hookText && post.content) {
          hookText = extractHook(post.content);
        }

        if (!hookText) continue;

        await supabase.from('post_hooks').upsert({
          post_url: post.post_url,
          handle: post.handle,
          is_own: post.is_own,
          hook_text: hookText,
          full_transcript: transcript || null,
          views: post.views,
          likes: post.likes,
          shares: post.shares,
        }, { onConflict: 'post_url' });
        extracted++;
      }

      // Now generate templates from all hooks
      const { data: allHooks } = await supabase.from('post_hooks').select('*').order('views', { ascending: false }).limit(20);

      if (allHooks && allHooks.length >= 3) {
        const templates = await generateTemplates(
          allHooks.map((h: { hook_text: string; handle: string; views: number }) => ({
            hook: h.hook_text,
            handle: h.handle,
            views: h.views,
          }))
        );

        if (templates.length > 0) {
          // Clear old templates and insert new ones
          await supabase.from('hook_templates').delete().neq('id', '');
          await supabase.from('hook_templates').insert(
            templates.map((t, i) => ({
              template: t.template,
              example_hook: t.exampleHook,
              example_handle: t.exampleHandle,
              views: t.views,
              score: templates.length - i,
            }))
          );
        }
      }

      return NextResponse.json({
        success: true,
        extracted,
        totalHooks: (allHooks || []).length,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Hooks error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
