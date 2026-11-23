-- Minimal stand-in for the parts of a Supabase database the migrations rely on, so they can be
-- applied to a plain local Postgres for testing (supabase/tests/run-local.sh). NOT for production:
-- a real Supabase project already has all of this.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text
);
-- Like Supabase: other auth tables reference users with cascade.
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);

-- Same definition Supabase uses: the subject of the request's JWT claims.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')),
    ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase's default privileges grant everything in public to the API roles; mimic the
-- owner's project setting instead ("Grant API access to new tables automatically" OFF), but keep
-- PostgreSQL's default EXECUTE-to-PUBLIC on functions so the migration's revokes are exercised.
