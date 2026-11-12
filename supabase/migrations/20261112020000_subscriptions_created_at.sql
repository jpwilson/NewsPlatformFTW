-- "New followers" in the analytics screen needs to know when someone subscribed.
-- Additive (approved by JP 2026-11-12). Existing rows get NULL: their real date
-- is unknown, and the screen counts only dated rows.
alter table public.subscriptions add column if not exists created_at timestamptz;
alter table public.subscriptions alter column created_at set default now();
