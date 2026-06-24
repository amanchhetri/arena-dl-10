-- 0017_activity_events.sql
-- Group activity feed events. Solo completions intentionally do NOT emit
-- events (Plan 3a has no solo feed surface).

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  actor_user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'challenge_completed',
    'joined_group',
    'level_up',
    'group_flame_lit',
    'group_flame_broken',
    'group_flame_milestone'
  )),
  target_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_group_date on public.activity_events (group_id, created_at desc)
  where group_id is not null;

grant select on public.activity_events to authenticated;
alter table public.activity_events enable row level security;

create policy activity_events_select_members on public.activity_events
  for select to authenticated
  using (group_id is not null and public.is_group_member(group_id, auth.uid()));

-- Widen users SELECT so the feed can render actor profiles (display_name,
-- username, avatar_url) of group-mates. Existing users_select_own policy
-- stays in place (OR semantics).
create policy users_select_group_mates on public.users
  for select to authenticated
  using (
    exists (
      select 1
      from public.group_members me
      join public.group_members them on me.group_id = them.group_id
      where me.user_id = auth.uid()
        and them.user_id = public.users.id
    )
  );
