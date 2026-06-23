-- group_rpcs.test.sql — covers all 7 RPCs + edge cases.
\set ON_ERROR_STOP on
begin;

-- Provision 6 test users with DISTINCT UUID prefixes (auth trigger generates
-- placeholder username 'u_<first8chars>' which would collide otherwise).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc1@local', '', now(), now()),
  ('b2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc2@local', '', now(), now()),
  ('c3333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc3@local', '', now(), now()),
  ('e4444444-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc4@local', '', now(), now()),
  ('f5555555-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc5@local', '', now(), now()),
  ('d6666666-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc6@local', '', now(), now());

-- User 1: create_group happy path
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare result jsonb;
declare gid uuid;
declare code text;
begin
  select public.create_group('Crew One', 'flame') into result;
  gid := (result->>'group_id')::uuid;
  code := result->>'invite_code';
  if code not like 'ARENA-%' or char_length(code) != 12 then
    raise exception 'FAIL: invite_code shape wrong: %', code; end if;
  if (select member_count from public.groups where id=gid) != 1 then
    raise exception 'FAIL: member_count should be 1 after create'; end if;
  if (select role from public.group_members where group_id=gid and user_id='a1111111-0000-0000-0000-000000000001') != 'owner' then
    raise exception 'FAIL: creator should be owner'; end if;
end $$;

-- Empty name rejects
do $$ begin
  begin
    perform public.create_group('', 'purple');
    raise exception 'FAIL: empty name should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Bad theme rejects
do $$ begin
  begin
    perform public.create_group('X', 'rainbow');
    raise exception 'FAIL: bad theme should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Create 4 more groups for user 1 to hit cap (already at 1 from Crew One)
do $$
declare i int;
begin
  for i in 2..5 loop
    perform public.create_group('Crew ' || i, 'purple');
  end loop;
end $$;

-- 6th group rejects
do $$ begin
  begin
    perform public.create_group('Crew 6', 'purple');
    raise exception 'FAIL: 6th group should reject';
  exception when sqlstate '54023' then end;
end $$;

reset role;

-- Capture Crew One's invite_code as service_role (RLS would hide it from user 2)
select invite_code as crew_one_code from public.groups where name='Crew One' \gset

-- Switch to user 2 — join via plain SELECT (psql var works in top-level SQL,
-- not inside do $$ blocks).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2222222-0000-0000-0000-000000000002","role":"authenticated"}';

select public.join_group(:'crew_one_code');

-- After joining, user 2 can see the group; verify state via do block
do $$
begin
  if (select member_count from public.groups where name='Crew One') != 2 then
    raise exception 'FAIL: member_count should be 2 after join, got %',
      (select member_count from public.groups where name='Crew One');
  end if;
end $$;

-- Double-join is idempotent
select public.join_group(:'crew_one_code');

do $$
begin
  if (select member_count from public.groups where name='Crew One') != 2 then
    raise exception 'FAIL: double-join must not double-count';
  end if;
end $$;

-- Bad code rejects
do $$ begin
  begin
    perform public.join_group('ARENA-NOPE99');
    raise exception 'FAIL: bad code should reject';
  exception when sqlstate '02000' then end;
end $$;

-- kick_member: owner (user 1) kicks user 2
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare gid uuid;
declare result jsonb;
begin
  select id into gid from public.groups where name='Crew One';
  select public.kick_member(gid, 'b2222222-0000-0000-0000-000000000002') into result;
  if (result->>'kicked')::bool != true then raise exception 'FAIL: kick should succeed'; end if;
  if exists (select 1 from public.group_members where group_id=gid and user_id='b2222222-0000-0000-0000-000000000002') then
    raise exception 'FAIL: kicked user still in group_members'; end if;
end $$;

-- Self-kick rejects
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Crew One';
  begin
    perform public.kick_member(gid, 'a1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: self-kick should reject';
  exception when sqlstate '42P05' then end;
end $$;

-- Non-owner can't kick (user 3 joins, then tries to kick user 1)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"c3333333-0000-0000-0000-000000000003","role":"authenticated"}';

select public.join_group(:'crew_one_code');

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Crew One';
  begin
    perform public.kick_member(gid, 'a1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: non-owner kick should reject';
  exception when sqlstate '42501' then end;
end $$;

-- regenerate_invite_code: owner can, code changes
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare gid uuid;
declare old_code text;
declare result jsonb;
declare new_code text;
begin
  select id, invite_code into gid, old_code from public.groups where name='Crew One';
  select public.regenerate_invite_code(gid) into result;
  new_code := result->>'invite_code';
  if new_code = old_code then raise exception 'FAIL: regenerated code matches old'; end if;
  if (select invite_code from public.groups where id=gid) != new_code then
    raise exception 'FAIL: invite_code not updated in row'; end if;
end $$;

-- update_group: owner can edit name + theme
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Crew One';
  perform public.update_group(gid, 'Crew One Renamed', 'lime');
  if (select name from public.groups where id=gid) != 'Crew One Renamed' then
    raise exception 'FAIL: name not updated'; end if;
  if (select theme from public.groups where id=gid) != 'lime' then
    raise exception 'FAIL: theme not updated'; end if;
end $$;

-- leave_group: owner-leave-populated transfers ownership to user 3
do $$
declare gid uuid;
declare result jsonb;
declare new_owner uuid;
begin
  select id into gid from public.groups where name='Crew One Renamed';
  select public.leave_group(gid) into result;
  if (result->>'group_deleted')::bool != false then raise exception 'FAIL: should not delete populated group'; end if;
  new_owner := (result->>'new_owner')::uuid;
  if new_owner is null then raise exception 'FAIL: new_owner missing'; end if;
  if (select role from public.group_members where group_id=gid and user_id=new_owner) != 'owner' then
    raise exception 'FAIL: new_owner does not have owner role'; end if;
end $$;

-- leave_group: sole-member-leave deletes the group (user 1 still owns Crew 2-5)
do $$
declare gid uuid;
declare result jsonb;
begin
  select id into gid from public.groups where name='Crew 2';
  select public.leave_group(gid) into result;
  if (result->>'group_deleted')::bool != true then
    raise exception 'FAIL: sole-member leave should delete group'; end if;
  if exists (select 1 from public.groups where id=gid) then
    raise exception 'FAIL: group still exists after sole-member leave'; end if;
end $$;

-- delete_group: owner can delete populated group
do $$ begin
  perform public.create_group('To Delete', 'cyan');
end $$;

reset role;

select invite_code as to_delete_code from public.groups where name='To Delete' \gset

-- User 6 joins
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"d6666666-0000-0000-0000-000000000006","role":"authenticated"}';

select public.join_group(:'to_delete_code');

-- User 1 deletes the populated group
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='To Delete';
  perform public.delete_group(gid);
  if exists (select 1 from public.groups where id=gid) then
    raise exception 'FAIL: delete_group did not remove the group'; end if;
end $$;

reset role;

-- Cleanup
delete from public.group_members where user_id in (
  select id from auth.users where email like 'rpc%@local'
);
delete from public.groups where created_by in (
  select id from auth.users where email like 'rpc%@local'
);
delete from public.users where id in (
  select id from auth.users where email like 'rpc%@local'
);
delete from auth.users where email like 'rpc%@local';

commit;
select 'TEST PASS: group_rpcs' as result;
