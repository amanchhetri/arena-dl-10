# Challenge Arena — Slice 2 Plan 3b: Group Leaderboard Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-group leaderboard with two views (this-week and all-time), a podium home preview, an RPC-only data path, and full SQL test coverage.

**Architecture:** One SECURITY DEFINER RPC (`get_group_leaderboard(p_group_id, p_period)`) computes both rankings in a single CTE. RLS membership is enforced inside the RPC, raising `42501` for non-members instead of returning an empty set. Client adds one TanStack hook, three components, one screen, and one home preview block — no new external dependencies.

**Tech Stack:** Postgres (Supabase) + RLS + SQL RPCs; React Native + Expo Router; TanStack Query v5; NativeWind. Existing `users_select_group_mates` policy from Plan 3a (migration 0017) and existing membership-scoped `challenge_completions` SELECT from Slice 2 Plan 1 are sufficient.

## Global Constraints

- Periods supported in this plan: **`'lifetime'`** and **`'this_week'`**. Any other `p_period` value raises `22023`.
- Week boundary: **calendar week, Monday 00:00 UTC**. Computed as `date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'`.
- Tie-breaker: equal `xp_total` → earlier `joined_at` ranks higher.
- 0-XP members appear at the bottom of every result with `rank = NULL`. Client renders `NULL` as `"—"`.
- Self-row highlight: `bg-primary-500/10`.
- Owner badge: a tiny crown (`👑` text + role check) next to `@username` on that row.
- Home preview: **top-3 this-week** only. Lifetime is screen-only.
- Default screen tab: **`this_week`**.
- All RPCs `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`.
- All Supabase calls live behind a TanStack hook under `src/features/groups/api/`.
- All user-facing strings via `i18n.t()` under `leaderboard.*`.
- All eslint-disable comments for `supabase.rpc as any` use the same pattern as Slice 1+2P1+2P2+2P3a.
- Working branch: `main` (direct commits, no worktrees).

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   └── groups/
│       └── [id]/
│           ├── index.tsx                       # MODIFIED — slot LeaderboardPodium
│           ├── _layout.tsx                     # MODIFIED — register leaderboard route
│           └── leaderboard.tsx                 # NEW — full screen with toggle
├── src/
│   ├── features/
│   │   └── groups/
│   │       ├── api/
│   │       │   └── useGroupLeaderboard.ts      # NEW
│   │       └── components/
│   │           ├── PeriodTogglePill.tsx        # NEW — this-week / all-time pill
│   │           ├── LeaderboardRow.tsx          # NEW — single row presentation
│   │           └── LeaderboardPodium.tsx       # NEW — top-3 home preview
│   ├── lib/
│   │   ├── analytics/events.ts                 # MODIFIED — 3 new typed events
│   │   └── i18n/locales/en.json                # MODIFIED — leaderboard.* namespace
│   └── types/
│       └── database.ts                         # MODIFIED — LeaderboardPeriod + LeaderboardRow types + RPC signature
└── supabase/
    ├── migrations/
    │   └── 0021_get_group_leaderboard.sql      # NEW
    └── tests/
        └── group_leaderboard.test.sql          # NEW — 5 cases
```

**Decomposition rationale:**

- One migration: a single RPC. Splitting it would just add ceremony.
- One SQL test file: 5 cases all exercise the same RPC.
- 3 separate component files because each is a different consumer: the pill lives in the screen header, the row lives in the screen body **and** the podium, the podium lives on the home page. Splitting keeps each file small enough to hold in context for review.
- The hook is one file with a single named export.

---

## Task 1: Migration 0021 — `get_group_leaderboard` RPC + SQL test (5 cases)

**Files:**

- Create: `supabase/migrations/0021_get_group_leaderboard.sql`
- Create: `supabase/tests/group_leaderboard.test.sql`

**Interfaces:**

- Produces: `public.get_group_leaderboard(p_group_id uuid, p_period text)` returning a table of `(user_id, username, display_name, avatar_url, role, joined_at, xp_total, rank)`. See exact signature in Step 1.

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0021_get_group_leaderboard.sql`:

```sql
-- 0021_get_group_leaderboard.sql
-- Single parameterized RPC returning either lifetime or this-week ranking
-- of group members by XP earned in that group. Members with 0 XP for the
-- period appear at the bottom of the result with rank = NULL; non-members
-- are bounced with 42501. The membership check is in the function body
-- (not RLS) so the client can distinguish "no XP yet" from "you're not
-- in this group".

create or replace function public.get_group_leaderboard(
  p_group_id uuid,
  p_period text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz,
  xp_total bigint,
  rank int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_since timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.is_group_member(p_group_id, v_user_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if p_period not in ('lifetime', 'this_week') then
    raise exception 'Invalid period' using errcode = '22023';
  end if;

  v_since := case
    when p_period = 'this_week'
    then date_trunc('week', (now() at time zone 'UTC')::timestamp) at time zone 'UTC'
    else null
  end;

  return query
  with totals as (
    select gm.user_id    as t_user_id,
           gm.role       as t_role,
           gm.joined_at  as t_joined_at,
           coalesce(sum(cc.xp_awarded), 0)::bigint as t_xp_total
      from public.group_members gm
      left join public.challenge_completions cc
        on cc.user_id = gm.user_id
       and cc.group_id = p_group_id
       and (v_since is null or cc.completed_at >= v_since)
     where gm.group_id = p_group_id
     group by gm.user_id, gm.role, gm.joined_at
  )
  select t.t_user_id,
         u.username,
         u.display_name,
         u.avatar_url,
         t.t_role,
         t.t_joined_at,
         t.t_xp_total,
         case when t.t_xp_total = 0 then null
              else (row_number() over (order by t.t_xp_total desc, t.t_joined_at asc))::int
         end as rank
    from totals t
    join public.users u on u.id = t.t_user_id
   order by t.t_xp_total desc, t.t_joined_at asc;
end;
$$;

grant execute on function public.get_group_leaderboard(uuid, text) to authenticated;
```

Note on the column aliasing inside the CTE (`t_user_id`, `t_role`, etc.): PostgreSQL otherwise complains about ambiguous references because the RPC's `RETURNS TABLE` declares output columns with the same names (`user_id`, `role`, `joined_at`). Aliasing inside the CTE avoids the conflict without relying on shadowing rules.

- [ ] **Step 2: Apply the migration**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
supabase db reset
```

Expected: applies 0001–0021 cleanly.

- [ ] **Step 3: Smoke check — function exists**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select proname, pronargs from pg_proc where proname='get_group_leaderboard';"
```

Expected: 1 row with `pronargs = 2`.

- [ ] **Step 4: Write the SQL test (5 cases)**

Create `supabase/tests/group_leaderboard.test.sql`:

```sql
-- group_leaderboard.test.sql
-- 5 cases for public.get_group_leaderboard(p_group_id, p_period).

\set ON_ERROR_STOP on
begin;

-- ----------------------------------------------------------------------------
-- Provision 4 users + 1 outsider. Distinct UUID prefixes so the auth trigger's
-- first-8-char usernames don't collide.
-- ----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1b00-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb1@local', '', now(), now()),
  ('22222222-1b00-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb2@local', '', now(), now()),
  ('33333333-1b00-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb3@local', '', now(), now()),
  ('44444444-1b00-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb4@local', '', now(), now()),
  ('55555555-1b00-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb5@local', '', now(), now());

-- User 1 creates the group; users 2-4 join. User 5 stays outside.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.create_group('LB Crew', 'cyan'); end $$;

-- User 1 also creates a group challenge so user-1, user-2, user-3 can complete it.
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='LB Crew';
  perform public.create_group_challenge(gid, 'Read 20 pages', null, 'study', 'medium', 'honor');
end $$;

reset role;
select invite_code as lb_code from public.groups where name='LB Crew' \gset

-- Users 2, 3, 4 join in that order so joined_at strictly increases per user index.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-1b00-0000-0000-000000000002","role":"authenticated"}';
select public.join_group(:'lb_code');

set local "request.jwt.claims" = '{"sub":"33333333-1b00-0000-0000-000000000003","role":"authenticated"}';
select public.join_group(:'lb_code');

set local "request.jwt.claims" = '{"sub":"44444444-1b00-0000-0000-000000000004","role":"authenticated"}';
select public.join_group(:'lb_code');

reset role;

-- ----------------------------------------------------------------------------
-- Seed completions directly (bypassing submit_completion to avoid event side
-- effects). User 1 = 70 XP this week, user 2 = 50 XP this week, user 3 = 30 XP
-- this week (will be backdated in a moment for case 2), user 4 = no completion.
-- ----------------------------------------------------------------------------
do $$
declare
  gid uuid;
  cid uuid;
  aid1 uuid; aid2 uuid; aid3 uuid;
begin
  select id into gid from public.groups where name='LB Crew';
  select id into cid from public.challenges where title='Read 20 pages' and group_id = gid;

  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '11111111-1b00-0000-0000-000000000001') returning id into aid1;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid1, '11111111-1b00-0000-0000-000000000001', cid, gid, 'honor', 70);

  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '22222222-1b00-0000-0000-000000000002') returning id into aid2;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid2, '22222222-1b00-0000-0000-000000000002', cid, gid, 'honor', 50);

  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '33333333-1b00-0000-0000-000000000003') returning id into aid3;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid3, '33333333-1b00-0000-0000-000000000003', cid, gid, 'honor', 30);
end $$;

-- ============================================================================
-- Case 1: lifetime ranking — 70 / 50 / 30 / 0 sorted desc
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  rec record;
  expected_users uuid[] := array[
    '11111111-1b00-0000-0000-000000000001',
    '22222222-1b00-0000-0000-000000000002',
    '33333333-1b00-0000-0000-000000000003',
    '44444444-1b00-0000-0000-000000000004'
  ];
  expected_xp bigint[] := array[70, 50, 30, 0];
  expected_rank int[] := array[1, 2, 3, null];
  i int := 1;
begin
  select id into gid from public.groups where name='LB Crew';
  for rec in
    select * from public.get_group_leaderboard(gid, 'lifetime')
  loop
    if rec.user_id != expected_users[i] then
      raise exception 'FAIL case 1: row % user_id expected % got %', i, expected_users[i], rec.user_id;
    end if;
    if rec.xp_total != expected_xp[i] then
      raise exception 'FAIL case 1: row % xp expected % got %', i, expected_xp[i], rec.xp_total;
    end if;
    if rec.rank is distinct from expected_rank[i] then
      raise exception 'FAIL case 1: row % rank expected % got %', i, expected_rank[i], rec.rank;
    end if;
    i := i + 1;
  end loop;
  if i != 5 then raise exception 'FAIL case 1: expected 4 rows, got %', i - 1; end if;
end $$;

reset role;

-- ============================================================================
-- Case 2: this-week excludes prior weeks. Backdate user 3's completion to
-- two weeks ago. Now user 3 should drop to 0 XP this week and appear at the
-- bottom with NULL rank.
-- ============================================================================
update public.challenge_completions
   set completed_at = now() - interval '14 days'
 where user_id = '33333333-1b00-0000-0000-000000000003';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  rec record;
  expected_users uuid[] := array[
    '11111111-1b00-0000-0000-000000000001',
    '22222222-1b00-0000-0000-000000000002',
    '33333333-1b00-0000-0000-000000000003',
    '44444444-1b00-0000-0000-000000000004'
  ];
  expected_xp bigint[] := array[70, 50, 0, 0];
  i int := 1;
begin
  select id into gid from public.groups where name='LB Crew';
  for rec in
    select * from public.get_group_leaderboard(gid, 'this_week')
  loop
    if rec.user_id != expected_users[i] then
      raise exception 'FAIL case 2: row % user_id expected % got %', i, expected_users[i], rec.user_id;
    end if;
    if rec.xp_total != expected_xp[i] then
      raise exception 'FAIL case 2: row % xp expected % got %', i, expected_xp[i], rec.xp_total;
    end if;
    if i <= 2 and rec.rank != i then
      raise exception 'FAIL case 2: row % expected rank %, got %', i, i, rec.rank;
    end if;
    if i > 2 and rec.rank is not null then
      raise exception 'FAIL case 2: row % expected NULL rank (0 XP this week), got %', i, rec.rank;
    end if;
    i := i + 1;
  end loop;
end $$;

reset role;

-- ============================================================================
-- Case 3: tie-breaker — give user 4 a completion of 50 XP (lifetime). User 4
-- joined AFTER user 2 (who also has 50 XP), so user 2 should outrank user 4.
-- ============================================================================
do $$
declare
  gid uuid;
  cid uuid;
  aid uuid;
begin
  select id into gid from public.groups where name='LB Crew';
  select id into cid from public.challenges where title='Read 20 pages' and group_id = gid;
  insert into public.challenge_accepts (challenge_id, user_id)
    values (cid, '44444444-1b00-0000-0000-000000000004') returning id into aid;
  insert into public.challenge_completions
    (accept_id, user_id, challenge_id, group_id, proof_type, xp_awarded)
    values (aid, '44444444-1b00-0000-0000-000000000004', cid, gid, 'honor', 50);
end $$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  row2 record;
  row3 record;
begin
  select id into gid from public.groups where name='LB Crew';
  -- Expect order: user1 (70), user2 (50, earlier join), user4 (50, later join), user3 (0)
  select * into row2 from public.get_group_leaderboard(gid, 'lifetime') offset 1 limit 1;
  select * into row3 from public.get_group_leaderboard(gid, 'lifetime') offset 2 limit 1;

  if row2.user_id != '22222222-1b00-0000-0000-000000000002' then
    raise exception 'FAIL case 3: expected user 2 at rank 2, got %', row2.user_id;
  end if;
  if row3.user_id != '44444444-1b00-0000-0000-000000000004' then
    raise exception 'FAIL case 3: expected user 4 at rank 3, got %', row3.user_id;
  end if;
  if row2.rank != 2 or row3.rank != 3 then
    raise exception 'FAIL case 3: ranks expected 2, 3 got %, %', row2.rank, row3.rank;
  end if;
end $$;

reset role;

-- ============================================================================
-- Case 4: 0-XP members appear with NULL rank at the bottom (already covered
-- structurally by case 1, but this case asserts the contract directly).
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1b00-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  gid uuid;
  bottom record;
begin
  select id into gid from public.groups where name='LB Crew';
  -- User 3 backdated → 0 XP this week. Should be at the bottom with NULL rank.
  select * into bottom from public.get_group_leaderboard(gid, 'this_week')
    order by xp_total asc, joined_at desc limit 1;
  if bottom.rank is not null then
    raise exception 'FAIL case 4: 0-XP member should have NULL rank, got %', bottom.rank;
  end if;
  if bottom.xp_total != 0 then
    raise exception 'FAIL case 4: bottom row should have 0 XP, got %', bottom.xp_total;
  end if;
end $$;

reset role;

-- ============================================================================
-- Case 5: RLS — non-member raises 42501
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"55555555-1b00-0000-0000-000000000005","role":"authenticated"}';

do $$
declare
  gid uuid;
  caught boolean := false;
begin
  -- Service-role-style read of the group id (the function call below will run as user 5)
  select id into gid from public.groups where name='LB Crew';
  begin
    perform * from public.get_group_leaderboard(gid, 'lifetime');
  exception when insufficient_privilege then
    caught := true;
  end;
  if not caught then
    raise exception 'FAIL case 5: non-member call should raise 42501';
  end if;
end $$;

reset role;

-- ----------------------------------------------------------------------------
-- Cleanup
-- ----------------------------------------------------------------------------
delete from public.challenge_completions where user_id in (
  select id from auth.users where email like 'lb%@local'
);
delete from public.challenge_accepts where user_id in (
  select id from auth.users where email like 'lb%@local'
);
delete from public.challenges where group_id in (
  select id from public.groups where name='LB Crew'
);
delete from public.activity_events where group_id in (
  select id from public.groups where name='LB Crew'
);
delete from public.group_members where group_id in (
  select id from public.groups where name='LB Crew'
);
delete from public.groups where name='LB Crew';
delete from public.users where id in (
  select id from auth.users where email like 'lb%@local'
);
delete from auth.users where email like 'lb%@local';

commit;
select 'TEST PASS: group_leaderboard (5 cases)' as result;
```

A few notes about the test:

- It's important that user 5 is NOT a member of the group for case 5.
- Case 5 reads `gid` from `public.groups` while running as user 5. User 5 is authenticated, so `groups_select_members` policy would normally block — but the `do` block's `select id into gid from public.groups where name='LB Crew'` happens within plpgsql which doesn't apply RLS for `into` reads in this setup. The actual leaderboard RPC call is what we're testing for 42501.

Wait — actually plpgsql DOES apply RLS for unprivileged callers. To make `select id into gid` succeed for user 5, we need a different path. Better: capture `gid` BEFORE switching to user 5. Let me revise.

- [ ] **Step 5: Fix case 5 — capture gid before switching role**

Edit `supabase/tests/group_leaderboard.test.sql` — replace the case 5 block with:

```sql
-- ============================================================================
-- Case 5: RLS — non-member raises 42501
-- ============================================================================
-- Capture gid as service role first, then switch to user 5 (a non-member)
-- and prove the RPC raises 42501.
reset role;
select id as lb_gid from public.groups where name='LB Crew' \gset

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"55555555-1b00-0000-0000-000000000005","role":"authenticated"}';

do $$
declare caught boolean := false;
begin
  begin
    perform * from public.get_group_leaderboard(:'lb_gid'::uuid, 'lifetime');
  exception when insufficient_privilege then
    caught := true;
  end;
  if not caught then
    raise exception 'FAIL case 5: non-member call should raise 42501';
  end if;
end $$;

reset role;
```

- [ ] **Step 6: Apply + run the test**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/group_leaderboard.test.sql 2>&1 | grep -E "TEST PASS|FAIL|ERROR" | head -3
```

Expected: `TEST PASS: group_leaderboard (5 cases)`.

- [ ] **Step 7: Full regression sweep (14 SQL tests now)**

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges activity_events proof_group_visibility group_leaderboard; do
  result=$(psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | grep -E "TEST PASS|FAIL|ERROR" | head -1)
  echo "$f: $result"
done
```

Expected: 14 `TEST PASS` lines, no `FAIL` / `ERROR`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0021_get_group_leaderboard.sql supabase/tests/group_leaderboard.test.sql
git commit -m "feat(db): get_group_leaderboard RPC (0021) + 5 SQL test cases"
```

---

## Task 2: Client foundations — types + analytics + i18n + hook

**Files:**

- Modify: `src/types/database.ts`
- Modify: `src/lib/analytics/events.ts`
- Modify: `src/lib/i18n/locales/en.json`
- Create: `src/features/groups/api/useGroupLeaderboard.ts`

**Interfaces:**

- Produces:
  - `LeaderboardPeriod` TS type (string union of `'lifetime' | 'this_week'`).
  - `LeaderboardRow` TS interface matching the RPC return shape.
  - Function signature on `Database['public']['Functions']` for `get_group_leaderboard`.
  - 3 new typed analytics events: `leaderboard_viewed`, `leaderboard_period_switched`, `leaderboard_preview_tapped`.
  - `leaderboard.*` i18n namespace.
  - `useGroupLeaderboard(groupId, period)` TanStack hook returning `Query<LeaderboardRow[]>`.

---

- [ ] **Step 1: Extend database types**

Edit `src/types/database.ts`. Add types and Function signature.

After the `ActivityEventRow` interface (around line 106), add:

```ts
export type LeaderboardPeriod = 'lifetime' | 'this_week';

export interface LeaderboardRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: GroupRole;
  joined_at: string;
  xp_total: number;
  rank: number | null;
}
```

Then inside `Database['public']['Functions']`, after the existing `delete_group_challenge` entry, add:

```ts
get_group_leaderboard: {
  Args: { p_group_id: string; p_period: LeaderboardPeriod };
  Returns: LeaderboardRow[];
};
```

- [ ] **Step 2: Add analytics events**

Edit `src/lib/analytics/events.ts`. After the `group_challenge_deleted` entry inside `EventPayloads`, add:

```ts
// Slice 2 Plan 3a (already present)
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
// Slice 2 Plan 3b
leaderboard_viewed: {
  group_id: string;
  period: 'lifetime' | 'this_week';
  rows_shown: number;
}
leaderboard_period_switched: {
  group_id: string;
  from: 'lifetime' | 'this_week';
  to: 'lifetime' | 'this_week';
}
leaderboard_preview_tapped: {
  group_id: string;
}
```

(The first three are already present from Plan 3a — leave them in place. Only the bottom three lines are new.)

- [ ] **Step 3: Add i18n keys**

Edit `src/lib/i18n/locales/en.json`. Before the existing `"legal":` block, add:

```json
  "leaderboard": {
    "screen": {
      "title": "Leaderboard"
    },
    "tabs": {
      "thisWeek": "This week",
      "allTime": "All-time"
    },
    "preview": {
      "title": "TOP THIS WEEK",
      "seeAll": "See all"
    },
    "empty": {
      "screen": "No XP earned in this group yet — be the first",
      "preview": "No XP this week yet"
    },
    "rank": {
      "noRank": "—"
    },
    "xp": "{{xp}} XP",
    "errors": {
      "notMember": "You're not a member of this group"
    }
  },
```

- [ ] **Step 4: Create the hook**

Create `src/features/groups/api/useGroupLeaderboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LeaderboardPeriod, LeaderboardRow } from '@/types/database';

export function useGroupLeaderboard(groupId: string | undefined, period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ['leaderboard', groupId, period],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<LeaderboardRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_group_leaderboard', {
        p_group_id: groupId,
        p_period: period,
      });
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
rm -f .expo/types/router.d.ts
bun run typecheck
```

Expected: clean.

```bash
git add src/types/database.ts src/lib/analytics/events.ts src/lib/i18n/locales/en.json src/features/groups/api/useGroupLeaderboard.ts
git commit -m "feat(leaderboard): types + analytics + i18n + useGroupLeaderboard hook"
```

---

## Task 3: Components — `PeriodTogglePill`, `LeaderboardRow`, `LeaderboardPodium`

**Files:**

- Create: `src/features/groups/components/PeriodTogglePill.tsx`
- Create: `src/features/groups/components/LeaderboardRow.tsx`
- Create: `src/features/groups/components/LeaderboardPodium.tsx`

**Interfaces:**

- Consumes:
  - `LeaderboardPeriod`, `LeaderboardRow` from `@/types/database`.
  - `useGroupLeaderboard` from `@/features/groups/api/useGroupLeaderboard`.
  - `useAuthStore` from `@/features/auth/store` (for self-row highlight).
- Produces:
  - `<PeriodTogglePill value={LeaderboardPeriod} onChange={(LeaderboardPeriod) => void} />`
  - `<LeaderboardRow row={LeaderboardRow} isSelf={boolean} />`
  - `<LeaderboardPodium groupId={string} onPress={() => void} />`

---

- [ ] **Step 1: Create `PeriodTogglePill`**

Create `src/features/groups/components/PeriodTogglePill.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import type { LeaderboardPeriod } from '@/types/database';
import { t } from '@/lib/i18n';

type Props = {
  value: LeaderboardPeriod;
  onChange: (next: LeaderboardPeriod) => void;
};

const SEGMENTS: { value: LeaderboardPeriod; labelKey: string }[] = [
  { value: 'this_week', labelKey: 'leaderboard.tabs.thisWeek' },
  { value: 'lifetime', labelKey: 'leaderboard.tabs.allTime' },
];

export function PeriodTogglePill({ value, onChange }: Props) {
  return (
    <View className="flex-row gap-1 rounded-full bg-bg-elevated p-1">
      {SEGMENTS.map((seg) => {
        const active = value === seg.value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => onChange(seg.value)}
            className={`flex-1 items-center rounded-full px-4 py-2 ${
              active ? 'bg-primary-500' : ''
            }`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-muted'}`}>
              {t(seg.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Create `LeaderboardRow`**

Create `src/features/groups/components/LeaderboardRow.tsx`:

```tsx
import { Text, View } from 'react-native';
import type { LeaderboardRow as LeaderboardRowData } from '@/types/database';
import { t } from '@/lib/i18n';

type Props = {
  row: LeaderboardRowData;
  isSelf: boolean;
};

function RankPill({ rank }: { rank: number | null }) {
  if (rank == null) {
    return (
      <View className="h-8 w-8 items-center justify-center rounded-full bg-bg-elevated">
        <Text className="text-sm text-text-muted">{t('leaderboard.rank.noRank')}</Text>
      </View>
    );
  }
  return (
    <View className="h-8 w-8 items-center justify-center rounded-full bg-bg-elevated">
      <Text className="text-sm font-semibold text-text-primary">{rank}</Text>
    </View>
  );
}

function AvatarCircle({ display }: { display: string }) {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-500/30">
      <Text className="font-display text-base text-text-primary">
        {display.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function LeaderboardRow({ row, isSelf }: Props) {
  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl p-3 ${
        isSelf ? 'bg-primary-500/10' : 'bg-bg-surface'
      }`}
    >
      <RankPill rank={row.rank} />
      <AvatarCircle display={row.username} />
      <View className="flex-1 flex-row items-center gap-1">
        <Text className="font-semibold text-text-primary">@{row.username}</Text>
        {row.role === 'owner' && <Text className="text-base">👑</Text>}
      </View>
      <View className="rounded-full bg-xp-gain/20 px-3 py-1">
        <Text className="text-xs font-semibold text-xp-gain">
          {t('leaderboard.xp', { xp: row.xp_total })}
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Create `LeaderboardPodium`**

Create `src/features/groups/components/LeaderboardPodium.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { useGroupLeaderboard } from '../api/useGroupLeaderboard';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

type Props = {
  groupId: string;
  onPress: () => void;
};

function PodiumSlot({
  rank,
  username,
  xp,
  isSelf,
  isFirst,
}: {
  rank: number;
  username: string;
  xp: number;
  isSelf: boolean;
  isFirst?: boolean;
}) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
  return (
    <View
      className={`flex-1 items-center rounded-2xl p-3 ${
        isSelf ? 'bg-primary-500/10' : 'bg-bg-surface'
      }`}
    >
      <Text className={isFirst ? 'text-3xl' : 'text-2xl'}>{medal}</Text>
      <Text
        className={`mt-1 font-semibold ${
          isFirst ? 'text-base text-text-primary' : 'text-sm text-text-primary'
        }`}
        numberOfLines={1}
      >
        @{username}
      </Text>
      <Text className="text-xs text-text-muted">{t('leaderboard.xp', { xp })}</Text>
    </View>
  );
}

export function LeaderboardPodium({ groupId, onPress }: Props) {
  const { data: rows } = useGroupLeaderboard(groupId, 'this_week');
  const userId = useAuthStore((s) => s.session?.user.id);

  if (!rows) return null;

  // Only members with rank (xp > 0) qualify for the podium
  const ranked = rows.filter((r) => r.rank != null).slice(0, 3);

  if (ranked.length === 0) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        <View className="rounded-2xl bg-bg-surface px-4 py-6">
          <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
            {t('leaderboard.preview.title')}
          </Text>
          <Text className="text-center text-sm text-text-muted">
            {t('leaderboard.empty.preview')}
          </Text>
        </View>
      </Pressable>
    );
  }

  function handlePress() {
    analytics.track('leaderboard_preview_tapped', { group_id: groupId });
    onPress();
  }

  // Layout: 2nd | 1st | 3rd, with 1st emphasized
  const first = ranked[0];
  const second = ranked[1];
  const third = ranked[2];

  return (
    <Pressable onPress={handlePress} className="active:opacity-80">
      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-semibold tracking-widest text-text-muted">
            {t('leaderboard.preview.title')}
          </Text>
          <Text className="text-sm font-semibold text-primary-500">
            {t('leaderboard.preview.seeAll')}
          </Text>
        </View>
        <View className="flex-row items-end gap-2">
          {second && (
            <PodiumSlot
              rank={2}
              username={second.username}
              xp={second.xp_total}
              isSelf={second.user_id === userId}
            />
          )}
          {first && (
            <PodiumSlot
              rank={1}
              username={first.username}
              xp={first.xp_total}
              isSelf={first.user_id === userId}
              isFirst
            />
          )}
          {third && (
            <PodiumSlot
              rank={3}
              username={third.username}
              xp={third.xp_total}
              isSelf={third.user_id === userId}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
rm -f .expo/types/router.d.ts
bun run typecheck
```

Expected: clean.

```bash
git add src/features/groups/components/PeriodTogglePill.tsx src/features/groups/components/LeaderboardRow.tsx src/features/groups/components/LeaderboardPodium.tsx
git commit -m "feat(leaderboard): PeriodTogglePill + LeaderboardRow + LeaderboardPodium"
```

---

## Task 4: Screen + home integration

**Files:**

- Create: `app/groups/[id]/leaderboard.tsx`
- Modify: `app/groups/[id]/_layout.tsx`
- Modify: `app/groups/[id]/index.tsx`

**Interfaces:**

- Consumes: all of Task 2 + Task 3.
- Produces: navigable `/groups/[id]/leaderboard` route + group home preview block.

---

- [ ] **Step 1: Create the leaderboard screen**

Create `app/groups/[id]/leaderboard.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { PeriodTogglePill } from '@/features/groups/components/PeriodTogglePill';
import { LeaderboardRow } from '@/features/groups/components/LeaderboardRow';
import { useGroupLeaderboard } from '@/features/groups/api/useGroupLeaderboard';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';
import type { LeaderboardPeriod } from '@/types/database';

export default function GroupLeaderboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<LeaderboardPeriod>('this_week');
  const { data: rows, isLoading, error } = useGroupLeaderboard(id, period);
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id && rows) {
      analytics.track('leaderboard_viewed', {
        group_id: id,
        period,
        rows_shown: rows.length,
      });
    }
  }, [id, rows, period]);

  function handlePeriodChange(next: LeaderboardPeriod) {
    if (next === period) return;
    analytics.track('leaderboard_period_switched', {
      group_id: id,
      from: period,
      to: next,
    });
    setPeriod(next);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['leaderboard', id, period] });
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

  if (error || !rows) {
    const code = (error as unknown as { code?: string } | null)?.code;
    const msg = code === '42501' ? t('leaderboard.errors.notMember') : t('auth.errors.generic');
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base px-6">
        <Text className="text-center text-text-muted">{msg}</Text>
      </SafeAreaView>
    );
  }

  const allZero = rows.every((r) => r.xp_total === 0);

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-4 pt-3">
        <PeriodTogglePill value={period} onChange={handlePeriodChange} />
      </View>
      {allZero ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-2 text-4xl">🏁</Text>
          <Text className="text-center text-text-muted">{t('leaderboard.empty.screen')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
          }
          renderItem={({ item }) => <LeaderboardRow row={item} isSelf={item.user_id === userId} />}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/groups/[id]/_layout.tsx`. After the existing `<Stack.Screen name="feed" ... />` line, add:

```tsx
<Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
```

The final `<Stack>` section should look like:

```tsx
<Stack.Screen name="index" options={{ title: '' }} />
<Stack.Screen name="members" options={{ title: 'Members' }} />
<Stack.Screen name="settings" options={{ title: 'Settings' }} />
<Stack.Screen name="edit-name" options={{ presentation: 'modal', title: '' }} />
<Stack.Screen name="edit-theme" options={{ presentation: 'modal', title: '' }} />
<Stack.Screen name="feed" options={{ title: 'Activity' }} />
<Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
```

- [ ] **Step 3: Slot the podium into the group home**

Edit `app/groups/[id]/index.tsx`. Add this import near the other component imports (after `GroupFeedSection`):

```tsx
import { LeaderboardPodium } from '@/features/groups/components/LeaderboardPodium';
```

Then, in the JSX body, insert `<LeaderboardPodium>` between `<GroupFeedSection>` and `<GroupChallengesSection>`. The relevant region should read:

```tsx
<GroupFeedSection
  groupId={group.id}
  onSeeAll={() => router.push(`/groups/${group.id}/feed`)}
/>

<LeaderboardPodium
  groupId={group.id}
  onPress={() => router.push(`/groups/${group.id}/leaderboard`)}
/>

<GroupChallengesSection
  groupId={group.id}
  ...
/>
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
rm -f .expo/types/router.d.ts
bun run typecheck
```

Expected: clean.

```bash
git add app/groups/\[id\]/leaderboard.tsx app/groups/\[id\]/_layout.tsx app/groups/\[id\]/index.tsx
git commit -m "feat(leaderboard): screen with toggle + group home podium preview"
```

---

## Task 5: Final sweep — typecheck, lint, test, all SQL tests, bundle, push

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

- [ ] **Step 2: Full SQL sweep (14 files)**

```bash
supabase db reset
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges activity_events proof_group_visibility group_leaderboard; do
  result=$(psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | grep -E "TEST PASS|FAIL|ERROR" | head -1)
  echo "$f: $result"
done
```

Expected: 14 `TEST PASS` lines.

- [ ] **Step 3: iOS bundle**

```bash
rm -rf dist
bunx expo export --platform ios --dump-sourcemap=false
rm -rf dist .expo/types/router.d.ts
```

Expected: `Exported: dist`.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Plan 3b — Acceptance

Plan 3b is complete when ALL of these are true:

- [ ] `bun run typecheck` / `lint` / `test` exit 0
- [ ] `supabase db reset` applies migrations 0001–0021 cleanly
- [ ] All 14 SQL test files end with `TEST PASS: …`
- [ ] Group home shows the top-3 this-week podium between the Activity section and the Challenges section
- [ ] Tapping the podium routes to `/groups/[id]/leaderboard`
- [ ] Leaderboard screen toggles between `this-week` and `all-time` without re-mounting
- [ ] Own row is visually highlighted (`bg-primary-500/10`)
- [ ] Owner row shows a crown next to `@username`
- [ ] 0-XP members appear at the bottom with rank "—"
- [ ] Non-member calling the RPC gets `42501` (SQL-verified by case 5)
- [ ] 3 new analytics events fire via the typed registry
- [ ] `bunx expo export --platform ios` bundles successfully
- [ ] Committed + pushed to `main`

### Deferred items (not part of Plan 3b acceptance)

- Monthly / last-30-days leaderboard
- Group-vs-group cross-leaderboard
- Per-category leaderboards (fitness-only, study-only, etc.)
- Rank-change deltas ("↑ 2 spots since Monday")
- Realtime updates (Supabase channel)
- Personal-record callouts
- Animated podium reveal
- Sharing leaderboard standings (deep link)

---

## Self-review notes (already applied while writing)

- The RPC uses CTE-internal aliases (`t_user_id`, `t_role`, `t_joined_at`, `t_xp_total`) so the outer `RETURNS TABLE` columns don't shadow them. Without this, plpgsql throws `column reference is ambiguous` on the `row_number() over (order by ...)` clause.
- The window function expression cannot use `FILTER (WHERE ...)` because `row_number()` is not a window aggregate. The plan computes rank unconditionally and wraps it in `CASE WHEN xp_total = 0 THEN NULL ELSE row_number()::int END`. Because the `ORDER BY` puts 0-XP rows last, the `row_number()` values for `xp_total > 0` are still 1, 2, 3… contiguous — no gaps introduced by NULL-rank rows.
- Case 5 captures `lb_gid` via `\gset` while running as service role, then switches to the non-member's JWT. Reading `groups.id` while running as user 5 would itself be blocked by `groups_select_members` and contaminate the test.
- The home podium calls `useGroupLeaderboard(groupId, 'this_week')` with no slice on the server side — it pulls all 25 rows (group cap) and filters to top 3 client-side. This matches the spec's §11 budget note (no separate hook needed for the preview).
- The hook uses the same `eslint-disable` pattern for `supabase.rpc as any` as Slice 1 Plan 5 and Slice 2 Plans 1/2/3a — necessary because the hand-written `Database` type narrows RPC return shapes to `never` in supabase-js.
- The screen's analytics `useEffect` fires `leaderboard_viewed` on every `rows` reference change (including period switches). The `leaderboard_period_switched` fires only on actual change, gated by the `next === period` early return.
- Pull-to-refresh on the screen invalidates `['leaderboard', id, period]` only — switching the toggle automatically re-queries the other key.

**Next plan after this:** Slice 2 Plan 3c — group home assembly + polish (final layout, pull-to-refresh on home, empty-state polish across all home blocks).
