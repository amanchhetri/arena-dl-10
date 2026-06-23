-- 0012_groups_schema.sql
-- Groups + group_members tables, member_count trigger, deferred FK from
-- challenge_completions.group_id (was added in Slice 1 without a constraint).

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  theme text not null default 'purple' check (theme in (
    'purple', 'pink', 'cyan', 'flame', 'lime', 'gold'
  )),
  invite_code text unique not null,
  created_by uuid references public.users(id) on delete set null,
  current_streak int not null default 0,
  last_activity_date date,
  member_count int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_groups_invite_code on public.groups (invite_code);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index idx_group_members_user on public.group_members (user_id);
create index idx_group_members_group_role on public.group_members (group_id, role);

grant select, update, delete on public.groups to authenticated;
grant select on public.group_members to authenticated;

create or replace function public.update_group_member_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.groups set member_count = member_count - 1 where id = old.group_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_group_member_count
  after insert or delete on public.group_members
  for each row execute function public.update_group_member_count();

alter table public.challenge_completions
  add constraint challenge_completions_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete set null;
