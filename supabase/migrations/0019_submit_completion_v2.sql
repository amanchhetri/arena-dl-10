-- 0019_submit_completion_v2.sql
-- Replaces Slice 1 Plan 4's submit_completion. Same signature, same return
-- shape. NEW side effects: emits activity_events rows + updates groups.flame.
-- All inside the same transaction as the completion + XP update.

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
  v_today date;
  v_group record;  -- only loaded if group challenge
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

  -- Idempotency: existing completion → return as-is
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
  if v_challenge.proof_type in ('video','peer') then
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

  -- Resolve the group up-front. v_group is non-null only for genuine group
  -- challenges; preset challenges (and test fixtures using sentinel UUIDs that
  -- aren't backed by a real groups row) fall through with v_group.id = null,
  -- which makes the completion solo: no FK propagation, no events, no flame.
  if v_challenge.group_id is not null then
    select id, current_streak, last_activity_date
      into v_group
      from public.groups
     where id = v_challenge.group_id
     for update;
  end if;

  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_url, proof_type, xp_awarded, group_id)
  values
    (p_accept_id, v_user_id, v_accept.challenge_id, p_proof_url,
     v_challenge.proof_type, v_challenge.xp_reward, v_group.id)
  returning id into v_completion_id;

  update public.challenge_accepts set status = 'completed' where id = p_accept_id;

  v_new_xp := v_old_xp + v_challenge.xp_reward;
  v_new_level := public.level_from_xp(v_new_xp);
  update public.users
    set total_xp = v_new_xp,
        level = v_new_level
    where id = v_user_id;

  select current_streak into v_new_streak from public.users where id = v_user_id;

  -- =========================================================================
  -- Plan 3a additions: emit activity events + update group flame
  -- v_group.id is null for solo completions OR for test sentinels that don't
  -- resolve to a real groups row, so all group side effects are skipped.
  -- =========================================================================
  if v_group.id is not null then
    -- Always emit challenge_completed for group completions
    insert into public.activity_events
      (group_id, actor_user_id, event_type, target_id, payload)
    values (
      v_group.id,
      v_user_id,
      'challenge_completed',
      v_challenge.id,
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'challenge_title', v_challenge.title,
        'xp_awarded', v_challenge.xp_reward,
        'proof_url', p_proof_url
      )
    );

    -- Emit level_up if applicable
    if v_new_level != v_old_level then
      insert into public.activity_events
        (group_id, actor_user_id, event_type, target_id, payload)
      values (
        v_group.id,
        v_user_id,
        'level_up',
        v_completion_id,
        jsonb_build_object('from_level', v_old_level, 'to_level', v_new_level)
      );
    end if;

    -- Group flame logic (lenient rule)
    v_today := ((now()) at time zone 'UTC')::date;

    if v_group.last_activity_date is null then
      update public.groups
         set current_streak = 1, last_activity_date = v_today
       where id = v_group.id;
      insert into public.activity_events (group_id, actor_user_id, event_type)
        values (v_group.id, v_user_id, 'group_flame_lit');
    elsif v_today = v_group.last_activity_date then
      -- Same day: no flame change, no event
      null;
    elsif v_today = v_group.last_activity_date + 1 then
      update public.groups
         set current_streak = v_group.current_streak + 1,
             last_activity_date = v_today
       where id = v_group.id;
      if v_group.current_streak + 1 in (3, 7, 14, 30, 60, 100) then
        insert into public.activity_events
          (group_id, actor_user_id, event_type, payload)
        values (
          v_group.id,
          v_user_id,
          'group_flame_milestone',
          jsonb_build_object('streak_length', v_group.current_streak + 1)
        );
      end if;
    else
      -- Gap > 1 day: fresh flame, no event (cron emitted the break)
      update public.groups
         set current_streak = 1, last_activity_date = v_today
       where id = v_group.id;
    end if;
  end if;

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
