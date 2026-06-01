-- Content Dashboard — initial schema
-- Run this against a fresh Supabase project (SQL Editor, or `supabase db push`).
-- It creates every table the app reads/writes, with row-level security enabled.

create extension if not exists "uuid-ossp" with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Your own published posts (pulled from the Instagram Graph API)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.client_posts (
  id                uuid primary key default extensions.uuid_generate_v4(),
  ig_post_id        text unique,
  content           text not null default '',
  likes             integer not null default 0,
  shares            integer not null default 0,
  views             integer not null default 0,
  comments          integer default 0,
  reach             integer default 0,
  saves             integer default 0,
  media_type        text,
  thumbnail_url     text default '',
  permalink         text default '',
  is_outlier        boolean not null default false,
  posted_at         timestamptz not null default now(),
  last_refreshed_at timestamptz default now(),
  created_at        timestamptz not null default now()
);
create index if not exists idx_client_posts_posted_at on public.client_posts (posted_at desc);
create index if not exists idx_client_posts_last_refreshed on public.client_posts (last_refreshed_at);

-- ─────────────────────────────────────────────────────────────
-- Competitors you track + their scraped posts
-- ─────────────────────────────────────────────────────────────
create table if not exists public.competitors (
  id               uuid primary key default gen_random_uuid(),
  instagram_handle text unique not null,
  display_name     text,
  profile_pic_url  text,
  color            text default '#635bff',
  created_at       timestamptz default now()
);

create table if not exists public.competitor_posts (
  id                uuid primary key default extensions.uuid_generate_v4(),
  handle            text not null,
  content           text not null default '',
  likes             integer not null default 0,
  shares            integer not null default 0,
  views             integer not null default 0,
  comments          integer default 0,
  post_url          text not null default '',
  video_url         text,
  thumbnail_url     text default '',
  ig_post_id        text,
  media_type        text,
  posted_at         timestamptz,
  scraped_at        timestamptz not null default now(),
  last_refreshed_at timestamptz default now(),
  created_at        timestamptz not null default now()
);
create unique index if not exists ux_competitor_posts_handle_ig_id on public.competitor_posts (handle, ig_post_id);
create index if not exists idx_competitor_posts_posted_at on public.competitor_posts (posted_at desc);
create index if not exists idx_competitor_posts_scraped_at on public.competitor_posts (scraped_at desc);

-- ─────────────────────────────────────────────────────────────
-- Hooks library + reusable hook templates
-- ─────────────────────────────────────────────────────────────
create table if not exists public.post_hooks (
  id              uuid primary key default gen_random_uuid(),
  post_url        text unique not null,
  handle          text not null,
  is_own          boolean default false,
  hook_text       text not null,
  full_transcript text,
  on_screen_text  text,
  why_it_works    text,
  hook_type       text,
  content_angle   text,
  template        text,
  views           integer default 0,
  likes           integer default 0,
  shares          integer default 0,
  outlier_ratio   real,
  is_favorite     boolean default false,
  posted_at       timestamptz,
  created_at      timestamptz default now()
);

create table if not exists public.hook_templates (
  id                     uuid primary key default gen_random_uuid(),
  template               text not null,
  example_hook           text,
  example_handle         text,
  on_screen_text_example text,
  hook_type              text,
  source_post_url        text,
  views                  integer default 0,
  score                  real default 0,
  outlier_ratio          real,
  posted_at              timestamptz,
  created_at             timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Content ideation → scripts → scheduling
-- ─────────────────────────────────────────────────────────────
create table if not exists public.content_ideas (
  id            uuid primary key default extensions.uuid_generate_v4(),
  hook          text not null,
  format        text not null default 'reel',
  pillar        text not null default '',
  relevance     text not null default '',
  status        text not null default 'pending'
                  check (status in ('pending','approved','scheduled','skipped','published')),
  scheduled_for timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_content_ideas_status on public.content_ideas (status);
create index if not exists idx_content_ideas_created_at on public.content_ideas (created_at desc);

create table if not exists public.scripts (
  id                uuid primary key default extensions.uuid_generate_v4(),
  idea_id           uuid references public.content_ideas(id),
  title             text not null default '',
  body              text not null,
  estimated_seconds integer,
  created_at        timestamptz not null default now()
);
create index if not exists idx_scripts_idea_id on public.scripts (idea_id);

create table if not exists public.scheduled_posts (
  id             uuid primary key default extensions.uuid_generate_v4(),
  idea_id        uuid references public.content_ideas(id),
  script_id      uuid references public.scripts(id),
  zernio_post_id text,
  platform       text not null default 'instagram',
  status         text not null default 'queued'
                   check (status in ('queued','scheduled','published','failed')),
  scheduled_for  timestamptz,
  published_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_scheduled_posts_status on public.scheduled_posts (status);

-- ─────────────────────────────────────────────────────────────
-- Publishing queue (videos pulled from Google Drive → scheduler)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.content_queue (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  caption         text,
  suggested_caption text,
  youtube_title   text,
  transcript      text,
  drive_file_id   text,
  drive_file_name text,
  drive_file_url  text,
  media_url       text,
  thumbnail_url   text,
  status          text not null default 'ready'
                    check (status in ('ready','scheduled','published','failed','removed')),
  scheduled_for   timestamptz,
  published_at    timestamptz,
  platforms       text[] default '{}',
  zernio_post_ids jsonb default '{}'::jsonb,
  is_trial_reel   boolean default false,
  error           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create unique index if not exists content_queue_drive_file_id_unique
  on public.content_queue (drive_file_id)
  where drive_file_id is not null and status <> 'removed';

-- ─────────────────────────────────────────────────────────────
-- Daily platform stats snapshot (followers / views per platform)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.platform_stats_daily (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  date        date not null,
  followers   integer not null default 0,
  total_views bigint not null default 0,
  views_7d    bigint,
  source      text not null default 'live',
  created_at  timestamptz not null default now()
);
create unique index if not exists platform_stats_daily_platform_date_key on public.platform_stats_daily (platform, date);
create index if not exists platform_stats_daily_platform_date_idx on public.platform_stats_daily (platform, date desc);

-- ─────────────────────────────────────────────────────────────
-- Trending topics brief (AI-generated daily)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.trending_topics (
  id              uuid primary key default gen_random_uuid(),
  brief_date      date unique not null,
  takeaway        text not null,
  x_posts         jsonb not null default '[]'::jsonb,
  hn_stories      jsonb not null default '[]'::jsonb,
  claude_trending jsonb not null default '[]'::jsonb,
  sources_meta    jsonb default '{}'::jsonb,
  created_at      timestamptz default now()
);
create index if not exists idx_trending_topics_date on public.trending_topics (brief_date desc);

-- ─────────────────────────────────────────────────────────────
-- Background refresh job tracking
-- ─────────────────────────────────────────────────────────────
create table if not exists public.refresh_jobs (
  id              uuid primary key default gen_random_uuid(),
  status          text not null default 'running'
                    check (status in ('running','complete','failed')),
  phase           text,
  message         text,
  total_steps     integer default 2,
  completed_steps integer default 0,
  started_at      timestamptz default now(),
  completed_at    timestamptz,
  error           text,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now()
);
create index if not exists idx_refresh_jobs_status_started on public.refresh_jobs (status, started_at desc);

-- ─────────────────────────────────────────────────────────────
-- Productivity: tasks, kanban, objectives, pipeline, goals
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id           uuid primary key default extensions.uuid_generate_v4(),
  text         text not null,
  quadrant     text not null check (quadrant in ('ui','ni','un','nn')),
  due          text default '',
  recurring    text default '',
  completed_at timestamptz,
  time_tracked integer default 0,
  created_at   timestamptz default now()
);

create table if not exists public.kanban_tasks (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  status               text not null default 'todo'
                         check (status in ('todo','in_progress','review','done')),
  label                text default 'content'
                         check (label in ('content','dev','design','urgent')),
  assigned_to          text,
  assigned_to_initials text,
  created_by           text default 'MC',
  position             integer default 0,
  due_date             text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table if not exists public.objectives (
  id         uuid primary key default extensions.uuid_generate_v4(),
  title      text not null,
  target     integer not null,
  current    integer default 0,
  week_start date not null,
  created_at timestamptz default now()
);

create table if not exists public.pipeline_items (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  "column"   text not null default 'Recorded',
  notes      text default '',
  created_at timestamptz default now()
);

create table if not exists public.financial_goals (
  id         uuid primary key default extensions.uuid_generate_v4(),
  title      text not null,
  target     numeric not null,
  current    numeric default 0,
  month      text not null,
  auto_sync  boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_initials text not null,
  type          text not null default 'task_assigned',
  title         text not null,
  message       text,
  read          boolean default false,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Email triage (Gmail → AI prioritization)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.email_triage (
  id           uuid primary key default gen_random_uuid(),
  gmail_id     text unique not null,
  thread_id    text,
  subject      text,
  sender_name  text,
  sender_email text,
  snippet      text,
  full_body    text,
  priority     text check (priority in ('high','medium','low','filtered')),
  category     text,
  received_at  timestamptz,
  triaged_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Access control. The app (lib/usePageAccess.ts) treats any signed-in user
-- WITHOUT a row here as an admin with full access — so the first person to
-- sign up is effectively the owner. Add rows with role='member' and a
-- page_access list to scope down additional team members. IMPORTANT: keep
-- signups locked down in Supabase Auth settings so strangers can't self-admin.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  email        text not null,
  role         text not null default 'member' check (role in ('admin','member')),
  display_name text,
  page_access  text[] default '{overview,tasks,calendar}',
  created_at   timestamptz default now()
);
create unique index if not exists user_roles_user_id_idx on public.user_roles (user_id);

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.client_posts          enable row level security;
alter table public.competitors           enable row level security;
alter table public.competitor_posts      enable row level security;
alter table public.post_hooks            enable row level security;
alter table public.hook_templates        enable row level security;
alter table public.content_ideas         enable row level security;
alter table public.scripts               enable row level security;
alter table public.scheduled_posts       enable row level security;
alter table public.content_queue         enable row level security;
alter table public.platform_stats_daily  enable row level security;
alter table public.trending_topics       enable row level security;
alter table public.refresh_jobs          enable row level security;
alter table public.tasks                 enable row level security;
alter table public.kanban_tasks          enable row level security;
alter table public.objectives            enable row level security;
alter table public.pipeline_items        enable row level security;
alter table public.financial_goals       enable row level security;
alter table public.notifications         enable row level security;
alter table public.email_triage          enable row level security;
alter table public.user_roles            enable row level security;

-- Signed-in users get full access to app data. The service role (used by
-- server-side API routes and cron jobs) bypasses RLS automatically.
create policy "authenticated full access" on public.client_posts         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.competitors          for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.competitor_posts     for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.post_hooks           for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.hook_templates       for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.content_ideas        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.scripts              for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.scheduled_posts      for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.content_queue        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.trending_topics      for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.refresh_jobs         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.tasks                for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.kanban_tasks         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.objectives           for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.pipeline_items       for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.financial_goals      for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.notifications        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.email_triage         for all to authenticated using (true) with check (true);

-- platform_stats_daily is written by cron (service role) and read by the app.
create policy "service role full access" on public.platform_stats_daily for all to service_role using (true) with check (true);
create policy "authenticated read" on public.platform_stats_daily for select to authenticated using (true);

-- user_roles: users can read their own row; the service role manages everyone.
create policy "users read own role" on public.user_roles for select using (auth.uid() = user_id);
create policy "service role manages roles" on public.user_roles for all using (auth.role() = 'service_role');
