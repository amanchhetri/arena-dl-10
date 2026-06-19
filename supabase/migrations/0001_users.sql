-- 0001_users.sql
-- Slice 1 schema per Doc B §4.1 + interests text[] addition for onboarding.

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null,
  avatar_url text,
  bio text,
  level int not null default 1,
  total_xp bigint not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_completion_date date,
  streak_freezes_available int not null default 1,
  is_public_profile bool not null default true,
  locale text not null default 'en',
  interests text[] not null default '{}',
  push_token text,
  notification_pref_evening_time time default '20:00',
  created_at timestamptz not null default now()
);

create index idx_users_total_xp on public.users (total_xp desc);
create index idx_users_current_streak on public.users (current_streak desc);

-- Defer FK so tests can insert public.users without an auth.users row.
alter table public.users alter constraint users_id_fkey deferrable initially deferred;

-- Auth trigger: create matching public.users row when auth.users is inserted.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, username, display_name, avatar_url, locale)
  values (
    new.id,
    'u_' || replace(substr(new.id::text, 1, 8), '-', ''),
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.raw_user_meta_data->>'avatar_url',
    'en'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
