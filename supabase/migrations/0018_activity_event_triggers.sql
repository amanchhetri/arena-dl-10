-- 0018_activity_event_triggers.sql
-- emit_joined_group_event trigger + reset_dead_group_flames pg_cron job.

create or replace function public.emit_joined_group_event()
returns trigger
language plpgsql
as $$
begin
  if new.role != 'owner' then
    insert into public.activity_events (group_id, actor_user_id, event_type)
      values (new.group_id, new.user_id, 'joined_group');
  end if;
  return new;
end;
$$;

create trigger trg_emit_joined_group_event
  after insert on public.group_members
  for each row execute function public.emit_joined_group_event();

create or replace function public.reset_dead_group_flames()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_count int := 0;
  r record;
begin
  for r in
    select id, current_streak, created_by
      from public.groups
     where current_streak > 0
       and last_activity_date is not null
       and last_activity_date < current_date - 1
  loop
    update public.groups set current_streak = 0 where id = r.id;
    insert into public.activity_events (group_id, actor_user_id, event_type, payload)
      values (
        r.id,
        coalesce(r.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
        'group_flame_broken',
        jsonb_build_object('broken_at_streak', r.current_streak)
      );
    reset_count := reset_count + 1;
  end loop;
  return reset_count;
end;
$$;

-- Idempotent re-schedule.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'group-flame-reset-nightly') then
    perform cron.unschedule('group-flame-reset-nightly');
  end if;
end $$;

select cron.schedule(
  'group-flame-reset-nightly',
  '30 3 * * *',
  $job$select public.reset_dead_group_flames();$job$
);
