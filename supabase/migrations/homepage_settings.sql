-- Homepage algorithm settings.
-- Run this in the Supabase Dashboard → SQL Editor before using the
-- Admin → Homepage tab. Single-row table (id is always 1).

create table if not exists public.homepage_settings (
  id                  integer primary key default 1,
  hero_mode           text    not null default 'recency_most_read', -- recency_most_read | newest | most_read_all_time | manual
  hero_recency_hours  integer not null default 24,
  featured_article_id integer references public.articles(id) on delete set null,
  most_read_window    text    not null default '7d',                -- 24h | 7d | 30d | all
  show_reading_now    boolean not null default true,
  updated_by          text,
  updated_at          timestamptz not null default now(),
  constraint homepage_settings_singleton check (id = 1)
);

-- Seed the single settings row.
insert into public.homepage_settings (id) values (1)
on conflict (id) do nothing;

-- Lock the table down. The admin-only restriction is enforced at the Express
-- layer, and both backends read/write with the service-role key (which bypasses
-- RLS). Enabling RLS with NO anon/authenticated policies means a browser holding
-- the public anon key CANNOT rewrite the homepage algorithm directly via
-- PostgREST. The public homepage reads settings through /api/homepage/settings
-- (service role), so it is unaffected.
alter table public.homepage_settings enable row level security;
revoke all on public.homepage_settings from anon, authenticated;

-- OPTIONAL (only if the article_views table exists — it should, it's written on
-- every article view). Speeds up future time-windowed "most read" aggregation.
create index if not exists idx_article_views_viewed_at
  on public.article_views (viewed_at);
create index if not exists idx_article_views_article_viewed
  on public.article_views (article_id, viewed_at);
