-- BanglaLingo: optional accounts and cross-device progress sync.
-- See docs/ACCOUNTS.md. Every table holds one row per signed-in user, keyed by auth.uid(), with a
-- JSONB document the app merges with the copy on the device.
--
-- Access model
--   * Row Level Security on every table: a user can select, insert, update and delete only rows
--     whose user_id is their own auth.uid(). No policy exists for `anon`, so guests get nothing.
--   * Table privileges are granted explicitly to `authenticated` only (the project is set up with
--     "Grant API access to new tables automatically" OFF), and revoked from `anon` and `public`.
--   * Account deletion goes through public.delete_my_account() (SECURITY DEFINER), executable by
--     `authenticated` only. The app never needs the service-role key.
--   * Each document is capped at 512 KB (as JSON text) to stop abuse.

begin;

-- ---------------------------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every write.
-- ---------------------------------------------------------------------------------------------
create or replace function public.bl_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.bl_touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Tables. Same shape for all four:
--   user_id         the owner; deleting the auth user deletes the row
--   data            the JSONB document (an object, at most 512 KB as text)
--   schema_version  document format version written by the app (currently 1)
--   rev             revision counter for optimistic concurrency (the app updates "where rev = n")
--   updated_at      set by the trigger
-- ---------------------------------------------------------------------------------------------

-- Lesson progress: XP, streak, last active day, completed lessons, daily XP log.
create table if not exists public.user_progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_progress_data_object check (jsonb_typeof(data) = 'object'),
  constraint user_progress_data_size check (octet_length(data::text) <= 524288),
  constraint user_progress_schema_version check (schema_version between 1 and 1000),
  constraint user_progress_rev check (rev >= 1)
);

-- Per-word spaced-review memory.
create table if not exists public.user_memory (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_memory_data_object check (jsonb_typeof(data) = 'object'),
  constraint user_memory_data_size check (octet_length(data::text) <= 524288),
  constraint user_memory_schema_version check (schema_version between 1 and 1000),
  constraint user_memory_rev check (rev >= 1)
);

-- Settings (with per-key change times) and the first-run answers.
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_settings_data_object check (jsonb_typeof(data) = 'object'),
  constraint user_settings_data_size check (octet_length(data::text) <= 524288),
  constraint user_settings_schema_version check (schema_version between 1 and 1000),
  constraint user_settings_rev check (rev >= 1)
);

-- Practice features: formality game, handwriting, speaking self-ratings, placement result.
create table if not exists public.user_features (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_features_data_object check (jsonb_typeof(data) = 'object'),
  constraint user_features_data_size check (octet_length(data::text) <= 524288),
  constraint user_features_schema_version check (schema_version between 1 and 1000),
  constraint user_features_rev check (rev >= 1)
);

drop trigger if exists user_progress_touch on public.user_progress;
create trigger user_progress_touch before update on public.user_progress
  for each row execute function public.bl_touch_updated_at();
drop trigger if exists user_memory_touch on public.user_memory;
create trigger user_memory_touch before update on public.user_memory
  for each row execute function public.bl_touch_updated_at();
drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.bl_touch_updated_at();
drop trigger if exists user_features_touch on public.user_features;
create trigger user_features_touch before update on public.user_features
  for each row execute function public.bl_touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Privileges: authenticated only. Nothing for anon or public.
-- ---------------------------------------------------------------------------------------------
revoke all on table public.user_progress, public.user_memory, public.user_settings, public.user_features
  from public, anon;
revoke all on table public.user_progress, public.user_memory, public.user_settings, public.user_features
  from authenticated;
grant select, insert, update, delete
  on table public.user_progress, public.user_memory, public.user_settings, public.user_features
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: own rows only. `(select auth.uid())` is evaluated once per statement.
-- ---------------------------------------------------------------------------------------------
alter table public.user_progress enable row level security;
alter table public.user_memory enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_features enable row level security;

-- user_progress
drop policy if exists "Own progress: select" on public.user_progress;
drop policy if exists "Own progress: insert" on public.user_progress;
drop policy if exists "Own progress: update" on public.user_progress;
drop policy if exists "Own progress: delete" on public.user_progress;
create policy "Own progress: select" on public.user_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own progress: insert" on public.user_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own progress: update" on public.user_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own progress: delete" on public.user_progress
  for delete to authenticated using ((select auth.uid()) = user_id);

-- user_memory
drop policy if exists "Own memory: select" on public.user_memory;
drop policy if exists "Own memory: insert" on public.user_memory;
drop policy if exists "Own memory: update" on public.user_memory;
drop policy if exists "Own memory: delete" on public.user_memory;
create policy "Own memory: select" on public.user_memory
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own memory: insert" on public.user_memory
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own memory: update" on public.user_memory
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own memory: delete" on public.user_memory
  for delete to authenticated using ((select auth.uid()) = user_id);

-- user_settings
drop policy if exists "Own settings: select" on public.user_settings;
drop policy if exists "Own settings: insert" on public.user_settings;
drop policy if exists "Own settings: update" on public.user_settings;
drop policy if exists "Own settings: delete" on public.user_settings;
create policy "Own settings: select" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own settings: insert" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own settings: update" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own settings: delete" on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- user_features
drop policy if exists "Own features: select" on public.user_features;
drop policy if exists "Own features: insert" on public.user_features;
drop policy if exists "Own features: update" on public.user_features;
drop policy if exists "Own features: delete" on public.user_features;
create policy "Own features: select" on public.user_features
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own features: insert" on public.user_features
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own features: update" on public.user_features
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own features: delete" on public.user_features
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- Account deletion. Runs with the owner's rights (it must delete from auth.users), so it only
-- ever touches the caller's own id and refuses to run without one.
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.user_progress where user_id = uid;
  delete from public.user_memory where user_id = uid;
  delete from public.user_settings where user_id = uid;
  delete from public.user_features where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
