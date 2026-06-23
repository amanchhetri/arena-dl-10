-- 0016_group_challenges_rpcs.sql
-- 3 RPCs for custom group challenges + RLS policy swap that surfaces them.

-- Replace the Slice 1 policy (presets only) with one that also covers
-- group challenges visible to members.
drop policy if exists challenges_select_presets on public.challenges;

create policy challenges_select_presets_or_group on public.challenges
  for select to authenticated
  using (
    (group_id is null and is_active = true)
    or
    (group_id is not null and is_active = true and public.is_group_member(group_id, auth.uid()))
  );

-- 4.2 create_group_challenge
create or replace function public.create_group_challenge(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_difficulty text,
  p_proof_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_xp int;
  v_challenge_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'Title must be 1-80 chars' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'Description too long' using errcode = '22023';
  end if;
  if p_category not in ('fitness','study','dare','habit','creative','other') then
    raise exception 'Invalid category' using errcode = '22023';
  end if;
  if p_difficulty not in ('easy','medium','hard','epic') then
    raise exception 'Invalid difficulty' using errcode = '22023';
  end if;
  if p_proof_type in ('video','peer') then
    raise exception 'Proof type not supported in Plan 2' using errcode = '0A000';
  end if;
  if p_proof_type not in ('honor','photo') then
    raise exception 'Invalid proof type' using errcode = '22023';
  end if;

  v_xp := case p_difficulty
    when 'easy'   then 30
    when 'medium' then 50
    when 'hard'   then 70
    when 'epic'   then 120
  end;

  insert into public.challenges
    (group_id, title, description, category, difficulty, xp_reward, proof_type,
     deadline_type, created_by, is_active)
  values
    (p_group_id, v_title, v_description, p_category, p_difficulty, v_xp, p_proof_type,
     'none', v_user_id, true)
  returning id into v_challenge_id;

  return jsonb_build_object('challenge_id', v_challenge_id);
end;
$$;

grant execute on function public.create_group_challenge(uuid, text, text, text, text, text) to authenticated;

-- 4.3 update_group_challenge
create or replace function public.update_group_challenge(
  p_challenge_id uuid,
  p_title text default null,
  p_description text default null,
  p_difficulty text default null,
  p_proof_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge record;
  v_is_authorized boolean;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_description text;
  v_xp int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found or v_challenge.group_id is null then
    raise exception 'not_a_group_challenge' using errcode = '02000';
  end if;

  v_is_authorized := v_challenge.created_by = v_user_id or exists (
    select 1 from public.group_members
    where group_id = v_challenge.group_id and user_id = v_user_id and role = 'owner'
  );
  if not v_is_authorized then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_title is null and p_description is null and p_difficulty is null and p_proof_type is null then
    raise exception 'no_change' using errcode = '22023';
  end if;

  if v_title is not null then
    if char_length(v_title) > 80 then
      raise exception 'Title too long' using errcode = '22023';
    end if;
    update public.challenges set title = v_title where id = p_challenge_id;
  end if;

  if p_description is not null then
    v_description := nullif(trim(p_description), '');
    if v_description is not null and char_length(v_description) > 500 then
      raise exception 'Description too long' using errcode = '22023';
    end if;
    update public.challenges set description = v_description where id = p_challenge_id;
  end if;

  if p_proof_type is not null then
    if p_proof_type in ('video','peer') then
      raise exception 'Proof type not supported in Plan 2' using errcode = '0A000';
    end if;
    if p_proof_type not in ('honor','photo') then
      raise exception 'Invalid proof type' using errcode = '22023';
    end if;
    update public.challenges set proof_type = p_proof_type where id = p_challenge_id;
  end if;

  if p_difficulty is not null then
    if p_difficulty not in ('easy','medium','hard','epic') then
      raise exception 'Invalid difficulty' using errcode = '22023';
    end if;
    v_xp := case p_difficulty
      when 'easy'   then 30
      when 'medium' then 50
      when 'hard'   then 70
      when 'epic'   then 120
    end;
    update public.challenges
      set difficulty = p_difficulty, xp_reward = v_xp
      where id = p_challenge_id;
  end if;
end;
$$;

grant execute on function public.update_group_challenge(uuid, text, text, text, text) to authenticated;

-- 4.4 delete_group_challenge (soft delete)
create or replace function public.delete_group_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge record;
  v_is_authorized boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found or v_challenge.group_id is null then
    raise exception 'not_a_group_challenge' using errcode = '02000';
  end if;

  v_is_authorized := v_challenge.created_by = v_user_id or exists (
    select 1 from public.group_members
    where group_id = v_challenge.group_id and user_id = v_user_id and role = 'owner'
  );
  if not v_is_authorized then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.challenges set is_active = false where id = p_challenge_id;
end;
$$;

grant execute on function public.delete_group_challenge(uuid) to authenticated;
