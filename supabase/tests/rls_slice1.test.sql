\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls1@local', '', now(), now()),
  ('a2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls2@local', '', now(), now());

do $$
declare preset_id uuid;
begin
  select id into preset_id from public.challenges where group_id is null limit 1;
  insert into public.challenge_accepts (challenge_id, user_id) values
    (preset_id, 'e1111111-0000-0000-0000-000000000001'),
    (preset_id, 'a2222222-0000-0000-0000-000000000002');
end $$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e1111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.challenge_accepts;
  if n != 1 then raise exception 'FAIL: user1 should see exactly 1 accept, saw %', n; end if;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.challenges where group_id is null;
  if n != 30 then raise exception 'FAIL: user1 should see 30 presets, saw %', n; end if;
end $$;

-- is_username_available should see across users despite RLS
do $$
declare avail boolean;
begin
  -- pre-claim a username for user2 so we know it's taken
  null;
end $$;

reset role;

-- claim user2's username then check availability as user1
update public.users set username = 'taken_by_two'
  where id = 'a2222222-0000-0000-0000-000000000002';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e1111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare avail boolean;
begin
  select public.is_username_available('taken_by_two') into avail;
  if avail then raise exception 'FAIL: is_username_available should return false for an existing username (got true)'; end if;
  select public.is_username_available('definitely_free_xyz') into avail;
  if not avail then raise exception 'FAIL: is_username_available should return true for a fresh username'; end if;
end $$;

reset role;

delete from public.challenge_accepts where user_id in (
  'e1111111-0000-0000-0000-000000000001',
  'a2222222-0000-0000-0000-000000000002'
);
delete from public.users where id in (
  'e1111111-0000-0000-0000-000000000001',
  'a2222222-0000-0000-0000-000000000002'
);
delete from auth.users where id in (
  'e1111111-0000-0000-0000-000000000001',
  'a2222222-0000-0000-0000-000000000002'
);

commit;
select 'TEST PASS: rls_slice1' as result;
