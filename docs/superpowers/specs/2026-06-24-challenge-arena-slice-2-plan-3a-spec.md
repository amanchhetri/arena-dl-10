# Challenge Arena — Slice 2, Plan 3a: Group Feed + Streak Flame

**Status:** Approved 2026-06-24
**Owner:** Aman
**Scope:** Activity feed scoped to a group + group streak flame counter + UI on group home and a dedicated feed screen. Photos render inline (storage RLS widens to group-mates). **Excludes** leaderboard (Plan 3b), home assembly + final polish (Plan 3c), real-time, notifications, reactions.
**Companion to:** Slice 2 Plan 1 spec (groups foundation), Slice 2 Plan 2 spec (custom challenges), Slice 1 specs (Doc A/B/C).

---

## 1. What's in Plan 3a

| In                                                                                                                   | Out (later)                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `activity_events` table + index + RLS                                                                                | Group leaderboard (Plan 3b)                |
| Lenient group flame rule on `groups.current_streak` + `last_activity_date`                                           | Real-time feed (Slice 3)                   |
| `submit_completion` v2 — emits `challenge_completed`, conditional `level_up`, group-flame events in same transaction | Push notifications on flame risk (Slice 3) |
| Trigger on `group_members` insert → `joined_group` event (skipped for owner-on-create)                               | Per-event reactions / comments             |
| Nightly pg_cron at 03:30 UTC → resets dead flames + emits `group_flame_broken`                                       | Personal streak milestones in a solo feed  |
| Storage RLS widening: group-mates can read each other's `proof/` objects                                             | Solo feed of any kind                      |
| New screens: `<GroupFeedSection>` on group home + dedicated `/groups/[id]/feed`                                      | Final group home assembly (Plan 3c)        |
| 4 migrations (0017–0020), 2 SQL test files (10 cases), 3 client components, 1 API hook                               |                                            |

## 2. Locked design pillars

| Pillar                 | Decision                                                                                                            | Source                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Flame rule             | Lenient — any member completion that day grows the flame; flame breaks only on a day with zero activity             | Plan 3a brainstorm (Q1)                                             |
| Event types in Plan 3a | `challenge_completed`, `joined_group`, `level_up`, `group_flame_lit`, `group_flame_broken`, `group_flame_milestone` | Plan 3a brainstorm (Q2)                                             |
| Proof photo visibility | Inline in feed for group-mates via widened storage RLS                                                              | Plan 3a brainstorm (Q3)                                             |
| Data freshness         | Polling (foreground refetch + pull-to-refresh); no real-time in Plan 3a                                             | Doc B §B1 ("selective Realtime in Slice 3")                         |
| Pagination             | Last 50 events per group; no infinite scroll in Plan 3a                                                             | This spec                                                           |
| Privacy on break       | `group_flame_broken` names the day, never the user who missed                                                       | This spec, derived from Doc A §4 anti-toxicity guardrail            |
| Milestone steps        | 3, 7, 14, 30, 60, 100 days                                                                                          | This spec (matches personal-streak milestone pattern from Doc C §8) |
| Cron schedule          | Nightly 03:30 UTC (30 min after personal streak reset cron)                                                         | This spec, derived from Slice 1 Plan 4                              |

---

## 3. Schema

### 3.1 `activity_events` table (new)

```sql
-- 0017_activity_events.sql

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

-- Only group events are queryable; solo events would leak to all authenticated
-- users (group_id IS NULL ⇒ no group to check membership against). Plan 3a
-- doesn't write null-group events anyway (see §4.1), so this policy is the
-- safer of the two equivalent formulations.
create policy activity_events_select_members on public.activity_events
  for select to authenticated
  using (group_id is not null and public.is_group_member(group_id, auth.uid()));
```

Payload conventions:

| event_type              | payload shape                                               |
| ----------------------- | ----------------------------------------------------------- |
| `challenge_completed`   | `{ challenge_id, challenge_title, xp_awarded, proof_url? }` |
| `joined_group`          | `{}` (group_id + actor_user_id are enough)                  |
| `level_up`              | `{ from_level, to_level }`                                  |
| `group_flame_lit`       | `{}`                                                        |
| `group_flame_milestone` | `{ streak_length }`                                         |
| `group_flame_broken`    | `{ broken_at_streak }`                                      |

`target_id` is set for `challenge_completed` (= challenge_id) and `level_up` (= the completion id that triggered it). Other types leave it null.

### 3.2 `groups.current_streak` + `last_activity_date`

Already exist from Slice 2 Plan 1 (migration 0012) with defaults 0 / null. Plan 3a populates them via `submit_completion` v2 + nightly cron.

---

## 4. Trigger behavior

### 4.1 `submit_completion` v2 (replaces Slice 1 Plan 4 RPC)

The Slice 1 RPC is extended to emit activity events and update the group flame in the same transaction as the completion insert + XP award. The signature, validation, and existing return shape are unchanged. New side effects only.

After the existing logic completes successfully:

1. **Only if `v_challenge.group_id IS NOT NULL`** (the completion is on a group challenge): insert `challenge_completed` activity event with:
   - `actor_user_id = v_user_id`
   - `group_id = v_challenge.group_id`
   - `target_id = v_challenge.id`
   - `payload = jsonb_build_object('challenge_id', v_challenge.id, 'challenge_title', v_challenge.title, 'xp_awarded', v_challenge.xp_reward, 'proof_url', p_proof_url)`

   Solo (preset) completions do NOT emit events. Plan 3a has no solo feed; a NULL-`group_id` event would either be unviewable (correct RLS) or leak across all users (broken RLS) — easier to just not write them.

2. **If `level_changed` AND `v_challenge.group_id IS NOT NULL`:** insert `level_up` event with `payload = { from_level: v_old_level, to_level: v_new_level }`, `target_id = v_completion_id`, `group_id = v_challenge.group_id`. Same reasoning: no event for solo level-ups (no surface to display them on).
3. **If `v_challenge.group_id IS NOT NULL` (group challenge):** update the group flame using lenient rule:
   - Look up `groups.last_activity_date AS last_date, current_streak AS curr` for the group, `for update`.
   - Compute `today := (v_completion.completed_at at time zone 'UTC')::date`.
   - Branch:
     - `last_date IS NULL`: `current_streak = 1`, `last_activity_date = today`. Insert `group_flame_lit` event (`actor_user_id = v_user_id`, `group_id = v_challenge.group_id`).
     - `today = last_date`: no flame mutation. No flame event.
     - `today = last_date + 1`: `current_streak = curr + 1`, `last_activity_date = today`. If `curr + 1` in (3, 7, 14, 30, 60, 100): insert `group_flame_milestone` with `payload = { streak_length: curr + 1 }`.
     - `today > last_date + 1`: `current_streak = 1` (fresh flame), `last_activity_date = today`. **No event** — the break itself is announced by the nightly cron, not the recovery completion (keeps the "flame broke" moment temporally honest and matches what users saw at the time it happened).

### 4.2 `on_join_emit_event` trigger

```sql
create or replace function public.emit_joined_group_event()
returns trigger language plpgsql as $$
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
```

Owner-on-create is suppressed so "Mira created Hockey Squad → Mira joined Hockey Squad" doesn't both appear.

### 4.3 Nightly `reset_dead_group_flames()` + pg_cron

```sql
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
    select id, current_streak, created_by from public.groups
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

Notes:

- 03:30 UTC, 30 minutes after the personal streak cron from Slice 1 Plan 4 (03:00 UTC), to avoid concurrent `users` updates.
- `actor_user_id` defaults to `groups.created_by`. If the creator deleted their account (`created_by` is NULL via the existing `on delete set null`), we use the zero-UUID as a sentinel. The feed renderer treats `actor_user_id = '0000...'` as "anonymous / system" and omits the avatar.

### 4.4 Storage RLS widening

```sql
-- 0020_storage_group_proof.sql

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

Coexists with the existing `proof_select_own` policy (OR semantics on multiple SELECT policies).

---

## 5. Client architecture

### 5.1 New files

```
src/features/groups/
├── api/
│   └── useGroupFeed.ts                # NEW — list last 50 activity_events for a group
└── components/
    ├── ActivityEventRow.tsx           # NEW — polymorphic row renderer
    ├── GroupFlameChip.tsx             # NEW — header chip with current_streak
    └── GroupFeedSection.tsx           # NEW — group home preview block (10 rows + "See all")
```

Reuses unchanged:

- `useSignedProofUrl` from Slice 1 Plan 4 (for inline photo URLs).
- `useGroup`, `useGroupMembers` from Slice 2 Plan 1 (group home already loads these).

### 5.2 `useGroupFeed` shape

```ts
type ActivityEvent = {
  id: string;
  group_id: string;
  actor_user_id: string;
  event_type:
    | 'challenge_completed'
    | 'joined_group'
    | 'level_up'
    | 'group_flame_lit'
    | 'group_flame_broken'
    | 'group_flame_milestone';
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
};

function useGroupFeed(groupId: string | undefined, limit = 50): UseQueryResult<ActivityEvent[]>;
```

Query joins `activity_events` with `users` for the actor profile (RLS on `users` from Slice 1 Plan 3 allows reading own row; we'll need to verify whether RLS allows reading group-mates' profile rows — see §6 below).

### 5.3 New screen

`app/groups/[id]/feed.tsx` — full 50-event scrollable list with pull-to-refresh. Uses `<ActivityEventRow>` for each row.

### 5.4 Group home integration

Plan 3a does NOT do final group home assembly (that's Plan 3c). It DOES add:

- A `<GroupFlameChip />` to the existing group home header next to the group name.
- A `<GroupFeedSection />` block — placement is "above the existing GroupChallengesSection." Plan 3c will refine.

These additions are tracked in §10 acceptance criteria.

---

## 6. RLS gap to address in Plan 3a

The Slice 1 `users_select_own` policy currently only allows a user to read their OWN row. The feed renderer needs to display group-mate profiles (username, display_name, avatar_url). Plan 3a widens with:

```sql
-- Add to 0017_activity_events.sql (it's the natural home — group feed needs group profile data)

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

This is restrictive enough — only group-mates can read profile rows of group members. Non-group-mates still get zero rows.

The existing `users_select_own` policy continues to work (own row always visible).

---

## 7. Migration list

| File                               | Purpose                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `0017_activity_events.sql`         | Table + index + RLS + `users_select_group_mates` widening                                 |
| `0018_activity_event_triggers.sql` | `emit_joined_group_event` trigger + `reset_dead_group_flames` function + pg_cron schedule |
| `0019_submit_completion_v2.sql`    | Replace `submit_completion` with v2 that also emits events + updates flame                |
| `0020_storage_group_proof.sql`     | `proof_select_group_mates` storage policy                                                 |

Four small migrations rather than one giant one; failed migration is easier to bisect.

---

## 8. SQL tests

### 8.1 `supabase/tests/activity_events.test.sql` (8 cases)

1. Completion fires `challenge_completed` event with correct payload (challenge_id, title, xp_awarded, proof_url).
2. First completion of a fresh group: `group_flame_lit` event AND `current_streak = 1`.
3. Same-day second completion: no flame event, `current_streak` stays the same.
4. Consecutive-day completion: `current_streak` increments + `last_activity_date` advances; no `group_flame_lit` event (only the first one).
5. Milestone hit (`current_streak = 7`): `group_flame_milestone` event with `payload.streak_length = 7`.
6. Gap > 1 day: `current_streak` resets to 1, no event emitted by this completion (cron emits the break instead).
7. New member joining: `joined_group` event fires; owner-on-create does NOT.
8. `reset_dead_group_flames()` manually invoked: groups with `last_activity_date < current_date - 1` get `current_streak = 0` AND a `group_flame_broken` event.

### 8.2 `supabase/tests/proof_group_visibility.test.sql` (2 cases)

9. Group-mate A can read storage object at `proof/<member-B-id>/file.jpg` (via signed URL).
10. Non-group-mate cannot.

---

## 9. Analytics events (3 new)

```ts
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

Where they fire:

- `group_feed_viewed` — client-side, on `<GroupFeedSection>` first render per group home visit and on `/groups/[id]/feed` mount.
- `group_flame_grew` — client-side, when `useGroup` data shows `current_streak` increased since last seen value (compare against prev query data via TanStack's previous data hook).
- `group_flame_broke` — client-side, when `useGroupFeed` returns a new `group_flame_broken` event (detection via event id not seen before).

Server-side analytics (pg_notify → external pipe) is out of scope; we accept client-detected fire as the source of truth.

---

## 10. Acceptance criteria

- A user completes a group challenge → feed gains a `challenge_completed` row with the proof photo rendered inline. The group flame chip increments by 1 (or initializes to 1 if it was 0).
- Hitting `current_streak = 7` via the completion: a `group_flame_milestone` row appears alongside the `challenge_completed` row.
- A new member joins a group via invite code → all members see a `joined_group` row appear within one refetch.
- Owner creates a group → no `joined_group` row for the owner (suppressed by trigger).
- A group with no activity for 2 days → next 03:30 UTC, `current_streak` becomes 0 and a `group_flame_broken` event appears. (Verify by manually invoking `public.reset_dead_group_flames()` in the SQL test rather than waiting on the cron.)
- A non-member of a group sees 0 events when querying `activity_events` for that group (RLS verified).
- A non-group-mate of user B cannot fetch a signed URL for `proof/<B>/...` (storage RLS verified).
- A group-mate of user B sees user B's proof photo inline in the feed.
- A group-mate can see user B's display_name and username in the actor field of feed rows (`users_select_group_mates` policy).
- A non-group-mate cannot read user B's profile row (existing RLS preserves this).
- `bun run typecheck` / `lint` / `test` all green.
- `supabase db reset` applies migrations 0001–0020 cleanly.
- All 13 SQL test files pass (Slice 1+2's 11 + Plan 3a's 2).

---

## 11. Explicitly NOT in Plan 3a

- Group leaderboard → **Plan 3b**.
- Final group home layout assembly + pull-to-refresh + empty-state polish → **Plan 3c**.
- Real-time feed (Supabase Realtime channel) → Slice 3.
- Push notifications when group flame at risk of breaking → Slice 3.
- Per-event reactions (👍, 🔥) → Slice 3 polish.
- Comments on feed events → out of scope entirely.
- Solo / personal activity feed → never (Doc A's Home tab is challenge-list-focused).
- Personal streak milestones in solo feed → no solo feed exists.
- Server-side analytics emission (`pg_notify` to external pipeline) → out of scope.

---

## 12. Definition of done for this document

- Schema with column types, indexes, RLS, payload conventions. ✓
- Trigger behavior pseudocoded per branch. ✓
- All 4 migrations enumerated. ✓
- 10 SQL test cases enumerated. ✓
- Client architecture with files, hook shape, screen list. ✓
- Acceptance criteria are testable. ✓
- Privacy / RLS gaps addressed (`users_select_group_mates`). ✓
- Out-of-scope items explicit. ✓

**Next:** `writing-plans` skill produces `docs/superpowers/plans/2026-06-24-challenge-arena-slice-2-plan-3a-implementation.md`.
