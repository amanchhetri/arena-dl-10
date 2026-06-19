-- 0006_username_finalize.sql
-- RPC: atomically claim a username for the authenticated user, with regex +
-- reserved-list + no `u_` prefix + uniqueness enforcement.

create or replace function public.users_finalize_username(
  p_username text,
  p_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text := lower(trim(p_username));
  v_reserved text[] := array[
    'admin','administrator','root','support','help','staff','team',
    'arena','challengearena','api','www','app','mobile',
    'signup','signin','login','logout','register','onboarding',
    'me','you','user','users','profile','settings','test'
  ];
begin
  if p_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username format' using errcode = '22023';
  end if;

  if v_normalized like 'u\_%' escape '\' then
    raise exception 'Username cannot start with u_' using errcode = '22023';
  end if;

  if v_normalized = any(v_reserved) then
    raise exception 'Username is reserved' using errcode = '22023';
  end if;

  if exists (select 1 from public.users where username = v_normalized and id != p_user_id) then
    raise exception 'Username already taken' using errcode = '23505';
  end if;

  update public.users set username = v_normalized where id = p_user_id;
end;
$$;

-- The single function signature is (text, uuid) — Postgres doesn't create a
-- separate (text) overload from the DEFAULT; callers omitting p_user_id are
-- still dispatched to (text, uuid) via the default expression.
grant execute on function public.users_finalize_username(text, uuid) to authenticated;
