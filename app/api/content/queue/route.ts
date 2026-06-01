import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyFolder, listFolderMedia, downloadFile, type DriveFile } from '@/lib/drive';
import { DRIVE_FOLDER_ID, DRIVE_CUTOFF_DATE, enabledZernioPlatforms, creatorPersona, CREATOR } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ZERNIO_KEY = process.env.ZERNIO_API_KEY?.trim();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();
const CUTOFF_DATE = DRIVE_CUTOFF_DATE;

const PLATFORM_ACCOUNTS: Record<string, string> = enabledZernioPlatforms();

// Cached voice reference — loaded once per request
let cachedVoiceRef: string | null = null;

async function getVoiceReference(): Promise<string> {
  if (cachedVoiceRef) return cachedVoiceRef;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('client_posts')
    .select('content')
    .order('posted_at', { ascending: false })
    .limit(15);
  cachedVoiceRef = (data || [])
    .map((p: { content: string }) => p.content)
    .filter((c: string) => c && c.length > 20)
    .slice(0, 10)
    .map((c: string, i: number) => `${i + 1}. "${c.slice(0, 300)}"`)
    .join('\n');
  return cachedVoiceRef;
}

// ─── Google Drive helpers (API-key or OAuth mode — see lib/drive.ts) ───

async function verifyDriveFolder(): Promise<boolean> {
  return verifyFolder(DRIVE_FOLDER_ID);
}

async function listDriveVideos(): Promise<DriveFile[]> {
  return listFolderMedia(DRIVE_FOLDER_ID, CUTOFF_DATE || undefined);
}

async function downloadDriveFile(fileId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  return downloadFile(fileId);
}

// ─── Transcribe with Gemini (handles video files up to 2GB natively) ───
// Throws an Error with a user-readable message on failure so callers can surface it in the UI.

async function transcribe(buffer: ArrayBuffer, fileName: string): Promise<string> {
  if (!GEMINI_KEY) { console.error('Transcribe: No GEMINI_API_KEY'); throw new Error('Server missing GEMINI_API_KEY'); }

  const sizeMB = buffer.byteLength / (1024 * 1024);
  console.log(`Transcribe: ${fileName} (${sizeMB.toFixed(1)}MB) via Gemini`);

  let fileUri: string | null = null;
  let fileName_remote: string | null = null;

  try {
    // 1. Start resumable upload to Gemini Files API
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
    if (!startRes.ok) {
      const body = (await startRes.text()).slice(0, 200);
      console.error(`Transcribe: Gemini upload start failed ${startRes.status} — ${body}`);
      throw new Error(`Gemini upload start failed (${startRes.status})`);
    }
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) { console.error('Transcribe: No upload URL returned'); throw new Error('Gemini did not return an upload URL'); }

    // 2. Upload the bytes
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Length': String(buffer.byteLength),
      },
      body: buffer,
    });
    if (!uploadRes.ok) {
      const body = (await uploadRes.text()).slice(0, 200);
      console.error(`Transcribe: Gemini upload failed ${uploadRes.status} — ${body}`);
      throw new Error(`Gemini upload failed (${uploadRes.status})`);
    }
    const uploadData = await uploadRes.json();
    fileUri = uploadData.file?.uri;
    fileName_remote = uploadData.file?.name;
    if (!fileUri || !fileName_remote) { console.error('Transcribe: No file URI in upload response'); throw new Error('Gemini upload returned no file URI'); }

    // 3. Poll until file is ACTIVE (videos need processing)
    let state = uploadData.file?.state || 'PROCESSING';
    let attempts = 0;
    while (state === 'PROCESSING' && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName_remote}?key=${GEMINI_KEY}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        state = checkData.state || 'PROCESSING';
      }
      attempts++;
    }
    if (state !== 'ACTIVE') {
      console.error(`Transcribe: File not ACTIVE after polling (state=${state})`);
      throw new Error(`Gemini file processing stuck in ${state} after 60s`);
    }

    // 4. Transcribe + extract visual context with Gemini 2.5 Flash
    //    Retry on 5xx/429 (Gemini occasionally returns 503 "high demand")
    const genBody = JSON.stringify({
      contents: [{
        parts: [
          { fileData: { mimeType: 'video/mp4', fileUri } },
          { text: `Watch this short-form video and return JSON ONLY (no markdown, no commentary) in this exact shape:

{
  "transcript": "verbatim transcript of all spoken words, no timestamps or labels",
  "visual_context": "1-3 short sentences covering what's shown on screen — any on-screen text, captions, software/tools demoed, screen recordings, key visuals. Skip generic 'a person is talking' descriptions."
}

If the video has no speech, set transcript to "". If there's nothing visually noteworthy, set visual_context to "".` },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    });

    // Try a chain of Gemini models — fall through on transient errors (5xx/404/429).
    // 4xx (other than 404/429) are non-retriable and fail fast.
    const callModel = async (model: string): Promise<Response> => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: genBody },
    );

    const fallbackChain = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
    const failures: string[] = [];
    let genRes: Response | null = null;
    for (const model of fallbackChain) {
      const r = await callModel(model);
      if (r.ok) {
        if (failures.length) console.warn(`Transcribe: succeeded on ${model} after ${failures.join(', ')}`);
        genRes = r;
        break;
      }
      const status = r.status;
      const transient = status === 429 || status === 404 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!transient) {
        const body = (await r.text()).slice(0, 200);
        console.error(`Transcribe: ${model} non-retriable error ${status} — ${body}`);
        throw new Error(`Gemini ${model} error ${status}: ${body.slice(0, 100)}`);
      }
      console.warn(`Transcribe: ${model} returned ${status} — trying next in chain`);
      failures.push(`${model}:${status}`);
    }
    if (!genRes) {
      throw new Error(`All Gemini models unavailable — ${failures.join(', ')}`);
    }
    const genData = await genRes.json();
    const raw = genData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    let transcript = '';
    let visualContext = '';
    try {
      const parsed = JSON.parse(raw);
      transcript = (parsed.transcript || '').trim();
      visualContext = (parsed.visual_context || '').trim();
    } catch {
      // Fallback: treat raw output as transcript
      transcript = raw;
    }
    // Combine into single string returned to caller — visual_context tagged so generateCaption can use it
    const combined = visualContext
      ? `${transcript}\n\n[VISUAL CONTEXT: ${visualContext}]`
      : transcript;
    console.log(`Transcribe: Success — transcript ${transcript.length} chars, visual ${visualContext.length} chars`);
    return combined;
  } catch (err) {
    console.error('Transcribe: Exception —', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    // Clean up the uploaded file (best-effort)
    if (fileName_remote) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName_remote}?key=${GEMINI_KEY}`, { method: 'DELETE' })
        .catch(() => {});
    }
  }
}

// ─── Generate caption with Claude ───

async function generateCaption(transcript: string, title: string, voiceRef: string): Promise<{ caption: string; youtubeTitle: string }> {
  if (!ANTHROPIC_KEY) return { caption: '', youtubeTitle: '' };
  try {
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

LINE 1 (hook): One short sentence that creates curiosity and is SPECIFIC to what they actually say or show in this video. Reference the actual content — never generic.

LINE 2 (CTA) — derive from the transcript using these rules in order:
  a) If they tell viewers to comment a specific word/phrase (e.g. "comment GUIDE", "comment AI", "say AGENT in the comments"), output exactly: Comment "WORD" for the [thing they're offering]
     — Use the EXACT word they say, in quotes. Match "thing they're offering" to what they actually mentioned: "the full guide", "the template", "the breakdown", "the prompt", "the cheat sheet", etc.
  b) If they give a different specific CTA (DM me, link in bio, save this, share with X), use their exact ask in plain language.
  c) If there is no specific CTA, or they just say something like "follow for more", output exactly: Follow @${CREATOR.handle} for more videos like this

After LINE 2, leave a blank line, then 3-5 lowercase hashtags relevant to the content of the video.

Caption rules:
- Match their tone (see voice above)
- No emojis
- Under 500 characters total
- Do NOT invent a CTA they didn't say. If unsure, default to rule (c).
- The two lines must clearly connect: the hook should make rule (a/b/c) feel earned.

2. YOUTUBE_TITLE: A short, catchy YouTube Shorts title under 80 characters. No hashtags. Should make people want to click.

Format your response EXACTLY like this:
---CAPTION---
[the caption here]
---YOUTUBE_TITLE---
[the title here]` }],
      }),
    });
    if (!res.ok) return { caption: '', youtubeTitle: '' };
    const data = await res.json();
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '';

    // Parse the structured response
    const captionMatch = text.match(/---CAPTION---\s*([\s\S]*?)(?:---YOUTUBE_TITLE---|$)/);
    const ytTitleMatch = text.match(/---YOUTUBE_TITLE---\s*([\s\S]*?)$/);

    const caption = captionMatch ? captionMatch[1].trim() : text;
    const youtubeTitle = ytTitleMatch ? ytTitleMatch[1].trim().slice(0, 100) : caption.split('\n')[0].slice(0, 80);

    return { caption, youtubeTitle };
  } catch { return { caption: '', youtubeTitle: '' }; }
}

// Note: transcription + captioning has moved to /api/content/process. Each row
// is processed in its own request (no waitUntil), driven by the client.

// ─── Zernio helpers ───

async function uploadToZernio(fileName: string, fileType: string, fileBuffer: ArrayBuffer): Promise<string | null> {
  if (!ZERNIO_KEY) return null;
  try {
    const presignRes = await fetch('https://zernio.com/api/v1/media/presign', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ZERNIO_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileName, contentType: fileType }),
    });
    if (!presignRes.ok) return null;
    const { uploadUrl, publicUrl } = await presignRes.json();
    if (!uploadUrl || !publicUrl) return null;

    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': fileType }, body: fileBuffer });
    if (!putRes.ok) return null;
    return publicUrl;
  } catch { return null; }
}

async function scheduleOnZernio(
  caption: string, mediaPublicUrl: string, platforms: string[],
  scheduledFor: Date, youtubeTitle?: string, isTrialReel?: boolean,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  if (!ZERNIO_KEY) return { success: false, error: 'ZERNIO_API_KEY not configured' };

  const platformEntries = platforms.map(p => {
    const entry: Record<string, unknown> = { platform: p, accountId: PLATFORM_ACCOUNTS[p] };
    if (p === 'youtube') {
      entry.platformSpecificData = { title: youtubeTitle || caption.slice(0, 100), visibility: 'public', madeForKids: false };
    }
    if (p === 'instagram' && isTrialReel) {
      entry.platformSpecificData = { trialParams: { graduationStrategy: 'MANUAL' } };
    }
    return entry;
  }).filter(e => e.accountId);

  const body: Record<string, unknown> = { content: caption, platforms: platformEntries, scheduledFor: scheduledFor.toISOString() };
  if (mediaPublicUrl) body.mediaItems = [{ type: 'video', url: mediaPublicUrl }];

  try {
    const res = await fetch('https://zernio.com/api/v1/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ZERNIO_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { success: false, error: (await res.text()).slice(0, 300) };
    const data = await res.json();
    return { success: true, postId: data.post?._id || data._id || 'scheduled' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}

// ═══════════════════════════════════════════════════════
// GET: Check Drive for new files, transcribe + generate captions
// ═══════════════════════════════════════════════════════

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scan = url.searchParams.get('scan') !== '0'; // ?scan=0 → skip Drive scan, just return queue
    const supabase = createAdminClient();
    const { data: queue } = await supabase.from('content_queue').select('*').order('created_at', { ascending: false });

    if (!scan) {
      return NextResponse.json({
        queue: queue || [],
        newFilesFound: 0,
        processing: 0,
        driveFolderId: DRIVE_FOLDER_ID,
        driveConnected: true,
        platforms: Object.keys(PLATFORM_ACCOUNTS),
      });
    }

    // Auto-publish: mark scheduled items as published if scheduled_for is >15 min in the past
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const scheduledItems = (queue || []).filter(
      (q: { status: string; scheduled_for: string | null }) =>
        q.status === 'scheduled' && q.scheduled_for && new Date(q.scheduled_for) < fifteenMinAgo
    );
    for (const item of scheduledItems) {
      await supabase.from('content_queue').update({
        status: 'published',
        published_at: item.scheduled_for,
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);
    }

    const driveConnected = await verifyDriveFolder();
    let newFilesFound = 0;
    let processing = 0;

    if (driveConnected) {
      const driveFiles = await listDriveVideos();
      const existingFileIds = new Set((queue || []).map((q: { drive_file_id: string }) => q.drive_file_id).filter(Boolean));

      for (const file of driveFiles) {
        if (existingFileIds.has(file.id)) continue;

        newFilesFound++;
        processing++;

        const cleanTitle = file.name.replace(/\.[^.]+$/, '');

        const { data: inserted, error: insertError } = await supabase.from('content_queue').insert({
          title: cleanTitle,
          drive_file_id: file.id,
          drive_file_name: file.name,
          drive_file_url: file.webViewLink,
          thumbnail_url: file.thumbnailLink || null,
          transcript: null,
          suggested_caption: null,
          caption: 'Generating caption…',
          youtube_title: null,
          status: 'ready',
        }).select('id').single();

        if (insertError) {
          console.error(`[queue] Supabase insert failed for "${file.name}":`, insertError);
        } else if (inserted?.id) {
          // Fire-and-forget: each /api/content/process call runs as its own
          // serverless invocation with its own 300s budget. We don't await so
          // the queue scan returns fast. The cron /api/cron/process-pending-captions
          // is the safety net for any rows this misses.
          const origin = new URL(request.url).origin;
          fetch(`${origin}/api/content/process?id=${inserted.id}`, { cache: 'no-store' }).catch(() => { /* server writes error to row */ });
        }
      }
    }

    const { data: updatedQueue } = await supabase.from('content_queue').select('*').order('created_at', { ascending: false });

    return NextResponse.json({
      queue: updatedQueue || [],
      newFilesFound,
      processing,
      driveFolderId: DRIVE_FOLDER_ID,
      driveConnected,
      platforms: Object.keys(PLATFORM_ACCOUNTS),
    });
  } catch (error) {
    return NextResponse.json({ queue: [], error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════
// POST: Schedule, update, or delete queue items
// ═══════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = createAdminClient();

    if (action === 'schedule') {
      const { id, caption, platforms, scheduledFor, youtubeTitle, isTrialReel } = body;

      if (!id || !platforms || platforms.length === 0 || !scheduledFor) {
        return NextResponse.json({ error: 'id, platforms, and scheduledFor are required' }, { status: 400 });
      }

      const { data: item } = await supabase.from('content_queue').select('*').eq('id', id).single();
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

      // Download from Drive + upload to Zernio
      let mediaPublicUrl = item.media_url;
      if (!mediaPublicUrl && item.drive_file_id) {
        const fileData = await downloadDriveFile(item.drive_file_id);
        if (!fileData) return NextResponse.json({ error: 'Failed to download from Google Drive' }, { status: 500 });

        mediaPublicUrl = await uploadToZernio(item.drive_file_name || 'video.mp4', fileData.mimeType, fileData.buffer);
        if (!mediaPublicUrl) return NextResponse.json({ error: 'Failed to upload to Zernio' }, { status: 500 });
      }

      // Schedule via Zernio — use stored YouTube title if not provided
      const finalYoutubeTitle = youtubeTitle || item.youtube_title || undefined;
      const result = await scheduleOnZernio(
        caption || item.caption || item.title || '',
        mediaPublicUrl || '', platforms,
        new Date(scheduledFor), finalYoutubeTitle, isTrialReel,
      );

      await supabase.from('content_queue').update({
        caption: caption || item.caption,
        status: result.success ? 'scheduled' : 'failed',
        platforms, scheduled_for: scheduledFor, media_url: mediaPublicUrl,
        is_trial_reel: isTrialReel || false,
        zernio_post_ids: { postId: result.postId },
        error: result.success ? null : result.error,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      return NextResponse.json({ success: result.success, postId: result.postId, error: result.error });
    }

    if (action === 'update') {
      const { id, caption, title } = body;
      const updates: Record<string, string> = {};
      if (caption !== undefined) updates.caption = caption;
      if (title !== undefined) updates.title = title;
      updates.updated_at = new Date().toISOString();
      await supabase.from('content_queue').update(updates).eq('id', id);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      // Soft-delete: mark as 'removed' so the row stays in the DB and the file
      // won't be re-imported on the next Drive scan (dedup is by drive_file_id).
      await supabase.from('content_queue').update({
        status: 'removed',
        updated_at: new Date().toISOString(),
      }).eq('id', body.id);
      return NextResponse.json({ success: true });
    }

    if (action === 'regenerate-caption') {
      const { id } = body;
      const { data: item } = await supabase.from('content_queue').select('*').eq('id', id).single();
      if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      // If transcript is missing, re-download from Drive and re-transcribe
      let transcript = (item.transcript || '').trim();
      if (!transcript && item.drive_file_id) {
        const fileData = await downloadDriveFile(item.drive_file_id);
        if (!fileData) {
          await supabase.from('content_queue').update({ error: 'Failed to download from Google Drive', updated_at: new Date().toISOString() }).eq('id', id);
          return NextResponse.json({ success: false, error: 'Failed to download from Google Drive', transcribed: false }, { status: 502 });
        }
        try {
          transcript = await transcribe(fileData.buffer, item.drive_file_name || 'video.mp4');
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Transcription failed';
          await supabase.from('content_queue').update({ error: reason, updated_at: new Date().toISOString() }).eq('id', id);
          return NextResponse.json({ success: false, error: reason, transcribed: false }, { status: 502 });
        }
        if (transcript) {
          await supabase.from('content_queue').update({ transcript }).eq('id', id);
        }
      }

      // Don't generate a caption from nothing — surface the failure
      if (!transcript) {
        const msg = 'Gemini returned an empty transcript (silent video?)';
        await supabase.from('content_queue').update({ error: msg, updated_at: new Date().toISOString() }).eq('id', id);
        return NextResponse.json({ success: false, error: msg, transcribed: false }, { status: 502 });
      }

      const voiceRef = await getVoiceReference();
      const { caption, youtubeTitle: ytTitle } = await generateCaption(transcript, item.title || '', voiceRef);
      await supabase.from('content_queue').update({ suggested_caption: caption, caption, youtube_title: ytTitle, updated_at: new Date().toISOString() }).eq('id', id);
      return NextResponse.json({ success: true, caption, youtubeTitle: ytTitle, transcribed: true });
    }

    if (action === 'sync-zernio') {
      if (!ZERNIO_KEY) return NextResponse.json({ error: 'ZERNIO_API_KEY not configured' }, { status: 500 });

      const { data: scheduledItems } = await supabase
        .from('content_queue')
        .select('*')
        .eq('status', 'scheduled');

      const results: { id: string; title: string; newStatus: string }[] = [];

      for (const item of scheduledItems || []) {
        const postId = item.zernio_post_ids?.postId;
        if (!postId || postId === 'scheduled') continue;

        try {
          const res = await fetch(`https://zernio.com/api/v1/posts/${postId}`, {
            headers: { Authorization: `Bearer ${ZERNIO_KEY}` },
          });

          if (res.status === 404) {
            await supabase.from('content_queue').update({
              status: 'removed',
              error: 'Post deleted from Zernio',
              updated_at: new Date().toISOString(),
            }).eq('id', item.id);
            results.push({ id: item.id, title: item.title, newStatus: 'removed' });
          } else if (res.ok) {
            const post = await res.json();
            const postStatus = post.post?.status || post.status;

            if (postStatus === 'published' || postStatus === 'completed') {
              await supabase.from('content_queue').update({
                status: 'published',
                published_at: post.post?.publishedAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('id', item.id);
              results.push({ id: item.id, title: item.title, newStatus: 'published' });
            } else if (postStatus === 'failed' || postStatus === 'error') {
              await supabase.from('content_queue').update({
                status: 'failed',
                error: `Zernio status: ${postStatus}`,
                updated_at: new Date().toISOString(),
              }).eq('id', item.id);
              results.push({ id: item.id, title: item.title, newStatus: 'failed' });
            }
            // If still 'scheduled'/'pending' in Zernio, leave as-is
          }
        } catch (err) {
          console.error(`[sync-zernio] Failed to check post ${postId}:`, err);
        }
      }

      return NextResponse.json({ success: true, synced: results.length, results });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
