-- Close direct table access for the public browser key.
-- APPLIED to production on 2026-11-12 (approved by JP). Kept here as the record;
-- it is safe to run again.
--
-- Until this ran, every table in `public` except `article_images` and
-- `homepage_settings` had row-level security off and full privileges granted to
-- the `anon` and `authenticated` roles. The site does not need that: the browser
-- uses Supabase only for sign-in and photo uploads (Auth and Storage), and all
-- data goes through the API, which connects with the service role (not subject
-- to row-level security or to these grants).
--
-- RULES FROM NOW ON
--   * Browser code must never query tables with supabase-js (`.from()`, `.rpc()`).
--     Add an endpoint in api/index.ts instead.
--   * New tables are private by default (step 3). If one ever needs to be read
--     from the browser, add row-level security policies for it deliberately.
begin;

-- 1. Row-level security on every table we own. No policies are added, so the
--    public roles see and change nothing even if a grant comes back by mistake.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 2. Remove the public roles' privileges on our tables, views and sequences.
do $$
declare o record;
begin
  for o in
    select c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
      and pg_get_userbyid(c.relowner) = current_user
  loop
    if o.relkind = 'S' then
      execute format('revoke all on sequence public.%I from anon, authenticated', o.relname);
    else
      execute format('revoke all on table public.%I from anon, authenticated', o.relname);
    end if;
  end loop;
end $$;

-- 3. Tables and sequences created from now on are private by default.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

commit;

-- To undo (restores the previous, open state; do not do this):
--   alter table public.<name> disable row level security;   -- for each table
--   grant all on all tables in schema public to anon, authenticated;
--   grant all on all sequences in schema public to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
