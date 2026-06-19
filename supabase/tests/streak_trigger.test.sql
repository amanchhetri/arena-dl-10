-- Integration test for the streak trigger (migration 0005).
-- Run: psql "$DB_URL" -f supabase/tests/streak_trigger.test.sql
\set ON_ERROR_STOP on

begin;

-- Helper: insert a test user via auth.users (FK satisfied; trigger creates public.users).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'streak1@local', '', now(), now()),
  ('b2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'streak2@local', '', now(), now()),
  ('c3333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'streak3@local', '', now(), now()),
  ('d4444444-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'streak4@local', '', now(), now());

-- A challenge to reference.
insert into public.challenges (id, title, category, difficulty, xp_reward, proof_type, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T', 'habit', 'easy', 30, 'honor',
        'a1111111-0000-0000-0000-000000000001');

-- Helper procedure: complete on a specific day
create or replace function pg_temp.complete_on_day(p_user uuid, p_day date)
returns void language plpgsql as $$
declare a_id uuid;
begin
  insert into public.challenge_accepts (challenge_id, user_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', p_user)
  returning id into a_id;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_type, xp_awarded, completed_at)
  values (a_id, p_user, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'honor', 30, p_day::timestamptz);
end;
$$;

----------------------------------------------------------------------
-- Case 1: first completion → streak=1, longest=1
----------------------------------------------------------------------
select pg_temp.complete_on_day('a1111111-0000-0000-0000-000000000001'::uuid, '2026-06-01'::date);

do $$
declare r record;
begin
  select current_streak, longest_streak, last_completion_date
    into r from public.users where id='a1111111-0000-0000-0000-000000000001';
  if r.current_streak != 1 then raise exception 'FAIL case 1: current_streak=% expected 1', r.current_streak; end if;
  if r.longest_streak != 1 then raise exception 'FAIL case 1: longest=% expected 1', r.longest_streak; end if;
  if r.last_completion_date != '2026-06-01' then raise exception 'FAIL case 1: last_date=% expected 2026-06-01', r.last_completion_date; end if;
end $$;

----------------------------------------------------------------------
-- Case 2: same-day second completion is a no-op
----------------------------------------------------------------------
select pg_temp.complete_on_day('b2222222-0000-0000-0000-000000000002'::uuid, '2026-06-01'::date);

-- second completion same day — need a second challenge to avoid uniqueness violation
insert into public.challenges (id, title, category, difficulty, xp_reward, proof_type, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'T2', 'habit', 'easy', 30, 'honor',
        'a1111111-0000-0000-0000-000000000001');

do $$
declare a_id uuid;
begin
  insert into public.challenge_accepts (challenge_id, user_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2222222-0000-0000-0000-000000000002')
  returning id into a_id;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_type, xp_awarded, completed_at)
  values (a_id, 'b2222222-0000-0000-0000-000000000002',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'honor', 30, '2026-06-01'::timestamptz);
end $$;

do $$
declare r record;
begin
  select current_streak, last_completion_date into r
    from public.users where id='b2222222-0000-0000-0000-000000000002';
  if r.current_streak != 1 then raise exception 'FAIL case 2: streak=% expected 1 (no change on same day)', r.current_streak; end if;
  if r.last_completion_date != '2026-06-01' then raise exception 'FAIL case 2: last_date changed'; end if;
end $$;

----------------------------------------------------------------------
-- Case 3: next-day completion increments
----------------------------------------------------------------------
select pg_temp.complete_on_day('c3333333-0000-0000-0000-000000000003'::uuid, '2026-06-01'::date);

do $$
declare a_id uuid;
begin
  insert into public.challenge_accepts (challenge_id, user_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c3333333-0000-0000-0000-000000000003')
  returning id into a_id;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_type, xp_awarded, completed_at)
  values (a_id, 'c3333333-0000-0000-0000-000000000003',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'honor', 30, '2026-06-02'::timestamptz);
end $$;

do $$
declare r record;
begin
  select current_streak, longest_streak, last_completion_date into r
    from public.users where id='c3333333-0000-0000-0000-000000000003';
  if r.current_streak != 2 then raise exception 'FAIL case 3: streak=% expected 2', r.current_streak; end if;
  if r.longest_streak != 2 then raise exception 'FAIL case 3: longest=% expected 2', r.longest_streak; end if;
  if r.last_completion_date != '2026-06-02' then raise exception 'FAIL case 3: last_date wrong'; end if;
end $$;

----------------------------------------------------------------------
-- Case 4: gap > 1 day resets to 1
----------------------------------------------------------------------
select pg_temp.complete_on_day('d4444444-0000-0000-0000-000000000004'::uuid, '2026-06-01'::date);

do $$
declare a_id uuid;
begin
  insert into public.challenge_accepts (challenge_id, user_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd4444444-0000-0000-0000-000000000004')
  returning id into a_id;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_type, xp_awarded, completed_at)
  values (a_id, 'd4444444-0000-0000-0000-000000000004',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'honor', 30, '2026-06-05'::timestamptz);
end $$;

do $$
declare r record;
begin
  select current_streak, longest_streak, last_completion_date into r
    from public.users where id='d4444444-0000-0000-0000-000000000004';
  if r.current_streak != 1 then raise exception 'FAIL case 4: streak=% expected 1 after gap', r.current_streak; end if;
  if r.longest_streak != 1 then raise exception 'FAIL case 4: longest=% expected 1', r.longest_streak; end if;
  if r.last_completion_date != '2026-06-05' then raise exception 'FAIL case 4: last_date wrong'; end if;
end $$;

-- Cleanup
delete from public.challenge_completions where user_id in (
  'a1111111-0000-0000-0000-000000000001',
  'b2222222-0000-0000-0000-000000000002',
  'c3333333-0000-0000-0000-000000000003',
  'd4444444-0000-0000-0000-000000000004'
);
delete from public.challenge_accepts where user_id in (
  'a1111111-0000-0000-0000-000000000001',
  'b2222222-0000-0000-0000-000000000002',
  'c3333333-0000-0000-0000-000000000003',
  'd4444444-0000-0000-0000-000000000004'
);
delete from public.challenges where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
delete from auth.users where id in (
  'a1111111-0000-0000-0000-000000000001',
  'b2222222-0000-0000-0000-000000000002',
  'c3333333-0000-0000-0000-000000000003',
  'd4444444-0000-0000-0000-000000000004'
);

commit;
select 'TEST PASS: streak trigger (4 cases)' as result;
