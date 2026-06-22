\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'del1@local', '', now(), now());

update public.users set username = 'will_delete' where id = 'd1111111-0000-0000-0000-000000000001';

insert into public.challenge_accepts (id, challenge_id, user_id)
select 'd1111111-aaaa-aaaa-aaaa-000000000001', id,
       'd1111111-0000-0000-0000-000000000001'
  from public.challenges where group_id is null limit 1;

insert into public.challenge_completions (accept_id, user_id, challenge_id, proof_type, xp_awarded)
select 'd1111111-aaaa-aaaa-aaaa-000000000001',
       'd1111111-0000-0000-0000-000000000001',
       challenge_id, 'honor', 30
  from public.challenge_accepts where id = 'd1111111-aaaa-aaaa-aaaa-000000000001';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"d1111111-0000-0000-0000-000000000001","role":"authenticated"}';

select public.delete_my_account();

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.users where id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: public.users not cascaded (% rows)', n; end if;

  select count(*) into n from auth.users where id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: auth.users not deleted'; end if;

  select count(*) into n from public.challenge_accepts
    where user_id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: accepts not cascaded (% rows)', n; end if;

  select count(*) into n from public.challenge_completions
    where user_id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: completions not cascaded (% rows)', n; end if;
end $$;

commit;
select 'TEST PASS: delete_my_account' as result;
