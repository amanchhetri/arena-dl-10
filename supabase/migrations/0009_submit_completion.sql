-- 0009_submit_completion.sql
-- Single write path for challenge_completions. Validates per Doc C §6.
-- Implemented as RPC (security definer) rather than Edge Function because
-- this dev environment cannot reach deno.land.

create or replace function public.level_from_xp(p_xp bigint)
returns int
language sql
immutable
as $$
  select case
    when p_xp >= 4500 then 10
    when p_xp >= 3000 then 9
    when p_xp >= 2000 then 8
    when p_xp >= 1500 then 7
    when p_xp >= 1000 then 6
    when p_xp >= 700  then 5
    when p_xp >= 400  then 4
    when p_xp >= 200  then 3
    when p_xp >= 100  then 2
    else 1
  end;
$$;

create or replace function public.submit_completion(
  p_accept_id uuid,
  p_proof_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_accept record;
  v_challenge record;
  v_existing record;
  v_old_xp bigint;
  v_old_level int;
  v_old_streak int;
  v_new_xp bigint;
  v_new_level int;
  v_new_streak int;
  v_completion_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_accept from public.challenge_accepts where id = p_accept_id;
  if not found then
    raise exception 'Accept not found' using errcode = '02000';
  end if;
  if v_accept.user_id != v_user_id then
    raise exception 'Accept not owned by caller' using errcode = '42501';
  end if;

  select * into v_existing from public.challenge_completions where accept_id = p_accept_id;
  if found then
    select total_xp, level, current_streak
      into v_old_xp, v_old_level, v_old_streak
      from public.users where id = v_user_id;
    return jsonb_build_object(
      'idempotent', true,
      'completion_id', v_existing.id,
      'xp_awarded', v_existing.xp_awarded,
      'new_total_xp', v_old_xp,
      'new_level', v_old_level,
      'level_changed', false,
      'new_streak', v_old_streak,
      'streak_changed', false
    );
  end if;

  select * into v_challenge from public.challenges where id = v_accept.challenge_id;
  if not found then
    raise exception 'Challenge not found' using errcode = '02000';
  end if;

  if v_challenge.proof_type = 'honor' and p_proof_url is not null then
    raise exception 'Honor challenge must not include proof_url' using errcode = '22023';
  end if;
  if v_challenge.proof_type = 'photo' and p_proof_url is null then
    raise exception 'Photo challenge requires proof_url' using errcode = '22023';
  end if;
  if v_challenge.proof_type in ('video', 'peer') then
    raise exception 'Proof type not supported in Slice 1' using errcode = '0A000';
  end if;

  if p_proof_url is not null then
    if p_proof_url not like 'proof/' || v_user_id::text || '/%' then
      raise exception 'proof_url must be under caller storage folder' using errcode = '42501';
    end if;
  end if;

  if v_challenge.deadline_type = 'expires_at' and v_challenge.expires_at < now() then
    raise exception 'Challenge has expired' using errcode = '22008';
  end if;

  select total_xp, level, current_streak
    into v_old_xp, v_old_level, v_old_streak
    from public.users where id = v_user_id for update;

  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_url, proof_type, xp_awarded)
  values
    (p_accept_id, v_user_id, v_accept.challenge_id, p_proof_url,
     v_challenge.proof_type, v_challenge.xp_reward)
  returning id into v_completion_id;

  update public.challenge_accepts set status = 'completed' where id = p_accept_id;

  v_new_xp := v_old_xp + v_challenge.xp_reward;
  v_new_level := public.level_from_xp(v_new_xp);
  update public.users
    set total_xp = v_new_xp,
        level = v_new_level
    where id = v_user_id;

  select current_streak into v_new_streak from public.users where id = v_user_id;

  return jsonb_build_object(
    'idempotent', false,
    'completion_id', v_completion_id,
    'xp_awarded', v_challenge.xp_reward,
    'new_total_xp', v_new_xp,
    'new_level', v_new_level,
    'level_changed', (v_new_level != v_old_level),
    'new_streak', v_new_streak,
    'streak_changed', (v_new_streak != v_old_streak)
  );
end;
$$;

grant execute on function public.submit_completion(uuid, text) to authenticated;
