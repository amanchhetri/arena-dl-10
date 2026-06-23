# Challenge Arena — Slice 2 Plan 2: Custom Group Challenges Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any group member can author challenges visible only to their group, with tier-locked XP (no gaming), creator-or-owner edit/delete, soft-delete, and a per-group catalog screen reachable from the group home.

**Architecture:** Zero new tables — group challenges are existing `challenges` rows with `group_id IS NOT NULL`. One CHECK constraint enforces creator/group consistency. Three `SECURITY DEFINER` RPCs handle create/update/delete (XP server-computed from difficulty tier). The Slice 1 `challenges_select_presets` RLS policy is replaced with a broader one that also surfaces members' group challenges. Client gets 4 new TanStack hooks, 2 new components, 3 new screens. Existing `ChallengeCard`, `useChallenge`, `useAcceptChallenge` are reused without modification — they're already source-agnostic.

**Tech Stack:** Postgres (Supabase) + RLS + SQL RPCs; React Native + Expo Router; TanStack Query v5; Phosphor icons (existing); NativeWind. No new external dependencies.

## Global Constraints

- Tier → XP map: `Easy=30, Medium=50, Hard=70, Epic=120` (single value per tier, server-computed).
- Client cannot supply XP. Any client-provided `xp_reward` is ignored.
- Custom challenges always have `created_by IS NOT NULL` AND `group_id IS NOT NULL` (enforced by `challenges_creator_consistency` CHECK).
- Proof tiers allowed in Plan 2: `'honor'` and `'photo'` only. `'video'` and `'peer'` reject with `0A000` (feature_not_supported).
- Edit/delete authorization: caller must be the row's `created_by` OR have `group_members.role='owner'` for the group.
- Soft delete only: `UPDATE challenges SET is_active = false`. No DELETE.
- All RPCs `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`.
- All Supabase reads/writes wrapped in TanStack hooks under `src/features/groups/api/`.
- All user-facing strings via `i18n.t()` under `groupChallenges.*`.
- `useMyAccepts` MUST defensively `.filter(a => a.challenge != null)` to handle accept rows whose challenge was soft-deleted (RLS returns null for the join).

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   └── groups/
│       └── [id]/
│           ├── catalog.tsx                      # NEW — group challenge catalog
│           ├── create-challenge.tsx             # NEW — author form
│           ├── edit-challenge/
│           │   └── [challengeId].tsx            # NEW — edit form + delete button
│           └── index.tsx                        # MODIFIED — inject GroupChallengesSection
├── src/
│   ├── features/
│   │   ├── groups/
│   │   │   ├── api/
│   │   │   │   ├── useGroupChallenges.ts        # NEW
│   │   │   │   ├── useCreateGroupChallenge.ts   # NEW
│   │   │   │   ├── useUpdateGroupChallenge.ts   # NEW
│   │   │   │   └── useDeleteGroupChallenge.ts   # NEW
│   │   │   └── components/
│   │   │       ├── GroupChallengesSection.tsx   # NEW
│   │   │       └── DifficultyPicker.tsx         # NEW
│   │   └── challenges/
│   │       └── api/
│   │           └── useMyAccepts.ts              # MODIFIED — defensive null filter
│   ├── lib/
│   │   ├── analytics/
│   │   │   └── events.ts                        # MODIFIED — 3 new typed events
│   │   └── i18n/locales/en.json                 # MODIFIED — groupChallenges.* keys
│   └── types/
│       └── database.ts                          # MODIFIED — 3 new RPC signatures
├── supabase/
│   ├── migrations/
│   │   ├── 0015_challenges_consistency.sql      # NEW — CHECK constraint
│   │   └── 0016_group_challenges_rpcs.sql       # NEW — 3 RPCs + RLS swap
│   └── tests/
│       └── group_challenges.test.sql            # NEW — 10 cases
└── docs/superpowers/
    └── plans/
        └── 2026-06-23-challenge-arena-slice-2-plan-2-implementation.md  # this file
```

**Decomposition rationale:**

- Schema constraint stays in its own micro-migration (0015) — small, isolated, easy to roll back independently.
- RPCs + RLS swap land together in 0016 because the policy widening is what makes the RPC outputs visible to clients; coupling them prevents a window where group challenges exist in DB but RLS hides them.
- One SQL test file because all 10 cases share the same setup (groups + members + challenges) and run in one transaction.
- Edit screen lives at `edit-challenge/[challengeId]` (nested route, not a query param) so back-navigation lands on the catalog rather than the create screen.

---

## Task 1: Migration 0015 — `challenges_creator_consistency` CHECK constraint

**Files:**

- Create: `supabase/migrations/0015_challenges_consistency.sql`

**Interfaces:**

- Produces: every `challenges` INSERT/UPDATE must satisfy `(created_by IS NULL AND group_id IS NULL) OR (created_by IS NOT NULL AND group_id IS NOT NULL)`.

---

- [ ] **Step 1: Write the constraint migration**

Create `supabase/migrations/0015_challenges_consistency.sql`:

```sql
-- 0015_challenges_consistency.sql
-- Preset challenges (created_by NULL, group_id NULL) and custom group
-- challenges (created_by NOT NULL, group_id NOT NULL) are the only two
-- valid shapes. Lock that in at the DB level.

alter table public.challenges
  add constraint challenges_creator_consistency check (
    (created_by is null and group_id is null) or
    (created_by is not null and group_id is not null)
  );
```

- [ ] **Step 2: Apply migration**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
supabase db reset
```

Expected: applies 0001–0015 cleanly. Existing 30 preset challenges satisfy the constraint (all have `created_by IS NULL AND group_id IS NULL`).

- [ ] **Step 3: Verify all earlier SQL tests still pass**

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

All ten should end with `TEST PASS: ...`.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(db): challenges_creator_consistency check (preset vs group) — 0015"
```

---

## Task 2: Migration 0016 — 3 RPCs + RLS policy swap + comprehensive SQL test

**Files:**

- Create: `supabase/migrations/0016_group_challenges_rpcs.sql`, `supabase/tests/group_challenges.test.sql`
- Modify: `src/types/database.ts` (add 3 RPC signatures)

**Interfaces:**

- Produces:
  - `create_group_challenge(p_group_id uuid, p_title text, p_description text, p_category text, p_difficulty text, p_proof_type text) → jsonb { challenge_id }`.
  - `update_group_challenge(p_challenge_id uuid, p_title text default null, p_description text default null, p_difficulty text default null, p_proof_type text default null) → void`.
  - `delete_group_challenge(p_challenge_id uuid) → void` (soft delete via `is_active = false`).
  - RLS policy `challenges_select_presets_or_group` (replaces `challenges_select_presets`): presets visible to all authenticated, group challenges visible to members, both require `is_active = true`.

---

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/tests/group_challenges.test.sql`:

```sql
-- group_challenges.test.sql — covers all 10 cases from spec §9.
\set ON_ERROR_STOP on
begin;

-- Provision 4 distinct-UUID-prefix test users (avoid auth-trigger username collisions).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-cccc-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc1@local', '', now(), now()),
  ('22222222-cccc-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc2@local', '', now(), now()),
  ('33333333-cccc-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc3@local', '', now(), now()),
  ('44444444-cccc-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc4@local', '', now(), now());

-- User 1 creates a group; user 2 + user 3 join. User 4 stays out.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';
do $$
declare r jsonb;
begin
  select public.create_group('GC Crew', 'cyan') into r;
end $$;

reset role;
select invite_code as gc_code from public.groups where name='GC Crew' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'gc_code');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-cccc-0000-0000-000000000003","role":"authenticated"}';
select public.join_group(:'gc_code');

-- Case 1: Creator path — user 2 (member) creates a Medium honor challenge
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';

do $$
declare gid uuid;
declare result jsonb;
declare cid uuid;
declare r record;
begin
  select id into gid from public.groups where name='GC Crew';
  select public.create_group_challenge(gid, 'Read for 30 min', 'Anything long-form', 'study', 'medium', 'honor') into result;
  cid := (result->>'challenge_id')::uuid;
  select * into r from public.challenges where id = cid;
  if r.xp_reward != 50 then raise exception 'FAIL: medium → 50 XP, got %', r.xp_reward; end if;
  if r.group_id != gid then raise exception 'FAIL: group_id not set'; end if;
  if r.created_by != '22222222-cccc-0000-0000-000000000002' then raise exception 'FAIL: created_by'; end if;
  if r.is_active != true then raise exception 'FAIL: should be active'; end if;
end $$;

-- Case 2: Tier → XP mapping
do $$
declare gid uuid;
declare r jsonb;
declare cid uuid;
declare xp int;
begin
  select id into gid from public.groups where name='GC Crew';

  select public.create_group_challenge(gid, 'Easy thing',   null, 'habit', 'easy',   'honor') into r;
  select xp_reward into xp from public.challenges where id = (r->>'challenge_id')::uuid;
  if xp != 30 then raise exception 'FAIL: easy → 30, got %', xp; end if;

  select public.create_group_challenge(gid, 'Hard thing',   null, 'fitness', 'hard',  'honor') into r;
  select xp_reward into xp from public.challenges where id = (r->>'challenge_id')::uuid;
  if xp != 70 then raise exception 'FAIL: hard → 70, got %', xp; end if;

  select public.create_group_challenge(gid, 'Epic thing',   null, 'dare', 'epic',   'photo') into r;
  select xp_reward into xp from public.challenges where id = (r->>'challenge_id')::uuid;
  if xp != 120 then raise exception 'FAIL: epic → 120, got %', xp; end if;
end $$;

-- Case 3: Non-member can't create
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-cccc-0000-0000-000000000004","role":"authenticated"}';

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='GC Crew';
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'easy', 'honor');
    raise exception 'FAIL: non-member create should reject';
  exception when sqlstate '42501' then end;
end $$;

-- Case 4: Bad inputs reject
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';

do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='GC Crew';
  -- empty title
  begin
    perform public.create_group_challenge(gid, '', null, 'habit', 'easy', 'honor');
    raise exception 'FAIL: empty title should reject';
  exception when sqlstate '22023' then end;
  -- bad category
  begin
    perform public.create_group_challenge(gid, 'X', null, 'mystery', 'easy', 'honor');
    raise exception 'FAIL: bad category should reject';
  exception when sqlstate '22023' then end;
  -- bad difficulty
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'ultra', 'honor');
    raise exception 'FAIL: bad difficulty should reject';
  exception when sqlstate '22023' then end;
  -- video proof not allowed in Plan 2
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'easy', 'video');
    raise exception 'FAIL: video proof should reject';
  exception when sqlstate '0A000' then end;
  -- peer proof not allowed
  begin
    perform public.create_group_challenge(gid, 'X', null, 'habit', 'easy', 'peer');
    raise exception 'FAIL: peer proof should reject';
  exception when sqlstate '0A000' then end;
end $$;

-- Case 5: Owner can update any group challenge (creator is user 2, owner is user 1)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';

do $$
declare cid uuid;
declare xp int;
begin
  select id into cid from public.challenges
    where title = 'Read for 30 min' and group_id = (select id from public.groups where name='GC Crew');
  perform public.update_group_challenge(cid, null, null, 'hard', null);
  select xp_reward into xp from public.challenges where id = cid;
  if xp != 70 then raise exception 'FAIL: owner difficulty update should recompute XP to 70, got %', xp; end if;
end $$;

-- Case 6: Non-creator non-owner can't update (user 3 tries to edit user 2's challenge)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-cccc-0000-0000-000000000003","role":"authenticated"}';

do $$
declare cid uuid;
begin
  select id into cid from public.challenges
    where title = 'Read for 30 min' and group_id = (select id from public.groups where name='GC Crew');
  begin
    perform public.update_group_challenge(cid, 'Hacked title', null, null, null);
    raise exception 'FAIL: non-creator non-owner update should reject';
  exception when sqlstate '42501' then end;
end $$;

-- Case 7: Creator can delete own challenge
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-cccc-0000-0000-000000000002","role":"authenticated"}';

do $$
declare cid uuid;
declare r record;
begin
  select id into cid from public.challenges
    where title = 'Easy thing' and group_id = (select id from public.groups where name='GC Crew');
  perform public.delete_group_challenge(cid);
  select is_active into r from public.challenges where id = cid;
  if r.is_active != false then raise exception 'FAIL: soft delete should flip is_active'; end if;
end $$;

-- Verify soft-deleted challenge is hidden by RLS
do $$
declare n int;
begin
  select count(*) into n from public.challenges
    where group_id = (select id from public.groups where name='GC Crew')
      and title = 'Easy thing';
  if n != 0 then raise exception 'FAIL: soft-deleted challenge should be hidden by RLS'; end if;
end $$;

-- Case 8: Owner can delete any group challenge (owner deletes user 2's Hard challenge)
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';

do $$
declare cid uuid;
begin
  select id into cid from public.challenges
    where title = 'Hard thing' and group_id = (select id from public.groups where name='GC Crew');
  perform public.delete_group_challenge(cid);
end $$;

-- Case 9: Soft delete preserves completions
-- (verify the completion row still exists even though the challenge is is_active=false)
-- Have user 3 accept + complete the still-active 'Epic thing' first, then soft-delete it
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-cccc-0000-0000-000000000003","role":"authenticated"}';

do $$
declare epic_id uuid;
declare a_id uuid;
declare comp_count int;
begin
  select id into epic_id from public.challenges
    where title = 'Epic thing' and group_id = (select id from public.groups where name='GC Crew');
  insert into public.challenge_accepts (challenge_id, user_id)
    values (epic_id, '33333333-cccc-0000-0000-000000000003')
    returning id into a_id;
  -- submit a photo completion (proof_url must be under user 3's folder)
  perform public.submit_completion(a_id, 'proof/33333333-cccc-0000-0000-000000000003/x.jpg');
  -- now owner soft-deletes
  reset role;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"11111111-cccc-0000-0000-000000000001","role":"authenticated"}';
  perform public.delete_group_challenge(epic_id);
  -- verify completion still exists (service_role view)
  reset role;
  select count(*) into comp_count from public.challenge_completions
    where challenge_id = epic_id and user_id = '33333333-cccc-0000-0000-000000000003';
  if comp_count != 1 then raise exception 'FAIL: completion lost after soft delete (got % rows)', comp_count; end if;
end $$;

-- Case 10: Non-member can't read group challenges
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-cccc-0000-0000-000000000004","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.challenges
    where group_id = (select id from public.groups where name='GC Crew');
  -- group_id reads as null for non-member because groups SELECT is RLS-filtered, but
  -- the challenges policy is the authoritative check
  if n != 0 then raise exception 'FAIL: non-member should see 0 group challenges, saw %', n; end if;
end $$;

reset role;

-- Cleanup
delete from public.challenge_completions where user_id in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.challenge_accepts where user_id in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.challenges where created_by in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.group_members where user_id in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.groups where created_by in (
  select id from auth.users where email like 'gc%@local'
);
delete from public.users where id in (
  select id from auth.users where email like 'gc%@local'
);
delete from auth.users where email like 'gc%@local';

commit;
select 'TEST PASS: group_challenges' as result;
```

- [ ] **Step 2: Run to verify failure**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/group_challenges.test.sql
```

Expected: FAIL — `function public.create_group_challenge(...) does not exist`.

- [ ] **Step 3: Write migration 0016**

Create `supabase/migrations/0016_group_challenges_rpcs.sql`:

```sql
-- 0016_group_challenges_rpcs.sql
-- 3 RPCs for custom group challenges + RLS policy swap that surfaces them.

-- Replace the Slice 1 policy (presets only) with one that also covers
-- group challenges visible to members.
drop policy if exists challenges_select_presets on public.challenges;

create policy challenges_select_presets_or_group on public.challenges
  for select to authenticated
  using (
    (group_id is null and is_active = true)
    or
    (group_id is not null and is_active = true and public.is_group_member(group_id, auth.uid()))
  );

-- 4.2 create_group_challenge
create or replace function public.create_group_challenge(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_difficulty text,
  p_proof_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_xp int;
  v_challenge_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'Title must be 1-80 chars' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'Description too long' using errcode = '22023';
  end if;
  if p_category not in ('fitness','study','dare','habit','creative','other') then
    raise exception 'Invalid category' using errcode = '22023';
  end if;
  if p_difficulty not in ('easy','medium','hard','epic') then
    raise exception 'Invalid difficulty' using errcode = '22023';
  end if;
  if p_proof_type in ('video','peer') then
    raise exception 'Proof type not supported in Plan 2' using errcode = '0A000';
  end if;
  if p_proof_type not in ('honor','photo') then
    raise exception 'Invalid proof type' using errcode = '22023';
  end if;

  v_xp := case p_difficulty
    when 'easy'   then 30
    when 'medium' then 50
    when 'hard'   then 70
    when 'epic'   then 120
  end;

  insert into public.challenges
    (group_id, title, description, category, difficulty, xp_reward, proof_type,
     deadline_type, created_by, is_active)
  values
    (p_group_id, v_title, v_description, p_category, p_difficulty, v_xp, p_proof_type,
     'none', v_user_id, true)
  returning id into v_challenge_id;

  return jsonb_build_object('challenge_id', v_challenge_id);
end;
$$;

grant execute on function public.create_group_challenge(uuid, text, text, text, text, text) to authenticated;

-- 4.3 update_group_challenge
create or replace function public.update_group_challenge(
  p_challenge_id uuid,
  p_title text default null,
  p_description text default null,
  p_difficulty text default null,
  p_proof_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge record;
  v_is_authorized boolean;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_description text;
  v_xp int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found or v_challenge.group_id is null then
    raise exception 'not_a_group_challenge' using errcode = '02000';
  end if;

  v_is_authorized := v_challenge.created_by = v_user_id or exists (
    select 1 from public.group_members
    where group_id = v_challenge.group_id and user_id = v_user_id and role = 'owner'
  );
  if not v_is_authorized then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_title is null and p_description is null and p_difficulty is null and p_proof_type is null then
    raise exception 'no_change' using errcode = '22023';
  end if;

  if v_title is not null then
    if char_length(v_title) > 80 then
      raise exception 'Title too long' using errcode = '22023';
    end if;
    update public.challenges set title = v_title where id = p_challenge_id;
  end if;

  if p_description is not null then
    v_description := nullif(trim(p_description), '');
    if v_description is not null and char_length(v_description) > 500 then
      raise exception 'Description too long' using errcode = '22023';
    end if;
    update public.challenges set description = v_description where id = p_challenge_id;
  end if;

  if p_proof_type is not null then
    if p_proof_type in ('video','peer') then
      raise exception 'Proof type not supported in Plan 2' using errcode = '0A000';
    end if;
    if p_proof_type not in ('honor','photo') then
      raise exception 'Invalid proof type' using errcode = '22023';
    end if;
    update public.challenges set proof_type = p_proof_type where id = p_challenge_id;
  end if;

  if p_difficulty is not null then
    if p_difficulty not in ('easy','medium','hard','epic') then
      raise exception 'Invalid difficulty' using errcode = '22023';
    end if;
    v_xp := case p_difficulty
      when 'easy'   then 30
      when 'medium' then 50
      when 'hard'   then 70
      when 'epic'   then 120
    end;
    update public.challenges
      set difficulty = p_difficulty, xp_reward = v_xp
      where id = p_challenge_id;
  end if;
end;
$$;

grant execute on function public.update_group_challenge(uuid, text, text, text, text) to authenticated;

-- 4.4 delete_group_challenge (soft delete)
create or replace function public.delete_group_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge record;
  v_is_authorized boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found or v_challenge.group_id is null then
    raise exception 'not_a_group_challenge' using errcode = '02000';
  end if;

  v_is_authorized := v_challenge.created_by = v_user_id or exists (
    select 1 from public.group_members
    where group_id = v_challenge.group_id and user_id = v_user_id and role = 'owner'
  );
  if not v_is_authorized then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.challenges set is_active = false where id = p_challenge_id;
end;
$$;

grant execute on function public.delete_group_challenge(uuid) to authenticated;
```

- [ ] **Step 4: Apply + verify all tests pass**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/group_challenges.test.sql
```

Expected: `TEST PASS: group_challenges`.

Then run the full regression sweep:

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

All 11 should end with `TEST PASS: ...`.

- [ ] **Step 5: Extend Database type with 3 new RPC signatures**

In `src/types/database.ts`, add to the `Functions` block (after `delete_group`):

```ts
      create_group_challenge: {
        Args: {
          p_group_id: string;
          p_title: string;
          p_description: string | null;
          p_category: string;
          p_difficulty: string;
          p_proof_type: string;
        };
        Returns: { challenge_id: string };
      };
      update_group_challenge: {
        Args: {
          p_challenge_id: string;
          p_title?: string | null;
          p_description?: string | null;
          p_difficulty?: string | null;
          p_proof_type?: string | null;
        };
        Returns: void;
      };
      delete_group_challenge: {
        Args: { p_challenge_id: string };
        Returns: void;
      };
```

- [ ] **Step 6: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(db): 3 group challenge RPCs + RLS swap (0016)"
```

---

## Task 3: API hooks — useGroupChallenges + 3 mutations + useMyAccepts null filter

**Files:**

- Create: `src/features/groups/api/useGroupChallenges.ts`, `useCreateGroupChallenge.ts`, `useUpdateGroupChallenge.ts`, `useDeleteGroupChallenge.ts`
- Modify: `src/features/challenges/api/useMyAccepts.ts` (add defensive `.filter`)

**Interfaces:**

- Produces:
  - `useGroupChallenges(groupId)` → `Query<ChallengeRow[]>` filtered by `group_id` and `is_active=true`, ordered `created_at desc`.
  - `useCreateGroupChallenge()` → mutation invalidating `['challenges', 'group', groupId]`.
  - `useUpdateGroupChallenge()` → mutation invalidating `['challenges', 'single', challengeId]` + `['challenges', 'group', groupId]`.
  - `useDeleteGroupChallenge()` → mutation; same invalidations as update + invalidate the user's `['accepts', 'mine', userId]` since deletion can orphan accepts.
  - `useMyAccepts` now filters out accepts whose `challenge` is null (i.e., RLS hid it due to soft-delete).

---

- [ ] **Step 1: useGroupChallenges**

Create `src/features/groups/api/useGroupChallenges.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRow } from '@/types/database';

export function useGroupChallenges(groupId: string | undefined) {
  return useQuery({
    queryKey: ['challenges', 'group', groupId],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<ChallengeRow[]> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('group_id', groupId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });
}
```

- [ ] **Step 2: useCreateGroupChallenge**

Create `src/features/groups/api/useCreateGroupChallenge.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

type Vars = {
  group_id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  proof_type: 'honor' | 'photo';
};

export function useCreateGroupChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('create_group_challenge', {
        p_group_id: vars.group_id,
        p_title: vars.title,
        p_description: vars.description,
        p_category: vars.category,
        p_difficulty: vars.difficulty,
        p_proof_type: vars.proof_type,
      });
      if (error) throw error;
      const result = data as { challenge_id: string };
      analytics.track('group_challenge_created', {
        group_id: vars.group_id,
        challenge_id: result.challenge_id,
        difficulty: vars.difficulty,
        proof_type: vars.proof_type,
      });
      return result;
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ['challenges', 'group', vars.group_id] });
    },
  });
}
```

- [ ] **Step 3: useUpdateGroupChallenge**

Create `src/features/groups/api/useUpdateGroupChallenge.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

type Vars = {
  challenge_id: string;
  group_id: string;
  title?: string;
  description?: string | null;
  difficulty?: string;
  proof_type?: 'honor' | 'photo';
};

export function useUpdateGroupChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('update_group_challenge', {
        p_challenge_id: vars.challenge_id,
        p_title: vars.title ?? null,
        p_description: vars.description ?? null,
        p_difficulty: vars.difficulty ?? null,
        p_proof_type: vars.proof_type ?? null,
      });
      if (error) throw error;
      analytics.track('group_challenge_updated', {
        group_id: vars.group_id,
        challenge_id: vars.challenge_id,
      });
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['challenges', 'single', vars.challenge_id] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'group', vars.group_id] }),
      ]);
    },
  });
}
```

- [ ] **Step 4: useDeleteGroupChallenge**

Create `src/features/groups/api/useDeleteGroupChallenge.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

type Vars = {
  challenge_id: string;
  group_id: string;
  by_owner: boolean;
};

export function useDeleteGroupChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Vars) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('delete_group_challenge', {
        p_challenge_id: vars.challenge_id,
      });
      if (error) throw error;
      analytics.track('group_challenge_deleted', {
        group_id: vars.group_id,
        challenge_id: vars.challenge_id,
        by_owner: vars.by_owner,
      });
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['challenges', 'single', vars.challenge_id] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'group', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
      ]);
    },
  });
}
```

- [ ] **Step 5: Modify useMyAccepts with defensive filter**

Edit `src/features/challenges/api/useMyAccepts.ts`. Find the `queryFn` block and update the return statement:

```ts
const { data, error } = await q;
if (error) throw error;
const rows = (data ?? []) as unknown as AcceptWithChallenge[];
// Defensive: RLS hides soft-deleted challenges, so the join can return
// accepts with null challenge. Filter them out so screens never crash on
// <ChallengeCard challenge={null} />.
return rows.filter((a) => a.challenge != null);
```

- [ ] **Step 6: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): 4 group challenge API hooks + defensive useMyAccepts filter"
```

---

## Task 4: Analytics events + i18n strings

**Files:**

- Modify: `src/lib/analytics/events.ts` (3 new events)
- Modify: `src/lib/i18n/locales/en.json` (new `groupChallenges.*` namespace)

---

- [ ] **Step 1: Register 3 new typed events**

Edit `src/lib/analytics/events.ts` — extend `EventPayloads`:

```ts
// Slice 2 Plan 2
group_challenge_created: {
  group_id: string;
  challenge_id: string;
  difficulty: string;
  proof_type: string;
}
group_challenge_updated: {
  group_id: string;
  challenge_id: string;
}
group_challenge_deleted: {
  group_id: string;
  challenge_id: string;
  by_owner: boolean;
}
```

- [ ] **Step 2: Add i18n keys**

In `src/lib/i18n/locales/en.json`, after the `groups` block add (or merge into the same `groups` block if you prefer — but keeping a top-level `groupChallenges` keeps the namespace clean):

```json
"groupChallenges": {
  "section": {
    "title": "CHALLENGES",
    "seeAll": "See all ({{count}})"
  },
  "empty": {
    "label": "No challenges yet",
    "cta": "Create the first challenge"
  },
  "catalog": {
    "title": "Catalog",
    "newButton": "+ New",
    "empty": "Nothing in this group yet"
  },
  "create": {
    "title": "New challenge",
    "titlePlaceholder": "What's the challenge?",
    "descriptionPlaceholder": "Details (optional)",
    "categoryLabel": "Category",
    "difficultyLabel": "Difficulty",
    "proofLabel": "Proof",
    "proofHonor": "Honor",
    "proofPhoto": "Photo",
    "submit": "Create challenge"
  },
  "edit": {
    "title": "Edit challenge",
    "save": "Save changes",
    "delete": "Delete challenge",
    "deleteConfirmTitle": "Delete this challenge?",
    "deleteConfirmBody": "Members will lose access immediately. Completed submissions stay on the record.",
    "deleteConfirmAction": "Yes, delete"
  },
  "difficulty": {
    "easy": "Easy",
    "medium": "Medium",
    "hard": "Hard",
    "epic": "Epic",
    "xpPreview": "+{{xp}} XP"
  },
  "errors": {
    "notMember": "You must be a group member to do this.",
    "notAuthorized": "Only the creator or group owner can edit this challenge.",
    "videoNotSupported": "Video proof isn't supported yet.",
    "peerNotSupported": "Peer-approval proof isn't supported yet."
  }
}
```

- [ ] **Step 3: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(i18n+analytics): groupChallenges.* strings + 3 typed events"
```

---

## Task 5: Components — DifficultyPicker + GroupChallengesSection

**Files:**

- Create: `src/features/groups/components/DifficultyPicker.tsx`, `src/features/groups/components/GroupChallengesSection.tsx`

**Interfaces:**

- Produces:
  - `<DifficultyPicker value onChange />` — 4 chips, each labeled with the tier name + XP preview, single-select.
  - `<GroupChallengesSection groupId onCreate onSeeAll />` — header + count + first 3 cards + "See all" / empty CTA.

---

- [ ] **Step 1: DifficultyPicker**

Create `src/features/groups/components/DifficultyPicker.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import type { Difficulty } from '@/types/database';
import { t } from '@/lib/i18n';

const TIERS: { difficulty: Difficulty; xp: number }[] = [
  { difficulty: 'easy', xp: 30 },
  { difficulty: 'medium', xp: 50 },
  { difficulty: 'hard', xp: 70 },
  { difficulty: 'epic', xp: 120 },
];

type Props = { value: Difficulty | null; onChange: (d: Difficulty) => void };

export function DifficultyPicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {TIERS.map(({ difficulty, xp }) => {
        const active = value === difficulty;
        return (
          <Pressable
            key={difficulty}
            onPress={() => onChange(difficulty)}
            className={`rounded-2xl px-4 py-3 ${
              active ? 'bg-primary-500' : 'bg-bg-elevated'
            } active:opacity-80`}
          >
            <Text
              className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-primary'}`}
            >
              {t(`groupChallenges.difficulty.${difficulty}`)}
            </Text>
            <Text className={`text-xs ${active ? 'text-white/80' : 'text-text-muted'}`}>
              {t('groupChallenges.difficulty.xpPreview', { xp })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: GroupChallengesSection**

Create `src/features/groups/components/GroupChallengesSection.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { useGroupChallenges } from '../api/useGroupChallenges';
import { t } from '@/lib/i18n';

type Props = {
  groupId: string;
  onChallengePress: (challengeId: string) => void;
  onSeeAll: () => void;
  onCreateFirst: () => void;
};

export function GroupChallengesSection({
  groupId,
  onChallengePress,
  onSeeAll,
  onCreateFirst,
}: Props) {
  const { data: challenges } = useGroupChallenges(groupId);

  if (!challenges) return null;

  if (challenges.length === 0) {
    return (
      <View className="items-center rounded-2xl bg-bg-surface px-4 py-6">
        <Text className="mb-2 text-3xl">✨</Text>
        <Text className="mb-3 text-sm text-text-muted">{t('groupChallenges.empty.label')}</Text>
        <Pressable
          onPress={onCreateFirst}
          className="rounded-full bg-primary-500 px-4 py-2 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">{t('groupChallenges.empty.cta')}</Text>
        </Pressable>
      </View>
    );
  }

  const preview = challenges.slice(0, 3);

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-semibold tracking-widest text-text-muted">
          {t('groupChallenges.section.title')}
        </Text>
        <Text className="text-xs text-text-muted">{challenges.length}</Text>
      </View>
      <View className="gap-3">
        {preview.map((c) => (
          <ChallengeCard key={c.id} challenge={c} onPress={() => onChallengePress(c.id)} />
        ))}
      </View>
      {challenges.length > 3 && (
        <Pressable onPress={onSeeAll} className="mt-3 self-end active:opacity-60">
          <Text className="text-sm font-semibold text-primary-500">
            {t('groupChallenges.section.seeAll', { count: challenges.length })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): DifficultyPicker + GroupChallengesSection components"
```

---

## Task 6: Slot GroupChallengesSection into group home

**Files:**

- Modify: `app/groups/[id]/index.tsx`

---

- [ ] **Step 1: Wire the section**

Edit `app/groups/[id]/index.tsx`. Add the import:

```tsx
import { GroupChallengesSection } from '@/features/groups/components/GroupChallengesSection';
```

Inside the `<ScrollView>`, between the existing `MemberAvatarRow` block and the `InviteCodeCard` block, insert:

```tsx
<GroupChallengesSection
  groupId={group.id}
  onChallengePress={(cid) => router.push(`/challenge/${cid}`)}
  onSeeAll={() => router.push(`/groups/${group.id}/catalog`)}
  onCreateFirst={() => router.push(`/groups/${group.id}/create-challenge`)}
/>
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): slot GroupChallengesSection into group home"
```

---

## Task 7: `/groups/[id]/catalog` screen

**Files:**

- Create: `app/groups/[id]/catalog.tsx`

**Interfaces:**

- Produces: full list of active group challenges, owner/creator each get edit affordance via long-press, header has "+ New" CTA.

---

- [ ] **Step 1: Create the screen**

Create `app/groups/[id]/catalog.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { EmptyState } from '@/ui/EmptyState';
import { useGroupChallenges } from '@/features/groups/api/useGroupChallenges';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

export default function GroupCatalog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: challenges, isLoading } = useGroupChallenges(id);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  function canEdit(creatorId: string | null): boolean {
    if (!creatorId) return false;
    return isOwner || creatorId === userId;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-row items-center justify-between px-6 pb-3 pt-4">
        <Text className="font-display text-3xl text-text-primary">
          {t('groupChallenges.catalog.title')}
        </Text>
        <Pressable
          onPress={() => router.push(`/groups/${id}/create-challenge`)}
          className="rounded-full bg-primary-500 px-4 py-2 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">
            {t('groupChallenges.catalog.newButton')}
          </Text>
        </Pressable>
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : !challenges || challenges.length === 0 ? (
        <EmptyState emoji="✨" label={t('groupChallenges.catalog.empty')} />
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 24, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={
                canEdit(item.created_by)
                  ? () => router.push(`/groups/${id}/edit-challenge/${item.id}`)
                  : undefined
              }
            >
              <ChallengeCard
                challenge={item}
                onPress={() => router.push(`/challenge/${item.id}`)}
              />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): /groups/[id]/catalog screen with creator/owner edit affordance"
```

---

## Task 8: `/groups/[id]/create-challenge` screen

**Files:**

- Create: `app/groups/[id]/create-challenge.tsx`

---

- [ ] **Step 1: Create the screen**

Create `app/groups/[id]/create-challenge.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { CategoryChip } from '@/features/challenges/components/CategoryChip';
import { DifficultyPicker } from '@/features/groups/components/DifficultyPicker';
import { useCreateGroupChallenge } from '@/features/groups/api/useCreateGroupChallenge';
import { t } from '@/lib/i18n';
import type { Category, Difficulty } from '@/types/database';

const CATEGORIES: { id: Category; labelKey: string }[] = [
  { id: 'fitness', labelKey: 'catalog.fitness' },
  { id: 'study', labelKey: 'catalog.study' },
  { id: 'habit', labelKey: 'catalog.habit' },
  { id: 'dare', labelKey: 'catalog.dare' },
  { id: 'creative', labelKey: 'catalog.creative' },
];

export default function CreateChallenge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [proofType, setProofType] = useState<'honor' | 'photo'>('honor');
  const mutation = useCreateGroupChallenge();

  const canSubmit =
    title.trim().length > 0 && category != null && difficulty != null && !mutation.isPending;

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '42501') return t('groupChallenges.errors.notMember');
    if (code === '0A000') {
      return proofType === 'honor'
        ? t('groupChallenges.errors.videoNotSupported')
        : t('groupChallenges.errors.peerNotSupported');
    }
    return e.message;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Text className="font-display text-2xl text-text-primary">
          {t('groupChallenges.create.title')}
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('groupChallenges.create.titlePlaceholder')}
          placeholderTextColor="#8B8B98"
          maxLength={80}
          autoFocus
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('groupChallenges.create.descriptionPlaceholder')}
          placeholderTextColor="#8B8B98"
          maxLength={500}
          multiline
          numberOfLines={3}
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.categoryLabel')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                label={t(c.labelKey)}
                active={category === c.id}
                onPress={() => setCategory(c.id)}
              />
            ))}
          </ScrollView>
        </View>
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.difficultyLabel')}
          </Text>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </View>
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.proofLabel')}
          </Text>
          <View className="flex-row gap-2">
            {(['honor', 'photo'] as const).map((p) => {
              const active = proofType === p;
              return (
                <Button
                  key={p}
                  variant={active ? 'primary' : 'ghost'}
                  onPress={() => setProofType(p)}
                >
                  {t(`groupChallenges.create.proof${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                </Button>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View className="px-6 pb-8">
        <Button
          disabled={!canSubmit}
          onPress={async () => {
            try {
              await mutation.mutateAsync({
                group_id: id,
                title,
                description: description.trim() || null,
                category: category!,
                difficulty: difficulty!,
                proof_type: proofType,
              });
              router.replace(`/groups/${id}/catalog`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groupChallenges.create.submit')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): /groups/[id]/create-challenge form"
```

---

## Task 9: `/groups/[id]/edit-challenge/[challengeId]` screen with delete

**Files:**

- Create: `app/groups/[id]/edit-challenge/[challengeId].tsx`

---

- [ ] **Step 1: Create the screen**

Create `app/groups/[id]/edit-challenge/[challengeId].tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/ui/Button';
import { DifficultyPicker } from '@/features/groups/components/DifficultyPicker';
import { useChallenge } from '@/features/challenges/api/useChallenge';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useUpdateGroupChallenge } from '@/features/groups/api/useUpdateGroupChallenge';
import { useDeleteGroupChallenge } from '@/features/groups/api/useDeleteGroupChallenge';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';
import type { Difficulty } from '@/types/database';

export default function EditChallenge() {
  const { id, challengeId } = useLocalSearchParams<{ id: string; challengeId: string }>();
  const router = useRouter();
  const { data: challenge, isLoading } = useChallenge(challengeId);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);
  const updateMutation = useUpdateGroupChallenge();
  const deleteMutation = useDeleteGroupChallenge();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [proofType, setProofType] = useState<'honor' | 'photo'>('honor');

  useEffect(() => {
    if (challenge) {
      setTitle(challenge.title);
      setDescription(challenge.description ?? '');
      setDifficulty(challenge.difficulty);
      setProofType(
        challenge.proof_type === 'honor' || challenge.proof_type === 'photo'
          ? challenge.proof_type
          : 'honor',
      );
    }
  }, [challenge]);

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  if (isLoading || !challenge) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '42501') return t('groupChallenges.errors.notAuthorized');
    return e.message;
  }

  function confirmDelete() {
    Alert.alert(
      t('groupChallenges.edit.deleteConfirmTitle'),
      t('groupChallenges.edit.deleteConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groupChallenges.edit.deleteConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                challenge_id: challengeId,
                group_id: id,
                by_owner: isOwner,
              });
              router.replace(`/groups/${id}/catalog`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Text className="font-display text-2xl text-text-primary">
          {t('groupChallenges.edit.title')}
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          multiline
          numberOfLines={3}
          placeholderTextColor="#8B8B98"
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.difficultyLabel')}
          </Text>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </View>
        <View>
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('groupChallenges.create.proofLabel')}
          </Text>
          <View className="flex-row gap-2">
            {(['honor', 'photo'] as const).map((p) => {
              const active = proofType === p;
              return (
                <Button
                  key={p}
                  variant={active ? 'primary' : 'ghost'}
                  onPress={() => setProofType(p)}
                >
                  {t(`groupChallenges.create.proof${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                </Button>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View className="gap-3 px-6 pb-8">
        <Button
          disabled={updateMutation.isPending || title.trim().length < 1 || difficulty == null}
          onPress={async () => {
            try {
              await updateMutation.mutateAsync({
                challenge_id: challengeId,
                group_id: id,
                title,
                description: description.trim() || null,
                difficulty: difficulty ?? undefined,
                proof_type: proofType,
              });
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groupChallenges.edit.save')}
        </Button>
        <Button variant="ghost" onPress={confirmDelete} disabled={deleteMutation.isPending}>
          {t('groupChallenges.edit.delete')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): /groups/[id]/edit-challenge/[challengeId] form + delete"
```

---

## Task 10: Final sweep — typecheck, lint, test, bundle, push

**Files:** none new.

---

- [ ] **Step 1: Full client-side sweep**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
rm -f .expo/types/router.d.ts
bun run typecheck
bun run lint
bun run test
```

Expected: all three exit 0; 7 Jest suites + 26 tests pass.

- [ ] **Step 2: Full SQL sweep**

```bash
supabase db reset
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

Expected: 11 `TEST PASS` lines.

- [ ] **Step 3: iOS bundle smoke check**

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

## Plan 2 — Acceptance

Plan 2 is complete when ALL of these are true:

- [ ] `bun run typecheck` / `lint` / `test` exit 0
- [ ] `supabase db reset` applies migrations 0001–0016 cleanly
- [ ] 11 SQL test files all end with `TEST PASS: ...`
- [ ] Group home shows the new Challenges section between MemberAvatarRow and InviteCodeCard
- [ ] Empty group → "Create the first challenge" CTA → opens create form
- [ ] Member can create a Medium honor challenge → it appears in group home + catalog with `+50 XP`
- [ ] Owner can edit any group challenge; non-creator non-owner member's edit attempt errors with the i18n-mapped "Only the creator or group owner..." message
- [ ] Difficulty change in edit form recomputes XP server-side (visible after invalidation)
- [ ] Delete from edit screen → confirmation → soft-delete → challenge disappears from catalog + home; existing completions intact (verified via SQL test)
- [ ] Non-member can't read group challenges (RLS verified)
- [ ] Solo Catalog tab still shows only the 30 preset challenges (no group challenges leak)
- [ ] Home Today still works after deleting an accepted group challenge (defensive filter prevents crash)
- [ ] 3 new analytics events fire via typed registry
- [ ] `bunx expo export --platform ios` bundles successfully
- [ ] Committed + pushed

### Deferred items (not part of Plan 2 acceptance)

- Group feed → Plan 3
- Group leaderboard → Plan 3
- Group streak flame → Plan 3
- Deadlines on group challenges → later polish
- Video / peer-approval proof tiers → Slice 3
- Custom XP overrides → never (anti-gaming)
- "Created by @username" attribution on group challenge cards → small polish, defer
- Notifications when a new group challenge is created → Slice 3
- Pull-to-refresh on group catalog → reuse pattern from Slice 1, defer

---

## Self-review notes (already applied while writing)

- All 3 RPCs from the spec are implemented in Task 2 with full SQL + Database type signatures. Test covers all 10 cases from spec §9.
- RLS swap (drop old, create new) is in the same migration as the RPCs — atomic, no window where group challenges exist but are invisible.
- `useDeleteGroupChallenge` invalidates `['accepts', 'mine', userId]` so Home Today refreshes after a delete; combined with the defensive null-filter in `useMyAccepts`, deleted group challenges disappear cleanly from Home.
- `DifficultyPicker.value` accepts `null` so the form can require an explicit choice rather than defaulting to easy.
- Edit screen's `useEffect` clamps `proof_type` to `'honor'|'photo'` if the row somehow has `'video'|'peer'` (shouldn't happen but defensive).
- Long-press to open edit (catalog screen) keeps the primary `onPress` tap → challenge detail, matching the rest of the app's card behavior. Could swap for a kebab menu post-PMF.
- `i18n` key `groupChallenges.create.proofHonor` / `proofPhoto` is dynamically composed via `proof${capitalized}` in the screens; both keys exist in the JSON.
- All eslint-disable comments for `supabase.rpc as any` follow the pattern from Slice 1+2P1 — kept consistent for future codemod.

**Next plan after this:** Slice 2 Plan 3 — Group feed + leaderboard + group streak flame. The social-payoff plan that makes groups feel alive.
