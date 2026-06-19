-- 0004_challenge_completions.sql
-- group_id FK deferred to Slice 2.

create table public.challenge_completions (
  id uuid primary key default gen_random_uuid(),
  accept_id uuid not null unique references public.challenge_accepts(id) on delete cascade,
  user_id uuid not null references public.users(id),
  challenge_id uuid not null references public.challenges(id),
  group_id uuid,
  proof_url text,
  proof_type text not null,
  completed_at timestamptz not null default now(),
  xp_awarded int not null,
  verification_status text not null check (verification_status in ('auto','pending_peer','approved','rejected')) default 'auto'
);

create index idx_completions_user_date on public.challenge_completions (user_id, completed_at desc);
create index idx_completions_group_date on public.challenge_completions (group_id, completed_at desc) where group_id is not null;
