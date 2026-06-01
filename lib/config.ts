// Central place for everything that makes this dashboard "yours".
// Set these in .env (see .env.example). Everything has a safe placeholder
// default so the app still boots before you've filled them in.
//
// NEXT_PUBLIC_* values are inlined at build time and safe to use in both
// server and client components. The rest are server-only.

// ─── Branding (safe for client + server) ─────────────────────────
export const BRAND = {
  // Shown in the browser tab, login screen, sidebar logo alt text, notifications.
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Content Dashboard',
  // First name used in the "Good morning, ___" greeting on the overview page.
  ownerFirstName: process.env.NEXT_PUBLIC_OWNER_NAME || 'there',
  // Public app URL (no trailing slash), e.g. https://your-dashboard.vercel.app
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, ''),
};

// ─── Creator profile (server-only — used to steer AI prompts) ─────
// These describe the person the AI is writing for. Generic defaults keep
// the app working; override them so generated scripts/captions/ideas
// actually sound like you.
export const CREATOR = {
  name: process.env.CREATOR_NAME || 'the creator',
  handle: process.env.CREATOR_HANDLE || 'yourhandle',
  // One sentence on what you teach / post about.
  niche: process.env.CREATOR_NICHE
    || 'helping their audience get results in their niche',
  // One sentence on who is watching.
  audience: process.env.CREATOR_AUDIENCE
    || 'people who follow them for practical, no-fluff advice',
  // A few words on tone of voice.
  voice: process.env.CREATOR_VOICE
    || 'Direct, energetic, no fluff. Real talk with genuine care.',
};

// A reusable persona preamble for AI prompts. Drop this into any system /
// user prompt that should write in the creator's voice.
export function creatorPersona(): string {
  return `You are writing for ${CREATOR.name} (@${CREATOR.handle}). `
    + `${CREATOR.name} ${CREATOR.niche}. `
    + `Their audience: ${CREATOR.audience}. `
    + `Voice: ${CREATOR.voice}`;
}

// ─── Integrations ────────────────────────────────────────────────
// Google Drive folder the publishing queue pulls "ready to post" videos from.
export const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';

// Only pull Drive files created on/after this date (avoids re-importing an
// entire archive on first run). ISO 8601. Leave blank to import everything.
export const DRIVE_CUTOFF_DATE = process.env.GOOGLE_DRIVE_CUTOFF_DATE?.trim() || '';

// Zernio account IDs per platform (scheduling). Find them via the Zernio
// accounts list. Any platform left blank is simply skipped.
export const ZERNIO_ACCOUNTS: Record<string, string> = {
  instagram: process.env.ZERNIO_ACCOUNT_INSTAGRAM?.trim() || '',
  tiktok: process.env.ZERNIO_ACCOUNT_TIKTOK?.trim() || '',
  youtube: process.env.ZERNIO_ACCOUNT_YOUTUBE?.trim() || '',
  facebook: process.env.ZERNIO_ACCOUNT_FACEBOOK?.trim() || '',
};

// Only the platforms you've actually connected (non-empty account IDs).
export function enabledZernioPlatforms(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ZERNIO_ACCOUNTS).filter(([, id]) => id),
  );
}

// Redirect URI for the Gmail/Google OAuth callback. Derived from your app URL.
export function googleOAuthRedirectUri(): string {
  const base = BRAND.appUrl || 'http://localhost:3000';
  return `${base}/api/auth/google/callback`;
}
