-- 0013_group_rpcs.sql
-- All RPCs for group lifecycle. SECURITY DEFINER bypasses RLS for these
-- controlled mutation paths; client never inserts/updates groups directly.

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;

create or replace function public.mint_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempts int := 0;
begin
  loop
    v_code := 'ARENA-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + (random() * length(v_chars))::int, 1);
    end loop;
    if not exists (select 1 from public.groups where invite_code = v_code) then
      return v_code;
    end if;
    v_attempts := v_attempts + 1;
    if v_attempts > 5 then
      raise exception 'Could not mint a unique invite code after 5 attempts' using errcode = '23505';
    end if;
  end loop;
end;
$$;

create or replace function public.create_group(
  p_name text,
  p_theme text default 'purple'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_name);
  v_code text;
  v_group_id uuid;
  v_existing_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Group name must be 1-40 chars' using errcode = '22023';
  end if;
  if p_theme not in ('purple','pink','cyan','flame','lime','gold') then
    raise exception 'Invalid theme' using errcode = '22023';
  end if;

  select count(*) into v_existing_count from public.group_members where user_id = v_user_id;
  if v_existing_count >= 5 then
    raise exception 'too_many_groups' using errcode = '54023';
  end if;

  v_code := public.mint_invite_code();

  insert into public.groups (name, theme, invite_code, created_by, member_count)
    values (v_name, p_theme, v_code, v_user_id, 0)
    returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_user_id, 'owner');

  return jsonb_build_object('group_id', v_group_id, 'invite_code', v_code);
end;
$$;

grant execute on function public.create_group(text, text) to authenticated;

create or replace function public.join_group(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(p_invite_code));
  v_group record;
  v_user_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select id, member_count into v_group from public.groups where invite_code = v_code;
  if not found then
    raise exception 'invite_code_not_found' using errcode = '02000';
  end if;

  if exists (select 1 from public.group_members where group_id = v_group.id and user_id = v_user_id) then
    return jsonb_build_object('group_id', v_group.id, 'member_count', v_group.member_count);
  end if;

  if v_group.member_count >= 25 then
    raise exception 'group_full' using errcode = '54024';
  end if;

  select count(*) into v_user_count from public.group_members where user_id = v_user_id;
  if v_user_count >= 5 then
    raise exception 'too_many_groups' using errcode = '54023';
  end if;

  insert into public.group_members (group_id, user_id, role)
    values (v_group.id, v_user_id, 'member');

  return jsonb_build_object('group_id', v_group.id, 'member_count', v_group.member_count + 1);
end;
$$;

grant execute on function public.join_group(text) to authenticated;

create or replace function public.leave_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_other_member_count int;
  v_new_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if v_caller_role = 'owner' then
    select count(*) into v_other_member_count
      from public.group_members where group_id = p_group_id and user_id != v_user_id;

    if v_other_member_count = 0 then
      delete from public.groups where id = p_group_id;
      return jsonb_build_object('left', true, 'group_deleted', true);
    end if;

    select user_id into v_new_owner from public.group_members
      where group_id = p_group_id and user_id != v_user_id
      order by joined_at asc limit 1;
    update public.group_members set role = 'owner'
      where group_id = p_group_id and user_id = v_new_owner;
    delete from public.group_members where group_id = p_group_id and user_id = v_user_id;

    return jsonb_build_object(
      'left', true, 'group_deleted', false, 'new_owner', v_new_owner
    );
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_user_id;
  return jsonb_build_object('left', true, 'group_deleted', false);
end;
$$;

grant execute on function public.leave_group(uuid) to authenticated;

create or replace function public.kick_member(
  p_group_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_target_user_id = v_user_id then
    raise exception 'self_kick_disallowed' using errcode = '42P05';
  end if;

  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_target_user_id
  ) then
    raise exception 'target_not_member' using errcode = '42501';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_target_user_id;
  return jsonb_build_object('kicked', true);
end;
$$;

grant execute on function public.kick_member(uuid, uuid) to authenticated;

create or replace function public.regenerate_invite_code(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_new_code text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  v_new_code := public.mint_invite_code();
  update public.groups set invite_code = v_new_code where id = p_group_id;
  return jsonb_build_object('invite_code', v_new_code);
end;
$$;

grant execute on function public.regenerate_invite_code(uuid) to authenticated;

create or replace function public.update_group(
  p_group_id uuid,
  p_name text default null,
  p_theme text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_name is null and p_theme is null then
    raise exception 'no_change' using errcode = '22023';
  end if;
  if v_name is not null then
    if char_length(v_name) > 40 then
      raise exception 'name_too_long' using errcode = '22023';
    end if;
    update public.groups set name = v_name where id = p_group_id;
  end if;
  if p_theme is not null then
    if p_theme not in ('purple','pink','cyan','flame','lime','gold') then
      raise exception 'invalid_theme' using errcode = '22023';
    end if;
    update public.groups set theme = p_theme where id = p_group_id;
  end if;
end;
$$;

grant execute on function public.update_group(uuid, text, text) to authenticated;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  delete from public.groups where id = p_group_id;
end;
$$;

grant execute on function public.delete_group(uuid) to authenticated;
