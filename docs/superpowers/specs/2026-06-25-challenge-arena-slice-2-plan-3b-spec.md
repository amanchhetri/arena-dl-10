# Challenge Arena — Slice 2 Plan 3b: Group Leaderboard

**Date:** 2026-06-25
**Status:** Approved
**Predecessor:** Plan 3a (group feed + streak flame) shipped on `main` at `d4adc6c`
**Successor:** Plan 3c (group home assembly + polish)

---

## 1. Purpose

Give group members a way to see how they're stacking up against each other on group challenges — both as a slow-burn flex ("all-time XP within this group") and a fast-cycling weekly competition ("this-week XP within this group"). The leaderboard pairs with the streak flame from Plan 3a to give two complementary group dynamics: the flame is a cooperative survival-mode reward; the leaderboard is a competitive ranking.

## 2. Locked design decisions (from brainstorm)

- **Presentation:** single screen with a toggle/pill at the top — `this-week` ↔ `all-time`. No separate screens, no stacked sections.
- **Week boundary:** **calendar week** — Monday 00:00 UTC to Sunday 23:59 UTC. Resets every Monday at 00:00 UTC. Computed via `date_trunc('week', now() at time zone 'UTC')`.
- **Home preview:** **top-3 this-week** as a podium block (1st centered/larger, 2nd-3rd flanking). Lifetime is screen-only.
- **Default tab on screen:** `this-week`.
- **Tie-breaker:** equal XP → earlier `joined_at` wins (rewards longer-in-group, fully deterministic).
- **0-XP members:** **show at the bottom** with rank rendered as "—" (NULL rank from the DB). No erasure.
- **Self-row highlight:** subtle background tint on the current user's row.
- **Owner badge:** tiny crown next to the owner's `@username` on their row (consistent with the members screen).

## 3. Architecture overview

Postgres-first. One parameterized SECURITY DEFINER RPC produces both rankings. RLS membership check lives inside the RPC, raising `42501` for non-members. Client adds one TanStack hook, two components, one screen, and one preview block on the group home.

No new external dependencies. No cron (calendar-week boundary is computed per-query from `now()`). No realtime channel (Plan 3a deferred that to Slice 3 — same deferral applies here).

## 4. Data model + RPC

### 4.1 Function signature

```sql
public.get_group_leaderboard(
  p_group_id uuid,
  p_period text  -- 'lifetime' | 'this_week'
) returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,            -- 'owner' | 'admin' | 'member'
  joined_at timestamptz,
  xp_total bigint,
  rank int              -- null for xp_total = 0
)
```

`SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`.

### 4.2 Function body — outline

1. `if auth.uid() is null` → raise `28000` `'Not authenticated'`.
2. `if not is_group_member(p_group_id, auth.uid())` → raise `42501` `'not_a_member'`.
3. `if p_period not in ('lifetime', 'this_week')` → raise `22023` `'Invalid period'`.
4. Compute `v_since timestamptz := case when p_period = 'this_week' then date_trunc('week', (now() at time zone 'UTC')::timestamp) at time zone 'UTC' else null end`.
5. Run a query like:
   ```sql
   with totals as (
     select gm.user_id,
            gm.role,
            gm.joined_at,
            coalesce(sum(cc.xp_awarded), 0)::bigint as xp_total
       from public.group_members gm
       left join public.challenge_completions cc
         on cc.user_id = gm.user_id
        and cc.group_id = p_group_id
        and (v_since is null or cc.completed_at >= v_since)
      where gm.group_id = p_group_id
      group by gm.user_id, gm.role, gm.joined_at
   )
   select t.user_id,
          u.username, u.display_name, u.avatar_url,
          t.role, t.joined_at,
          t.xp_total,
          case when t.xp_total = 0 then null
               else (row_number() over (
                       order by t.xp_total desc, t.joined_at asc
                     ) filter (where t.xp_total > 0))::int
          end as rank
     from totals t
     join public.users u on u.id = t.user_id
    order by t.xp_total desc, t.joined_at asc;
   ```
6. Implementation note: `row_number() over (...) filter` only counts XP > 0 rows toward the rank; 0-XP rows still appear in the result, but with `rank = null`. The full result is ordered so 0-XP members sort to the bottom.

### 4.3 Why one RPC, not two

A single RPC with a string discriminator (instead of two RPCs `get_group_lifetime_leaderboard` / `get_group_weekly_leaderboard`) keeps Slice 2 Plan 3b small and lets future periods (monthly, last-7-days, etc.) drop in as new branch values without a new function signature. The TS hook caller pays a one-line cost (`useGroupLeaderboard(groupId, period)`) for that flexibility.

## 5. RLS posture

No new policies. `challenge_completions` already has membership-scoped SELECT from Slice 2 Plan 1. `users_select_group_mates` from Plan 3a (migration 0017) makes the actor profile join legal. The RPC itself bounces non-members via the explicit check in §4.2 step 2 — so non-members get `42501` instead of a silent empty list.

## 6. Client surface

### 6.1 Files added or modified

```
challenge-arena/
├── app/
│   └── groups/
│       └── [id]/
│           ├── index.tsx                       # MODIFIED — slot LeaderboardPreview
│           ├── _layout.tsx                     # MODIFIED — register leaderboard route
│           └── leaderboard.tsx                 # NEW — full screen with toggle
├── src/
│   ├── features/
│   │   └── groups/
│   │       ├── api/
│   │       │   └── useGroupLeaderboard.ts     # NEW
│   │       └── components/
│   │           ├── LeaderboardRow.tsx          # NEW — single row presentation
│   │           ├── LeaderboardPodium.tsx       # NEW — top-3 home preview
│   │           └── PeriodTogglePill.tsx        # NEW — this-week / all-time pill
│   ├── lib/
│   │   ├── analytics/events.ts                 # MODIFIED — 3 new typed events
│   │   └── i18n/locales/en.json                # MODIFIED — leaderboard.* namespace
│   └── types/
│       └── database.ts                         # MODIFIED — RPC signature + LeaderboardRow type
└── supabase/
    ├── migrations/
    │   └── 0021_get_group_leaderboard.sql      # NEW
    └── tests/
        └── group_leaderboard.test.sql          # NEW — 5 cases
```

### 6.2 Types

```ts
export type LeaderboardPeriod = 'lifetime' | 'this_week';

export interface LeaderboardRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: GroupRole;
  joined_at: string;
  xp_total: number; // js number is safe up to 2^53; bigint from PG → number coercion via PostgREST
  rank: number | null;
}
```

### 6.3 Hook

```ts
useGroupLeaderboard(groupId: string | undefined, period: LeaderboardPeriod)
```

- queryKey: `['leaderboard', groupId, period]`
- enabled when `groupId` is defined
- staleTime: TanStack default (60s) — leaderboards don't change second-by-second
- calls `supabase.rpc('get_group_leaderboard', { p_group_id, p_period })`

### 6.4 Components

- **`LeaderboardRow`** — full-width row with: rank pill on the left (number or "—"), avatar circle, `@username` + crown if owner, XP pill on the right. Self-row carries a subtle bg tint via `bg-primary-500/10`.
- **`LeaderboardPodium`** — top-3 this-week, home preview block. 1st place rendered slightly larger and centered with a `🥇` accent; 2nd-3rd flank it with `🥈` and `🥉`. The whole block is pressable and routes to `/groups/[id]/leaderboard`.
- **`PeriodTogglePill`** — controlled pill with two segments. Same visual language as the existing difficulty picker in the create-challenge screen (consistent UI rhythm).

### 6.5 Screen

`app/groups/[id]/leaderboard.tsx`:

- Header with `PeriodTogglePill` (default `this_week`)
- `FlatList` of `LeaderboardRow`
- Pull-to-refresh invalidates `['leaderboard', groupId, period]`
- Empty state ("No XP earned in this group yet — be the first") if every member is at 0

### 6.6 Group home insertion

Inside `app/groups/[id]/index.tsx`, between the existing `<GroupFeedSection>` and `<GroupChallengesSection>` blocks:

```tsx
<LeaderboardPodium
  groupId={group.id}
  onPress={() => router.push(`/groups/${group.id}/leaderboard`)}
/>
```

## 7. Analytics

3 new typed events in `EventPayloads`:

```ts
leaderboard_viewed: {
  group_id: string;
  period: LeaderboardPeriod;
  rows_shown: number;
}
leaderboard_period_switched: {
  group_id: string;
  from: LeaderboardPeriod;
  to: LeaderboardPeriod;
}
leaderboard_preview_tapped: {
  group_id: string;
}
```

## 8. i18n

`leaderboard.*` namespace in `en.json`:

```json
"leaderboard": {
  "screen": { "title": "Leaderboard" },
  "tabs": { "thisWeek": "This week", "allTime": "All-time" },
  "preview": { "title": "TOP THIS WEEK", "seeAll": "See all" },
  "empty": {
    "screen": "No XP earned in this group yet — be the first",
    "preview": "No XP this week yet"
  },
  "rank": { "noRank": "—" },
  "xp": "{{xp}} XP"
}
```

## 9. Error handling

- `42501` `not_a_member` → friendly "You're not a member of this group" message
- `28000` `Not authenticated` → re-prompt sign-in
- Any other RPC error → generic `auth.errors.generic` fallback (existing pattern)

## 10. Testing

`supabase/tests/group_leaderboard.test.sql` — 5 cases:

1. **Lifetime ranking:** 3 members with 30 / 50 / 70 XP — RPC returns 3 rows sorted desc, ranks 1/2/3.
2. **This-week excludes prior weeks:** member A earned 50 XP last week (backdated `completed_at`), member B earned 30 XP this week. This-week call returns B at rank 1 (30 XP) and A at the bottom with `rank = NULL` (0 XP this week).
3. **Tie-breaker:** two members both have 40 XP — earlier-joined member ranks higher.
4. **0-XP members:** a member with no completions in the group appears at the bottom with `rank = NULL`.
5. **RLS:** calling the RPC with a non-member's JWT raises `42501`.

No new Jest tests. The hook + components are structural; the existing Slice 2 pattern relies on SQL tests for RPC + RLS, and on TypeScript for component contracts.

## 11. Performance budget

- Group cap is 25 members (Slice 2 Plan 1 constraint), so the leaderboard query never scans more than `25 × <completions per member>` rows. With realistic numbers (a few hundred completions per group lifetime), the query plan is trivial — `idx_completions_group_date` from migration 0004 covers the predicate.
- Home preview pulls the same 25-row result and slices client-side to top-3; no extra round trip.
- No cache invalidation needed beyond the standard pull-to-refresh. Completion submissions don't trigger a leaderboard invalidate from the client; users either pull-to-refresh on the screen or wait the 60s staleTime.

## 12. Acceptance

Plan 3b ships when ALL of these are true:

- [ ] Migration 0021 applies cleanly via `supabase db reset`
- [ ] `supabase/tests/group_leaderboard.test.sql` passes (5 cases)
- [ ] Full 14-file SQL test sweep stays green (no regression on prior 13)
- [ ] `bun run typecheck` / `lint` / `test` exit 0
- [ ] Group home shows the top-3 this-week podium between the Activity section and the Challenges section
- [ ] Tapping the podium routes to `/groups/[id]/leaderboard`
- [ ] Leaderboard screen toggles between `this-week` and `all-time` without re-mounting
- [ ] Own row is visually highlighted
- [ ] Owner row shows a crown next to `@username`
- [ ] 0-XP members appear at the bottom with rank "—"
- [ ] Non-member calling the RPC gets `42501` (SQL-verified)
- [ ] 3 new analytics events fire via the typed registry
- [ ] `bunx expo export --platform ios` bundles successfully
- [ ] Committed + pushed to `main`

## 13. Deferred to Plan 3c or later

- Monthly leaderboard or last-30-days
- Group-vs-group cross-leaderboard
- Per-category leaderboards (fitness-only, study-only, etc.)
- Rank-change deltas ("↑ 2 spots since Monday")
- Realtime updates (Supabase channel)
- Personal-record callouts ("You just hit your highest weekly XP!")
- Animated podium reveal
- Sharing leaderboard standings (deep link)

---

## Self-review notes (applied while writing)

- The `row_number() over (...) filter (where ...)` syntax in §4.2 — Postgres supports `filter` on window functions only via 11+. Supabase is on PG 15+, so this is fine.
- Tie-breaker is enforced both in the `row_number()` window AND the outer `order by` to keep result stability even when the caller doesn't apply its own sort.
- The "non-member RPC raises 42501" guarantee is the explicit `is_group_member` check inside the RPC, not RLS. RLS on the joined tables would silently return an empty result — but a deliberate raise is more useful for the client because it can distinguish "no XP yet" from "you're not in this group".
- The XP total is `bigint` in SQL and coerces to `number` in JS via PostgREST. Since group XP is bounded by `25 members × ~1000 XP/challenge × ~10k challenges` ≈ 250M, comfortably within JS safe integer range.
- The home preview reads the same query result as the screen (limit 3 client-side from a 25-row result). No second RPC, no separate hook.
- No new migration to widen any existing RLS — `users_select_group_mates` from Plan 3a (migration 0017) is what makes the actor profile join legal here.
