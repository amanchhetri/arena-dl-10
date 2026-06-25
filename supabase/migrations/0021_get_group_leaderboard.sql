-- 0021_get_group_leaderboard.sql
-- Single parameterized RPC returning either lifetime or this-week ranking
-- of group members by XP earned in that group. Members with 0 XP for the
-- period appear at the bottom of the result with rank = NULL; non-members
-- are bounced with 42501. The membership check is in the function body
-- (not RLS) so the client can distinguish "no XP yet" from "you're not
-- in this group".

create or replace function public.get_group_leaderboard(
  p_group_id uuid,
  p_period text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz,
  xp_total bigint,
  rank int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_since timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if p_period not in ('lifetime', 'this_week') then
    raise exception 'Invalid period' using errcode = '22023';
  end if;

  v_since := case
    when p_period = 'this_week'
    then date_trunc('week', (now() at time zone 'UTC')::timestamp) at time zone 'UTC'
    else null
  end;

  return query
  with totals as (
    select gm.user_id    as t_user_id,
           gm.role       as t_role,
           gm.joined_at  as t_joined_at,
           coalesce(sum(cc.xp_awarded), 0)::bigint as t_xp_total
      from public.group_members gm
      left join public.challenge_completions cc
        on cc.user_id = gm.user_id
       and cc.group_id = p_group_id
       and (v_since is null or cc.completed_at >= v_since)
     where gm.group_id = p_group_id
     group by gm.user_id, gm.role, gm.joined_at
  )
  select t.t_user_id,
         u.username,
         u.display_name,
         u.avatar_url,
         t.t_role,
         t.t_joined_at,
         t.t_xp_total,
         case when t.t_xp_total = 0 then null
              else (row_number() over (order by t.t_xp_total desc, t.t_joined_at asc))::int
         end as rank
    from totals t
    join public.users u on u.id = t.t_user_id
   order by t.t_xp_total desc, t.t_joined_at asc;
end;
$$;

grant execute on function public.get_group_leaderboard(uuid, text) to authenticated;
