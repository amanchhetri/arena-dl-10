-- 0011_delete_account.sql
-- Self-service account deletion. Cascades through auth.users → public.users
-- → accepts → completions.
--
-- Migration 0004 created challenge_completions with FKs to users and challenges
-- but missing ON DELETE CASCADE on user_id/challenge_id, which blocks the
-- cascade chain. Fix that here so account deletion actually works.

alter table public.challenge_completions
  drop constraint challenge_completions_user_id_fkey,
  drop constraint challenge_completions_challenge_id_fkey;

alter table public.challenge_completions
  add constraint challenge_completions_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  add constraint challenge_completions_challenge_id_fkey
    foreign key (challenge_id) references public.challenges(id) on delete cascade;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = v_user_id;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
