import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStaticPath from 'ffmpeg-static';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadFile } from '@/lib/drive';
import { creatorPersona, CREATOR } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Resolve the ffmpeg binary path at runtime. We don't trust `require('ffmpeg-static')`
// because Next.js bundling rewrites __dirname inside the package, breaking its path
// computation. The binary is copied into the function via outputFileTracingIncludes
// (see next.config.mjs) and lives next to node_modules at runtime.
function resolveFfmpegPath(): string {
  // ffmpegStaticPath from `require('ffmpeg-static')` is computed against the
  // package's __dirname. After Next.js bundles, that path lives in the .next
  // output but the binary itself is traced as a sibling — fall through the
  // candidates until one exists.
  const candidates = [
    process.env.FFMPEG_BIN,
    ffmpegStaticPath,
    ffmpegStaticPath ? path.join(path.dirname(ffmpegStaticPath), 'ffmpeg') : null,
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    '/var/task/node_modules/ffmpeg-static/ffmpeg',
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync } = require('fs') as typeof import('fs');
  const dirs = [
    process.cwd(),
    '/var/task',
    '/var/task/node_modules',
    '/var/task/node_modules/ffmpeg-static',
    '/var/task/.next/server/app/api/content/process',
    '/var/task/.next/server',
  ];
  const debug: string[] = [`ffmpegStaticPath=${ffmpegStaticPath}`];
  for (const dir of dirs) {
    try { debug.push(`${dir}: ${readdirSync(dir).slice(0, 30).join(',')}`); } catch (e) { debug.push(`${dir}: ${(e as Error).message.slice(0, 80)}`); }
  }
  throw new Error(`ffmpeg binary not found; tried: ${candidates.join(', ')}\n${debug.join('\n')}`);
}

// Synchronous single-row processor — bypasses waitUntil. Use when the queue
// route's background job dropped a row. POST { id } or GET ?id=
//
// Each call gets its own fresh function invocation with the full maxDuration
// budget, so even slow videos finish.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();

async function downloadDriveFile(fileId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  return downloadFile(fileId);
}

const TRANSCRIBE_PROMPT = `Watch this short-form video and return JSON ONLY (no markdown) in this exact shape:

{
  "transcript": "verbatim transcript of all spoken words, no timestamps",
  "visual_context": "1-3 short sentences covering on-screen text, software demoed, key visuals. Skip generic descriptions."
}

If no speech, set transcript to "". If nothing visually noteworthy, set visual_context to "".`;

const TRANSCRIBE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

// Gemini accepts inline base64 up to ~36 MB request body (we cap a bit below).
// Base64 inflates by ~33%, so ~25 MB binary fits comfortably.
const INLINE_MAX_BYTES = 25 * 1024 * 1024;

function parseTranscriptJson(raw: string): { transcript: string; visualContext: string } {
  try {
    const parsed = JSON.parse(raw);
    return {
      transcript: (parsed.transcript || '').trim(),
      visualContext: (parsed.visual_context || '').trim(),
    };
  } catch {
    return { transcript: raw, visualContext: '' };
  }
}

function formatTranscript(transcript: string, visualContext: string): string {
  return visualContext ? `${transcript}\n\n[VISUAL CONTEXT: ${visualContext}]` : transcript;
}

async function callGemini(parts: unknown[]): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [...parts, { text: TRANSCRIBE_PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });
  const failures: string[] = [];
  for (const model of TRANSCRIBE_MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (r.ok) {
      const data = await r.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    }
    const status = r.status;
    const transient = status === 429 || status === 404 || status >= 500;
    if (!transient) {
      const errBody = (await r.text()).slice(0, 200);
      throw new Error(`Gemini ${model} error ${status}: ${errBody.slice(0, 100)}`);
    }
    failures.push(`${model}:${status}`);
  }
  throw new Error(`All Gemini models unavailable — ${failures.join(', ')}`);
}

// Primary: inline base64. Works for files up to ~25 MB and — unlike the File
// API — does NOT silently transition to FAILED state for valid HEVC/H.264 mp4s
// (Google's File API has been broken on new uploads as of 2026-05-22).
async function transcribeInline(buffer: ArrayBuffer): Promise<string> {
  const b64 = Buffer.from(buffer).toString('base64');
  const raw = await callGemini([{ inline_data: { mime_type: 'video/mp4', data: b64 } }]);
  const { transcript, visualContext } = parseTranscriptJson(raw);
  return formatTranscript(transcript, visualContext);
}

// For files too big for video inline_data: extract just the audio track with
// ffmpeg (1-2 MB even for a 200 MB video) and send the audio to Gemini.
// We lose visual context but get a reliable transcript independent of the
// broken Gemini File API.
async function extractAudio(buffer: ArrayBuffer): Promise<Buffer> {
  const ffmpegBin = resolveFfmpegPath();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-'));
  const inputPath = path.join(tmp, 'in.mp4');
  const outputPath = path.join(tmp, 'out.m4a');
  try {
    await fs.writeFile(inputPath, Buffer.from(buffer));
    // Ensure the bundled binary is executable on the Vercel runtime.
    try { await fs.chmod(ffmpegBin, 0o755); } catch { /* may already be executable */ }

    await new Promise<void>((resolve, reject) => {
      const args = ['-i', inputPath, '-vn', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-y', outputPath];
      const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function transcribeAudio(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const audio = await extractAudio(buffer);
  if (audio.byteLength > INLINE_MAX_BYTES) {
    throw new Error(`Extracted audio is ${(audio.byteLength / 1024 / 1024).toFixed(1)} MB — too large even after stripping video. File: ${fileName}`);
  }
  const b64 = audio.toString('base64');
  // Audio-only path can't return visual_context, so request a simpler shape.
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: 'audio/mp4', data: b64 } },
        { text: 'Transcribe the spoken words verbatim. No timestamps, no commentary, just the transcript text.' },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  });
  const failures: string[] = [];
  for (const model of TRANSCRIBE_MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (r.ok) {
      const data = await r.json();
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    }
    const status = r.status;
    const transient = status === 429 || status === 404 || status >= 500;
    if (!transient) {
      const errBody = (await r.text()).slice(0, 200);
      throw new Error(`Gemini ${model} (audio) error ${status}: ${errBody.slice(0, 100)}`);
    }
    failures.push(`${model}:${status}`);
  }
  throw new Error(`All Gemini models unavailable for audio — ${failures.join(', ')}`);
}

// Fallback: File API. Kept for larger files (>INLINE_MAX_BYTES). May fail
// while Google's File API is degraded.
async function transcribeViaFileApi(buffer: ArrayBuffer, fileName: string): Promise<string> {
  let fileName_remote: string | null = null;
  try {
    const startRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(buffer.byteLength),
          'X-Goog-Upload-Header-Content-Type': 'video/mp4',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: fileName } }),
      },
    );
    if (!startRes.ok) throw new Error(`Gemini upload start failed (${startRes.status})`);
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error('Gemini did not return an upload URL');

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Length': String(buffer.byteLength),
      },
      body: buffer,
    });
    if (!uploadRes.ok) throw new Error(`Gemini upload failed (${uploadRes.status})`);
    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    fileName_remote = uploadData.file?.name;
    if (!fileUri || !fileName_remote) throw new Error('Gemini upload returned no file URI');

    let state = uploadData.file?.state || 'PROCESSING';
    let attempts = 0;
    while (state === 'PROCESSING' && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName_remote}?key=${GEMINI_KEY}`);
      if (checkRes.ok) state = (await checkRes.json()).state || 'PROCESSING';
      attempts++;
    }
    if (state !== 'ACTIVE') throw new Error(`Gemini file stuck in ${state} after 60s`);

    const raw = await callGemini([{ fileData: { mimeType: 'video/mp4', fileUri } }]);
    const { transcript, visualContext } = parseTranscriptJson(raw);
    return formatTranscript(transcript, visualContext);
  } finally {
    if (fileName_remote) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName_remote}?key=${GEMINI_KEY}`, { method: 'DELETE' }).catch(() => {});
    }
  }
}

async function transcribe(buffer: ArrayBuffer, fileName: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('Server missing GEMINI_API_KEY');
  // ≤25 MB: full video inline (keeps Gemini's visual-context bonus).
  if (buffer.byteLength <= INLINE_MAX_BYTES) {
    return transcribeInline(buffer);
  }
  // >25 MB: strip to audio with ffmpeg, send audio inline. No visual context
  // but works for any size and survives Gemini File API outages.
  try {
    return await transcribeAudio(buffer, fileName);
  } catch (audioErr) {
    // Last-ditch fallback: try the (currently flaky) File API.
    try {
      return await transcribeViaFileApi(buffer, fileName);
    } catch {
      throw audioErr;
    }
  }
}

async function getVoiceReference(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('client_posts')
    .select('content')
    .order('posted_at', { ascending: false })
    .limit(15);
  return (data || [])
    .map((p: { content: string }) => p.content)
    .filter((c: string) => c && c.length > 20)
    .slice(0, 10)
    .map((c: string, i: number) => `${i + 1}. "${c.slice(0, 300)}"`)
    .join('\n');
}

async function generateCaption(transcript: string, title: string, voiceRef: string): Promise<{ caption: string; youtubeTitle: string }> {
  if (!ANTHROPIC_KEY) return { caption: '', youtubeTitle: '' };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${creatorPersona()}
You are their social media caption writer.

Their recent captions for style reference:
${voiceRef}

${transcript ? `Video transcript:\n"${transcript.slice(0, 1500)}"` : `Video title: "${title}"`}

Write TWO things.

1. CAPTION — strict 2-line format:
LINE 1 (hook): One short sentence that creates curiosity, SPECIFIC to what they say.
LINE 2 (CTA): If they say "comment WORD" → "Comment \\"WORD\\" for the [thing]". Else use their exact CTA. Else "Follow @${CREATOR.handle} for more videos like this".
After LINE 2, blank line, then 3-5 lowercase hashtags.

Rules: match their tone, no emojis, under 500 chars total, no invented CTAs.

2. YOUTUBE_TITLE: Catchy YT Shorts title under 80 chars, no hashtags.

Format EXACTLY:
---CAPTION---
[caption]
---YOUTUBE_TITLE---
[title]` }],
    }),
  });
  if (!res.ok) return { caption: '', youtubeTitle: '' };
  const data = await res.json();
  const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
  const captionMatch = text.match(/---CAPTION---\s*([\s\S]*?)(?:---YOUTUBE_TITLE---|$)/);
  const ytTitleMatch = text.match(/---YOUTUBE_TITLE---\s*([\s\S]*?)$/);
  const caption = captionMatch ? captionMatch[1].trim() : text;
  const youtubeTitle = ytTitleMatch ? ytTitleMatch[1].trim().slice(0, 100) : caption.split('\n')[0].slice(0, 80);
  return { caption, youtubeTitle };
}

async function processRow(id: string) {
  const supabase = createAdminClient();
  const { data: row, error: loadErr } = await supabase
    .from('content_queue')
    .select('id, drive_file_id, drive_file_name, title, caption, transcript')
    .eq('id', id)
    .single();
  if (loadErr || !row) throw new Error(`Row ${id} not found`);
  if (!row.drive_file_id) throw new Error('Row has no drive_file_id');
  // Skip if already processed (caption present, not the placeholder, and we have a transcript)
  if (row.transcript && row.caption && row.caption !== 'Generating caption…') {
    return { id, transcriptLen: row.transcript.length, captionLen: row.caption.length, skipped: true };
  }

  const fileData = await downloadDriveFile(row.drive_file_id);
  if (!fileData) {
    await supabase.from('content_queue').update({
      caption: '', error: 'Failed to download from Google Drive', updated_at: new Date().toISOString(),
    }).eq('id', id);
    throw new Error('Drive download failed');
  }

  let transcript: string;
  try {
    transcript = await transcribe(fileData.buffer, row.drive_file_name);
  } catch (err) {
    const sizeMB = (fileData.buffer.byteLength / 1024 / 1024).toFixed(1);
    const reason = err instanceof Error ? err.message : 'transcription failed';
    const hint = fileData.buffer.byteLength > INLINE_MAX_BYTES
      ? ` (file is ${sizeMB} MB — Gemini File API is currently failing for large uploads; try re-exporting under 25 MB at lower bitrate / H.264).`
      : '';
    await supabase.from('content_queue').update({
      caption: '', error: `${reason}${hint}`, updated_at: new Date().toISOString(),
    }).eq('id', id);
    throw err;
  }

  if (!transcript) {
    await supabase.from('content_queue').update({
      caption: '', error: 'Gemini returned an empty transcript (silent video?)', updated_at: new Date().toISOString(),
    }).eq('id', id);
    throw new Error('Empty transcript');
  }

  const voiceRef = await getVoiceReference();
  const { caption, youtubeTitle } = await generateCaption(transcript, row.title, voiceRef);

  await supabase.from('content_queue').update({
    transcript,
    suggested_caption: caption || null,
    caption: caption || '',
    youtube_title: youtubeTitle || null,
    error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  return { id, transcriptLen: transcript.length, captionLen: caption.length };
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const result = await processRow(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const result = await processRow(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
