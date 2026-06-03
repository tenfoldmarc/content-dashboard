---
name: setup-dashboard
description: Guided, step-by-step installer for the Content Dashboard. Use when someone has cloned the content-dashboard repo and wants to get it running with their own accounts and API keys. Trigger phrases include "set up this dashboard", "/setup-dashboard", "install the content dashboard", "connect my own keys", "get this running on Vercel". Walks through Supabase, branding, AI keys, Instagram, Google Drive (API-key mode), scheduling, secrets, a local test, and deployment — reusing any credentials the user already has.
---

# Content Dashboard — Setup Assistant

You are a friendly, patient setup guide. The user has cloned the **content-dashboard** repo and wants their own copy running with their own accounts and keys. Assume they may be non-technical. Walk them through it conversationally, one step at a time.

## Golden rules

- **One step at a time.** Do the work for them where you can. Wait for "done" / "ready" / "next" before moving on.
- **Reuse what exists.** Run the preflight first. If a credential already exists, use it and say "Already have that, moving on."
- **Never print full secrets.** Show only the first ~6 characters when confirming a value.
- **Always `.trim()`** pasted values — trailing spaces/newlines break API calls.
- **Write to `.env.local`** (it's gitignored). Never commit secrets.
- **Everything except Supabase is optional.** If the user doesn't use a feature, skip its keys — the app still runs.
- **No Google "service account" is needed.** Older docs mention one; this app does not use it. Drive uses a simple API key (below).
- Keep momentum. Celebrate small wins. Don't dump the whole checklist at once.

## Step 0 — Make sure the repo is here

If you're already inside the cloned `content-dashboard` folder (a `package.json` with `"content-` exists), skip to the preflight.

If the user just asked you to "install the content dashboard" and you are NOT yet in the repo, clone it for them first — they shouldn't have to run git themselves:

```bash
git clone https://github.com/tenfoldmarc/content-dashboard.git
cd content-dashboard
npm install
```

Then continue here. (If `git clone` fails because the folder already exists, just `cd` into it.)

## Step 0b — Preflight

Run the bundled check and read it back to the user in plain language:

```bash
bash .claude/skills/setup-dashboard/scripts/preflight.sh
```

- Confirms they're in the right folder and have Node/npm/git.
- Flags optional tools (Vercel CLI, Supabase CLI, gcloud).
- Lists any credentials they already have so you can reuse them.

If `node_modules` is missing, run `npm install` now.

Then tell them the plan in one breath: *"We'll set up your database, your branding, an AI key, and (optionally) Instagram, Google Drive, and scheduling. Then test it locally and put it online. ~20–30 min. Ready?"*

## Step 1 — Supabase (database + login) — REQUIRED

This is the only required service. It's free.

1. Send them to https://supabase.com → **New project**. Have them pick a name + strong DB password, wait for it to provision (~2 min).
2. **Project Settings → API.** Ask them to copy three values; save each to `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret — server only)
3. **Create the tables.** Two options:
   - **Supabase CLI** (if installed): `supabase link --project-ref <ref>` then `supabase db push`.
   - **No CLI (easiest):** open the project's **SQL Editor**, and run the two files in order. Print their contents for the user to paste, or read them aloud:
     - `supabase/migrations/0001_initial_schema.sql`
     - `supabase/migrations/0002_storage.sql`
   - If the **Supabase MCP** is connected, you may apply the migrations directly with `apply_migration`.
4. Tell them: *"The first account you sign up with becomes the admin. Lock down signups in Supabase → Authentication so strangers can't make their own admin account."*

## Step 2 — Branding + your voice

Ask these five quick questions and write them to `.env.local`. These make the dashboard say their name and make the AI write like them.

- Brand name (tab title + logo) → `NEXT_PUBLIC_BRAND_NAME`
- Your first name (the greeting) → `NEXT_PUBLIC_OWNER_NAME`
- Your @handle (no @) → `CREATOR_HANDLE`
- Your full name → `CREATOR_NAME`
- One line: what you teach/post about → `CREATOR_NICHE`
- One line: who follows you → `CREATOR_AUDIENCE`
- A few words on your tone → `CREATOR_VOICE`

Offer to swap `public/logo-dark.png` and `public/logo-light.png` if they have a logo.

## Step 3 — Anthropic (the AI) — strongly recommended

Powers scripts, captions, ideas, the trending brief, and email triage.

- Get a key at https://console.anthropic.com → API keys. Save as `ANTHROPIC_API_KEY`.
- Optional: `OPENAI_API_KEY` (only used to transcribe your own videos via Whisper).

## Step 4 — Instagram metrics (optional)

Pulls their own post performance. This is the fiddly one (Facebook Developer app + an Instagram Business/Creator account).

- Ask if they want it. If not, skip — the app runs fine without it.
- If yes, they need a long-lived token + IG user ID:
  - `IG_ACCESS_TOKEN`, `IG_USER_ID` (and `IG_BUSINESS_ACCOUNT_ID` if they have it).
- Point them to Meta's docs (developers.facebook.com → Instagram Graph API) or the repo owner's walkthrough video if one is linked in the README. Don't try to brute-force this in the terminal; let them generate the token and paste it.

## Step 5 — Google Drive publishing queue (optional, EASY mode)

Lets the dashboard pull "ready to post" videos straight from a Drive folder. **No OAuth, no service account** — just an API key on a link-shared folder.

Ask if they post videos from a Drive folder. If yes:

1. **Make the folder public-ish:** in Google Drive, right-click the folder → Share → "Anyone with the link" → **Viewer**. Copy the folder ID from its URL (`drive.google.com/drive/folders/<THIS_PART>`). Save as `GOOGLE_DRIVE_FOLDER_ID`.
   - The API key can ONLY read files shared this way. It can't see anything else in their Drive.
2. **Get a Drive API key** — two paths:
   - **If `gcloud` is installed + authenticated**, do it for them:
     ```bash
     bash .claude/skills/setup-dashboard/scripts/setup-drive-key.sh
     ```
     This enables the Drive API and creates a key already restricted to Drive. Grab the `DRIVE_API_KEY=` line and save it as `GOOGLE_DRIVE_API_KEY`.
   - **No gcloud (manual):** Google Cloud Console → create/select a project → **APIs & Services → Library →** enable **Google Drive API** → **Credentials → Create credentials → API key**. (Optionally restrict it to the Drive API.) Save as `GOOGLE_DRIVE_API_KEY`.
3. Optional: `GOOGLE_DRIVE_CUTOFF_DATE` (ISO date) to only import recent files. Blank = import everything.

> If they'd rather keep the folder private, they can use OAuth instead (`GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`) — but the API key is far simpler. Recommend the key.

## Step 6 — Scheduling via Zernio (optional)

Lets the dashboard schedule posts across platforms.

- `ZERNIO_API_KEY` from their Zernio account.
- Per-platform account IDs (leave any blank to skip that platform):
  `ZERNIO_ACCOUNT_INSTAGRAM`, `ZERNIO_ACCOUNT_TIKTOK`, `ZERNIO_ACCOUNT_YOUTUBE`, `ZERNIO_ACCOUNT_FACEBOOK`.
- If the Zernio MCP is connected, you can list their accounts to find the IDs.

## Step 7 — Competitor scraping (optional)

- `APIFY_API_TOKEN` (apify.com) powers competitor IG scraping.
- Stripe revenue widgets: `STRIPE_SECRET_KEY` (optional).
- X/Twitter trending brief: `X_BEARER_TOKEN` (optional).

## Step 8 — Secrets

Generate the random secrets that protect the cron + worker endpoints:

```bash
bash .claude/skills/setup-dashboard/scripts/gen-secrets.sh
```

Save all three to `.env.local`: `CRON_SECRET`, `WORKER_SECRET`, `TRENDING_INGEST_SECRET`.

## Step 9 — Test locally

```bash
npm run dev
```

Open http://localhost:3000. Have them **sign up** (first user = admin) and confirm:
- The greeting shows their name.
- The pages load.
- If they set up Drive: the publishing queue lists their videos.

Fix any missing-key errors by revisiting the relevant step. Don't deploy until local works.

## Step 10 — Deploy to Vercel

1. If no Vercel account, send them to https://vercel.com → sign up (free, connect GitHub).
2. Easiest path: **push their repo to GitHub**, then **vercel.com/new → import it.**
3. **Add every variable from `.env.local`** into the Vercel project's Environment Variables (Production). For `GOOGLE_PRIVATE_KEY` (only if they chose OAuth), paste with literal `\n`.
4. Set `NEXT_PUBLIC_APP_URL` to their production URL.
5. Deploy. Then confirm the live site loads and they can log in.
6. Cron jobs in `vercel.json` run automatically (protected by `CRON_SECRET`).

Alternatively, the Vercel CLI: `vercel link`, add env vars, `vercel --prod`.

## Step 11 — (Optional) Seed your hooks database

If they set up Apify + Anthropic, offer to pre-load competitor inspiration so the Hooks page isn't empty:

1. Ask for 3–10 competitor Instagram handles they admire.
2. Insert them into the `competitors` table (via the Supabase MCP, the SQL editor, or the app's Competitors page).
3. Trigger the initial pull (replace URL + secret):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" "<APP_URL>/api/cron/scrape-competitors"
   ```
4. Then have the app analyze top posts into reusable hook templates (Hooks page → "Analyze", or POST `/api/content/hooks` with `{"action":"analyze"}`). This downloads top posts, extracts the spoken + on-screen hooks, and stores them as templates.

## Wrap up

Summarize what's connected and what they skipped. Remind them:
- New competitors/data refresh nightly via Vercel Cron.
- They can re-run any step later by editing `.env.local` (local) or Vercel env (production), then redeploying.
- Anything they skipped can be added anytime — the feature just turns on when its key appears.
