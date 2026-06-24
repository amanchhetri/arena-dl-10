-- proof_group_visibility.test.sql — 2 cases for storage RLS widening.
\set ON_ERROR_STOP on
begin;

-- Provision 3 users: A + B in the same group, C outside it.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-ad00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pv1@local', '', now(), now()),
  ('bbbbbbbb-ad00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pv2@local', '', now(), now()),
  ('cccccccc-ad00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pv3@local', '', now(), now());

-- A creates a group, B joins, C doesn't.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-ad00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('PV Group', 'gold'); end $$;

reset role;
select invite_code as pv_code from public.groups where name='PV Group' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"bbbbbbbb-ad00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'pv_code');

-- Seed a fake storage object under user B's prefix
reset role;
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values (
  'proof',
  'bbbbbbbb-ad00-0000-0000-000000000002/test-proof.jpg',
  null,
  'bbbbbbbb-ad00-0000-0000-000000000002',
  '{"size": 100}'::jsonb
);

-- Case 9: User A (same group as B) can SELECT B's proof object
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-ad00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'proof'
     and name = 'bbbbbbbb-ad00-0000-0000-000000000002/test-proof.jpg';
  if n != 1 then raise exception 'FAIL case 9: group-mate A should see B''s proof object, saw %', n; end if;
end $$;

-- Case 10: User C (not in group) CANNOT SELECT B's proof object
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"cccccccc-ad00-0000-0000-000000000003","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'proof'
     and name = 'bbbbbbbb-ad00-0000-0000-000000000002/test-proof.jpg';
  if n != 0 then raise exception 'FAIL case 10: non-group-mate C should see 0 of B''s proof, saw %', n; end if;
end $$;

reset role;

-- Direct DELETE on storage.objects is blocked by a Supabase guard, so we
-- rollback instead of commit. All assertions ran intra-transaction and are
-- valid; rollback cleans up every fixture row in one move.
rollback;
select 'TEST PASS: proof_group_visibility' as result;
