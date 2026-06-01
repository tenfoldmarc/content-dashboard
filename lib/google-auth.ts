// Refresh Google OAuth token using direct HTTP call
// This works around googleapis library issues on Vercel

let cachedToken: { token: string; expiry: number } | null = null;

export async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) return null;

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiry > Date.now() + 60000) {
    return cachedToken.token;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Token refresh failed: ${err.error} - ${err.error_description}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiry: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.token;
}
