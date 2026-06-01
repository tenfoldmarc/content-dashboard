import { NextResponse } from 'next/server';
import { googleOAuthRedirectUri } from '@/lib/config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID || '',
      client_secret: process.env.GMAIL_CLIENT_SECRET || '',
      redirect_uri: googleOAuthRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.error) {
    return NextResponse.json({ error: tokens.error, description: tokens.error_description }, { status: 400 });
  }

  // Show the refresh token so it can be saved
  return new NextResponse(`
    <html>
      <body style="font-family: monospace; padding: 40px; background: #0a0a0f; color: #f0f0f5;">
        <h2 style="color: #635bff;">Google OAuth Success!</h2>
        <p>Copy this refresh token and paste it back to Claude Code:</p>
        <textarea style="width:100%; height:80px; background:#16161f; color:#3ecf8e; border:1px solid #222233; padding:12px; font-family:monospace; font-size:14px;" readonly>${tokens.refresh_token || 'NO REFRESH TOKEN - try again with prompt=consent'}</textarea>
        <p style="color: #8a8a9a; margin-top: 12px;">You can close this tab now.</p>
      </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } });
}
