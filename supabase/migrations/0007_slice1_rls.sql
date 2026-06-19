-- 0007_slice1_rls.sql
-- Enable RLS on Slice 1 tables. Plan 3 needs the read paths; Plan 4 will add
-- write policies for completions + tighten challenge INSERT once group-scoped
-- challenges are supported in Slice 2.

-- Grant table privileges to authenticated role; RLS policies below decide visibility.
grant select, update on public.users to authenticated;
grant select on public.challenges to authenticated;
grant select, insert, update on public.challenge_accepts to authenticated;
grant select on public.challenge_completions to authenticated;

alter table public.users enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_accepts enable row level security;
alter table public.challenge_completions enable row level security;

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy challenges_select_presets on public.challenges
  for select to authenticated
  using (group_id is null);

create policy accepts_select_own on public.challenge_accepts
  for select to authenticated
  using (user_id = auth.uid());

create policy accepts_insert_own on public.challenge_accepts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy accepts_update_own on public.challenge_accepts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy completions_select_own on public.challenge_completions
  for select to authenticated
  using (user_id = auth.uid());

-- Server-side username availability check. Without this, Plan 2's
-- useUsernameAvailable count query returns 0 for usernames owned by OTHER
-- users (RLS filters before the username filter applies), incorrectly
-- reporting them as available. A SECURITY DEFINER RPC sidesteps RLS for
-- this one specific read.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.users where username = lower(trim(p_username))
  );
$$;

grant execute on function public.is_username_available(text) to authenticated;
