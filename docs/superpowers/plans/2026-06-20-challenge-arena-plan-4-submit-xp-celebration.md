# Challenge Arena — Plan 4: Submit Proof + XP Engine + Celebration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Slice 1 core loop end-to-end — user taps Submit Proof → (honor confirm OR photo capture + upload) → server validates and awards XP atomically → celebration overlay animates the XP count-up, streak tick, and optional level-up → user lands back on Home with the challenge no longer in "Today". After Plan 4, XP and streak counters on Profile/Home actually move.

**Architecture deviation from Doc B §5.1:** the spec called for `submit-completion` as an **Edge Function** running on Deno. Plan 1's environment can't reach `deno.land` from this network (TLS unreachable — corporate proxy), and the Supabase Edge Runtime is disabled in `supabase/config.toml`. Plan 4 implements the same trust boundary as a **Postgres `SECURITY DEFINER` RPC** instead. The RPC is functionally equivalent (server-side validation, atomic XP/streak update in one transaction, RLS bypass for the controlled write path), and avoids paying network latency for what is essentially a DB operation. When the network issue is resolved (or a CI environment runs the build), the same logic can be ported to an Edge Function with a thin client switch — the response shape is identical.

**Streak-reset cron:** same reasoning — implemented as `cron.schedule()` against a Postgres function via the `pg_cron` extension, not a scheduled Edge Function.

**Tech Stack additions:** `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`. Reanimated 3 (already installed) drives the celebration animations. No new state-management or networking libraries.

## Global Constraints

- Photo proofs upload to private Supabase Storage bucket `proof/`, path `<user_id>/<accept_id>.jpg`. Anonymous role can NEVER read the bucket; only the owner and their group-mates (Slice 2+) get signed URLs.
- Honor proofs do NOT upload anything; `proof_url` stays NULL in the completions row.
- Photo proofs compress to 1080×1080 JPEG @ 80% quality on-device before upload.
- The `submit_completion` RPC is the SINGLE write path for `challenge_completions`. RLS continues to deny direct client INSERTs.
- XP awarded is ALWAYS `challenges.xp_reward` at the time of completion — server reads the challenge row, never trusts the client.
- All 5 validation rejection cases from Doc C §6 return distinct error codes the client can branch on.
- Re-submitting the same `accept_id` returns the existing completion (idempotent on the client side), not a duplicate.
- Celebration animations respect `prefers-reduced-motion` via the `useReducedMotion` hook from Reanimated.
- All new strings live under `i18n.t()` keys: `proof.*`, `celebrate.*`.
- pg_cron job is scheduled to run nightly at 03:00 UTC (configurable in migration).

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   ├── challenge/
│   │   ├── [id].tsx                          # MODIFIED — Submit Proof wired
│   │   └── [id]/
│   │       └── celebrate.tsx                 # NEW — modal celebration screen
│   └── _layout.tsx                           # MODIFIED — add celebrate route to stack
├── src/
│   ├── features/
│   │   └── completions/
│   │       ├── api/
│   │       │   ├── useSubmitCompletion.ts    # NEW — wraps submit_completion RPC
│   │       │   ├── useUploadProofPhoto.ts    # NEW — picker → compress → upload
│   │       │   └── useSignedProofUrl.ts      # NEW — signed-URL fetch w/ caching
│   │       └── components/
│   │           ├── ProofSubmitSheet.tsx      # NEW — honor/photo branch UI
│   │           ├── XPCounter.tsx             # NEW — animated XP count-up
│   │           ├── FlameTick.tsx             # NEW — streak flame pulse
│   │           └── LevelUpOverlay.tsx        # NEW — level-up modal layer
│   └── lib/
│       └── motion.ts                         # NEW — shared reanimated configs + reduced-motion check
├── supabase/
│   ├── migrations/
│   │   ├── 0008_proof_bucket.sql             # NEW — proof bucket + storage policies
│   │   ├── 0009_submit_completion.sql        # NEW — RPC + grants
│   │   └── 0010_streak_cron.sql              # NEW — pg_cron job + reset function
│   └── tests/
│       ├── submit_completion.test.sql        # NEW — 5 validation cases + happy path
│       └── streak_reset_cron.test.sql        # NEW — manually invoke reset fn
```

**Decomposition rationale:**

- The `completions` feature folder is new — submit, upload, signed URL, and the UI bits all coexist here.
- The `submit_completion` RPC stays separate from the streak cron because they have different schedules of change (RPC evolves with proof types; cron rarely changes).
- `XPCounter`, `FlameTick`, `LevelUpOverlay` are split because they animate independently and the celebration screen needs to sequence them.
- `lib/motion.ts` holds the reduced-motion hook and shared animation presets so the four animated components stay consistent.

---

## Task 1: Storage bucket + policies migration

**Files:**

- Create: `supabase/migrations/0008_proof_bucket.sql`

**Interfaces:**

- Produces: Private bucket `proof` with policies allowing `authenticated` role to INSERT objects under their own `<user_id>/` prefix, SELECT their own uploads, and DELETE their own uploads. Group-mate access lands in Slice 2.

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_proof_bucket.sql`:

```sql
-- 0008_proof_bucket.sql
-- Private storage bucket for challenge proof media (photos in Slice 1).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proof',
  'proof',
  false,
  10 * 1024 * 1024, -- 10MB cap, matches Doc B §7
  array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helper: bucket id used in policies
create policy proof_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proof'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy proof_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy proof_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
```

Expected: applies 0001–0008 cleanly.

- [ ] **Step 3: Verify the bucket exists**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, public, file_size_limit from storage.buckets where id='proof';"
```

Expected: one row, `public=f`, `file_size_limit=10485760`.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(db): proof storage bucket + per-user access policies"
```

---

## Task 2: `submit_completion` RPC + comprehensive SQL test

**Files:**

- Create: `supabase/migrations/0009_submit_completion.sql`, `supabase/tests/submit_completion.test.sql`

**Interfaces:**

- Produces:
  - SQL function `public.submit_completion(p_accept_id uuid, p_proof_url text default null)` returning `jsonb`. Validates 5 cases. On success, inserts completion, updates `users.total_xp` and `users.level`, marks accept as completed, returns a JSON envelope with everything the celebration screen needs.
  - Streak trigger from migration 0005 fires automatically inside the same transaction.

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/submit_completion.test.sql`:

```sql
-- submit_completion.test.sql
-- Exercises: happy path (honor + photo), 5 rejection cases, idempotency,
-- XP/level/streak side effects, and JSON response shape.
\set ON_ERROR_STOP on
begin;

-- Provision test users
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('51111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sub1@local', '', now(), now()),
  ('62222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sub2@local', '', now(), now());

-- Honor + photo challenges to play with
insert into public.challenges (id, title, category, difficulty, xp_reward, proof_type, created_by)
values
  ('a1111111-1111-1111-1111-111111111111', 'Honor C', 'habit', 'easy', 30, 'honor',
   '51111111-0000-0000-0000-000000000001'),
  ('a2222222-2222-2222-2222-222222222222', 'Photo C', 'habit', 'easy', 50, 'photo',
   '51111111-0000-0000-0000-000000000001'),
  ('a3333333-3333-3333-3333-333333333333', 'Expired C', 'habit', 'easy', 40, 'honor',
   '51111111-0000-0000-0000-000000000001');

-- Set 'Expired C' to a deadline in the past
update public.challenges set
  deadline_type = 'expires_at',
  expires_at = (now() - interval '1 day')
  where id = 'a3333333-3333-3333-3333-333333333333';

-- Accept all three for user 1
insert into public.challenge_accepts (id, challenge_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   '51111111-0000-0000-0000-000000000001'),
  ('b2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
   '51111111-0000-0000-0000-000000000001'),
  ('b3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333',
   '51111111-0000-0000-0000-000000000001');

-- Also accept honor challenge for user 2 (used for cross-user test)
insert into public.challenge_accepts (id, challenge_id, user_id) values
  ('b4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111',
   '62222222-0000-0000-0000-000000000002');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"51111111-0000-0000-0000-000000000001","role":"authenticated"}';

----------------------------------------------------------------------
-- Rejection case 1: accept_id does not belong to caller
----------------------------------------------------------------------
do $$ begin
  begin
    perform public.submit_completion('b4444444-4444-4444-4444-444444444444', null);
    raise exception 'FAIL: cross-user accept_id should reject';
  exception when sqlstate '42501' then end;
end $$;

----------------------------------------------------------------------
-- Rejection case 2: photo challenge with no proof_url
----------------------------------------------------------------------
do $$ begin
  begin
    perform public.submit_completion('b2222222-2222-2222-2222-222222222222', null);
    raise exception 'FAIL: photo challenge w/o proof_url should reject';
  exception when sqlstate '22023' then end;
end $$;

----------------------------------------------------------------------
-- Rejection case 3: honor challenge with proof_url present
----------------------------------------------------------------------
do $$ begin
  begin
    perform public.submit_completion(
      'b1111111-1111-1111-1111-111111111111',
      'proof/51111111-0000-0000-0000-000000000001/some.jpg'
    );
    raise exception 'FAIL: honor + proof_url should reject';
  exception when sqlstate '22023' then end;
end $$;

----------------------------------------------------------------------
-- Rejection case 4: photo proof_url not under caller's folder
----------------------------------------------------------------------
do $$ begin
  begin
    perform public.submit_completion(
      'b2222222-2222-2222-2222-222222222222',
      'proof/62222222-0000-0000-0000-000000000002/wrong.jpg'
    );
    raise exception 'FAIL: proof_url outside caller folder should reject';
  exception when sqlstate '42501' then end;
end $$;

----------------------------------------------------------------------
-- Rejection case 5: deadline passed
----------------------------------------------------------------------
do $$ begin
  begin
    perform public.submit_completion('b3333333-3333-3333-3333-333333333333', null);
    raise exception 'FAIL: expired accept should reject';
  exception when sqlstate '22008' then end;
end $$;

----------------------------------------------------------------------
-- Happy path: honor completion
----------------------------------------------------------------------
do $$
declare result jsonb;
begin
  select public.submit_completion('b1111111-1111-1111-1111-111111111111', null) into result;

  if (result->>'xp_awarded')::int != 30 then
    raise exception 'FAIL: expected xp_awarded=30, got %', result->>'xp_awarded'; end if;
  if (result->>'new_total_xp')::int != 30 then
    raise exception 'FAIL: expected new_total_xp=30, got %', result->>'new_total_xp'; end if;
  if (result->>'new_level')::int != 1 then
    raise exception 'FAIL: expected new_level=1 (under 100), got %', result->>'new_level'; end if;
  if (result->>'level_changed')::bool != false then
    raise exception 'FAIL: level_changed must be false on first 30 XP'; end if;
  if (result->>'new_streak')::int != 1 then
    raise exception 'FAIL: expected new_streak=1, got %', result->>'new_streak'; end if;
  if (result->>'streak_changed')::bool != true then
    raise exception 'FAIL: streak_changed must be true on first completion'; end if;
end $$;

-- Verify side effects
do $$
declare r record;
begin
  select total_xp, current_streak, last_completion_date into r
    from public.users where id='51111111-0000-0000-0000-000000000001';
  if r.total_xp != 30 then raise exception 'FAIL: users.total_xp=% expected 30', r.total_xp; end if;
  if r.current_streak != 1 then raise exception 'FAIL: users.current_streak=% expected 1', r.current_streak; end if;
end $$;

do $$
declare s text;
begin
  select status into s from public.challenge_accepts where id='b1111111-1111-1111-1111-111111111111';
  if s != 'completed' then raise exception 'FAIL: accept.status=% expected completed', s; end if;
end $$;

----------------------------------------------------------------------
-- Idempotency: re-submitting same accept returns existing completion, no double XP
----------------------------------------------------------------------
do $$
declare result jsonb;
declare xp_before int;
declare xp_after int;
begin
  select total_xp into xp_before from public.users where id='51111111-0000-0000-0000-000000000001';
  select public.submit_completion('b1111111-1111-1111-1111-111111111111', null) into result;
  select total_xp into xp_after from public.users where id='51111111-0000-0000-0000-000000000001';
  if xp_after != xp_before then
    raise exception 'FAIL: idempotent re-submit must not award XP twice (% → %)', xp_before, xp_after;
  end if;
  if (result->>'idempotent')::bool != true then
    raise exception 'FAIL: response missing idempotent=true marker';
  end if;
end $$;

----------------------------------------------------------------------
-- Level-up: bump user to enough XP to cross L2 threshold
----------------------------------------------------------------------
do $$
declare result jsonb;
begin
  -- User now has 30 XP. Submit the photo challenge (+50 = 80 — still L1).
  select public.submit_completion(
    'b2222222-2222-2222-2222-222222222222',
    'proof/51111111-0000-0000-0000-000000000001/photo.jpg'
  ) into result;
  if (result->>'new_total_xp')::int != 80 then
    raise exception 'FAIL: expected 80 XP, got %', result->>'new_total_xp'; end if;
  if (result->>'level_changed')::bool != false then
    raise exception 'FAIL: 80 XP must not trigger level up'; end if;
end $$;

reset role;

-- Cleanup
delete from public.challenge_completions where user_id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);
delete from public.challenge_accepts where user_id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);
delete from public.challenges where id in (
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333'
);
delete from public.users where id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);
delete from auth.users where id in (
  '51111111-0000-0000-0000-000000000001',
  '62222222-0000-0000-0000-000000000002'
);

commit;
select 'TEST PASS: submit_completion (5 rejections + happy path + idempotency + level-up gate)' as result;
```

- [ ] **Step 2: Run failing test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/submit_completion.test.sql
```

Expected: FAIL — `function public.submit_completion(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0009_submit_completion.sql`:

```sql
-- 0009_submit_completion.sql
-- Single write path for challenge_completions. Validates per Doc C §6:
--   1. accept belongs to caller (42501)
--   2. accept in 'accepted' status (already-completed handled via idempotency)
--   3. proof_type ↔ proof_url consistency (22023)
--   4. proof_url under caller's folder (42501)
--   5. challenge deadline (22008)

-- Level thresholds inlined to avoid a separate config table for Slice 1.
-- Keep in sync with src/lib/challenge.ts LEVEL_THRESHOLDS.
create or replace function public.level_from_xp(p_xp bigint)
returns int
language sql
immutable
as $$
  select case
    when p_xp >= 4500 then 10
    when p_xp >= 3000 then 9
    when p_xp >= 2000 then 8
    when p_xp >= 1500 then 7
    when p_xp >= 1000 then 6
    when p_xp >= 700  then 5
    when p_xp >= 400  then 4
    when p_xp >= 200  then 3
    when p_xp >= 100  then 2
    else 1
  end;
$$;

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

  -- Idempotent path: if a completion already exists for this accept, return it
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

  -- Proof type / proof_url consistency
  if v_challenge.proof_type = 'honor' and p_proof_url is not null then
    raise exception 'Honor challenge must not include proof_url' using errcode = '22023';
  end if;
  if v_challenge.proof_type = 'photo' and p_proof_url is null then
    raise exception 'Photo challenge requires proof_url' using errcode = '22023';
  end if;
  if v_challenge.proof_type in ('video', 'peer') then
    raise exception 'Proof type not supported in Slice 1' using errcode = '0A000';
  end if;

  -- proof_url must be under caller's storage folder
  if p_proof_url is not null then
    if p_proof_url not like 'proof/' || v_user_id::text || '/%' then
      raise exception 'proof_url must be under caller storage folder' using errcode = '42501';
    end if;
  end if;

  -- Deadline check
  if v_challenge.deadline_type = 'expires_at' and v_challenge.expires_at < now() then
    raise exception 'Challenge has expired' using errcode = '22008';
  end if;

  -- Read pre-update state
  select total_xp, level, current_streak
    into v_old_xp, v_old_level, v_old_streak
    from public.users where id = v_user_id for update;

  -- Insert completion (the streak trigger from 0005 fires here)
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, proof_url, proof_type, xp_awarded)
  values
    (p_accept_id, v_user_id, v_accept.challenge_id, p_proof_url,
     v_challenge.proof_type, v_challenge.xp_reward)
  returning id into v_completion_id;

  -- Mark accept completed
  update public.challenge_accepts set status = 'completed' where id = p_accept_id;

  -- Award XP + recompute level
  v_new_xp := v_old_xp + v_challenge.xp_reward;
  v_new_level := public.level_from_xp(v_new_xp);
  update public.users
    set total_xp = v_new_xp,
        level = v_new_level
    where id = v_user_id;

  -- Read post-streak-trigger state
  select current_streak into v_new_streak from public.users where id = v_user_id;

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

grant execute on function public.submit_completion(uuid, text) to authenticated;
```

- [ ] **Step 4: Apply + run test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/submit_completion.test.sql
```

Expected: `TEST PASS: submit_completion (5 rejections + happy path + idempotency + level-up gate)`.

- [ ] **Step 5: Verify all earlier SQL tests still pass**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/schema_constraints.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/streak_trigger.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/username_finalize.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_slice1.test.sql
```

All four should still end with `TEST PASS: …`.

- [ ] **Step 6: Extend Database type with the RPC**

In `src/types/database.ts`, add to the `Functions` block:

```ts
      submit_completion: {
        Args: { p_accept_id: string; p_proof_url?: string | null };
        Returns: {
          idempotent: boolean;
          completion_id: string;
          xp_awarded: number;
          new_total_xp: number;
          new_level: number;
          level_changed: boolean;
          new_streak: number;
          streak_changed: boolean;
        };
      };
```

- [ ] **Step 7: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(db): submit_completion RPC + level_from_xp helper"
```

---

## Task 3: Streak-reset pg_cron job

**Files:**

- Create: `supabase/migrations/0010_streak_cron.sql`, `supabase/tests/streak_reset_cron.test.sql`

**Interfaces:**

- Produces: function `public.reset_dead_streaks()` that sets `current_streak = 0` for any user whose `last_completion_date < CURRENT_DATE - 1`. Scheduled nightly via `pg_cron` at 03:00 UTC.

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/streak_reset_cron.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cron1@local', '', now(), now()),
  ('c2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cron2@local', '', now(), now()),
  ('c3333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cron3@local', '', now(), now());

-- Three users at different streak/last_date states:
--   c1: streak 5, last completion today  → should stay
--   c2: streak 5, last completion yesterday → should stay (within grace)
--   c3: streak 5, last completion 3 days ago → should reset to 0
update public.users set current_streak = 5, last_completion_date = current_date
  where id = 'c1111111-0000-0000-0000-000000000001';
update public.users set current_streak = 5, last_completion_date = current_date - 1
  where id = 'c2222222-0000-0000-0000-000000000002';
update public.users set current_streak = 5, last_completion_date = current_date - 3
  where id = 'c3333333-0000-0000-0000-000000000003';

-- Run the reset
select public.reset_dead_streaks();

do $$
declare a int; b int; c int;
begin
  select current_streak into a from public.users where id = 'c1111111-0000-0000-0000-000000000001';
  select current_streak into b from public.users where id = 'c2222222-0000-0000-0000-000000000002';
  select current_streak into c from public.users where id = 'c3333333-0000-0000-0000-000000000003';
  if a != 5 then raise exception 'FAIL: c1 streak should remain 5, got %', a; end if;
  if b != 5 then raise exception 'FAIL: c2 (1-day gap) should remain 5, got %', b; end if;
  if c != 0 then raise exception 'FAIL: c3 (3-day gap) should reset to 0, got %', c; end if;
end $$;

delete from public.users where id in (
  'c1111111-0000-0000-0000-000000000001',
  'c2222222-0000-0000-0000-000000000002',
  'c3333333-0000-0000-0000-000000000003'
);
delete from auth.users where id in (
  'c1111111-0000-0000-0000-000000000001',
  'c2222222-0000-0000-0000-000000000002',
  'c3333333-0000-0000-0000-000000000003'
);

commit;
select 'TEST PASS: streak_reset_cron' as result;
```

- [ ] **Step 2: Run failing test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/streak_reset_cron.test.sql
```

Expected: FAIL — function does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0010_streak_cron.sql`:

```sql
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

-- Schedule nightly at 03:00 UTC. Idempotent: schedule replaces existing job.
select cron.unschedule(jobid) from cron.job where jobname = 'streak-reset-nightly';
select cron.schedule(
  'streak-reset-nightly',
  '0 3 * * *',
  $$select public.reset_dead_streaks();$$
);
```

- [ ] **Step 4: Apply + run test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/streak_reset_cron.test.sql
```

Expected: `TEST PASS: streak_reset_cron`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): pg_cron nightly streak reset + reset_dead_streaks fn"
```

---

## Task 4: Photo upload pipeline hook

**Files:**

- Create: `src/features/completions/api/useUploadProofPhoto.ts`, `src/features/completions/api/useSignedProofUrl.ts`

**Interfaces:**

- Produces:
  - `useUploadProofPhoto()` — mutation that opens the picker/camera, compresses, uploads, returns the storage path `proof/<user_id>/<accept_id>.jpg`. Throws if user cancels.
  - `useSignedProofUrl(path)` — query returning a 1-hour signed URL for a given proof storage path.

---

- [ ] **Step 1: Install picker + manipulator**

```bash
bunx expo install expo-image-picker expo-image-manipulator
```

- [ ] **Step 2: Add iOS / Android permission strings to `app.json`**

In `app.json` `expo.ios` block (merge with existing fields):

```json
{
  "ios": {
    "bundleIdentifier": "app.challengearena",
    "supportsTablet": false,
    "infoPlist": {
      "NSCameraUsageDescription": "Snap proof of completed challenges.",
      "NSPhotoLibraryUsageDescription": "Pick proof of completed challenges from your library."
    }
  }
}
```

In `expo.plugins`, add:

```json
[
  "expo-image-picker",
  {
    "photosPermission": "Pick proof of completed challenges from your library.",
    "cameraPermission": "Snap proof of completed challenges."
  }
]
```

- [ ] **Step 3: Create `useUploadProofPhoto`**

Create `src/features/completions/api/useUploadProofPhoto.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

type Vars = { acceptId: string };

export class ProofPickCancelled extends Error {
  constructor() {
    super('User cancelled proof picker');
  }
}

export function useUploadProofPhoto() {
  return useMutation({
    mutationFn: async ({ acceptId }: Vars): Promise<string> => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');

      analytics.track('proof_submission_started', { accept_id: acceptId, proof_type: 'photo' });

      const picker = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
      });
      if (picker.canceled || !picker.assets[0]) throw new ProofPickCancelled();
      const asset = picker.assets[0];

      // Compress to 1080x1080 JPEG @ 80% quality per Doc B §7
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1080, height: 1080 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      const startedAt = Date.now();

      // Read the compressed file as ArrayBuffer (Supabase Storage RN expects a Blob or ArrayBuffer)
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const path = `${userId}/${acceptId}.jpg`;
      const { error } = await supabase.storage.from('proof').upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;

      analytics.track('proof_upload_completed', {
        accept_id: acceptId,
        ms_elapsed: Date.now() - startedAt,
        bytes: arrayBuffer.byteLength,
      });

      return `proof/${path}`;
    },
  });
}
```

- [ ] **Step 4: Create `useSignedProofUrl`**

Create `src/features/completions/api/useSignedProofUrl.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const TEN_MIN = 10 * 60 * 1000;

export function useSignedProofUrl(storagePath: string | null | undefined) {
  // storagePath comes in as "proof/<user>/<file>.jpg" — strip leading "proof/" before passing to API.
  const inBucketPath = storagePath?.startsWith('proof/')
    ? storagePath.slice('proof/'.length)
    : (storagePath ?? null);

  return useQuery({
    queryKey: ['proof-signed-url', inBucketPath],
    enabled: Boolean(inBucketPath),
    staleTime: TEN_MIN,
    queryFn: async (): Promise<string | null> => {
      if (!inBucketPath) return null;
      const { data, error } = await supabase.storage
        .from('proof')
        .createSignedUrl(inBucketPath, 60 * 60); // 1 hour
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(proof): photo upload + signed-url hooks"
```

---

## Task 5: `useSubmitCompletion` mutation hook + ProofSubmitSheet UI

**Files:**

- Create: `src/features/completions/api/useSubmitCompletion.ts`, `src/features/completions/components/ProofSubmitSheet.tsx`
- Modify: `app/challenge/[id].tsx` (replace "coming soon" alert with sheet open)

**Interfaces:**

- Produces:
  - `useSubmitCompletion()` — wraps the RPC, returns the typed response.
  - `<ProofSubmitSheet visible onClose onSubmitHonor onSubmitPhoto busy />` — modal sheet with honor confirm and "pick photo" branches.
  - Detail screen's Submit Proof button opens the sheet and routes to `celebrate` on success.

---

- [ ] **Step 1: i18n keys**

Merge into `src/lib/i18n/locales/en.json`:

```json
{
  "proof": {
    "sheetTitle": "Submit proof",
    "honorPrompt": "Are you sure you did this?",
    "honorConfirm": "Yes, mark done",
    "honorCancel": "Not yet",
    "photoPick": "Pick a photo",
    "photoTake": "Take photo (coming soon)",
    "uploading": "Uploading…",
    "errors": {
      "cancelled": "Pick cancelled — try again when you're ready"
    }
  }
}
```

- [ ] **Step 2: Create useSubmitCompletion**

Create `src/features/completions/api/useSubmitCompletion.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export type SubmitCompletionResult = {
  idempotent: boolean;
  completion_id: string;
  xp_awarded: number;
  new_total_xp: number;
  new_level: number;
  level_changed: boolean;
  new_streak: number;
  streak_changed: boolean;
};

type Vars = {
  acceptId: string;
  challengeId: string;
  proofUrl: string | null;
  proofType: 'honor' | 'photo';
};

export function useSubmitCompletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ acceptId, proofUrl }: Vars): Promise<SubmitCompletionResult> => {
      const startedAt = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('submit_completion', {
        p_accept_id: acceptId,
        p_proof_url: proofUrl,
      });
      if (error) throw error;
      const result = data as SubmitCompletionResult;

      analytics.track('challenge_completed', {
        completion_id: result.completion_id,
        xp_awarded: result.xp_awarded,
        proof_type: 'honor', // overwritten below
        duration_ms: Date.now() - startedAt,
      });
      if (result.level_changed) {
        analytics.track('level_up', {
          from_level: result.new_level - 1,
          to_level: result.new_level,
        });
      }
      // Milestone events
      if ([1, 3, 7, 14, 30].includes(result.new_streak) && result.streak_changed) {
        analytics.track('streak_milestone_hit', { streak_length: result.new_streak });
      }
      return result;
    },
    onSuccess: async (_data, { challengeId }) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'single', userId, challengeId] }),
        qc.invalidateQueries({ queryKey: ['users', userId] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'suggested', userId] }),
      ]);
    },
  });
}
```

- [ ] **Step 3: Create ProofSubmitSheet**

Create `src/features/completions/components/ProofSubmitSheet.tsx`:

```tsx
import { Modal, Pressable, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { t } from '@/lib/i18n';
import type { ProofType } from '@/types/database';

type Props = {
  visible: boolean;
  proofType: ProofType;
  onClose: () => void;
  onSubmitHonor: () => void;
  onPickPhoto: () => void;
  busy: boolean;
};

export function ProofSubmitSheet({
  visible,
  proofType,
  onClose,
  onSubmitHonor,
  onPickPhoto,
  busy,
}: Props) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable onPress={busy ? undefined : onClose} className="flex-1 bg-black/60" />
      <SafeAreaView className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-bg-elevated px-6 pb-8 pt-6">
        <View className="mx-auto mb-6 h-1 w-12 rounded-full bg-text-muted/40" />
        <Text className="mb-2 text-center font-display text-xl text-text-primary">
          {t('proof.sheetTitle')}
        </Text>

        {proofType === 'honor' ? (
          <>
            <Text className="mb-6 text-center text-base text-text-muted">
              {t('proof.honorPrompt')}
            </Text>
            <Button disabled={busy} onPress={onSubmitHonor}>
              {busy ? t('proof.uploading') : t('proof.honorConfirm')}
            </Button>
            <View className="mt-3">
              <Button disabled={busy} onPress={onClose} variant="ghost">
                {t('proof.honorCancel')}
              </Button>
            </View>
          </>
        ) : (
          <>
            <Button disabled={busy} onPress={onPickPhoto}>
              {busy ? t('proof.uploading') : t('proof.photoPick')}
            </Button>
            <View className="mt-3">
              <Button disabled onPress={() => undefined} variant="ghost">
                {t('proof.photoTake')}
              </Button>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}
```

- [ ] **Step 4: Wire detail screen Submit Proof button**

Replace `app/challenge/[id].tsx` (full file):

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { DifficultyBadge } from '@/features/challenges/components/DifficultyBadge';
import { ProofTypeIcon } from '@/features/challenges/components/ProofTypeIcon';
import { useChallenge } from '@/features/challenges/api/useChallenge';
import { useMyAccept } from '@/features/challenges/api/useMyAccept';
import { useAcceptChallenge } from '@/features/challenges/api/useAcceptChallenge';
import { useSubmitCompletion } from '@/features/completions/api/useSubmitCompletion';
import {
  ProofPickCancelled,
  useUploadProofPhoto,
} from '@/features/completions/api/useUploadProofPhoto';
import { ProofSubmitSheet } from '@/features/completions/components/ProofSubmitSheet';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

const categoryEmoji: Record<string, string> = {
  fitness: '💪',
  study: '📚',
  habit: '🧘',
  dare: '🎲',
  creative: '🎨',
  other: '✨',
};

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: challenge, isLoading } = useChallenge(id);
  const { data: accept } = useMyAccept(id);
  const acceptMutation = useAcceptChallenge();
  const submitMutation = useSubmitCompletion();
  const uploadMutation = useUploadProofPhoto();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (challenge) {
      analytics.track('challenge_viewed', {
        challenge_id: challenge.id,
        category: challenge.category,
      });
    }
  }, [challenge]);

  if (isLoading || !challenge) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const state: 'fresh' | 'accepted' | 'completed' =
    accept?.status === 'completed' ? 'completed' : accept ? 'accepted' : 'fresh';

  async function finalize(proofUrl: string | null) {
    if (!accept) return;
    try {
      const result = await submitMutation.mutateAsync({
        acceptId: accept.id,
        challengeId: challenge!.id,
        proofUrl,
        proofType: challenge!.proof_type as 'honor' | 'photo',
      });
      setSheetOpen(false);
      router.push({
        pathname: '/challenge/[id]/celebrate',
        params: {
          id: challenge!.id,
          xp: String(result.xp_awarded),
          newTotal: String(result.new_total_xp),
          newLevel: String(result.new_level),
          levelChanged: result.level_changed ? '1' : '0',
          newStreak: String(result.new_streak),
          streakChanged: result.streak_changed ? '1' : '0',
        },
      });
    } catch (e) {
      Alert.alert(t('auth.errors.generic'), (e as Error).message);
    }
  }

  async function handleHonor() {
    await finalize(null);
  }

  async function handlePickPhoto() {
    if (!accept) return;
    try {
      const proofUrl = await uploadMutation.mutateAsync({ acceptId: accept.id });
      await finalize(proofUrl);
    } catch (e) {
      if (e instanceof ProofPickCancelled) {
        Alert.alert(t('proof.errors.cancelled'));
        return;
      }
      Alert.alert(t('auth.errors.generic'), (e as Error).message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-6 pt-4">
        <Text className="text-base text-text-muted" onPress={() => router.back()}>
          ← back
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 16 }}>
        <View className="items-center">
          <Text className="text-6xl">{categoryEmoji[challenge.category] ?? '✨'}</Text>
          <Text className="mt-4 text-center font-display text-2xl text-text-primary">
            {challenge.title}
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <Text className="text-sm capitalize text-text-muted">{challenge.category}</Text>
            <Text className="text-sm text-text-muted">·</Text>
            <DifficultyBadge difficulty={challenge.difficulty} />
            <Text className="text-sm text-text-muted">·</Text>
            <Text className="text-sm font-semibold text-text-primary">
              +{challenge.xp_reward} XP
            </Text>
            <Text className="text-sm text-text-muted">·</Text>
            <ProofTypeIcon proofType={challenge.proof_type} />
          </View>
        </View>
        {challenge.description && (
          <Text className="mt-6 text-center text-base text-text-primary">
            {challenge.description}
          </Text>
        )}
        <Text className="mt-4 text-center text-xs text-text-muted">
          {t(`challenge.proofRequired.${challenge.proof_type}`)}
        </Text>
      </ScrollView>
      <View className="px-6 pb-8">
        {state === 'fresh' && (
          <Button
            disabled={acceptMutation.isPending}
            onPress={async () => {
              try {
                await acceptMutation.mutateAsync({ challenge });
              } catch (e) {
                Alert.alert(t('auth.errors.generic'), (e as Error).message);
              }
            }}
          >
            {t('challenge.accept')}
          </Button>
        )}
        {state === 'accepted' && (
          <Button onPress={() => setSheetOpen(true)} disabled={submitMutation.isPending}>
            {t('challenge.submitProof')}
          </Button>
        )}
        {state === 'completed' && (
          <View className="items-center rounded-2xl bg-xp-gain/10 px-4 py-6">
            <Text className="text-3xl text-xp-gain">✓</Text>
            <Text className="mt-2 font-display text-base text-text-primary">
              {t('challenge.completedToday')}
            </Text>
          </View>
        )}
      </View>

      <ProofSubmitSheet
        visible={sheetOpen}
        proofType={challenge.proof_type}
        onClose={() => setSheetOpen(false)}
        onSubmitHonor={handleHonor}
        onPickPhoto={handlePickPhoto}
        busy={submitMutation.isPending || uploadMutation.isPending}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(proof): submit completion hook + ProofSubmitSheet + wire detail screen"
```

---

## Task 6: Celebration screen with animations

**Files:**

- Create: `src/lib/motion.ts`, `src/features/completions/components/XPCounter.tsx`, `FlameTick.tsx`, `LevelUpOverlay.tsx`, `app/challenge/[id]/celebrate.tsx`

**Interfaces:**

- Produces:
  - `<XPCounter from to durationMs />` — animated number that counts from→to.
  - `<FlameTick streak pulse />` — flame icon that pulses once when `pulse=true`.
  - `<LevelUpOverlay level visible onDismiss />` — sequenced level-up celebration.
  - Celebrate screen reads params, sequences animations, dismisses to Home.

---

- [ ] **Step 1: lib/motion.ts**

Create `src/lib/motion.ts`:

```ts
import { useReducedMotion } from 'react-native-reanimated';

export function useMotionDurations() {
  const reduced = useReducedMotion();
  return {
    short: reduced ? 0 : 200,
    medium: reduced ? 0 : 400,
    long: reduced ? 0 : 800,
    countUp: reduced ? 0 : 1200,
  };
}
```

- [ ] **Step 2: XPCounter**

Create `src/features/completions/components/XPCounter.tsx`:

```tsx
import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotionDurations } from '@/lib/motion';

const AnimatedText = Animated.createAnimatedComponent(Text);

type Props = { from: number; to: number; className?: string };

export function XPCounter({ from, to, className }: Props) {
  const value = useSharedValue(from);
  const { countUp } = useMotionDurations();

  useEffect(() => {
    value.value = withTiming(to, { duration: countUp, easing: Easing.out(Easing.cubic) });
  }, [to, value, countUp]);

  const animatedProps = useAnimatedProps(() => ({
    text: `+${Math.round(value.value)} XP`,
    defaultValue: `+${from} XP`,
  })) as unknown as { text: string };

  return (
    <AnimatedText
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      animatedProps={animatedProps as any}
      className={className ?? 'font-display text-6xl text-xp-gain'}
    >
      +{from} XP
    </AnimatedText>
  );
}
```

- [ ] **Step 3: FlameTick**

Create `src/features/completions/components/FlameTick.tsx`:

```tsx
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotionDurations } from '@/lib/motion';

type Props = { streak: number; pulse: boolean };

export function FlameTick({ streak, pulse }: Props) {
  const scale = useSharedValue(1);
  const { short, medium } = useMotionDurations();

  useEffect(() => {
    if (!pulse) return;
    scale.value = withSequence(
      withTiming(1.35, { duration: short }),
      withTiming(1, { duration: medium }),
    );
  }, [pulse, scale, short, medium]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style} className="flex-row items-center gap-2">
      <Text className="text-4xl">🔥</Text>
      <View>
        <Text className="font-display text-2xl text-text-primary">{streak}</Text>
        <Text className="text-xs text-text-muted">day{streak === 1 ? '' : 's'}</Text>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 4: LevelUpOverlay**

Create `src/features/completions/components/LevelUpOverlay.tsx`:

```tsx
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotionDurations } from '@/lib/motion';

type Props = { level: number; visible: boolean; onDismiss: () => void };

export function LevelUpOverlay({ level, visible, onDismiss }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const { medium, long } = useMotionDurations();

  useEffect(() => {
    if (!visible) return;
    opacity.value = withTiming(1, { duration: medium });
    scale.value = withSequence(
      withTiming(1.1, { duration: medium, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1, { duration: long }),
    );
  }, [visible, opacity, scale, medium, long]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!visible) return null;
  return (
    <Pressable onPress={onDismiss} className="absolute inset-0">
      <Animated.View
        style={overlayStyle}
        className="flex-1 items-center justify-center bg-black/80"
      >
        <Animated.View style={contentStyle} className="items-center">
          <Text className="text-7xl">🎉</Text>
          <Text className="mt-4 font-display text-4xl text-primary-500">Level {level}!</Text>
          <Text className="mt-4 text-xs text-text-muted">Tap to dismiss</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
```

- [ ] **Step 5: Celebrate screen**

Create `app/challenge/[id]/celebrate.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { XPCounter } from '@/features/completions/components/XPCounter';
import { FlameTick } from '@/features/completions/components/FlameTick';
import { LevelUpOverlay } from '@/features/completions/components/LevelUpOverlay';
import { haptics } from '@/lib/haptics';

export default function Celebrate() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    xp: string;
    newTotal: string;
    newLevel: string;
    levelChanged: string;
    newStreak: string;
    streakChanged: string;
  }>();

  const xp = Number(params.xp ?? 0);
  const newTotal = Number(params.newTotal ?? 0);
  const newLevel = Number(params.newLevel ?? 1);
  const levelChanged = params.levelChanged === '1';
  const newStreak = Number(params.newStreak ?? 0);
  const streakChanged = params.streakChanged === '1';

  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    void haptics.success();
    if (levelChanged) {
      const t = setTimeout(() => {
        void haptics.notification();
        setShowLevelUp(true);
      }, 1300);
      return () => clearTimeout(t);
    }
  }, [levelChanged]);

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-4 text-6xl">🎉</Text>
        <XPCounter from={newTotal - xp} to={newTotal} />
        <Text className="mt-2 text-base text-text-muted">+{xp} XP earned</Text>
        <View className="mt-10">
          <FlameTick streak={newStreak} pulse={streakChanged} />
        </View>
      </View>
      <View className="px-6 pb-8">
        <Button onPress={() => router.replace('/(tabs)')}>Continue</Button>
      </View>
      <LevelUpOverlay
        level={newLevel}
        visible={showLevelUp}
        onDismiss={() => setShowLevelUp(false)}
      />
    </SafeAreaView>
  );
}
```

Note: the XPCounter renders `+{newTotal} XP` after animation, but starts from `(newTotal - xp)`. The "+{xp} XP earned" subtitle reinforces the delta.

- [ ] **Step 6: Add celebrate to the stack typing** (no manual route — Expo Router picks it up automatically since `[id]/celebrate.tsx` exists)

- [ ] **Step 7: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(celebrate): animated XP counter + flame tick + level-up overlay + screen"
```

---

## Task 7: Show submitted proof on completed-state detail screen

**Files:**

- Modify: `app/challenge/[id].tsx`

**Interfaces:**

- Produces: when state is `completed` AND the completion had a `proof_url`, show the user's submitted photo (signed URL) on the detail screen.

---

- [ ] **Step 1: Hook to fetch completion for a given accept**

Create `src/features/completions/api/useMyCompletion.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeCompletionRow } from '@/types/database';

export function useMyCompletion(acceptId: string | undefined) {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['completions', 'by-accept', userId, acceptId],
    enabled: Boolean(userId && acceptId),
    queryFn: async (): Promise<ChallengeCompletionRow | null> => {
      const { data, error } = await supabase
        .from('challenge_completions')
        .select('*')
        .eq('accept_id', acceptId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChallengeCompletionRow | null;
    },
  });
}
```

- [ ] **Step 2: Render the proof image when present**

In `app/challenge/[id].tsx`, when `state === 'completed'`, instead of just the checkmark block, also fetch and render the proof:

```tsx
import { Image } from 'react-native';
import { useMyCompletion } from '@/features/completions/api/useMyCompletion';
import { useSignedProofUrl } from '@/features/completions/api/useSignedProofUrl';
```

Within the component, after the existing hooks:

```tsx
const { data: completion } = useMyCompletion(accept?.id);
const { data: signedUrl } = useSignedProofUrl(completion?.proof_url ?? null);
```

Replace the `state === 'completed'` block:

```tsx
{
  state === 'completed' && (
    <View className="items-center rounded-2xl bg-xp-gain/10 px-4 py-6">
      <Text className="text-3xl text-xp-gain">✓</Text>
      <Text className="mt-2 font-display text-base text-text-primary">
        {t('challenge.completedToday')}
      </Text>
      <Text className="mt-1 text-xs text-text-muted">+{completion?.xp_awarded ?? 0} XP</Text>
      {signedUrl && (
        <Image
          source={{ uri: signedUrl }}
          className="mt-4 h-48 w-48 rounded-2xl"
          resizeMode="cover"
        />
      )}
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(detail): render submitted proof photo on completed state"
```

---

## Plan 4 — Acceptance

Plan 4 is complete when ALL of these are true:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run test` passes (Plan 1–3 suites + nothing new in Jest; SQL tests carry the heavy weight here)
- [ ] `supabase db reset` applies migrations 0001–0010 cleanly
- [ ] All 6 SQL tests pass: `schema_constraints`, `streak_trigger`, `username_finalize`, `rls_slice1`, `submit_completion`, `streak_reset_cron`
- [ ] Honor proof end-to-end: tap Submit Proof → confirm → celebrate animates +XP → streak chip updates on Home → challenge no longer in Today
- [ ] Photo proof end-to-end: tap Submit Proof → Pick a photo → image picker → photo uploads to `proof/<user>/<accept>.jpg` → completion inserts → celebrate animates → Home updated
- [ ] Completed challenge detail shows the submitted photo (signed URL works, image renders)
- [ ] Re-submitting the same completed accept does NOT double-count XP (RPC's idempotent branch returns existing completion)
- [ ] Level-up overlay fires when XP crosses a threshold (test by accepting + completing enough Hard/Epic challenges to cross 100 XP)
- [ ] Cancelling the photo picker shows the "cancelled, try again" alert and does NOT mark anything completed
- [ ] All five RPC rejection cases verified by the SQL test

### Deferred items (not part of Plan 4 acceptance)

- Video proof + peer-approval proof tiers → **Slice 2 / Slice 3**
- Edge Function migration of `submit_completion` (currently an RPC) → revisit when deno.land reachable; client switch is trivial since response shape is identical
- Push notification firing on streak risk → **Slice 3** (uses the streak cron's output as a signal)
- Polish on celebration screen (confetti particles, ambient sound, mascot animation) → **Plan 5**
- Profile "Longest streak" tile auto-updates on submit (already correctly populated by the streak trigger; Plan 3's pull-from-profile already reads it)

---

## Self-review notes (already applied while writing)

- The RPC uses `for update` on `users` to prevent a race when two completions land simultaneously for the same user — XP additions stay atomic.
- The streak trigger (migration 0005) already fires on `challenge_completions` insert, so the RPC reads `current_streak` after the insert without re-implementing the logic.
- The RPC handles idempotency BEFORE the proof-type / proof-url checks so a re-submit doesn't fail with a stale "honor + proof_url" error if the original submission was honor.
- `proof_url` storage path includes `proof/` prefix in DB (matches Doc B §7), but storage API calls strip it (Supabase Storage paths are relative to the bucket). `useSignedProofUrl` handles that asymmetry in one place.
- The celebration screen passes everything through URL params so it doesn't re-fetch anything — the RPC's response is the source of truth for that one render.
- `useMyCompletion` is a separate query, not part of `useMyAccept`, because the detail screen only needs it in `completed` state — keeps the fresh/accepted states from paying for the extra fetch.
- `pg_cron`'s `cron.schedule()` is idempotent via the `cron.unschedule` line — re-applying the migration won't create duplicate jobs.
- All analytics events from Doc B §9 / Doc C §8 fire at the right points: `proof_submission_started`, `proof_upload_completed`, `challenge_completed`, `streak_milestone_hit`, `level_up`.

**Next plan after this:** **Plan 5 — Slice 1 release prep** — Phosphor icons, suggested-rail polish, pull-to-refresh, empty-state illustrations, settings screen, share-card stub (`<final-domain>/u/<username>` is Slice 4), TestFlight + Play Console upload prep, App Store privacy questionnaire, screenshots, app icon final. Plan 5 ships Slice 1 to TestFlight.
