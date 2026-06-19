-- 0010_streak_cron.sql
-- Nightly streak-reset job per Doc C §7.
-- Implemented as pg_cron schedule rather than an Edge Function to avoid the
-- deno.land TLS unreachability in this dev environment.

create extension if not exists pg_cron with schema extensions;

create or replace function public.reset_dead_streaks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_count int;
begin
  with affected as (
    update public.users
      set current_streak = 0
      where current_streak > 0
        and last_completion_date is not null
        and last_completion_date < current_date - 1
      returning id
  )
  select count(*) into reset_count from affected;
  return reset_count;
end;
$$;

-- Idempotent: drop the existing job if present, then schedule fresh.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'streak-reset-nightly') then
    perform cron.unschedule('streak-reset-nightly');
  end if;
end $$;

select cron.schedule(
  'streak-reset-nightly',
  '0 3 * * *',
  $job$select public.reset_dead_streaks();$job$
);
