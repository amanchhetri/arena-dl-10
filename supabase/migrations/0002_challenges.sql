-- 0002_challenges.sql
-- Slice 1 challenges table. group_id FK deferred to Slice 2 when groups exists.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid,
  title text not null check (char_length(title) between 1 and 80),
  description text,
  category text not null check (category in ('fitness','study','dare','habit','creative','other')),
  difficulty text not null check (difficulty in ('easy','medium','hard','epic')),
  xp_reward int not null check (xp_reward between 0 and 1000),
  proof_type text not null check (proof_type in ('honor','photo','video','peer')),
  deadline_type text not null check (deadline_type in ('none','daily','one_time','expires_at')) default 'none',
  expires_at timestamptz,
  created_by uuid references public.users(id),
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  check (deadline_type != 'expires_at' or expires_at is not null)
);

create index idx_challenges_group on public.challenges (group_id) where group_id is not null;
create index idx_challenges_preset_category on public.challenges (category) where group_id is null;
