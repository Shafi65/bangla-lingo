-- RLS and privilege tests for supabase/migrations. Run by run-local.sh after the stub and the
-- migrations. Every check raises an exception on failure; the script stops at the first one.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test');
insert into auth.sessions (user_id) values
  ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b');

create or replace function pg_temp.as_user(sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect_denied(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege or check_violation then
    raise notice 'ok: % (denied: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % was allowed', label;
end $$;

create or replace function pg_temp.expect_rows(stmt text, n integer, label text) returns void language plpgsql as $$
declare got integer;
begin
  execute 'select count(*) from (' || stmt || ') s' into got;
  if got <> n then raise exception 'FAIL: % returned % rows, expected %', label, got, n; end if;
  raise notice 'ok: % (% rows)', label, got;
end $$;

grant execute on all functions in schema pg_temp to public;

-- 1. User A writes their four rows (user_id defaults to auth.uid()).
begin;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
insert into public.user_progress (data) values ('{"xp": 10}');
insert into public.user_memory (data) values ('{"v": 1, "w": {}}');
insert into public.user_settings (data) values ('{"settings": {}}');
insert into public.user_features (data) values ('{}');
select pg_temp.expect_rows('select * from public.user_progress', 1, 'A sees own progress');
-- Conditional update (optimistic concurrency) bumps rev; updated_at trigger runs as authenticated.
update public.user_progress set data = '{"xp": 20}', rev = rev + 1 where rev = 1;
select pg_temp.expect_rows('select * from public.user_progress where rev = 2 and (data->>''xp'')::int = 20', 1, 'A conditional update');
-- Inserting a row for someone else is refused by the WITH CHECK clause.
select pg_temp.expect_denied($q$insert into public.user_memory (user_id, data) values ('00000000-0000-4000-8000-00000000000b', '{}')$q$, 'A inserts a row for B');
commit;

-- 2. User B cannot see, change or delete A's rows.
begin;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select pg_temp.expect_rows('select * from public.user_progress', 0, 'B sees no progress rows of A');
select pg_temp.expect_rows('select * from public.user_memory', 0, 'B sees no memory rows of A');
select pg_temp.expect_rows('select * from public.user_settings', 0, 'B sees no settings rows of A');
select pg_temp.expect_rows('select * from public.user_features', 0, 'B sees no features rows of A');
do $$ declare n integer; begin
  update public.user_progress set data = '{"xp": 999}' where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B updated % of A''s rows', n; end if;
  delete from public.user_settings where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted % of A''s rows', n; end if;
  raise notice 'ok: B cannot update or delete A''s rows';
end $$;
insert into public.user_progress (data) values ('{"xp": 5}');
-- B cannot hand their row over to A (WITH CHECK on update).
select pg_temp.expect_denied($q$update public.user_progress set user_id = '00000000-0000-4000-8000-00000000000a'$q$, 'B moves own row to A');
-- Payload size cap: ~600 KB document is refused.
select pg_temp.expect_denied($q$update public.user_progress set data = jsonb_build_object('pad', repeat('x', 600000))$q$, 'oversized document');
select pg_temp.expect_denied($q$update public.user_progress set data = '[1,2]'$q$, 'non-object document');
commit;

-- 3. A's data is untouched by B's attempts.
begin;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a');
select pg_temp.expect_rows('select * from public.user_progress where (data->>''xp'')::int = 20', 1, 'A data intact');
select pg_temp.expect_rows('select * from public.user_settings', 1, 'A settings intact');
commit;

-- 4. anon (no sign-in) has no access at all, even with a forged sub claim.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"anon"}', true);
set local role anon;
select pg_temp.expect_denied('select * from public.user_progress', 'anon select');
select pg_temp.expect_denied($q$insert into public.user_settings (user_id, data) values ('00000000-0000-4000-8000-00000000000a', '{}')$q$, 'anon insert');
select pg_temp.expect_denied('select public.delete_my_account()', 'anon delete_my_account');
select pg_temp.expect_denied('select public.bl_touch_updated_at()', 'anon trigger function');
commit;

-- 5. delete_my_account without a sub claim refuses.
begin;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.delete_my_account();
  exception when insufficient_privilege then
    raise notice 'ok: delete_my_account refuses without auth.uid()';
    return;
  end;
  raise exception 'FAIL: delete_my_account ran without a user';
end $$;
commit;

-- 6. B deletes their account: B's rows and auth user go, A is untouched.
begin;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b');
select public.delete_my_account();
commit;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000000b') then raise exception 'FAIL: B auth user still there'; end if;
  if exists (select 1 from auth.sessions where user_id = '00000000-0000-4000-8000-00000000000b') then raise exception 'FAIL: B sessions still there'; end if;
  if exists (select 1 from public.user_progress where user_id = '00000000-0000-4000-8000-00000000000b') then raise exception 'FAIL: B progress still there'; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000000a') then raise exception 'FAIL: A auth user deleted'; end if;
  if (select count(*) from public.user_progress) + (select count(*) from public.user_memory)
     + (select count(*) from public.user_settings) + (select count(*) from public.user_features) <> 4 then
    raise exception 'FAIL: A rows changed';
  end if;
  raise notice 'ok: delete_my_account removed only B';
end $$;

-- 7. Privilege catalogue: exactly select/insert/update/delete for authenticated, nothing for anon/public.
do $$ declare t text; begin
  foreach t in array array['user_progress','user_memory','user_settings','user_features'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'FAIL: RLS off on %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete,truncate,references,trigger') then raise exception 'FAIL: anon has privileges on %', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'truncate,references,trigger') then raise exception 'FAIL: authenticated has extra privileges on %', t; end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'select') or not has_table_privilege('authenticated', 'public.' || t, 'insert')
       or not has_table_privilege('authenticated', 'public.' || t, 'update') or not has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception 'FAIL: authenticated lacks a privilege on %', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute') then raise exception 'FAIL: anon can execute delete_my_account'; end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account()', 'execute') then raise exception 'FAIL: authenticated cannot execute delete_my_account'; end if;
  raise notice 'ok: privilege catalogue';
end $$;

\echo 'ALL RLS TESTS PASSED'
