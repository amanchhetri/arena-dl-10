# Challenge Arena — Slice 2, Plan 2: Custom Group Challenges

**Status:** Approved 2026-06-23
**Owner:** Aman
**Scope:** Group members can author challenges visible only to their group. XP is tier-locked (no arbitrary XP). Creator + group owner can edit; both can soft-delete. Group home gains a Challenges section; new screens for group catalog + create + edit. **Excludes** feed, leaderboard, streak flame (Plan 3), deadlines, video/peer proof, notifications.
**Companion to:** Slice 2 Plan 1 spec (groups foundation), Slice 1 specs (Doc A/B/C).

---

## 1. What's in Plan 2

| In                                                                                                                | Out (later plans)                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `create_group_challenge` / `update_group_challenge` / `delete_group_challenge` RPCs                               | Group feed (Plan 3)                            |
| Difficulty → XP mapping (server-computed)                                                                         | Group leaderboard (Plan 3)                     |
| `challenges_creator_consistency` CHECK constraint                                                                 | Group streak flame (Plan 3)                    |
| Widen `challenges` SELECT RLS to include group challenges for members                                             | Deadlines on group challenges                  |
| New screens: `/groups/[id]/catalog`, `/groups/[id]/create-challenge`, `/groups/[id]/edit-challenge/[challengeId]` | Custom XP overrides (never — anti-gaming)      |
| Group Home gains a "Challenges" preview section + "See all" link                                                  | Group challenge notifications (Slice 3)        |
| Reuse existing `ChallengeCard`, `useChallenge`, `useAcceptChallenge` (source-agnostic)                            | Per-member stats / who-completed-what (Plan 3) |
| 4 new API hooks + 2 new components                                                                                | Mentions / @-tagging in descriptions           |

## 2. Locked design pillars

| Pillar                | Decision                                                          | Source                                |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| Who can create        | Any group member                                                  | Plan 2 brainstorm (Q1)                |
| XP model              | Server-computed from difficulty tier; client cannot supply XP     | Plan 2 brainstorm (Q1)                |
| Tier → XP map         | Easy=30, Medium=50, Hard=70, Epic=120 (single value per tier)     | This spec                             |
| Visibility            | Members only via RLS (`is_group_member`)                          | Slice 2 Plan 1                        |
| XP destination        | Counts toward global `users.total_xp` (same as preset challenges) | Doc B §4.1, no separate group economy |
| Edit / delete         | Creator OR group owner; soft-delete via `is_active = false`       | This spec                             |
| Proof tiers in Plan 2 | `'honor'` and `'photo'` only (video + peer remain Slice 3 scope)  | Inherits from Slice 1                 |
| Deadline support      | None (`deadline_type = 'none'` always)                            | This spec                             |

---

## 3. Schema

Single migration adds one CHECK constraint. No new tables, no new columns.

```sql
-- 0015_group_challenges.sql
-- Custom group challenges already fit the existing `challenges` table —
-- group_id is just non-null. Add a consistency CHECK so preset rows
-- (created_by NULL) and custom rows (group_id NOT NULL) can't drift.

alter table public.challenges
  add constraint challenges_creator_consistency check (
    (created_by is null and group_id is null) or
    (created_by is not null and group_id is not null)
  );
```

Notes:

- The existing `challenges` row shape already supports both kinds. The constraint just makes the relationship explicit.
- The existing seed data (30 preset rows) satisfies the constraint: `created_by IS NULL AND group_id IS NULL`. No data migration needed.
- `is_active` already exists on `challenges` from Slice 1 migration 0002 and defaults `true`. We piggyback on it for soft delete.

---

## 4. RPCs

All `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`.

### 4.1 Difficulty → XP helper (inlined)

The mapping is small enough to inline in each RPC rather than create a separate function — three call sites, six values total. Pattern used in each RPC:

```sql
v_xp := case p_difficulty
  when 'easy'   then 30
  when 'medium' then 50
  when 'hard'   then 70
  when 'epic'   then 120
  else null
end;
```

### 4.2 `create_group_challenge(p_group_id, p_title, p_description, p_category, p_difficulty, p_proof_type)`

Returns: `jsonb` — `{ challenge_id }`.

Logic:

1. `auth.uid()` required (28000).
2. Caller must be a member of `p_group_id` (`is_group_member` returns false → 42501 `not_a_member`).
3. Validate inputs (each → 22023):
   - `p_title` trimmed length 1–80.
   - `p_description` if non-null, trimmed length ≤ 500.
   - `p_category` in `('fitness','study','dare','habit','creative','other')`.
   - `p_difficulty` in `('easy','medium','hard','epic')`.
   - `p_proof_type` in `('honor','photo')`.
4. Compute `v_xp` from `p_difficulty` per §4.1.
5. INSERT into `challenges` with `group_id = p_group_id`, `created_by = auth.uid()`, `xp_reward = v_xp`, `deadline_type = 'none'`, `is_active = true`.
6. Return `{ challenge_id: <new uuid> }`.

### 4.3 `update_group_challenge(p_challenge_id, p_title?, p_description?, p_difficulty?, p_proof_type?)`

Returns: `void`.

Logic:

1. Auth required.
2. Load the challenge. If not found OR `group_id` is null → 02000 `not_a_group_challenge`.
3. Check authorization: caller is `created_by` of the row OR is owner of `group_id` (via `group_members.role='owner'`). Else 42501 `not_authorized`.
4. At least one of the optional params must be non-null (22023 `no_change`).
5. If `p_title` provided: validate length, UPDATE.
6. If `p_description` provided: validate length, UPDATE.
7. If `p_proof_type` provided: validate enum, UPDATE.
8. If `p_difficulty` provided: validate enum, compute new XP, UPDATE both `difficulty` and `xp_reward`.

### 4.4 `delete_group_challenge(p_challenge_id)`

Returns: `void`.

Logic:

1. Auth required.
2. Load the challenge. If not found OR `group_id` is null → 02000.
3. Authorization same as §4.3 (creator or group owner).
4. UPDATE `is_active = false`. (No DELETE — preserves historical completions cleanly.)

---

## 5. RLS

The current Plan 3 of Slice 1 policy is `challenges_select_presets` which only allows preset rows. Replace with a broader policy that also allows group challenges visible to members.

```sql
drop policy challenges_select_presets on public.challenges;

create policy challenges_select_presets_or_group on public.challenges
  for select to authenticated
  using (
    (group_id is null and is_active = true)
    or
    (group_id is not null and is_active = true and public.is_group_member(group_id, auth.uid()))
  );
```

Effects:

- A non-member of a group cannot read its custom challenges.
- A member sees only `is_active = true` rows — soft-deleted rows disappear from queries.
- Presets continue to require `is_active = true` (was implicit in the old policy via the seed defaults).

INSERT/UPDATE/DELETE policies remain absent — all writes go through the three RPCs above.

---

## 6. UI surfaces

### 6.1 Group home (`/groups/[id]/index`) — additions

Insert a new "Challenges" section between the MemberAvatarRow and the InviteCodeCard:

- Section header: "CHALLENGES" + count badge (e.g., "3").
- If 0 active: empty state with emoji + "Create the first challenge" CTA → push to `/groups/[id]/create-challenge`.
- If 1+ active: render up to 3 `ChallengeCard`s, each tappable → push to `/challenge/[id]`. Below: "See all (N)" link → push to `/groups/[id]/catalog`.

### 6.2 `/groups/[id]/catalog` (new)

- Header: group name + theme accent + "Catalog".
- FloatingActionButton or top-right "+ New" button → `/groups/[id]/create-challenge`.
- FlatList of all active group challenges (same `ChallengeCard` from Slice 1).
- Each card has a long-press menu (or trailing kebab on each row) with: "Edit", "Delete" — only shown if caller is creator or owner.
- Empty state: same as home section.

### 6.3 `/groups/[id]/create-challenge` (new)

Form fields, top to bottom:

- Title (TextInput, 1–80, required, autofocus).
- Description (TextInput multiline, 0–500, optional).
- Category — horizontal scrolling `CategoryChip` row (reused from Slice 1 catalog).
- Difficulty — `DifficultyPicker` (new component): 4 chips labeled with XP preview ("Easy · +30 XP", "Medium · +50 XP", etc.).
- Proof type — two radio-like buttons: Honor / Photo.
- Sticky bottom Create button (disabled until title valid + category + difficulty + proof_type chosen).

On submit: call `useCreateGroupChallenge`, on success replace current screen with `/groups/[id]/catalog`.

### 6.4 `/groups/[id]/edit-challenge/[challengeId]` (new)

Same form as create, pre-filled from `useChallenge(challengeId)`. Title becomes "Edit Challenge". Submit calls `useUpdateGroupChallenge` with only changed fields.

A "Delete this challenge" destructive button at the bottom, behind an Alert confirmation. Calls `useDeleteGroupChallenge`, on success goes back to group catalog.

This screen is only reachable via the catalog row menu — and the menu only shows for creator + owner. RPCs are the server-side enforcement.

### 6.5 Solo Home + solo Catalog: mostly unchanged

- `useMyAccepts('accepted')` returns rows joined to `challenges` regardless of group_id, so accepted group challenges naturally appear in Home Today.
- **Plan 2 modification:** `useMyAccepts` needs to defensively `.filter(a => a.challenge != null)` because the RLS-filtered join will return `null` for any accept whose challenge has been soft-deleted (RLS hides `is_active=false` rows). Otherwise stale accepts crash `<ChallengeCard challenge={null} />`.
- `usePresetChallenges()` filters `is null group_id` and remains preset-only on Catalog tab.
- `useSuggestedChallenges()` also filters `is null group_id`. Plan 2 intentionally does NOT mix group challenges into Suggested — solo Home stays preset-anchored to avoid mental-model conflation.

---

## 7. Client architecture additions

```
src/features/groups/
├── api/
│   ├── useGroupChallenges.ts            # NEW — list active challenges for a group
│   ├── useCreateGroupChallenge.ts       # NEW
│   ├── useUpdateGroupChallenge.ts       # NEW
│   └── useDeleteGroupChallenge.ts       # NEW (soft delete)
└── components/
    ├── GroupChallengesSection.tsx       # NEW — for group home
    └── DifficultyPicker.tsx             # NEW — 4-chip picker w/ XP preview
```

Reuses unchanged:

- `ChallengeCard`, `CategoryChip`, `DifficultyBadge`, `ProofTypeIcon`
- `useChallenge`, `useAcceptChallenge`, `useMyAccept`, `useMyCompletion`

### `useGroupChallenges` shape

```ts
function useGroupChallenges(groupId: string | undefined): UseQueryResult<ChallengeRow[]>;
```

Filters `group_id = groupId AND is_active = true`. Sort by `created_at desc`. Backed by RLS — RLS denies non-members.

### Cache invalidation rules

| Mutation                  | Invalidates                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `useCreateGroupChallenge` | `['challenges', 'group', groupId]`                                          |
| `useUpdateGroupChallenge` | `['challenges', 'single', challengeId]`, `['challenges', 'group', groupId]` |
| `useDeleteGroupChallenge` | same as update                                                              |

---

## 8. Analytics events (3 new)

Add to `src/lib/analytics/events.ts`:

```ts
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

---

## 9. SQL tests (one new file)

`supabase/tests/group_challenges.test.sql` covers:

1. **Creator path:** member creates a Medium honor challenge → row exists with `xp_reward = 50`, `group_id` set, `created_by` set, `is_active = true`.
2. **Tier → XP mapping:** create one challenge per tier, verify XP is 30/50/70/120 respectively.
3. **Non-member can't create:** user not in group calling `create_group_challenge` → 42501.
4. **Bad inputs reject:** empty title, description > 500 chars, bad category, bad difficulty, bad proof_type, video proof_type, peer proof_type → all 22023 (or 22023 for video/peer which we explicitly reject as "not in Slice 2").
5. **Owner can update any group challenge** (creator is a non-owner member): owner updates difficulty Easy→Hard, verify `xp_reward` recomputed to 70.
6. **Non-creator non-owner member can't update:** another member calls update → 42501.
7. **Creator can delete own challenge:** `is_active` flips to false; challenge no longer visible via RLS-filtered SELECT.
8. **Owner can delete any group challenge.**
9. **Soft delete preserves completions:** create challenge, accept, complete, then delete → completion row still exists with the original `challenge_id`.
10. **Non-member can't read:** even with full `select * from challenges` they see 0 group rows for groups they're not in.

---

## 10. Acceptance criteria

- A group member creates a custom challenge → it appears in the group's catalog and the home's Challenges section, member_count of the group is unchanged.
- Owner of the group sees Edit + Delete affordances on every group challenge; non-owner members see Edit + Delete only on their own.
- Difficulty change in the edit form recomputes XP server-side; the new value shows on the card after invalidation.
- Soft-delete makes the challenge invisible in the catalog AND the home section, but anyone who had accepted it before delete can still see it on `/challenge/[id]` and submit proof (the `challenges` row with `is_active=false` is still loadable via `useChallenge` because the RLS policy filters reads; this gap is acceptable for Plan 2 — accepted users keep their work).

  _Important nuance:_ RLS hides `is_active=false` rows from `useChallenge` SELECT too. So accepted users lose access after delete. This is the simpler shipping behavior and matches the spec — owner/creator deletion is treated as "the challenge is gone, including from in-flight accepts". A future improvement could let in-flight completions finish, but Plan 2 keeps the simpler model.

- Accepted group challenges appear in Home Today.
- Solo Catalog stays preset-only.
- Non-member of a group cannot see its challenges (RLS verified by SQL test).
- 26th-member scenario (already in Slice 2 Plan 1) doesn't regress — adding challenges does not change member-count behavior.
- `bun run typecheck` / `lint` / `test` all green.
- `supabase db reset` applies 0001–0015 cleanly; all 11 SQL tests pass (Slice 1+2P1's 10 + Plan 2's 1).

---

## 11. Definition of done for this document

- Schema change (one CHECK constraint) specified with exact SQL. ✓
- All 3 RPCs specified with inputs, outputs, error codes, and authorization. ✓
- RLS policy change specified with both old and new policies. ✓
- All 4 new UI screens / sections enumerated with field-level detail. ✓
- Reused components and hooks called out explicitly. ✓
- 4 new API hooks + 2 new components in the file structure. ✓
- 3 new analytics events typed. ✓
- 10 SQL test cases enumerated. ✓
- Acceptance criteria are testable. ✓
- Out-of-scope items explicit. ✓

**Next:** `writing-plans` skill produces `docs/superpowers/plans/2026-06-23-challenge-arena-slice-2-plan-2-implementation.md`.
