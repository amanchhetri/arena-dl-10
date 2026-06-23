\set ON_ERROR_STOP on
begin;

-- Tables exist
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='groups') then
    raise exception 'FAIL: public.groups missing'; end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='group_members') then
    raise exception 'FAIL: public.group_members missing'; end if;
end $$;

-- Test users (auth trigger populates public.users)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-2222-3333-4444-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'g1@local', '', now(), now()),
  ('22222222-3333-4444-5555-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'g2@local', '', now(), now());

-- Insert group with member_count=0; trigger will bump
insert into public.groups (id, name, invite_code, created_by, member_count)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew', 'ARENA-AAAAAA',
        '11111111-2222-3333-4444-555555555555', 0);

-- Insert owner, member_count should be 1
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        '11111111-2222-3333-4444-555555555555', 'owner');

do $$
declare c int;
begin
  select member_count into c from public.groups where invite_code='ARENA-AAAAAA';
  if c != 1 then raise exception 'FAIL: trigger should bump member_count to 1, got %', c; end if;
end $$;

-- Insert another member, count should be 2
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        '22222222-3333-4444-5555-666666666666', 'member');

do $$
declare c int;
begin
  select member_count into c from public.groups where invite_code='ARENA-AAAAAA';
  if c != 2 then raise exception 'FAIL: trigger should bump member_count to 2, got %', c; end if;
end $$;

-- Delete a member, count should be 1
delete from public.group_members
  where group_id='99999999-9999-9999-9999-999999999999'
    and user_id='22222222-3333-4444-5555-666666666666';

do $$
declare c int;
begin
  select member_count into c from public.groups where invite_code='ARENA-AAAAAA';
  if c != 1 then raise exception 'FAIL: trigger should decrement member_count to 1, got %', c; end if;
end $$;

-- Bad theme rejects
do $$ begin
  begin
    insert into public.groups (name, theme, invite_code, created_by)
    values ('X', 'rainbow', 'ARENA-XXXXXX', '11111111-2222-3333-4444-555555555555');
    raise exception 'FAIL: invalid theme should reject';
  exception when check_violation then end;
end $$;

-- Empty name rejects
do $$ begin
  begin
    insert into public.groups (name, invite_code, created_by)
    values ('', 'ARENA-YYYYYY', '11111111-2222-3333-4444-555555555555');
    raise exception 'FAIL: empty name should reject';
  exception when check_violation then end;
end $$;

-- Cleanup
delete from public.group_members where group_id='99999999-9999-9999-9999-999999999999';
delete from public.groups where id='99999999-9999-9999-9999-999999999999';
delete from public.users where id in (
  '11111111-2222-3333-4444-555555555555',
  '22222222-3333-4444-5555-666666666666'
);
delete from auth.users where id in (
  '11111111-2222-3333-4444-555555555555',
  '22222222-3333-4444-5555-666666666666'
);

commit;
select 'TEST PASS: groups_schema' as result;
