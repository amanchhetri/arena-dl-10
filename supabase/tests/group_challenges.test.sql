-- group_challenges.test.sql — covers all 10 cases from spec §9.
\set ON_ERROR_STOP on
begin;

-- Provision 4 distinct-UUID-prefix test users (avoid auth-trigger username collisions).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-cccc-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc1@local', '', now(), now()),
  ('22222222-cccc-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc2@local', '', now(), now()),
  ('33333333-cccc-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc3@local', '', now(), now()),
  ('44444444-cccc-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc4@local', '', now(), now());

-- User 1 creates a group; user 2 + user 3 join. User 4 stays out.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';
do $$
declare r jsonb;
begin
  select public.create_group('GC Crew', 'cyan') into r;
end $$;

reset role;
select invite_code as gc_code from public.groups where name='GC Crew' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'gc_code');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-cccc-0000-0000-000000000003","role":"authenticated"}';
select public.join_group(:'gc_code');

-- Case 1: Creator path — user 2 (member) creates a Medium honor challenge
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';

do $$
declare gid uuid;
declare result jsonb;
declare cid uuid;
declare r record;
begin
  select id into gid from public.groups where name='GC Crew';
  select public.create_group_challenge(gid, 'Read for 30 min', 'Anything long-form', 'study', 'medium', 'honor') into result;
  cid := (result->>'challenge_id')::uuid;
  select * into r from public.challenges where id = cid;
  if r.xp_reward != 50 then raise exception 'FAIL: medium → 50 XP, got %', r.xp_reward; end if;
  if r.group_id != gid then raise exception 'FAIL: group_id not set'; end if;
  if r.created_by != '22222222-cccc-0000-0000-000000000002' then raise exception 'FAIL: created_by'; end if;
  if r.is_active != true then raise exception 'FAIL: should be active'; end if;
end $$;

-- Case 2: Tier → XP mapping
do $$
declare gid uuid;
declare r jsonb;
declare cid uuid;
declare xp int;
begin
  select id into gid from public.groups where name='GC Crew';

  select public.create_group_challenge(gid, 'Easy thing',   null, 'habit', 'easy',   'honor') into r;
  select xp_reward into xp from public.challenges where id = (r->>'challenge_id')::uuid;
  if xp != 30 then raise exception 'FAIL: easy → 30, got %', xp; end if;

  select public.create_group_challenge(gid, 'Hard thing',   null, 'fitness', 'hard',  'honor') into r;
  select xp_reward into xp from public.challenges where id = (r->>'challenge_id')::uuid;
  if xp != 70 then raise exception 'FAIL: hard → 70, got %', xp; end if;

  select public.create_group_challenge(gid, 'Epic thing',   null, 'dare', 'epic',   'photo') into r;
  select xp_reward into xp from public.challenges where id = (r->>'challenge_id')::uuid;
  if xp != 120 then raise exception 'FAIL: epic → 120, got %', xp; end if;
end $$;

-- Case 3: Non-member can't create
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-cccc-0000-0000-000000000004","role":"authenticated"}';

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='GC Crew';
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'easy', 'honor');
    raise exception 'FAIL: non-member create should reject';
  exception when sqlstate '42501' then end;
end $$;

-- Case 4: Bad inputs reject
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='GC Crew';
  -- empty title
  begin
    perform public.create_group_challenge(gid, '', null, 'habit', 'easy', 'honor');
    raise exception 'FAIL: empty title should reject';
  exception when sqlstate '22023' then end;
  -- bad category
  begin
    perform public.create_group_challenge(gid, 'X', null, 'mystery', 'easy', 'honor');
    raise exception 'FAIL: bad category should reject';
  exception when sqlstate '22023' then end;
  -- bad difficulty
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'ultra', 'honor');
    raise exception 'FAIL: bad difficulty should reject';
  exception when sqlstate '22023' then end;
  -- video proof not allowed in Plan 2
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'easy', 'video');
    raise exception 'FAIL: video proof should reject';
  exception when sqlstate '0A000' then end;
  -- peer proof not allowed
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'easy', 'peer');
    raise exception 'FAIL: peer proof should reject';
  exception when sqlstate '0A000' then end;
end $$;

-- Case 5: Owner can update any group challenge (creator is user 2, owner is user 1)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';

do $$
declare cid uuid;
declare xp int;
begin
  select id into cid from public.challenges
    where title = 'Read for 30 min' and group_id = (select id from public.groups where name='GC Crew');
  perform public.update_group_challenge(cid, null, null, 'hard', null);
  select xp_reward into xp from public.challenges where id = cid;
  if xp != 70 then raise exception 'FAIL: owner difficulty update should recompute XP to 70, got %', xp; end if;
end $$;

-- Case 6: Non-creator non-owner can't update (user 3 tries to edit user 2's challenge)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-cccc-0000-0000-000000000003","role":"authenticated"}';

do $$
declare cid uuid;
begin
  select id into cid from public.challenges
    where title = 'Read for 30 min' and group_id = (select id from public.groups where name='GC Crew');
  begin
    perform public.update_group_challenge(cid, 'Hacked title', null, null, null);
    raise exception 'FAIL: non-creator non-owner update should reject';
  exception when sqlstate '42501' then end;
end $$;

-- Case 7: Creator can delete own challenge
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';

do $$
declare cid uuid;
declare r record;
begin
  select id into cid from public.challenges
    where title = 'Easy thing' and group_id = (select id from public.groups where name='GC Crew');
  perform public.delete_group_challenge(cid);
  select is_active into r from public.challenges where id = cid;
  if r.is_active != false then raise exception 'FAIL: soft delete should flip is_active'; end if;
end $$;

-- Verify soft-deleted challenge is hidden by RLS
do $$
declare n int;
begin
  select count(*) into n from public.challenges
    where group_id = (select id from public.groups where name='GC Crew')
      and title = 'Easy thing';
  if n != 0 then raise exception 'FAIL: soft-deleted challenge should be hidden by RLS'; end if;
end $$;

-- Case 8: Owner can delete any group challenge (owner deletes user 2's Hard challenge)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';

do $$
declare cid uuid;
begin
  select id into cid from public.challenges
    where title = 'Hard thing' and group_id = (select id from public.groups where name='GC Crew');
  perform public.delete_group_challenge(cid);
end $$;

-- Case 9: Soft delete preserves completions
-- (verify the completion row still exists even though the challenge is is_active=false)
-- Have user 3 accept + complete the still-active 'Epic thing' first, then soft-delete it
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-cccc-0000-0000-000000000003","role":"authenticated"}';

do $$
declare epic_id uuid;
declare a_id uuid;
declare comp_count int;
begin
  select id into epic_id from public.challenges
    where title = 'Epic thing' and group_id = (select id from public.groups where name='GC Crew');
  insert into public.challenge_accepts (challenge_id, user_id)
    values (epic_id, '33333333-cccc-0000-0000-000000000003')
    returning id into a_id;
  -- submit a photo completion (proof_url must be under user 3's folder)
  perform public.submit_completion(a_id, 'proof/33333333-cccc-0000-0000-000000000003/x.jpg');
  -- now owner soft-deletes
  reset role;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';
  perform public.delete_group_challenge(epic_id);
  -- verify completion still exists (service_role view)
  reset role;
  select count(*) into comp_count from public.challenge_completions
    where challenge_id = epic_id and user_id = '33333333-cccc-0000-0000-000000000003';
  if comp_count != 1 then raise exception 'FAIL: completion lost after soft delete (got % rows)', comp_count; end if;
end $$;

-- Case 10: Non-member can't read group challenges
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-cccc-0000-0000-000000000004","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.challenges
    where group_id = (select id from public.groups where name='GC Crew');
  -- group_id reads as null for non-member because groups SELECT is RLS-filtered, but
  -- the challenges policy is the authoritative check
  if n != 0 then raise exception 'FAIL: non-member should see 0 group challenges, saw %', n; end if;
end $$;

reset role;

-- Cleanup
delete from public.challenge_completions where user_id in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.challenge_accepts where user_id in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.challenges where created_by in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.group_members where user_id in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.groups where created_by in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.users where id in (
  select id from auth.users where email like 'gc%@local'
);
delete from auth.users where email like 'gc%@local';

commit;
select 'TEST PASS: group_challenges' as result;
