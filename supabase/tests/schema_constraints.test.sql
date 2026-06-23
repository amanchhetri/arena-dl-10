-- Combined constraint tests for migrations 0001..0004 and seed.
-- Run: psql "$DB_URL" -f supabase/tests/schema_constraints.test.sql
\set ON_ERROR_STOP on

begin;

------------------------------------------------------------
-- Seed count BEFORE any test inserts pollute the table
------------------------------------------------------------
do $$
declare
  total int; habit_c int; study_c int; fitness_c int; dare_c int; creative_c int;
begin
  select count(*) into total from public.challenges where group_id is null and created_by is null;
  if total != 30 then raise exception 'FAIL: expected 30 presets, got %', total; end if;
  select count(*) into habit_c    from public.challenges where group_id is null and category='habit'    and created_by is null;
  select count(*) into study_c    from public.challenges where group_id is null and category='study'    and created_by is null;
  select count(*) into fitness_c  from public.challenges where group_id is null and category='fitness'  and created_by is null;
  select count(*) into dare_c     from public.challenges where group_id is null and category='dare'     and created_by is null;
  select count(*) into creative_c from public.challenges where group_id is null and category='creative' and created_by is null;
  if habit_c    != 8 then raise exception 'FAIL: habit count = %', habit_c; end if;
  if study_c    != 8 then raise exception 'FAIL: study count = %', study_c; end if;
  if fitness_c  != 8 then raise exception 'FAIL: fitness count = %', fitness_c; end if;
  if dare_c     != 4 then raise exception 'FAIL: dare count = %', dare_c; end if;
  if creative_c != 2 then raise exception 'FAIL: creative count = %', creative_c; end if;
end $$;

------------------------------------------------------------
-- Provision a test user via auth (handle_new_auth_user creates public.users)
------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'test+constraints@local', '',
        now(), now());
update public.users set username='mira_', display_name='Mira'
  where id='00000000-0000-0000-0000-000000000002';

------------------------------------------------------------
-- 0001 users — username regex + uniqueness + defaults
------------------------------------------------------------
do $$ begin
  begin
    update public.users set username='AB' where id='00000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: 2-char username should reject';
  exception when check_violation then end;
end $$;

do $$
declare r record;
begin
  select level, total_xp, current_streak, streak_freezes_available,
         is_public_profile, locale, interests
    into r from public.users where username='mira_';
  if r.level != 1 then raise exception 'FAIL: level default'; end if;
  if r.total_xp != 0 then raise exception 'FAIL: total_xp default'; end if;
  if r.current_streak != 0 then raise exception 'FAIL: current_streak default'; end if;
  if r.streak_freezes_available != 1 then raise exception 'FAIL: freezes default'; end if;
  if r.is_public_profile != true then raise exception 'FAIL: is_public_profile default'; end if;
  if r.locale != 'en' then raise exception 'FAIL: locale default'; end if;
  if array_length(r.interests, 1) is not null then raise exception 'FAIL: interests default'; end if;
end $$;

------------------------------------------------------------
-- 0002 challenges — enum + xp bounds + deadline check
------------------------------------------------------------
insert into public.challenges (id, title, category, difficulty, xp_reward, proof_type, created_by, group_id)
  values ('11111111-1111-1111-1111-111111111111', 'T', 'habit', 'easy', 30, 'photo',
          '00000000-0000-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffffff');

do $$ begin
  begin
    insert into public.challenges (title, category, difficulty, xp_reward, proof_type)
      values ('X', 'habit', 'extreme', 30, 'honor');
    raise exception 'FAIL: invalid difficulty should reject';
  exception when check_violation then end;
end $$;

do $$ begin
  begin
    insert into public.challenges (title, category, difficulty, xp_reward, proof_type)
      values ('X', 'habit', 'easy', 30, 'magic');
    raise exception 'FAIL: invalid proof_type should reject';
  exception when check_violation then end;
end $$;

do $$ begin
  begin
    insert into public.challenges (title, category, difficulty, xp_reward, proof_type)
      values ('X', 'habit', 'easy', 1001, 'honor');
    raise exception 'FAIL: xp_reward > 1000 should reject';
  exception when check_violation then end;
end $$;

do $$ begin
  begin
    insert into public.challenges (title, category, difficulty, xp_reward, proof_type, deadline_type)
      values ('X', 'habit', 'easy', 30, 'honor', 'expires_at');
    raise exception 'FAIL: expires_at required when deadline_type=expires_at';
  exception when check_violation then end;
end $$;

------------------------------------------------------------
-- 0003 challenge_accepts — defaults + uniqueness
------------------------------------------------------------
insert into public.challenge_accepts (challenge_id, user_id)
  values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002');

do $$
declare s text;
begin
  select status into s from public.challenge_accepts
   where challenge_id='11111111-1111-1111-1111-111111111111';
  if s != 'accepted' then raise exception 'FAIL: accept default status'; end if;
end $$;

do $$ begin
  begin
    insert into public.challenge_accepts (challenge_id, user_id)
      values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: duplicate accept should reject';
  exception when unique_violation then end;
end $$;

------------------------------------------------------------
-- 0004 challenge_completions — unique accept_id
------------------------------------------------------------
do $$
declare a_id uuid;
begin
  select id into a_id from public.challenge_accepts
    where challenge_id='11111111-1111-1111-1111-111111111111';
  insert into public.challenge_completions (accept_id, user_id, challenge_id, proof_type, xp_awarded)
    values (a_id, '00000000-0000-0000-0000-000000000002',
            '11111111-1111-1111-1111-111111111111', 'photo', 30);
  begin
    insert into public.challenge_completions (accept_id, user_id, challenge_id, proof_type, xp_awarded)
      values (a_id, '00000000-0000-0000-0000-000000000002',
              '11111111-1111-1111-1111-111111111111', 'photo', 30);
    raise exception 'FAIL: duplicate completion for same accept should reject';
  exception when unique_violation then end;
end $$;

------------------------------------------------------------
-- Cleanup
------------------------------------------------------------
delete from public.challenge_completions where user_id='00000000-0000-0000-0000-000000000002';
delete from public.challenge_accepts where user_id='00000000-0000-0000-0000-000000000002';
delete from public.challenges where id='11111111-1111-1111-1111-111111111111';
delete from auth.users where id='00000000-0000-0000-0000-000000000002';

commit;
select 'TEST PASS: schema constraints + seed' as result;
