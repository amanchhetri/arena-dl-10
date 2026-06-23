\set ON_ERROR_STOP on

-- NOTE: This test inserts challenges with group_id = 'ffffffff-...' as a sentinel
-- because the challenges_creator_consistency CHECK constraint (migration 0015)
-- requires both created_by AND group_id to be non-null on custom challenges.
-- There is no FK on challenges.group_id today. If a future migration adds
-- `REFERENCES public.groups(id)`, this test must be updated to seed a real
-- groups row first; otherwise the challenge INSERT will fail on the FK.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('51111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sub1@local', '', now(), now()),
  ('62222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sub2@local', '', now(), now());

insert into public.challenges (id, title, category, difficulty, xp_reward, proof_type, created_by, group_id)
values
  ('a1111111-1111-1111-1111-111111111111', 'Honor C', 'habit', 'easy', 30, 'honor',
   '51111111-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  ('a2222222-2222-2222-2222-222222222222', 'Photo C', 'habit', 'easy', 50, 'photo',
   '51111111-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  ('a3333333-3333-3333-3333-333333333333', 'Expired C', 'habit', 'easy', 40, 'honor',
   '51111111-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff');

update public.challenges set
  deadline_type = 'expires_at',
  expires_at = (now() - interval '1 day')
  where id = 'a3333333-3333-3333-3333-333333333333';

insert into public.challenge_accepts (id, challenge_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   '51111111-0000-0000-0000-000000000001'),
  ('b2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
   '51111111-0000-0000-0000-000000000001'),
  ('b3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333',
   '51111111-0000-0000-0000-000000000001'),
  ('b4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111',
   '62222222-0000-0000-0000-000000000002');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"51111111-0000-0000-0000-000000000001","role":"authenticated"}';

-- Rejection 1: cross-user accept
do $$ begin
  begin
    perform public.submit_completion('b4444444-4444-4444-4444-444444444444', null);
    raise exception 'FAIL: cross-user accept_id should reject';
  exception when sqlstate '42501' then end;
end $$;

-- Rejection 2: photo w/o proof_url
do $$ begin
  begin
    perform public.submit_completion('b2222222-2222-2222-2222-222222222222', null);
    raise exception 'FAIL: photo w/o proof should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Rejection 3: honor + proof_url
do $$ begin
  begin
    perform public.submit_completion(
      'b1111111-1111-1111-1111-111111111111',
      'proof/51111111-0000-0000-0000-000000000001/x.jpg'
    );
    raise exception 'FAIL: honor + proof_url should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Rejection 4: proof_url outside caller folder
do $$ begin
  begin
    perform public.submit_completion(
      'b2222222-2222-2222-2222-222222222222',
      'proof/62222222-0000-0000-0000-000000000002/wrong.jpg'
    );
    raise exception 'FAIL: cross-folder proof_url should reject';
  exception when sqlstate '42501' then end;
end $$;

-- Rejection 5: expired
do $$ begin
  begin
    perform public.submit_completion('b3333333-3333-3333-3333-333333333333', null);
    raise exception 'FAIL: expired challenge should reject';
  exception when sqlstate '22008' then end;
end $$;

-- Happy path: honor
do $$
declare result jsonb;
begin
  select public.submit_completion('b1111111-1111-1111-1111-111111111111', null) into result;
  if (result->>'xp_awarded')::int != 30 then
    raise exception 'FAIL: xp_awarded expected 30, got %', result->>'xp_awarded'; end if;
  if (result->>'new_total_xp')::int != 30 then
    raise exception 'FAIL: new_total_xp expected 30, got %', result->>'new_total_xp'; end if;
  if (result->>'new_level')::int != 1 then
    raise exception 'FAIL: level should still be 1, got %', result->>'new_level'; end if;
  if (result->>'level_changed')::bool != false then
    raise exception 'FAIL: level_changed must be false on first 30 XP'; end if;
  if (result->>'new_streak')::int != 1 then
    raise exception 'FAIL: streak expected 1, got %', result->>'new_streak'; end if;
  if (result->>'streak_changed')::bool != true then
    raise exception 'FAIL: streak_changed expected true'; end if;
end $$;

-- Side effects
do $$
declare r record;
begin
  select total_xp, current_streak into r from public.users where id='51111111-0000-0000-0000-000000000001';
  if r.total_xp != 30 then raise exception 'FAIL: users.total_xp=%', r.total_xp; end if;
  if r.current_streak != 1 then raise exception 'FAIL: users.current_streak=%', r.current_streak; end if;
end $$;

do $$
declare s text;
begin
  select status into s from public.challenge_accepts where id='b1111111-1111-1111-1111-111111111111';
  if s != 'completed' then raise exception 'FAIL: accept.status=% expected completed', s; end if;
end $$;

-- Idempotency
do $$
declare result jsonb;
declare xp_before bigint; xp_after bigint;
begin
  select total_xp into xp_before from public.users where id='51111111-0000-0000-0000-000000000001';
  select public.submit_completion('b1111111-1111-1111-1111-111111111111', null) into result;
  select total_xp into xp_after from public.users where id='51111111-0000-0000-0000-000000000001';
  if xp_after != xp_before then
    raise exception 'FAIL: idempotent re-submit double-counted XP (% → %)', xp_before, xp_after;
  end if;
  if (result->>'idempotent')::bool != true then
    raise exception 'FAIL: missing idempotent=true on re-submit';
  end if;
end $$;

-- Photo happy path
do $$
declare result jsonb;
begin
  select public.submit_completion(
    'b2222222-2222-2222-2222-222222222222',
    'proof/51111111-0000-0000-0000-000000000001/photo.jpg'
  ) into result;
  if (result->>'new_total_xp')::int != 80 then
    raise exception 'FAIL: expected 80 XP, got %', result->>'new_total_xp'; end if;
  if (result->>'level_changed')::bool != false then
    raise exception 'FAIL: 80 XP should not trigger level up'; end if;
end $$;

reset role;

delete from public.challenge_completions where user_id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);
delete from public.challenge_accepts where user_id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);
delete from public.challenges where id in (
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333'
);
delete from public.users where id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);
delete from auth.users where id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);

commit;
select 'TEST PASS: submit_completion' as result;
