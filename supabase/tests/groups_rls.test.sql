\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('77777777-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls_a@local', '', now(), now()),
  ('88888888-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls_b@local', '', now(), now());

-- User A creates a group
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"77777777-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare result jsonb;
begin
  select public.create_group('Secret Crew', 'pink') into result;
end $$;

-- User B sees zero
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.groups where name='Secret Crew';
  if n != 0 then raise exception 'FAIL: non-member should see 0 groups, saw %', n; end if;
end $$;

-- User A sees their group
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"77777777-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.groups where name='Secret Crew';
  if n != 1 then raise exception 'FAIL: owner should see 1 group, saw %', n; end if;
end $$;

reset role;

-- Cleanup
delete from public.group_members where user_id in (
  '77777777-1111-1111-1111-111111111111',
  '88888888-2222-2222-2222-222222222222'
);
delete from public.groups where created_by in (
  '77777777-1111-1111-1111-111111111111',
  '88888888-2222-2222-2222-222222222222'
);
delete from public.users where id in (
  '77777777-1111-1111-1111-111111111111',
  '88888888-2222-2222-2222-222222222222'
);
delete from auth.users where id in (
  '77777777-1111-1111-1111-111111111111',
  '88888888-2222-2222-2222-222222222222'
);

commit;
select 'TEST PASS: groups_rls' as result;
