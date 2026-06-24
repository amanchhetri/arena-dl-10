-- activity_events.test.sql
-- Cases 1-6: submit_completion v2 emits events + updates flame.
-- Cases 7-8: join trigger + cron reset.

\set ON_ERROR_STOP on
begin;

-- Provision 4 test users with distinct UUID prefixes.
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

-- User 1 creates a group + a group challenge to use across cases.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-fe00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('Feed Crew', 'cyan'); end $$;

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Stretch 5 min', null, 'fitness', 'medium', 'honor');
end $$;

-- ============================================================================
-- Case 1: challenge_completed event fires with correct payload
-- ============================================================================
do $$
declare cid uuid;
declare aid uuid;
begin
  select id into cid from public.challenges
    where title='Stretch 5 min' and group_id=(select id from public.groups where name='Feed Crew');
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '11111111-fe00-0000-0000-000000000001')
    returning id into aid;
  perform public.submit_completion(aid, null);
end $$;

do $$
declare evt record;
begin
  select event_type, payload into evt from public.activity_events
   where event_type = 'challenge_completed'
     and group_id = (select id from public.groups where name='Feed Crew');
  if evt is null then raise exception 'FAIL case 1: no challenge_completed event'; end if;
  if (evt.payload->>'xp_awarded')::int != 50 then
    raise exception 'FAIL case 1: xp_awarded payload = %', evt.payload->>'xp_awarded';
  end if;
  if evt.payload->>'challenge_title' != 'Stretch 5 min' then
    raise exception 'FAIL case 1: challenge_title payload = %', evt.payload->>'challenge_title';
  end if;
end $$;

-- ============================================================================
-- Case 2: first completion lit the flame
-- ============================================================================
do $$
declare gid uuid;
declare streak int;
declare lit_count int;
begin
  select id, current_streak into gid, streak from public.groups where name='Feed Crew';
  if streak != 1 then raise exception 'FAIL case 2a: current_streak should be 1, got %', streak; end if;

  select count(*) into lit_count from public.activity_events
   where event_type = 'group_flame_lit' and group_id = gid;
  if lit_count != 1 then raise exception 'FAIL case 2b: 1 group_flame_lit event expected, saw %', lit_count; end if;
end $$;

-- ============================================================================
-- Case 3: same-day second completion does NOT emit flame event or change streak
-- ============================================================================
-- Create another challenge so user 1 can complete a second one today
do $$
declare gid uuid;
declare cid2 uuid;
declare aid2 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Second one', null, 'habit', 'easy', 'honor');
  select id into cid2 from public.challenges where title='Second one' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid2, '11111111-fe00-0000-0000-000000000001')
    returning id into aid2;
  perform public.submit_completion(aid2, null);
end $$;

do $$
declare streak int;
declare lit_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 1 then raise exception 'FAIL case 3a: streak should still be 1 (same day), got %', streak; end if;

  select count(*) into lit_count from public.activity_events
   where event_type = 'group_flame_lit'
     and group_id = (select id from public.groups where name='Feed Crew');
  if lit_count != 1 then raise exception 'FAIL case 3b: still 1 lit event expected, saw %', lit_count; end if;
end $$;

-- ============================================================================
-- Case 4: consecutive-day completion increments + emits no group_flame_lit
-- ============================================================================
-- Backdate last_activity_date to yesterday so today's completion is "consecutive".
-- Reset role first: groups has no UPDATE RLS policy, so we need service role
-- to mutate it. JWT claims persist across reset role, so subsequent
-- SECURITY DEFINER RPCs still resolve auth.uid() correctly.
reset role;
update public.groups
   set last_activity_date = current_date - 1
 where name='Feed Crew';

do $$
declare gid uuid;
declare cid3 uuid;
declare aid3 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Day 2 challenge', null, 'study', 'easy', 'honor');
  select id into cid3 from public.challenges where title='Day 2 challenge' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid3, '11111111-fe00-0000-0000-000000000001')
    returning id into aid3;
  perform public.submit_completion(aid3, null);
end $$;

do $$
declare streak int;
declare lit_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 2 then raise exception 'FAIL case 4a: streak should be 2 (consecutive day), got %', streak; end if;

  select count(*) into lit_count from public.activity_events
   where event_type = 'group_flame_lit'
     and group_id = (select id from public.groups where name='Feed Crew');
  if lit_count != 1 then raise exception 'FAIL case 4b: still 1 lit event (no new one on increment), saw %', lit_count; end if;
end $$;

-- ============================================================================
-- Case 5: milestone — bump streak to 6, then complete → streak=7 → milestone event
-- ============================================================================
reset role;
update public.groups
   set current_streak = 6, last_activity_date = current_date - 1
 where name='Feed Crew';

do $$
declare gid uuid;
declare cid4 uuid;
declare aid4 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Milestone trigger', null, 'creative', 'easy', 'honor');
  select id into cid4 from public.challenges where title='Milestone trigger' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid4, '11111111-fe00-0000-0000-000000000001')
    returning id into aid4;
  perform public.submit_completion(aid4, null);
end $$;

do $$
declare streak int;
declare ms_payload jsonb;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 7 then raise exception 'FAIL case 5a: streak should be 7, got %', streak; end if;

  select payload into ms_payload from public.activity_events
   where event_type = 'group_flame_milestone'
     and group_id = (select id from public.groups where name='Feed Crew')
   order by created_at desc limit 1;
  if ms_payload is null then raise exception 'FAIL case 5b: no group_flame_milestone event'; end if;
  if (ms_payload->>'streak_length')::int != 7 then
    raise exception 'FAIL case 5c: milestone streak_length payload = %', ms_payload->>'streak_length';
  end if;
end $$;

-- ============================================================================
-- Case 6: gap > 1 day — fresh flame, NO event from completion itself
-- ============================================================================
reset role;
update public.groups
   set current_streak = 7, last_activity_date = current_date - 5
 where name='Feed Crew';

-- Snapshot lit-event count before
do $$
declare gid uuid;
declare lit_before int;
declare lit_after int;
declare streak_after int;
declare cid5 uuid;
declare aid5 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  select count(*) into lit_before from public.activity_events
   where event_type = 'group_flame_lit' and group_id = gid;

  perform public.create_group_challenge(gid, 'After gap', null, 'fitness', 'easy', 'honor');
  select id into cid5 from public.challenges where title='After gap' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid5, '11111111-fe00-0000-0000-000000000001')
    returning id into aid5;
  perform public.submit_completion(aid5, null);

  select count(*) into lit_after from public.activity_events
   where event_type = 'group_flame_lit' and group_id = gid;
  select current_streak into streak_after from public.groups where id = gid;

  if streak_after != 1 then raise exception 'FAIL case 6a: streak should reset to 1 (fresh flame), got %', streak_after; end if;
  if lit_after != lit_before then
    raise exception 'FAIL case 6b: gap recovery should NOT emit group_flame_lit (cron emits the break separately)'; end if;
end $$;

-- ============================================================================
-- Case 7: join trigger — owner suppressed, member emits
-- ============================================================================
-- Reset role to service for code lookup
reset role;
select invite_code as fe_code from public.groups where name='Feed Crew' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-fe00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'fe_code');

reset role;
do $$
declare n_owner int;
declare n_member int;
begin
  -- Owner (user 1) row inserted on create_group; trigger should have suppressed
  select count(*) into n_owner from public.activity_events
   where event_type = 'joined_group'
     and actor_user_id = '11111111-fe00-0000-0000-000000000001';
  if n_owner != 0 then raise exception 'FAIL case 7a: owner-on-create should NOT emit, saw %', n_owner; end if;

  -- Member (user 2) join should have emitted
  select count(*) into n_member from public.activity_events
   where event_type = 'joined_group'
     and actor_user_id = '22222222-fe00-0000-0000-000000000002';
  if n_member != 1 then raise exception 'FAIL case 7b: member join should emit, saw %', n_member; end if;
end $$;

-- ============================================================================
-- Case 8: nightly cron resets dead flames + emits group_flame_broken
-- ============================================================================
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  update public.groups
     set current_streak = 5, last_activity_date = current_date - 3
   where id = gid;
end $$;

select public.reset_dead_group_flames();

do $$
declare streak int; broken_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 0 then raise exception 'FAIL case 8a: streak should reset to 0, got %', streak; end if;

  select count(*) into broken_count from public.activity_events
   where event_type = 'group_flame_broken'
     and group_id = (select id from public.groups where name='Feed Crew');
  if broken_count != 1 then raise exception 'FAIL case 8b: 1 group_flame_broken event, saw %', broken_count; end if;
end $$;

-- Cleanup
delete from public.challenge_completions where user_id in (
  select id from auth.users where email like 'fe%@local'
);
delete from public.challenge_accepts where user_id in (
  select id from auth.users where email like 'fe%@local'
);
delete from public.challenges where group_id in (
  select id from public.groups where name='Feed Crew'
);
delete from public.activity_events where group_id in (
  select id from public.groups where name='Feed Crew'
);
delete from public.group_members where group_id in (
  select id from public.groups where name='Feed Crew'
);
delete from public.groups where name='Feed Crew';
delete from public.users where id in (
  select id from auth.users where email like 'fe%@local'
);
delete from auth.users where email like 'fe%@local';

commit;
select 'TEST PASS: activity_events (8 cases)' as result;
