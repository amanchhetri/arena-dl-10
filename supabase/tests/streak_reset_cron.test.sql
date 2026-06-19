\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cron1@local', '', now(), now()),
  ('e2222222-2222-2222-2222-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cron2@local', '', now(), now()),
  ('e3333333-3333-3333-3333-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cron3@local', '', now(), now());

update public.users set current_streak = 5, last_completion_date = current_date
  where id = 'e1111111-1111-1111-1111-000000000001';
update public.users set current_streak = 5, last_completion_date = current_date - 1
  where id = 'e2222222-2222-2222-2222-000000000002';
update public.users set current_streak = 5, last_completion_date = current_date - 3
  where id = 'e3333333-3333-3333-3333-000000000003';

select public.reset_dead_streaks();

do $$
declare a int; b int; c int;
begin
  select current_streak into a from public.users where id = 'e1111111-1111-1111-1111-000000000001';
  select current_streak into b from public.users where id = 'e2222222-2222-2222-2222-000000000002';
  select current_streak into c from public.users where id = 'e3333333-3333-3333-3333-000000000003';
  if a != 5 then raise exception 'FAIL: e1 streak should remain 5, got %', a; end if;
  if b != 5 then raise exception 'FAIL: e2 (1-day grace) should remain 5, got %', b; end if;
  if c != 0 then raise exception 'FAIL: e3 (3-day gap) should reset to 0, got %', c; end if;
end $$;

delete from public.users where id in (
  'e1111111-1111-1111-1111-000000000001',
  'e2222222-2222-2222-2222-000000000002',
  'e3333333-3333-3333-3333-000000000003'
);
delete from auth.users where id in (
  'e1111111-1111-1111-1111-000000000001',
  'e2222222-2222-2222-2222-000000000002',
  'e3333333-3333-3333-3333-000000000003'
);

commit;
select 'TEST PASS: streak_reset_cron' as result;
