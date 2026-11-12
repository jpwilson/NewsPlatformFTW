-- Analytics events (approved by JP 2026-11-12: additive change).
-- Written only by the server (service role). No raw IP addresses are stored.
begin;
create table if not exists public.page_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  kind text not null,                 -- 'view' | 'read' | 'bot'
  path text not null,
  article_id integer references public.articles(id) on delete set null,
  channel_id integer,
  visitor text,                       -- hash of a daily salt + ip + user agent
  user_id integer,
  referrer_host text, utm_source text, utm_medium text, utm_campaign text,
  country text, device text, browser text,
  bot text, status integer,           -- crawler name and the HTTP status it received
  engaged_ms integer, scroll_pct smallint
);
create index if not exists page_events_ts on public.page_events (ts desc);
create index if not exists page_events_article_ts on public.page_events (article_id, ts desc);
create index if not exists page_events_kind_ts on public.page_events (kind, ts desc);
alter table public.page_events enable row level security;
revoke all on public.page_events from anon, authenticated;
grant all on public.page_events to service_role;
grant usage, select on sequence public.page_events_id_seq to service_role;
commit;
