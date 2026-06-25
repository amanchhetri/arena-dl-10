-- group_leaderboard.test.sql
-- 5 cases for public.get_group_leaderboard(p_group_id, p_period).

\set ON_ERROR_STOP on
begin;

-- ----------------------------------------------------------------------------
-- Provision 4 users + 1 outsider. Distinct UUID prefixes so the auth trigger's
-- first-8-char usernames don't collide.
-- ----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1b00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb1@local', '', now(), now()),
  ('22222222-1b00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb2@local', '', now(), now()),
  ('33333333-1b00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb3@local', '', now(), now()),
  ('44444444-1b00-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb4@local', '', now(), now()),
  ('55555555-1b00-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb5@local', '', now(), now());

-- User 1 creates the group; users 2-4 join. User 5 stays outside.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('LB Crew', 'cyan'); end $$;

-- User 1 also creates a group challenge so user-1, user-2, user-3 can complete it.
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='LB Crew';
  perform public.create_group_challenge(gid, 'Read 20 pages', null, 'study', 'medium', 'honor');
end $$;

reset role;
select invite_code as lb_code from public.groups where name='LB Crew' \gset

-- Users 2, 3, 4 join in that order so joined_at strictly increases per user index.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-1b00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'lb_code');

set local "request.jwt.claims" = '{"sub":"33333333-1b00-0000-0000-000000000003","role":"authenticated"}';
select public.join_group(:'lb_code');

set local "request.jwt.claims" = '{"sub":"44444444-1b00-0000-0000-000000000004","role":"authenticated"}';
select public.join_group(:'lb_code');

reset role;

-- ----------------------------------------------------------------------------
-- Seed completions directly (bypassing submit_completion to avoid event side
-- effects). User 1 = 70 XP this week, user 2 = 50 XP this week, user 3 = 30 XP
-- this week (will be backdated in a moment for case 2), user 4 = no completion.
-- ----------------------------------------------------------------------------
do $$
declare
  gid uuid;
  cid uuid;
  aid1 uuid; aid2 uuid; aid3 uuid;
begin
  select id into gid from public.groups where name='LB Crew';
  select id into cid from public.challenges where title='Read 20 pages' and group_id = gid;

  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '11111111-1b00-0000-0000-000000000001') returning id into aid1;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid1, '11111111-1b00-0000-0000-000000000001', cid, gid, 'honor', 70);

  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '22222222-1b00-0000-0000-000000000002') returning id into aid2;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid2, '22222222-1b00-0000-0000-000000000002', cid, gid, 'honor', 50);

  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '33333333-1b00-0000-0000-000000000003') returning id into aid3;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid3, '33333333-1b00-0000-0000-000000000003', cid, gid, 'honor', 30);
end $$;

-- ============================================================================
-- Case 1: lifetime ranking — 70 / 50 / 30 / 0 sorted desc
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  rec record;
  expected_users uuid[] := array[
    '11111111-1b00-0000-0000-000000000001',
    '22222222-1b00-0000-0000-000000000002',
    '33333333-1b00-0000-0000-000000000003',
    '44444444-1b00-0000-0000-000000000004'
  ];
  expected_xp bigint[] := array[70, 50, 30, 0];
  expected_rank int[] := array[1, 2, 3, null];
  i int := 1;
begin
  select id into gid from public.groups where name='LB Crew';
  for rec in
    select * from public.get_group_leaderboard(gid, 'lifetime')
  loop
    if rec.user_id != expected_users[i] then
      raise exception 'FAIL case 1: row % user_id expected % got %', i, expected_users[i], rec.user_id;
    end if;
    if rec.xp_total != expected_xp[i] then
      raise exception 'FAIL case 1: row % xp expected % got %', i, expected_xp[i], rec.xp_total;
    end if;
    if rec.rank is distinct from expected_rank[i] then
      raise exception 'FAIL case 1: row % rank expected % got %', i, expected_rank[i], rec.rank;
    end if;
    i := i + 1;
  end loop;
  if i != 5 then raise exception 'FAIL case 1: expected 4 rows, got %', i - 1; end if;
end $$;

reset role;

-- ============================================================================
-- Case 2: this-week excludes prior weeks. Backdate user 3's completion to
-- two weeks ago. Now user 3 should drop to 0 XP this week and appear at the
-- bottom with NULL rank.
-- ============================================================================
update public.challenge_completions
   set completed_at = now() - interval '14 days'
 where user_id = '33333333-1b00-0000-0000-000000000003';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  rec record;
  -- Only check the top-2 by user_id; 0-XP rows (3 & 4) may appear in either
  -- order because joined_at timestamps can be equal within the same transaction.
  expected_top_users uuid[] := array[
    '11111111-1b00-0000-0000-000000000001',
    '22222222-1b00-0000-0000-000000000002'
  ];
  expected_top_xp bigint[] := array[70, 50];
  i int := 1;
begin
  select id into gid from public.groups where name='LB Crew';
  for rec in
    select * from public.get_group_leaderboard(gid, 'this_week')
  loop
    if i <= 2 then
      if rec.user_id != expected_top_users[i] then
        raise exception 'FAIL case 2: row % user_id expected % got %', i, expected_top_users[i], rec.user_id;
      end if;
      if rec.xp_total != expected_top_xp[i] then
        raise exception 'FAIL case 2: row % xp expected % got %', i, expected_top_xp[i], rec.xp_total;
      end if;
      if rec.rank != i then
        raise exception 'FAIL case 2: row % expected rank %, got %', i, i, rec.rank;
      end if;
    else
      -- 0-XP rows: xp must be 0 and rank must be NULL
      if rec.xp_total != 0 then
        raise exception 'FAIL case 2: row % expected 0 XP, got %', i, rec.xp_total;
      end if;
      if rec.rank is not null then
        raise exception 'FAIL case 2: row % expected NULL rank (0 XP this week), got %', i, rec.rank;
      end if;
    end if;
    i := i + 1;
  end loop;
  if i != 5 then raise exception 'FAIL case 2: expected 4 rows, got %', i - 1; end if;
end $$;

reset role;

-- ============================================================================
-- Case 3: tie-breaker — give user 4 a completion of 50 XP (lifetime). User 4
-- joined AFTER user 2 (who also has 50 XP), so user 2 should outrank user 4.
-- ============================================================================
do $$
declare
  gid uuid;
  cid uuid;
  aid uuid;
begin
  select id into gid from public.groups where name='LB Crew';
  select id into cid from public.challenges where title='Read 20 pages' and group_id = gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '44444444-1b00-0000-0000-000000000004') returning id into aid;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid, '44444444-1b00-0000-0000-000000000004', cid, gid, 'honor', 50);
end $$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  row2 record;
  row3 record;
begin
  select id into gid from public.groups where name='LB Crew';
  -- Expect order: user1 (70), user2 (50, earlier join), user4 (50, later join), user3 (0)
  select * into row2 from public.get_group_leaderboard(gid, 'lifetime') offset 1 limit 1;
  select * into row3 from public.get_group_leaderboard(gid, 'lifetime') offset 2 limit 1;

  if row2.user_id != '22222222-1b00-0000-0000-000000000002' then
    raise exception 'FAIL case 3: expected user 2 at rank 2, got %', row2.user_id;
  end if;
  if row3.user_id != '44444444-1b00-0000-0000-000000000004' then
    raise exception 'FAIL case 3: expected user 4 at rank 3, got %', row3.user_id;
  end if;
  if row2.rank != 2 or row3.rank != 3 then
    raise exception 'FAIL case 3: ranks expected 2, 3 got %, %', row2.rank, row3.rank;
  end if;
end $$;

reset role;

-- ============================================================================
-- Case 4: 0-XP members appear with NULL rank at the bottom (already covered
-- structurally by case 1, but this case asserts the contract directly).
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  bottom record;
begin
  select id into gid from public.groups where name='LB Crew';
  -- User 3 backdated → 0 XP this week. Should be at the bottom with NULL rank.
  select * into bottom from public.get_group_leaderboard(gid, 'this_week')
    order by xp_total asc, joined_at desc limit 1;
  if bottom.rank is not null then
    raise exception 'FAIL case 4: 0-XP member should have NULL rank, got %', bottom.rank;
  end if;
  if bottom.xp_total != 0 then
    raise exception 'FAIL case 4: bottom row should have 0 XP, got %', bottom.xp_total;
  end if;
end $$;

reset role;

-- ============================================================================
-- Case 5: RLS — non-member raises 42501
-- ============================================================================
-- Capture gid as service role first (via \gset + session GUC), then switch
-- to user 5 (a non-member) and prove the RPC raises 42501.
reset role;
select id as lb_gid from public.groups where name='LB Crew' \gset
set local "my.lb_gid" = :'lb_gid';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"55555555-1b00-0000-0000-000000000005","role":"authenticated"}';

do $$
declare
  gid uuid := current_setting('my.lb_gid')::uuid;
  caught boolean := false;
begin
  begin
    perform * from public.get_group_leaderboard(gid, 'lifetime');
  exception when insufficient_privilege then
    caught := true;
  end;
  if not caught then
    raise exception 'FAIL case 5: non-member call should raise 42501';
  end if;
end $$;

reset role;

-- ----------------------------------------------------------------------------
-- Cleanup
-- ----------------------------------------------------------------------------
delete from public.challenge_completions where user_id in (
  select id from auth.users where email like 'lb%@local'
);
delete from public.challenge_accepts where user_id in (
  select id from auth.users where email like 'lb%@local'
);
delete from public.challenges where group_id in (
  select id from public.groups where name='LB Crew'
);
delete from public.activity_events where group_id in (
  select id from public.groups where name='LB Crew'
);
delete from public.group_members where group_id in (
  select id from public.groups where name='LB Crew'
);
delete from public.groups where name='LB Crew';
delete from public.users where id in (
  select id from auth.users where email like 'lb%@local'
);
delete from auth.users where email like 'lb%@local';

commit;
select 'TEST PASS: group_leaderboard (5 cases)' as result;
