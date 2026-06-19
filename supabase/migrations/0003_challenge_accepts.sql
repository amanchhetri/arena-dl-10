-- 0003_challenge_accepts.sql

create table public.challenge_accepts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  status text not null check (status in ('accepted','completed','expired','abandoned')) default 'accepted',
  unique (challenge_id, user_id)
);

create index idx_accepts_user_status on public.challenge_accepts (user_id, status);
