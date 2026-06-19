\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'finalize1@local', '', now(), now()),
  ('f2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'finalize2@local', '', now(), now());

-- Function rejects too-short
do $$ begin
  begin
    perform public.users_finalize_username('ab', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: too short should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Function rejects bad chars
do $$ begin
  begin
    perform public.users_finalize_username('mira!', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: bad chars should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Function rejects u_ prefix
do $$ begin
  begin
    perform public.users_finalize_username('u_abc123', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: u_ prefix should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Function rejects reserved
do $$ begin
  begin
    perform public.users_finalize_username('admin', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: reserved should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Happy path
select public.users_finalize_username('mira_', 'f1111111-0000-0000-0000-000000000001');

do $$
declare u text;
begin
  select username into u from public.users where id='f1111111-0000-0000-0000-000000000001';
  if u != 'mira_' then raise exception 'FAIL: username not claimed (got %)', u; end if;
end $$;

-- Uniqueness
do $$ begin
  begin
    perform public.users_finalize_username('mira_', 'f2222222-0000-0000-0000-000000000002');
    raise exception 'FAIL: duplicate username should reject';
  exception when sqlstate '23505' then end;
end $$;

delete from public.users where id in (
  'f1111111-0000-0000-0000-000000000001',
  'f2222222-0000-0000-0000-000000000002'
);
delete from auth.users where id in (
  'f1111111-0000-0000-0000-000000000001',
  'f2222222-0000-0000-0000-000000000002'
);

commit;
select 'TEST PASS: username_finalize' as result;
