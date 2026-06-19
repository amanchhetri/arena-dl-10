-- 0005_streak_trigger.sql
-- Maintains users.current_streak / longest_streak / last_completion_date
-- on insert into challenge_completions. Per Doc C §7.

create or replace function public.update_streak_on_completion()
returns trigger language plpgsql as $$
declare
  completion_day date := (new.completed_at at time zone 'UTC')::date;
  user_last_date date;
  user_current_streak int;
begin
  select last_completion_date, current_streak
    into user_last_date, user_current_streak
    from public.users
   where id = new.user_id
   for update;

  if user_last_date is null then
    update public.users
       set current_streak = 1,
           longest_streak = greatest(longest_streak, 1),
           last_completion_date = completion_day
     where id = new.user_id;
  elsif completion_day = user_last_date then
    null;
  elsif completion_day = user_last_date + 1 then
    update public.users
       set current_streak = user_current_streak + 1,
           longest_streak = greatest(longest_streak, user_current_streak + 1),
           last_completion_date = completion_day
     where id = new.user_id;
  else
    -- gap > 1 day. Freeze logic deferred to Slice 3; for Slice 1 we always reset.
    update public.users
       set current_streak = 1,
           longest_streak = greatest(longest_streak, 1),
           last_completion_date = completion_day
     where id = new.user_id;
  end if;

  return new;
end;
$$;

create trigger trg_update_streak
  after insert on public.challenge_completions
  for each row execute function public.update_streak_on_completion();
