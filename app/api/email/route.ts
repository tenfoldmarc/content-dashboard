import { NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/google-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function gmailFetch(path: string, options?: RequestInit) {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error('No Google access token');

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Gmail API ${res.status}`);
  }

  return res.json();
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function extractBody(payload: { body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }> }): string {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      }
    }
    for (const part of payload.parts) {
      if ((part as { parts?: unknown[] }).parts) {
        const nested = extractBody(part as typeof payload);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  return match ? { name: match[1].replace(/^"|"$/g, '').trim(), email: match[2] } : { name: from, email: from };
}

// Triage with Claude Haiku
async function triageEmails(emails: { id: string; subject: string; from: string; email: string }[]): Promise<Map<string, { priority: string; category: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const map = new Map<string, { priority: string; category: string }>();
  if (!apiKey || emails.length === 0) {
    emails.forEach(e => map.set(e.id, { priority: 'medium', category: 'Uncategorized' }));
    return map;
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250414',
        max_tokens: 2048,
        messages: [{ role: 'user', content: `You are an email triage assistant for a content creator and small-business owner.

Classify each email:
- "high" = Business opportunities, client communications, partnerships, revenue-related
- "medium" = Team messages, project updates, service notifications needing attention
- "low" = Billing, routine notifications, tool updates
- "filtered" = Newsletters, marketing, automated notifications, promotional, spam

Category labels: "Business", "Team", "Billing", "Newsletter", "Notification"

Emails:
${emails.map((e, i) => `${i + 1}. id:"${e.id}" | Subject:"${e.subject}" | From: ${e.from} <${e.email}>`).join('\n')}

Respond as JSON array only: [{"id":"...","priority":"...","category":"..."}]` }],
      }),
    });
    if (!res.ok) throw new Error('Triage API error');
    const data = await res.json();
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '[]';
    const results: { id: string; priority: string; category: string }[] = JSON.parse(text);
    results.forEach(r => map.set(r.id, { priority: r.priority, category: r.category }));
  } catch {
    emails.forEach(e => map.set(e.id, { priority: 'medium', category: 'Uncategorized' }));
  }
  return map;
}

export async function GET() {
  try {
    const token = await getGoogleAccessToken();
    if (!token) {
      return NextResponse.json({ emails: [], filteredCount: 0, connected: false, note: 'Gmail not configured.' });
    }

    const supabase = createAdminClient();

    // Fetch latest 20 inbox messages
    const listData = await gmailFetch('/messages?maxResults=20&labelIds=INBOX');
    const messageRefs: { id: string }[] = listData.messages || [];

    if (messageRefs.length === 0) {
      return NextResponse.json({ emails: [], filteredCount: 0, connected: true });
    }

    const messageIds = messageRefs.map(m => m.id);

    // Check cache
    const { data: cached } = await supabase.from('email_triage').select('*').in('gmail_id', messageIds);
    const cachedMap = new Map((cached || []).map((r: { gmail_id: string }) => [r.gmail_id, r]));
    const uncachedIds = messageIds.filter(id => !cachedMap.has(id));

    if (uncachedIds.length > 0) {
      // Fetch message details
      interface ParsedMsg { gmail_id: string; thread_id: string; subject: string; sender_name: string; sender_email: string; snippet: string; full_body: string; received_at: string }
      const freshMessages: ParsedMsg[] = [];

      for (const msgId of uncachedIds.slice(0, 15)) {
        try {
          const msg = await gmailFetch(`/messages/${msgId}?format=full`);
          const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
          const sender = parseSender(getHeader(headers, 'From'));
          const body = extractBody(msg.payload);

          freshMessages.push({
            gmail_id: msg.id,
            thread_id: msg.threadId || '',
            subject: getHeader(headers, 'Subject'),
            sender_name: sender.name,
            sender_email: sender.email,
            snippet: msg.snippet || '',
            full_body: body.slice(0, 3000),
            received_at: new Date(parseInt(msg.internalDate || '0')).toISOString(),
          });
        } catch { /* skip failed messages */ }
      }

      // Triage
      const triageResults = await triageEmails(freshMessages.map(m => ({
        id: m.gmail_id, subject: m.subject, from: m.sender_name, email: m.sender_email,
      })));

      // Cache
      const rows = freshMessages.map(msg => ({
        ...msg,
        priority: triageResults.get(msg.gmail_id)?.priority || 'medium',
        category: triageResults.get(msg.gmail_id)?.category || 'Uncategorized',
      }));

      if (rows.length > 0) {
        await supabase.from('email_triage').upsert(rows, { onConflict: 'gmail_id' });
        for (const row of rows) cachedMap.set(row.gmail_id, row);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allEmails: any[] = messageIds.map(id => cachedMap.get(id)).filter(Boolean);
    const important = allEmails.filter(e => e.priority === 'high' || e.priority === 'medium');

    return NextResponse.json({ emails: important, filteredCount: allEmails.length - important.length, connected: true });
  } catch (error) {
    console.error('Email error:', error);
    return NextResponse.json({ emails: [], filteredCount: 0, connected: false, note: error instanceof Error ? error.message : 'Gmail error' });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'refresh') {
      const supabase = createAdminClient();
      await supabase.from('email_triage').delete().neq('gmail_id', '');
      return NextResponse.json({ success: true });
    }

    if (body.action === 'reply') {
      const token = await getGoogleAccessToken();
      if (!token) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

      const { to, subject, body: replyBody, threadId, messageId } = body;
      if (!to || !replyBody) return NextResponse.json({ error: 'to and body required' }, { status: 400 });

      const replySubject = subject ? `Re: ${subject.replace(/^Re:\s*/i, '')}` : 'Re:';
      const rawEmail = [
        `To: ${to}`, `Subject: ${replySubject}`,
        ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${messageId}`] : []),
        'Content-Type: text/plain; charset=utf-8', '', replyBody,
      ].join('\r\n');

      await gmailFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: Buffer.from(rawEmail).toString('base64url'), threadId: threadId || undefined }),
      });

      return NextResponse.json({ success: true, message: 'Reply sent' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
