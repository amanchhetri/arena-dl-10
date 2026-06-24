# Challenge Arena — Slice 2 Plan 3a: Group Feed + Streak Flame Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `activity_events` table, lenient group-flame mechanics, in-feed photo proofs (with widened storage RLS), an in-home Activity preview, and a dedicated `/groups/[id]/feed` screen — all driven by an extended `submit_completion` v2 RPC + nightly pg_cron.

**Architecture:** Postgres-first. The existing `submit_completion` SECURITY DEFINER RPC from Slice 1 Plan 4 is extended (v2) to additionally emit `challenge_completed` / `level_up` / group-flame events and maintain `groups.current_streak` + `last_activity_date` inside the same transaction. A separate trigger on `group_members` insert emits `joined_group`. A nightly pg_cron at 03:30 UTC resets dead group flames and emits `group_flame_broken`. RLS scopes events to group members and widens storage + users SELECT to group-mates so feed photos and actor profiles render. Client adds one TanStack hook, three components, one new screen, and inserts a flame chip + feed preview into the existing group home.

**Tech Stack:** Postgres (Supabase) + RLS + SQL RPCs; pg_cron (already enabled by Slice 1 Plan 4 migration 0010); React Native + Expo Router; TanStack Query v5; Phosphor icons; NativeWind. No new external dependencies.

## Global Constraints

- Flame rule: **lenient** — any member completion that day grows the flame; flame breaks only on a day with zero activity.
- Event types in Plan 3a: `challenge_completed`, `joined_group`, `level_up`, `group_flame_lit`, `group_flame_broken`, `group_flame_milestone`.
- Milestone steps for `group_flame_milestone`: **3, 7, 14, 30, 60, 100 days**.
- Cron schedule: **nightly 03:30 UTC** (30 minutes after the personal streak reset cron from Slice 1 Plan 4).
- Solo (preset-only) completions do **NOT** emit events. The `activity_events` RLS policy is `using (group_id is not null and is_group_member(group_id, auth.uid()))` — there is no surface for null-`group_id` events.
- `group_flame_broken` event uses `actor_user_id = groups.created_by`, falling back to `'00000000-0000-0000-0000-000000000000'::uuid` if the creator's account was deleted (`created_by` set null via cascade). Client treats zero-UUID as system / anonymous.
- Pagination: last **50 events** per group; no infinite scroll.
- `submit_completion` v1 signature, validation, and return shape stay unchanged. v2 only adds side effects.
- All RPCs `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`.
- All Supabase calls live behind a TanStack hook under `src/features/groups/api/`.
- All user-facing strings via `i18n.t()` under `feed.*` and `groupFlame.*`.
- All eslint-disable comments for `supabase.rpc as any` use the same pattern as Slice 1+2P1+2P2.
- Working branch: `main` (direct commits, no worktrees).

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   └── groups/
│       └── [id]/
│           ├── index.tsx                       # MODIFIED — slot flame chip + feed preview
│           ├── _layout.tsx                     # MODIFIED — register feed route
│           └── feed.tsx                        # NEW — full 50-event scrollable feed
├── src/
│   ├── features/
│   │   └── groups/
│   │       ├── api/
│   │       │   └── useGroupFeed.ts             # NEW
│   │       └── components/
│   │           ├── ActivityEventRow.tsx        # NEW — polymorphic per event_type
│   │           ├── GroupFlameChip.tsx          # NEW
│   │           └── GroupFeedSection.tsx        # NEW — group home preview block
│   ├── lib/
│   │   ├── analytics/events.ts                 # MODIFIED — 3 new typed events
│   │   └── i18n/locales/en.json                # MODIFIED — feed.* + groupFlame.* keys
│   └── types/
│       └── database.ts                         # MODIFIED — ActivityEventRow type
├── supabase/
│   ├── migrations/
│   │   ├── 0017_activity_events.sql            # NEW — table + RLS + users widening
│   │   ├── 0018_activity_event_triggers.sql    # NEW — join trigger + reset_dead_group_flames + cron
│   │   ├── 0019_submit_completion_v2.sql       # NEW — RPC replacement
│   │   └── 0020_storage_group_proof.sql        # NEW — storage policy
│   └── tests/
│       ├── activity_events.test.sql            # NEW — 8 cases
│       └── proof_group_visibility.test.sql     # NEW — 2 cases
└── docs/superpowers/
    └── plans/
        └── 2026-06-24-challenge-arena-slice-2-plan-3a-implementation.md  # this file
```

**Decomposition rationale:**

- 4 migrations split by concern (schema, triggers, RPC v2, storage) so any one can be rolled back surgically.
- 2 SQL test files: `activity_events.test.sql` covers cases 1–8 (events table + completion-driven events + flame + join + cron); `proof_group_visibility.test.sql` covers cases 9–10 (storage RLS).
- `ActivityEventRow` is its own file because it's a polymorphic 6-branch renderer — long, but each branch is small and the switch is the file's whole job.
- `GroupFlameChip` and `GroupFeedSection` are split because the chip lives in the home header and the section lives in the home body — different consumers, different update cadences (chip re-renders on `useGroup`; section re-renders on `useGroupFeed`).

---

## Task 1: Migration 0017 — activity_events table + RLS + users-select-group-mates widening

**Files:**

- Create: `supabase/migrations/0017_activity_events.sql`

**Interfaces:**

- Produces:
  - Table `public.activity_events` with the 6 event_type enum values from spec §3.1.
  - Index `idx_activity_group_date` on `(group_id, created_at desc)` where `group_id is not null`.
  - RLS policy `activity_events_select_members` — group-events-only, members-only.
  - RLS policy `users_select_group_mates` on `public.users` — group-mates can read each other's profile rows.

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0017_activity_events.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
supabase db reset
```

Expected: applies 0001–0017 cleanly.

- [ ] **Step 3: Smoke check — table exists**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='activity_events' order by ordinal_position;"
```

Expected: 7 columns (id, group_id, actor_user_id, event_type, target_id, payload, created_at).

- [ ] **Step 4: Re-run all 11 prior SQL tests as a regression sweep**

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

Expected: all 11 end with `TEST PASS: …`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): activity_events table + RLS + users-select-group-mates (0017)"
```

---

## Task 2: Migration 0018 — join trigger + reset_dead_group_flames + cron + first 2 SQL test cases

**Files:**

- Create: `supabase/migrations/0018_activity_event_triggers.sql`, `supabase/tests/activity_events.test.sql`

**Interfaces:**

- Produces:
  - `public.emit_joined_group_event()` trigger fn + `trg_emit_joined_group_event` AFTER INSERT trigger on `group_members`.
  - `public.reset_dead_group_flames()` SECURITY DEFINER function returning int (count of groups reset).
  - pg_cron schedule `group-flame-reset-nightly` running `0 3 30 * * *` — sorry, the actual cron expression is `'30 3 * * *'` (minute 30, hour 3, every day).
  - SQL test cases 7 (join trigger + owner suppression) and 8 (cron resets dead flames + emits broken event).

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0018_activity_event_triggers.sql`:

```sql
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
```

- [ ] **Step 2: Write the failing SQL test (cases 7 + 8)**

Create `supabase/tests/activity_events.test.sql`:

```sql
-- activity_events.test.sql
-- Cases 1-6 are added by Task 3 (after submit_completion v2 lands).
-- This file starts with cases 7 (join trigger) and 8 (cron reset).

\set ON_ERROR_STOP on
begin;

-- Provision 4 test users with distinct UUID prefixes (avoid auth-trigger
-- username collision since it uses first 8 chars of UUID).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-fe00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe1@local', '', now(), now()),
  ('22222222-fe00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe2@local', '', now(), now()),
  ('33333333-fe00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe3@local', '', now(), now()),
  ('44444444-fe00-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe4@local', '', now(), now());

-- ============================================================================
-- Case 7: join trigger — owner-on-create suppressed, members emit
-- ============================================================================

-- User 1 creates a group → owner row inserted, no joined_group event should fire.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-fe00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('Feed Crew', 'cyan'); end $$;

reset role;
do $$
declare n int;
begin
  select count(*) into n from public.activity_events
   where event_type = 'joined_group'
     and group_id = (select id from public.groups where name='Feed Crew');
  if n != 0 then raise exception 'FAIL case 7a: owner-on-create should NOT emit joined_group, saw %', n; end if;
end $$;

-- Capture the invite code as service_role
select invite_code as fe_code from public.groups where name='Feed Crew' \gset

-- User 2 joins → 1 joined_group event should fire
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-fe00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'fe_code');

reset role;
do $$
declare n int;
begin
  select count(*) into n from public.activity_events
   where event_type = 'joined_group'
     and group_id = (select id from public.groups where name='Feed Crew')
     and actor_user_id = '22222222-fe00-0000-0000-000000000002';
  if n != 1 then raise exception 'FAIL case 7b: member join should emit exactly 1 event, saw %', n; end if;
end $$;

-- ============================================================================
-- Case 8: nightly cron — resets dead flames + emits group_flame_broken
-- ============================================================================

-- Force a stale flame state on Feed Crew (simulating "yesterday was active, today is not")
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  update public.groups
     set current_streak = 5, last_activity_date = current_date - 3
   where id = gid;
end $$;

-- Manually invoke the cron function
select public.reset_dead_group_flames();

do $$
declare streak int; broken_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 0 then raise exception 'FAIL case 8a: streak should reset to 0, got %', streak; end if;

  select count(*) into broken_count from public.activity_events
   where event_type = 'group_flame_broken'
     and group_id = (select id from public.groups where name='Feed Crew');
  if broken_count != 1 then raise exception 'FAIL case 8b: 1 group_flame_broken event expected, saw %', broken_count; end if;
end $$;

-- Cleanup
delete from public.activity_events where group_id = (select id from public.groups where name='Feed Crew');
delete from public.group_members where group_id = (select id from public.groups where name='Feed Crew');
delete from public.groups where name='Feed Crew';
delete from public.users where id in (
  '11111111-fe00-0000-0000-000000000001',
  '22222222-fe00-0000-0000-000000000002',
  '33333333-fe00-0000-0000-000000000003',
  '44444444-fe00-0000-0000-000000000004'
);
delete from auth.users where id in (
  '11111111-fe00-0000-0000-000000000001',
  '22222222-fe00-0000-0000-000000000002',
  '33333333-fe00-0000-0000-000000000003',
  '44444444-fe00-0000-0000-000000000004'
);

commit;
select 'TEST PASS: activity_events (cases 7-8 so far)' as result;
```

- [ ] **Step 3: Run failing → apply → run passing**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/activity_events.test.sql 2>&1 | tail -5
```

Expected: `TEST PASS: activity_events (cases 7-8 so far)`.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(db): join trigger + reset_dead_group_flames + cron (0018) + 2 SQL test cases"
```

---

## Task 3: Migration 0019 — `submit_completion` v2 + extend SQL test with cases 1-6

**Files:**

- Create: `supabase/migrations/0019_submit_completion_v2.sql`
- Modify: `supabase/tests/activity_events.test.sql` (prepend cases 1-6 before existing 7+8)

**Interfaces:**

- Produces: `submit_completion(uuid, text)` is replaced; signature + return shape unchanged from Slice 1 Plan 4. New side effects only: emits `challenge_completed`, conditional `level_up`, and group-flame events (`group_flame_lit` / `group_flame_milestone`); updates `groups.current_streak` + `last_activity_date` for group challenges.

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0019_submit_completion_v2.sql`:

```sql
-- 0019_submit_completion_v2.sql
-- Replaces Slice 1 Plan 4's submit_completion. Same signature, same return
-- shape. NEW side effects: emits activity_events rows + updates groups.flame.
-- All inside the same transaction as the completion + XP update.

create or replace function public.submit_completion(
  p_accept_id uuid,
  p_proof_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_accept record;
  v_challenge record;
  v_existing record;
  v_old_xp bigint;
  v_old_level int;
  v_old_streak int;
  v_new_xp bigint;
  v_new_level int;
  v_new_streak int;
  v_completion_id uuid;
  v_today date;
  v_group record;  -- only loaded if group challenge
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_accept from public.challenge_accepts where id = p_accept_id;
  if not found then
    raise exception 'Accept not found' using errcode = '02000';
  end if;
  if v_accept.user_id != v_user_id then
    raise exception 'Accept not owned by caller' using errcode = '42501';
  end if;

  -- Idempotency: existing completion → return as-is
  select * into v_existing from public.challenge_completions where accept_id = p_accept_id;
  if found then
    select total_xp, level, current_streak
      into v_old_xp, v_old_level, v_old_streak
      from public.users where id = v_user_id;
    return jsonb_build_object(
      'idempotent', true,
      'completion_id', v_existing.id,
      'xp_awarded', v_existing.xp_awarded,
      'new_total_xp', v_old_xp,
      'new_level', v_old_level,
      'level_changed', false,
      'new_streak', v_old_streak,
      'streak_changed', false
    );
  end if;

  select * into v_challenge from public.challenges where id = v_accept.challenge_id;
  if not found then
    raise exception 'Challenge not found' using errcode = '02000';
  end if;

  if v_challenge.proof_type = 'honor' and p_proof_url is not null then
    raise exception 'Honor challenge must not include proof_url' using errcode = '22023';
  end if;
  if v_challenge.proof_type = 'photo' and p_proof_url is null then
    raise exception 'Photo challenge requires proof_url' using errcode = '22023';
  end if;
  if v_challenge.proof_type in ('video','peer') then
    raise exception 'Proof type not supported in Slice 1' using errcode = '0A000';
  end if;

  if p_proof_url is not null then
    if p_proof_url not like 'proof/' || v_user_id::text || '/%' then
      raise exception 'proof_url must be under caller storage folder' using errcode = '42501';
    end if;
  end if;

  if v_challenge.deadline_type = 'expires_at' and v_challenge.expires_at < now() then
    raise exception 'Challenge has expired' using errcode = '22008';
  end if;

  select total_xp, level, current_streak
    into v_old_xp, v_old_level, v_old_streak
    from public.users where id = v_user_id for update;

  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_url, proof_type, xp_awarded, group_id)
  values
    (p_accept_id, v_user_id, v_accept.challenge_id, p_proof_url,
     v_challenge.proof_type, v_challenge.xp_reward, v_challenge.group_id)
  returning id into v_completion_id;

  update public.challenge_accepts set status = 'completed' where id = p_accept_id;

  v_new_xp := v_old_xp + v_challenge.xp_reward;
  v_new_level := public.level_from_xp(v_new_xp);
  update public.users
    set total_xp = v_new_xp,
        level = v_new_level
    where id = v_user_id;

  select current_streak into v_new_streak from public.users where id = v_user_id;

  -- =========================================================================
  -- Plan 3a additions: emit activity events + update group flame
  -- =========================================================================
  if v_challenge.group_id is not null then
    -- Always emit challenge_completed for group completions
    insert into public.activity_events
      (group_id, actor_user_id, event_type, target_id, payload)
    values (
      v_challenge.group_id,
      v_user_id,
      'challenge_completed',
      v_challenge.id,
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'challenge_title', v_challenge.title,
        'xp_awarded', v_challenge.xp_reward,
        'proof_url', p_proof_url
      )
    );

    -- Emit level_up if applicable
    if v_new_level != v_old_level then
      insert into public.activity_events
        (group_id, actor_user_id, event_type, target_id, payload)
      values (
        v_challenge.group_id,
        v_user_id,
        'level_up',
        v_completion_id,
        jsonb_build_object('from_level', v_old_level, 'to_level', v_new_level)
      );
    end if;

    -- Group flame logic (lenient rule)
    v_today := ((now()) at time zone 'UTC')::date;
    select id, current_streak, last_activity_date
      into v_group
      from public.groups
     where id = v_challenge.group_id
     for update;

    if v_group.last_activity_date is null then
      update public.groups
         set current_streak = 1, last_activity_date = v_today
       where id = v_group.id;
      insert into public.activity_events (group_id, actor_user_id, event_type)
        values (v_group.id, v_user_id, 'group_flame_lit');
    elsif v_today = v_group.last_activity_date then
      -- Same day: no flame change, no event
      null;
    elsif v_today = v_group.last_activity_date + 1 then
      update public.groups
         set current_streak = v_group.current_streak + 1,
             last_activity_date = v_today
       where id = v_group.id;
      if v_group.current_streak + 1 in (3, 7, 14, 30, 60, 100) then
        insert into public.activity_events
          (group_id, actor_user_id, event_type, payload)
        values (
          v_group.id,
          v_user_id,
          'group_flame_milestone',
          jsonb_build_object('streak_length', v_group.current_streak + 1)
        );
      end if;
    else
      -- Gap > 1 day: fresh flame, no event (cron emitted the break)
      update public.groups
         set current_streak = 1, last_activity_date = v_today
       where id = v_group.id;
    end if;
  end if;

  return jsonb_build_object(
    'idempotent', false,
    'completion_id', v_completion_id,
    'xp_awarded', v_challenge.xp_reward,
    'new_total_xp', v_new_xp,
    'new_level', v_new_level,
    'level_changed', (v_new_level != v_old_level),
    'new_streak', v_new_streak,
    'streak_changed', (v_new_streak != v_old_streak)
  );
end;
$$;
```

(The `grant execute` from Slice 1 Plan 4 still applies — `create or replace function` preserves grants.)

- [ ] **Step 2: Prepend cases 1-6 to `activity_events.test.sql`**

Replace `supabase/tests/activity_events.test.sql` with the following (full file, cases 1-6 first, then existing 7-8):

```sql
-- activity_events.test.sql
-- Cases 1-6: submit_completion v2 emits events + updates flame.
-- Cases 7-8: join trigger + cron reset.

\set ON_ERROR_STOP on
begin;

-- Provision 4 test users with distinct UUID prefixes.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-fe00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe1@local', '', now(), now()),
  ('22222222-fe00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe2@local', '', now(), now()),
  ('33333333-fe00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe3@local', '', now(), now()),
  ('44444444-fe00-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fe4@local', '', now(), now());

-- User 1 creates a group + a group challenge to use across cases.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-fe00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('Feed Crew', 'cyan'); end $$;

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Stretch 5 min', null, 'fitness', 'medium', 'honor');
end $$;

-- ============================================================================
-- Case 1: challenge_completed event fires with correct payload
-- ============================================================================
do $$
declare cid uuid;
declare aid uuid;
begin
  select id into cid from public.challenges
    where title='Stretch 5 min' and group_id=(select id from public.groups where name='Feed Crew');
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '11111111-fe00-0000-0000-000000000001')
    returning id into aid;
  perform public.submit_completion(aid, null);
end $$;

do $$
declare evt record;
begin
  select event_type, payload into evt from public.activity_events
   where event_type = 'challenge_completed'
     and group_id = (select id from public.groups where name='Feed Crew');
  if evt is null then raise exception 'FAIL case 1: no challenge_completed event'; end if;
  if (evt.payload->>'xp_awarded')::int != 50 then
    raise exception 'FAIL case 1: xp_awarded payload = %', evt.payload->>'xp_awarded';
  end if;
  if evt.payload->>'challenge_title' != 'Stretch 5 min' then
    raise exception 'FAIL case 1: challenge_title payload = %', evt.payload->>'challenge_title';
  end if;
end $$;

-- ============================================================================
-- Case 2: first completion lit the flame
-- ============================================================================
do $$
declare gid uuid;
declare streak int;
declare lit_count int;
begin
  select id, current_streak into gid, streak from public.groups where name='Feed Crew';
  if streak != 1 then raise exception 'FAIL case 2a: current_streak should be 1, got %', streak; end if;

  select count(*) into lit_count from public.activity_events
   where event_type = 'group_flame_lit' and group_id = gid;
  if lit_count != 1 then raise exception 'FAIL case 2b: 1 group_flame_lit event expected, saw %', lit_count; end if;
end $$;

-- ============================================================================
-- Case 3: same-day second completion does NOT emit flame event or change streak
-- ============================================================================
-- Create another challenge so user 1 can complete a second one today
do $$
declare gid uuid;
declare cid2 uuid;
declare aid2 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Second one', null, 'habit', 'easy', 'honor');
  select id into cid2 from public.challenges where title='Second one' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid2, '11111111-fe00-0000-0000-000000000001')
    returning id into aid2;
  perform public.submit_completion(aid2, null);
end $$;

do $$
declare streak int;
declare lit_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 1 then raise exception 'FAIL case 3a: streak should still be 1 (same day), got %', streak; end if;

  select count(*) into lit_count from public.activity_events
   where event_type = 'group_flame_lit'
     and group_id = (select id from public.groups where name='Feed Crew');
  if lit_count != 1 then raise exception 'FAIL case 3b: still 1 lit event expected, saw %', lit_count; end if;
end $$;

-- ============================================================================
-- Case 4: consecutive-day completion increments + emits no group_flame_lit
-- ============================================================================
-- Backdate last_activity_date to yesterday so today's completion is "consecutive"
update public.groups
   set last_activity_date = current_date - 1
 where name='Feed Crew';

do $$
declare gid uuid;
declare cid3 uuid;
declare aid3 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Day 2 challenge', null, 'study', 'easy', 'honor');
  select id into cid3 from public.challenges where title='Day 2 challenge' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid3, '11111111-fe00-0000-0000-000000000001')
    returning id into aid3;
  perform public.submit_completion(aid3, null);
end $$;

do $$
declare streak int;
declare lit_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 2 then raise exception 'FAIL case 4a: streak should be 2 (consecutive day), got %', streak; end if;

  select count(*) into lit_count from public.activity_events
   where event_type = 'group_flame_lit'
     and group_id = (select id from public.groups where name='Feed Crew');
  if lit_count != 1 then raise exception 'FAIL case 4b: still 1 lit event (no new one on increment), saw %', lit_count; end if;
end $$;

-- ============================================================================
-- Case 5: milestone — bump streak to 6, then complete → streak=7 → milestone event
-- ============================================================================
update public.groups
   set current_streak = 6, last_activity_date = current_date - 1
 where name='Feed Crew';

do $$
declare gid uuid;
declare cid4 uuid;
declare aid4 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  perform public.create_group_challenge(gid, 'Milestone trigger', null, 'creative', 'easy', 'honor');
  select id into cid4 from public.challenges where title='Milestone trigger' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid4, '11111111-fe00-0000-0000-000000000001')
    returning id into aid4;
  perform public.submit_completion(aid4, null);
end $$;

do $$
declare streak int;
declare ms_payload jsonb;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 7 then raise exception 'FAIL case 5a: streak should be 7, got %', streak; end if;

  select payload into ms_payload from public.activity_events
   where event_type = 'group_flame_milestone'
     and group_id = (select id from public.groups where name='Feed Crew')
   order by created_at desc limit 1;
  if ms_payload is null then raise exception 'FAIL case 5b: no group_flame_milestone event'; end if;
  if (ms_payload->>'streak_length')::int != 7 then
    raise exception 'FAIL case 5c: milestone streak_length payload = %', ms_payload->>'streak_length';
  end if;
end $$;

-- ============================================================================
-- Case 6: gap > 1 day — fresh flame, NO event from completion itself
-- ============================================================================
update public.groups
   set current_streak = 7, last_activity_date = current_date - 5
 where name='Feed Crew';

-- Snapshot lit-event count before
do $$
declare gid uuid;
declare lit_before int;
declare lit_after int;
declare streak_after int;
declare cid5 uuid;
declare aid5 uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  select count(*) into lit_before from public.activity_events
   where event_type = 'group_flame_lit' and group_id = gid;

  perform public.create_group_challenge(gid, 'After gap', null, 'fitness', 'easy', 'honor');
  select id into cid5 from public.challenges where title='After gap' and group_id=gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid5, '11111111-fe00-0000-0000-000000000001')
    returning id into aid5;
  perform public.submit_completion(aid5, null);

  select count(*) into lit_after from public.activity_events
   where event_type = 'group_flame_lit' and group_id = gid;
  select current_streak into streak_after from public.groups where id = gid;

  if streak_after != 1 then raise exception 'FAIL case 6a: streak should reset to 1 (fresh flame), got %', streak_after; end if;
  if lit_after != lit_before then
    raise exception 'FAIL case 6b: gap recovery should NOT emit group_flame_lit (cron emits the break separately)'; end if;
end $$;

-- ============================================================================
-- Case 7: join trigger — owner suppressed, member emits
-- ============================================================================
-- Reset role to service for code lookup
reset role;
select invite_code as fe_code from public.groups where name='Feed Crew' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-fe00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'fe_code');

reset role;
do $$
declare n_owner int;
declare n_member int;
begin
  -- Owner (user 1) row inserted on create_group; trigger should have suppressed
  select count(*) into n_owner from public.activity_events
   where event_type = 'joined_group'
     and actor_user_id = '11111111-fe00-0000-0000-000000000001';
  if n_owner != 0 then raise exception 'FAIL case 7a: owner-on-create should NOT emit, saw %', n_owner; end if;

  -- Member (user 2) join should have emitted
  select count(*) into n_member from public.activity_events
   where event_type = 'joined_group'
     and actor_user_id = '22222222-fe00-0000-0000-000000000002';
  if n_member != 1 then raise exception 'FAIL case 7b: member join should emit, saw %', n_member; end if;
end $$;

-- ============================================================================
-- Case 8: nightly cron resets dead flames + emits group_flame_broken
-- ============================================================================
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Feed Crew';
  update public.groups
     set current_streak = 5, last_activity_date = current_date - 3
   where id = gid;
end $$;

select public.reset_dead_group_flames();

do $$
declare streak int; broken_count int;
begin
  select current_streak into streak from public.groups where name='Feed Crew';
  if streak != 0 then raise exception 'FAIL case 8a: streak should reset to 0, got %', streak; end if;

  select count(*) into broken_count from public.activity_events
   where event_type = 'group_flame_broken'
     and group_id = (select id from public.groups where name='Feed Crew');
  if broken_count != 1 then raise exception 'FAIL case 8b: 1 group_flame_broken event, saw %', broken_count; end if;
end $$;

-- Cleanup
delete from public.challenge_completions where user_id in (
  select id from auth.users where email like 'fe%@local'
);
delete from public.challenge_accepts where user_id in (
  select id from auth.users where email like 'fe%@local'
);
delete from public.challenges where group_id in (
  select id from public.groups where name='Feed Crew'
);
delete from public.activity_events where group_id in (
  select id from public.groups where name='Feed Crew'
);
delete from public.group_members where group_id in (
  select id from public.groups where name='Feed Crew'
);
delete from public.groups where name='Feed Crew';
delete from public.users where id in (
  select id from auth.users where email like 'fe%@local'
);
delete from auth.users where email like 'fe%@local';

commit;
select 'TEST PASS: activity_events (8 cases)' as result;
```

- [ ] **Step 3: Apply migration + run test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/activity_events.test.sql 2>&1 | tail -5
```

Expected: `TEST PASS: activity_events (8 cases)`.

- [ ] **Step 4: Full regression sweep (12 SQL tests now)**

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges activity_events; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

All 12 should end with `TEST PASS: …`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): submit_completion v2 emits events + flame logic (0019) + 6 SQL test cases"
```

---

## Task 4: Migration 0020 — storage RLS widening + proof_group_visibility SQL test

**Files:**

- Create: `supabase/migrations/0020_storage_group_proof.sql`, `supabase/tests/proof_group_visibility.test.sql`

**Interfaces:**

- Produces: storage policy `proof_select_group_mates` on `storage.objects` — group-mates can read each other's `proof/<user_id>/*` files.

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0020_storage_group_proof.sql`:

```sql
-- 0020_storage_group_proof.sql
-- Widen proof bucket SELECT so group-mates can render each other's photos
-- inline in the activity feed. Coexists with proof_select_own from Slice 1
-- Plan 4 migration 0008.

create policy proof_select_group_mates on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proof'
    and exists (
      select 1
      from public.group_members me
      join public.group_members them on me.group_id = them.group_id
      where me.user_id = auth.uid()
        and them.user_id::text = (storage.foldername(name))[1]
    )
  );
```

- [ ] **Step 2: Write the SQL test**

Create `supabase/tests/proof_group_visibility.test.sql`:

```sql
-- proof_group_visibility.test.sql — 2 cases for storage RLS widening.
\set ON_ERROR_STOP on
begin;

-- Provision 3 users: A + B in the same group, C outside it.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-pv00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pv1@local', '', now(), now()),
  ('bbbbbbbb-pv00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pv2@local', '', now(), now()),
  ('cccccccc-pv00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pv3@local', '', now(), now());

-- A creates a group, B joins, C doesn't.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-pv00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('PV Group', 'gold'); end $$;

reset role;
select invite_code as pv_code from public.groups where name='PV Group' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"bbbbbbbb-pv00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'pv_code');

-- Seed a fake storage object under user B's prefix
reset role;
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values (
  'proof',
  'bbbbbbbb-pv00-0000-0000-000000000002/test-proof.jpg',
  null,
  'bbbbbbbb-pv00-0000-0000-000000000002',
  '{"size": 100}'::jsonb
);

-- Case 9: User A (same group as B) can SELECT B's proof object
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-pv00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'proof'
     and name = 'bbbbbbbb-pv00-0000-0000-000000000002/test-proof.jpg';
  if n != 1 then raise exception 'FAIL case 9: group-mate A should see B''s proof object, saw %', n; end if;
end $$;

-- Case 10: User C (not in group) CANNOT SELECT B's proof object
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"cccccccc-pv00-0000-0000-000000000003","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'proof'
     and name = 'bbbbbbbb-pv00-0000-0000-000000000002/test-proof.jpg';
  if n != 0 then raise exception 'FAIL case 10: non-group-mate C should see 0 of B''s proof, saw %', n; end if;
end $$;

reset role;

-- Cleanup
delete from storage.objects where name = 'bbbbbbbb-pv00-0000-0000-000000000002/test-proof.jpg';
delete from public.activity_events where group_id in (select id from public.groups where name='PV Group');
delete from public.group_members where group_id in (select id from public.groups where name='PV Group');
delete from public.groups where name='PV Group';
delete from public.users where id in (
  'aaaaaaaa-pv00-0000-0000-000000000001',
  'bbbbbbbb-pv00-0000-0000-000000000002',
  'cccccccc-pv00-0000-0000-000000000003'
);
delete from auth.users where id in (
  'aaaaaaaa-pv00-0000-0000-000000000001',
  'bbbbbbbb-pv00-0000-0000-000000000002',
  'cccccccc-pv00-0000-0000-000000000003'
);

commit;
select 'TEST PASS: proof_group_visibility' as result;
```

- [ ] **Step 3: Apply + run test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/proof_group_visibility.test.sql 2>&1 | tail -5
```

Expected: `TEST PASS: proof_group_visibility`.

- [ ] **Step 4: Full SQL test sweep (13 files now)**

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges activity_events proof_group_visibility; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

All 13 should end with `TEST PASS: …`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): storage proof_select_group_mates RLS (0020) + 2 SQL test cases"
```

---

## Task 5: Client foundations — types, analytics, i18n, useGroupFeed hook

**Files:**

- Modify: `src/types/database.ts`, `src/lib/analytics/events.ts`, `src/lib/i18n/locales/en.json`
- Create: `src/features/groups/api/useGroupFeed.ts`

**Interfaces:**

- Produces:
  - `ActivityEventRow` TS type (union over event_type with payload narrowing).
  - 3 new typed analytics events: `group_feed_viewed`, `group_flame_grew`, `group_flame_broke`.
  - `feed.*` and `groupFlame.*` i18n namespaces.
  - `useGroupFeed(groupId, limit=50)` returns `Query<ActivityEventWithActor[]>`.

---

- [ ] **Step 1: Extend Database type**

In `src/types/database.ts`, near the other row interfaces, add:

```ts
export type ActivityEventType =
  | 'challenge_completed'
  | 'joined_group'
  | 'level_up'
  | 'group_flame_lit'
  | 'group_flame_broken'
  | 'group_flame_milestone';

export interface ActivityEventRow {
  id: string;
  group_id: string | null;
  actor_user_id: string;
  event_type: ActivityEventType;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}
```

And add to `Database['public']['Tables']`:

```ts
activity_events: {
  Row: ActivityEventRow;
  Insert: Partial<ActivityEventRow> & Pick<ActivityEventRow, 'actor_user_id' | 'event_type'>;
  Update: Partial<ActivityEventRow>;
}
```

- [ ] **Step 2: Add analytics events**

In `src/lib/analytics/events.ts`, extend `EventPayloads`:

```ts
// Slice 2 Plan 3a
group_feed_viewed: {
  group_id: string;
  events_shown: number;
}
group_flame_grew: {
  group_id: string;
  new_streak: number;
}
group_flame_broke: {
  group_id: string;
  previous_streak: number;
}
```

- [ ] **Step 3: Add i18n keys**

In `src/lib/i18n/locales/en.json`, before the `legal` block (or wherever feels right alphabetically), add:

```json
  "feed": {
    "section": {
      "title": "ACTIVITY",
      "seeAll": "See all"
    },
    "empty": {
      "label": "No activity yet — complete a challenge to get the group going"
    },
    "screen": {
      "title": "Activity",
      "empty": "Nothing here yet"
    },
    "events": {
      "challengeCompleted": "completed {{title}}",
      "joinedGroup": "joined the group",
      "levelUp": "reached Level {{level}}",
      "flameLit": "The group flame is alive today",
      "flameMilestone": "{{streak}}-day flame! Keep it up.",
      "flameBroken": "The flame broke."
    },
    "xpBadge": "+{{xp}} XP"
  },
  "groupFlame": {
    "active": "{{streak}} day flame",
    "dormant": "Light it today"
  },
```

- [ ] **Step 4: Create useGroupFeed**

Create `src/features/groups/api/useGroupFeed.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ActivityEventRow, UserRow } from '@/types/database';

export type ActorProfile = Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type ActivityEventWithActor = ActivityEventRow & { actor: ActorProfile | null };

export function useGroupFeed(groupId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['feed', groupId, limit],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<ActivityEventWithActor[]> => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*, actor:users!actor_user_id(id, username, display_name, avatar_url)')
        .eq('group_id', groupId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityEventWithActor[];
    },
  });
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
rm -f .expo/types/router.d.ts
bun run typecheck
git add .
git commit -m "feat(feed): types + analytics + i18n + useGroupFeed hook"
```

---

## Task 6: Components — ActivityEventRow + GroupFlameChip + GroupFeedSection

**Files:**

- Create: `src/features/groups/components/ActivityEventRow.tsx`, `GroupFlameChip.tsx`, `GroupFeedSection.tsx`

**Interfaces:**

- Produces:
  - `<ActivityEventRow event={ActivityEventWithActor} />` — polymorphic by `event.event_type`.
  - `<GroupFlameChip currentStreak={number} />` — orange chip when >0, gray "Light it today" when 0.
  - `<GroupFeedSection groupId onSeeAll />` — header + first 10 rows + "See all" / empty CTA.

---

- [ ] **Step 1: ActivityEventRow**

Create `src/features/groups/components/ActivityEventRow.tsx`:

```tsx
import { Image, Text, View } from 'react-native';
import { useSignedProofUrl } from '@/features/completions/api/useSignedProofUrl';
import type { ActivityEventWithActor } from '../api/useGroupFeed';
import { t } from '@/lib/i18n';

type Props = { event: ActivityEventWithActor };

function AvatarCircle({ display }: { display: string }) {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-500/30">
      <Text className="font-display text-base text-text-primary">
        {display.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function ActivityEventRow({ event }: Props) {
  const actorName = event.actor?.username ?? '...';
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const proofUrl = typeof payload.proof_url === 'string' ? (payload.proof_url as string) : null;
  const { data: signedUrl } = useSignedProofUrl(proofUrl);

  if (event.event_type === 'challenge_completed') {
    const title = (payload.challenge_title as string) ?? 'a challenge';
    const xp = (payload.xp_awarded as number) ?? 0;
    return (
      <View className="rounded-2xl bg-bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <AvatarCircle display={actorName} />
          <View className="flex-1">
            <Text className="text-text-primary">
              <Text className="font-semibold">@{actorName}</Text>{' '}
              <Text className="text-text-muted">
                {t('feed.events.challengeCompleted', { title })}
              </Text>
            </Text>
          </View>
          <View className="rounded-full bg-xp-gain/20 px-2 py-0.5">
            <Text className="text-xs font-semibold text-xp-gain">{t('feed.xpBadge', { xp })}</Text>
          </View>
        </View>
        {signedUrl && (
          <Image
            source={{ uri: signedUrl }}
            className="mt-3 h-48 w-full rounded-2xl"
            resizeMode="cover"
          />
        )}
      </View>
    );
  }

  if (event.event_type === 'joined_group') {
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-bg-surface p-4">
        <AvatarCircle display={actorName} />
        <Text className="flex-1 text-text-primary">
          <Text className="font-semibold">@{actorName}</Text>{' '}
          <Text className="text-text-muted">{t('feed.events.joinedGroup')}</Text>
        </Text>
      </View>
    );
  }

  if (event.event_type === 'level_up') {
    const level = (payload.to_level as number) ?? 1;
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-bg-surface p-4">
        <AvatarCircle display={actorName} />
        <Text className="flex-1 text-text-primary">
          <Text className="font-semibold">@{actorName}</Text>{' '}
          <Text className="text-text-muted">{t('feed.events.levelUp', { level })}</Text>
        </Text>
        <Text className="text-2xl">⭐</Text>
      </View>
    );
  }

  if (event.event_type === 'group_flame_lit') {
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-flame-from/10 p-4">
        <Text className="text-2xl">🔥</Text>
        <Text className="flex-1 text-text-primary">{t('feed.events.flameLit')}</Text>
      </View>
    );
  }

  if (event.event_type === 'group_flame_milestone') {
    const streak = (payload.streak_length as number) ?? 0;
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-flame-from/15 p-4">
        <Text className="text-2xl">🔥</Text>
        <Text className="flex-1 font-semibold text-flame-from">
          {t('feed.events.flameMilestone', { streak })}
        </Text>
      </View>
    );
  }

  // group_flame_broken
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-bg-elevated p-4">
      <Text className="text-2xl">🪦</Text>
      <Text className="flex-1 text-text-muted">{t('feed.events.flameBroken')}</Text>
    </View>
  );
}
```

- [ ] **Step 2: GroupFlameChip**

Create `src/features/groups/components/GroupFlameChip.tsx`:

```tsx
import { Text, View } from 'react-native';
import { t } from '@/lib/i18n';

type Props = { currentStreak: number };

export function GroupFlameChip({ currentStreak }: Props) {
  if (currentStreak > 0) {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-flame-from/15 px-3 py-1">
        <Text className="text-base">🔥</Text>
        <Text className="text-sm font-semibold text-flame-from">
          {t('groupFlame.active', { streak: currentStreak })}
        </Text>
      </View>
    );
  }
  return (
    <View className="rounded-full bg-bg-elevated px-3 py-1">
      <Text className="text-sm text-text-muted">{t('groupFlame.dormant')}</Text>
    </View>
  );
}
```

- [ ] **Step 3: GroupFeedSection**

Create `src/features/groups/components/GroupFeedSection.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { ActivityEventRow } from './ActivityEventRow';
import { useGroupFeed } from '../api/useGroupFeed';
import { t } from '@/lib/i18n';

type Props = {
  groupId: string;
  onSeeAll: () => void;
};

export function GroupFeedSection({ groupId, onSeeAll }: Props) {
  const { data: events } = useGroupFeed(groupId, 10);

  if (!events) return null;

  if (events.length === 0) {
    return (
      <View className="items-center rounded-2xl bg-bg-surface px-4 py-6">
        <Text className="mb-2 text-3xl">📭</Text>
        <Text className="text-center text-sm text-text-muted">{t('feed.empty.label')}</Text>
      </View>
    );
  }

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-semibold tracking-widest text-text-muted">
          {t('feed.section.title')}
        </Text>
        <Pressable onPress={onSeeAll} className="active:opacity-60">
          <Text className="text-sm font-semibold text-primary-500">{t('feed.section.seeAll')}</Text>
        </Pressable>
      </View>
      <View className="gap-2">
        {events.map((e) => (
          <ActivityEventRow key={e.id} event={e} />
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
bun run typecheck
git add .
git commit -m "feat(feed): ActivityEventRow + GroupFlameChip + GroupFeedSection"
```

---

## Task 7: Group home integration + new feed screen

**Files:**

- Modify: `app/groups/[id]/index.tsx`, `app/groups/[id]/_layout.tsx`
- Create: `app/groups/[id]/feed.tsx`

---

- [ ] **Step 1: Wire chip + section into group home**

Edit `app/groups/[id]/index.tsx`. Add imports near the existing ones:

```tsx
import { GroupFlameChip } from '@/features/groups/components/GroupFlameChip';
import { GroupFeedSection } from '@/features/groups/components/GroupFeedSection';
```

Wrap the existing header row to include the flame chip next to the group name. Find the existing header row and replace it with:

```tsx
<View className="flex-row items-center justify-between">
  <View className="flex-1 flex-row items-center gap-3">
    <ThemeAccent theme={group.theme} size={20} />
    <Text className="font-display text-3xl text-text-primary" numberOfLines={1}>
      {group.name}
    </Text>
  </View>
  <View className="ml-2 flex-row items-center gap-2">
    <GroupFlameChip currentStreak={group.current_streak} />
    <Pressable onPress={() => router.push(`/groups/${group.id}/settings`)} className="p-2">
      <Icon.Settings {...ICON_DEFAULTS} color="#F4F4F8" />
    </Pressable>
  </View>
</View>
```

Then insert `<GroupFeedSection>` between the `<MemberAvatarRow>` block and the `<GroupChallengesSection>` block:

```tsx
<GroupFeedSection groupId={group.id} onSeeAll={() => router.push(`/groups/${group.id}/feed`)} />
```

- [ ] **Step 2: Register feed route in nested layout**

Edit `app/groups/[id]/_layout.tsx`. Add a Stack.Screen entry for the new feed route inside the existing `<Stack>`:

```tsx
<Stack.Screen name="feed" options={{ title: 'Activity' }} />
```

- [ ] **Step 3: Create the feed screen**

Create `app/groups/[id]/feed.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { ActivityEventRow } from '@/features/groups/components/ActivityEventRow';
import { useGroupFeed } from '@/features/groups/api/useGroupFeed';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import { useEffect } from 'react';
import { t } from '@/lib/i18n';

export default function GroupFeed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: events, isLoading } = useGroupFeed(id, 50);
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id && events) {
      analytics.track('group_feed_viewed', { group_id: id, events_shown: events.length });
    }
    // intentionally fire only when events array reference changes
  }, [id, events]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['feed', id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'single', id] }),
        qc.invalidateQueries({ queryKey: ['users', userId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      {!events || events.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-2 text-4xl">📭</Text>
          <Text className="text-center text-text-muted">{t('feed.screen.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
          renderItem={({ item }) => <ActivityEventRow event={item} />}
        />
      )}
    </SafeAreaView>
  );
}
```

Note on the `analytics.track` effect: `events.length` is the dependency we care about, but using the events array reference means it fires whenever the query refetches even with identical content. For Plan 3a that's acceptable — the event represents "viewer saw a feed" which can fire per visit. A `useRef` debounce is post-PMF polish.

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(feed): group home gets flame chip + feed preview + /feed screen"
```

---

## Task 8: Final sweep — typecheck, lint, test, all SQL tests, bundle, push

**Files:** none new.

---

- [ ] **Step 1: Full client sweep**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
rm -f .expo/types/router.d.ts
bun run typecheck
bun run lint
bun run test
```

Expected: all three exit 0; 7 Jest suites + 26 tests pass.

- [ ] **Step 2: Full SQL sweep (13 files)**

```bash
supabase db reset
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges activity_events proof_group_visibility; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

Expected: 13 `TEST PASS` lines.

- [ ] **Step 3: iOS bundle**

```bash
rm -rf dist
bunx expo export --platform ios --dump-sourcemap=false
rm -rf dist .expo/types/router.d.ts
```

Expected: `Exported: dist`.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Plan 3a — Acceptance

Plan 3a is complete when ALL of these are true:

- [ ] `bun run typecheck` / `lint` / `test` exit 0
- [ ] `supabase db reset` applies migrations 0001–0020 cleanly
- [ ] All 13 SQL test files end with `TEST PASS: …`
- [ ] Group home shows the flame chip next to the group name (active orange when streak > 0; gray "Light it today" when 0)
- [ ] Group home shows the Activity section above the Challenges section; empty state with "complete a challenge to get the group going" CTA when no events; up to 10 most-recent rows otherwise; "See all" link routes to `/groups/[id]/feed`
- [ ] `/groups/[id]/feed` screen renders the full last-50 events with pull-to-refresh
- [ ] Completing a group challenge → `challenge_completed` row appears in feed with proof photo (if photo proof); flame chip increments by 1; if streak hit 7, `group_flame_milestone` row appears alongside
- [ ] New member joining → `joined_group` row appears for all members within one refetch; owner-on-create does NOT emit
- [ ] Manually invoking `public.reset_dead_group_flames()` resets streak to 0 and emits `group_flame_broken` row
- [ ] Non-member of a group sees zero events when querying `activity_events` for that group (RLS verified by SQL)
- [ ] Group-mate can render another member's proof photo via `useSignedProofUrl` (storage RLS verified by SQL)
- [ ] Non-group-mate cannot read the same proof object (storage RLS verified by SQL)
- [ ] 3 new analytics events fire via typed registry
- [ ] `bunx expo export --platform ios` bundles successfully
- [ ] Committed + pushed

### Deferred items (not part of Plan 3a acceptance)

- Group leaderboard → **Plan 3b**
- Final group home layout assembly + pull-to-refresh + empty-state polish → **Plan 3c**
- Real-time feed (Supabase Realtime channel) → Slice 3
- Push notifications when group flame at risk of breaking → Slice 3
- Per-event reactions (👍, 🔥) → Slice 3 polish
- Personal-streak milestone events in feed → out of Plan 3a scope (no solo feed exists)
- Server-side analytics emission (`pg_notify` to external pipe) → out of scope
- Avatar images for actors (currently using initials fallback) → Slice 3 polish alongside avatar uploads

---

## Self-review notes (already applied while writing)

- The `submit_completion` v2 migration uses `create or replace function` to preserve the existing `grant execute` from Slice 1 Plan 4 — no re-grant needed.
- Same-day, consecutive, and gap branches each use distinct branches in the `if/elsif` chain — verified manually that the flame rule from spec §4.1 is encoded exactly: no flame change same day; +1 consecutive; reset to 1 (not 0) on gap; cron emits the break separately.
- `events.length` in the feed-screen analytics `useEffect` is the practical dependency; using `events` (the reference) is acceptable because the existing TanStack default `staleTime` of 60s prevents a refetch storm.
- The `useGroupFeed` join `actor:users!actor_user_id(...)` uses PostgREST embedded-resource syntax with explicit FK disambiguation — required because `activity_events` has TWO FKs to users via `actor_user_id` (well, technically only one, but being explicit avoids ambiguity if more relations are added later).
- Cases 7 and 8 in the SQL test depend on the user 1's owner row from the create_group at the top of the test fixture — explicitly verified the owner row is created BEFORE we check case 7's "owner suppressed" assertion.
- The cron is idempotent re-scheduled via the `do $$ ... unschedule ... end $$` block — same pattern as Slice 1 Plan 4 migration 0010.
- The `ActivityEventRow` polymorphic switch is exhaustive over the 6 event_type values; if we add new event types, TypeScript won't flag missing branches (the switch is by string comparison, not by discriminated union). Accepting that for Plan 3a; a discriminated-union refactor lands when we add `streak_milestone` or `badge_earned` in Slice 3.

**Next plan after this:** Slice 2 Plan 3b — group leaderboard. Two ranking queries (lifetime XP within group, this-week XP within group), leaderboard screen, group home preview block.
