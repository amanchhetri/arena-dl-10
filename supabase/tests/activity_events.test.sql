-- activity_events.test.sql
-- Cases 1-6 are added by Task 3 (after submit_completion v2 lands).
-- This file starts with cases 7 (join trigger) and 8 (cron reset).

\set ON_ERROR_STOP on
begin;

-- Provision 4 test users with distinct UUID prefixes (avoid auth-trigger
-- username collision since it uses first 8 chars of UUID).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-fe00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe1@local', '', now(), now()),
  ('22222222-fe00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe2@local', '', now(), now()),
  ('33333333-fe00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe3@local', '', now(), now()),
  ('44444444-fe00-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe4@local', '', now(), now());

-- ============================================================================
-- Case 7: join trigger — owner-on-create suppressed, members emit
-- ============================================================================

-- User 1 creates a group → owner row inserted, no joined_group event should fire.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-fe00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('Feed Crew', 'cyan'); end $$;

reset role;
do $$
declare n int;
begin
  select count(*) into n from public.activity_events
   where event_type = 'joined_group'
     and group_id = (select id from public.groups where name='Feed Crew');
  if n != 0 then raise exception 'FAIL case 7a: owner-on-create should NOT emit joined_group, saw %', n; end if;
end $$;

-- Capture the invite code as service_role
select invite_code as fe_code from public.groups where name='Feed Crew' \gset

-- User 2 joins → 1 joined_group event should fire
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-fe00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'fe_code');

reset role;
do $$
declare n int;
begin
  select count(*) into n from public.activity_events
   where event_type = 'joined_group'
     and group_id = (select id from public.groups where name='Feed Crew')
     and actor_user_id = '22222222-fe00-0000-0000-000000000002';
  if n != 1 then raise exception 'FAIL case 7b: member join should emit exactly 1 event, saw %', n; end if;
end $$;

-- ============================================================================
-- Case 8: nightly cron — resets dead flames + emits group_flame_broken
-- ============================================================================

-- Force a stale flame state on Feed Crew (simulating "yesterday was active, today is not")
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  update public.groups
     set current_streak = 5, last_activity_date = current_date - 3
   where id = gid;
end $$;

-- Manually invoke the cron function
select public.reset_dead_group_flames();

do $$
declare streak int; broken_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 0 then raise exception 'FAIL case 8a: streak should reset to 0, got %', streak; end if;

  select count(*) into broken_count from public.activity_events
   where event_type = 'group_flame_broken'
     and group_id = (select id from public.groups where name='Feed Crew');
  if broken_count != 1 then raise exception 'FAIL case 8b: 1 group_flame_broken event expected, saw %', broken_count; end if;
end $$;

-- Cleanup
delete from public.activity_events where group_id = (select id from public.groups where name='Feed Crew');
delete from public.group_members where group_id = (select id from public.groups where name='Feed Crew');
delete from public.groups where name='Feed Crew';
delete from public.users where id in (
  '11111111-fe00-0000-0000-000000000001',
  '22222222-fe00-0000-0000-000000000002',
  '33333333-fe00-0000-0000-000000000003',
  '44444444-fe00-0000-0000-000000000004'
);
delete from auth.users where id in (
  '11111111-fe00-0000-0000-000000000001',
  '22222222-fe00-0000-0000-000000000002',
  '33333333-fe00-0000-0000-000000000003',
  '44444444-fe00-0000-0000-000000000004'
);

commit;
select 'TEST PASS: activity_events (cases 7-8 so far)' as result;
