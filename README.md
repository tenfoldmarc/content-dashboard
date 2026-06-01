# Content Dashboard

An open-source command center for content creators. Track your own post performance, spy on competitors, mine viral hooks, generate scripts and captions in your voice, queue videos from Google Drive, and schedule across platforms — all in one self-hosted dashboard.

Built with **Next.js 14**, **Supabase**, and the **Instagram Graph API**. Deploy your own copy in an afternoon.

---

## Features

- **Overview** — live follower/views metrics per platform, daily trending-topics brief.
- **My posts** — your Instagram posts pulled via the Graph API, with outlier detection.
- **Competitors** — scrape and track competitor accounts, compare performance.
- **Hooks** — auto-extract the hooks from top-performing posts and turn them into reusable templates.
- **Content pipeline** — AI-generated content ideas → scripts → scheduling, in your voice.
- **Publishing queue** — pull "ready to post" videos from a Google Drive folder, auto-write captions, schedule via Zernio.
- **Calendar** — content schedule alongside your Google Calendar.
- **Financials** — Stripe revenue widgets and goal tracking (optional).
- **Productivity** — tasks, kanban, weekly objectives, email triage.

Every integration is optional. Features whose API keys you leave blank simply stay dormant — the app still runs.

---

## Tech stack

| Layer        | Choice                                            |
|--------------|---------------------------------------------------|
| Framework    | Next.js 14 (App Router)                           |
| Database/Auth| Supabase (Postgres + Auth + Storage)              |
| Styling      | Tailwind CSS                                      |
| AI           | Anthropic Claude (scripts/captions/ideas), OpenAI Whisper (transcription) |
| Scheduling   | Zernio                                            |
| Hosting      | Vercel (with Vercel Cron)                         |

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/tenfoldmarc/content-dashboard.git
cd content-dashboard
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the migrations in order:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_storage.sql`

   (Or, with the [Supabase CLI](https://supabase.com/docs/guides/local-development): `supabase db push`.)
3. From **Project Settings → API**, copy your project URL, anon key, and service-role key into your env (next step).

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in at minimum the **Supabase** and **branding** values. Add the **creator profile** so AI-generated content sounds like you, then any integrations you want (Instagram, Anthropic, Zernio, etc.). Every variable is documented inline in `.env.example`.

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The **first account you sign up** with becomes the admin (see [Access control](#access-control)).

---

## Make it yours

All personalization lives in `lib/config.ts`, driven by environment variables — no code edits needed:

- **Branding** — `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_OWNER_NAME`, `NEXT_PUBLIC_APP_URL`.
- **Creator voice** — `CREATOR_NAME`, `CREATOR_HANDLE`, `CREATOR_NICHE`, `CREATOR_AUDIENCE`, `CREATOR_VOICE`. These steer every AI prompt (scripts, captions, ideas, trending brief).
- **Logo** — replace `public/logo-dark.png` and `public/logo-light.png` with your own.
- **Theme colors** — edit the CSS variables (e.g. `--accent`) in `app/globals.css`.
- **Competitors** — add the handles you want to track from the Competitors page in the UI.

---

## Connecting Google Drive (optional)

The publishing queue can pull "ready to post" videos straight from a Google Drive folder. There are two ways to connect it (pick one, both documented in `.env.example`):

- **API key (recommended, easiest):** enable the Google Drive API in Google Cloud, make an API key, and share your videos folder as "Anyone with the link → Viewer". Set `GOOGLE_DRIVE_API_KEY` + `GOOGLE_DRIVE_FOLDER_ID`. No OAuth, no consent screen. The key can only read that public folder, nothing else in your Drive.
- **OAuth (for private folders):** use a Google OAuth app + refresh token instead (`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN`). The same credential also powers the optional Calendar and Gmail-triage features.

If you skip Drive entirely, every other feature still works.

## Deploy to Vercel

```bash
# create the GitHub repo, then:
git push -u origin main
```

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add every environment variable from your `.env.local` in the Vercel project settings.
   - Set `NEXT_PUBLIC_APP_URL` to your production URL.
3. Deploy.

### Scheduled jobs

`vercel.json` already defines the cron schedule (daily stats snapshot, refresh your posts, refresh competitors). Vercel Cron calls these endpoints automatically. They're protected by `CRON_SECRET` — set it in your env and Vercel sends it as a Bearer token.

To trigger a full refresh by hand, copy `scripts/refresh-data.sh.example` to `scripts/refresh-data.sh`, set `DASHBOARD_URL` and `CRON_SECRET`, and run it.

---

## Access control

Authentication is handled by Supabase Auth. The access model (`lib/usePageAccess.ts`) is intentionally simple:

- Any signed-in user **without** a row in `user_roles` is treated as an **admin** with full access — so the first person to sign up is effectively the owner.
- To add scoped team members, insert rows into `user_roles` with `role = 'member'` and a `page_access` array, or manage them from the Users area in the app.

> **Important:** because a user with no role row defaults to admin, lock down signups in **Supabase → Authentication → Providers** (e.g. disable open email signups, or restrict to invited users) so strangers can't self-promote.

---

## Project structure

```
app/            Next.js routes (pages + API)
  api/          server routes: content, cron jobs, stripe, users, etc.
components/     React UI components
lib/            config, Supabase clients, queries, integrations
  config.ts     <- all branding + creator + integration settings
supabase/
  migrations/   database schema (run these on a fresh project)
scripts/        helper scripts (manual data refresh)
```

---

## License

MIT. Use it, fork it, make it yours.
