# Challenge Arena — Slice 2, Plan 1: Groups Foundation

**Status:** Approved 2026-06-23
**Owner:** Aman
**Scope:** Groups table + group_members table + invite-code RPCs + Groups tab + create/join/leave/kick flows + group home + group settings + group members list. **Excludes** custom challenges (Plan 2), feed (Plan 3), leaderboard (Plan 3), group streak flame (Plan 3).
**Companion to:** Slice 1 specs (Doc A/B/C), Slice 2 Plan 2 spec (TBD), Slice 2 Plan 3 spec (TBD).

---

## 1. What's in Plan 1

| In                                                                           | Out (later plans)                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------- |
| `groups` + `group_members` tables                                            | Custom group challenges (Plan 2)                    |
| Seven RPCs: create / join / leave / kick / regenerate-code / update / delete | Group feed (Plan 3)                                 |
| Per-group RLS via `is_group_member()` helper                                 | Group leaderboard (Plan 3)                          |
| Groups tab in tab bar (4 tabs total)                                         | Group streak flame (Plan 3)                         |
| `/groups/[id]/index`, `/settings`, `/members`, `/create`, `/join` screens    | Onboarding invite-code step                         |
| Owner-can-kick, member-can-leave, owner-transfer-on-leave                    | Admin role (kept in enum, no UI)                    |
| 25-member cap + 5-group-per-user cap enforced server-side                    | Notifications on join (Slice 3)                     |
| Share invite code via native share sheet                                     | Group discovery / search (out of scope by Doc A §6) |

## 2. Locked design pillars

| Pillar            | Decision                                                                         | Source                                 |
| ----------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| Group size        | ≤25 members                                                                      | Slice 2 Plan 1 brainstorm              |
| Per-user cap      | ≤5 active memberships                                                            | Slice 2 Plan 1 brainstorm              |
| Invite code       | Fixed per group, regeneratable; `ARENA-XXXXXX` format                            | Slice 2 Plan 1 brainstorm + Doc B §4.2 |
| Leave / kick      | Hard delete; ownership transfers on owner leave; sole-member-leave deletes group | Slice 2 Plan 1 brainstorm              |
| Visibility        | Private. No discovery. Invite-code-only entry.                                   | Doc A §3                               |
| Roles in Plan 1   | `owner` + `member`. `admin` reserved in enum, unused.                            | Slice 2 Plan 1 brainstorm              |
| Charset for codes | `[A-HJ-NP-Z2-9]` (excludes `0OIL1` lookalikes), 6 chars, ~33 bits entropy        | This spec                              |

---

## 3. Schema

### 3.1 `groups` table (new)

```sql
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  theme text not null default 'purple' check (theme in (
    'purple', 'pink', 'cyan', 'flame', 'lime', 'gold'
  )),
  invite_code text unique not null,
  created_by uuid references public.users(id) on delete set null,
  current_streak int not null default 0,
  last_activity_date date,
  member_count int not null default 1,
  created_at timestamptz not null default now()
);

create index idx_groups_invite_code on public.groups (invite_code);

grant select, update, delete on public.groups to authenticated;
alter table public.groups enable row level security;
```

Notes:

- `created_by` is nullable (`on delete set null`) so deleting a user doesn't cascade-delete the groups they created. Member rows still cascade-delete via `group_members.user_id`.
- `current_streak` + `last_activity_date` remain at defaults in Plan 1. Plan 3 populates them.
- `member_count` is a denormalized counter maintained by trigger (see §3.3).

### 3.2 `group_members` table (new)

```sql
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index idx_group_members_user on public.group_members (user_id);
create index idx_group_members_group_role on public.group_members (group_id, role);

grant select on public.group_members to authenticated;
alter table public.group_members enable row level security;
```

Notes:

- INSERT/UPDATE/DELETE all go through RPCs only. Direct client writes denied.
- `admin` retained in the enum so Slice 3 / Slice 4 can promote without an `ALTER TYPE`.

### 3.3 Trigger: maintain `groups.member_count`

```sql
create or replace function public.update_group_member_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.groups set member_count = member_count - 1 where id = old.group_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_group_member_count
  after insert or delete on public.group_members
  for each row execute function public.update_group_member_count();
```

### 3.4 Deferred FK from Slice 1

```sql
-- challenge_completions.group_id has been nullable + unconstrained since
-- Slice 1 migration 0004. Add the FK now that public.groups exists.
alter table public.challenge_completions
  add constraint challenge_completions_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete set null;
```

---

## 4. RPCs

All RPCs are `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`. They are the only write path; RLS denies direct client mutations.

### 4.1 `is_group_member(p_group_id, p_user_id)` — helper

```sql
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;
```

Used by RLS policies. `SECURITY DEFINER` prevents recursive RLS evaluation between `groups` and `group_members`.

### 4.2 `create_group(p_name text, p_theme text default 'purple')`

Returns: `jsonb` — `{ group_id, invite_code }`.

Logic:

1. `auth.uid()` required (28000).
2. Caller's active membership count < 5 (54023 if exceeded — `'too_many_groups'`).
3. `p_name` length 1–40, trimmed (22023).
4. `p_theme` in allowed set (22023).
5. Mint unique `invite_code` (retry up to 5x on collision, then 23505).
6. Insert `groups` row, `created_by = auth.uid()`, `member_count` starts at 1 (trigger adds 1 from the owner insert below; account for this — set `member_count = 0` then trigger increments).

Actually, the cleanest path: insert `groups` row with `member_count = 0`, then insert `group_members` row for owner, trigger bumps to 1.

7. Insert `group_members(group_id, user_id=auth.uid(), role='owner')`.
8. Return `{ group_id, invite_code }`.

### 4.3 `join_group(p_invite_code text)`

Returns: `jsonb` — `{ group_id, member_count }`.

Logic:

1. Auth required.
2. Trim + uppercase the code (defensive against user pastes).
3. Look up `groups` row by `invite_code` (02000 if not found).
4. Already a member? → return success idempotently (no error, just return current state).
5. Caller's active membership count < 5 (54023).
6. Group's `member_count < 25` (54024 — `'group_full'`).
7. Insert `group_members(group_id, user_id, role='member')`.
8. Return `{ group_id, member_count }` (post-insert count).

### 4.4 `leave_group(p_group_id uuid)`

Returns: `jsonb` — `{ left: true, group_deleted: bool, new_owner: uuid? }`.

Logic:

1. Auth required.
2. Caller must be a member of `p_group_id` (42501).
3. Branch on caller role + group size:
   - **Not owner:** delete own `group_members` row. Return `{ left: true, group_deleted: false }`.
   - **Owner + sole member:** delete `groups` row (cascades members + sets `challenge_completions.group_id` to null). Return `{ left: true, group_deleted: true }`.
   - **Owner + others remain:** transfer ownership to longest-tenured non-owner member (`order by joined_at asc limit 1`). Set their `role='owner'`. Delete caller's `group_members` row. Return `{ left: true, group_deleted: false, new_owner: <uuid> }`.

### 4.5 `kick_member(p_group_id uuid, p_target_user_id uuid)`

Returns: `jsonb` — `{ kicked: true }`.

Logic:

1. Auth required.
2. Caller must be the **owner** of `p_group_id` (42501).
3. Target must be a member (42501 if not).
4. Target must not be the caller (`use leave_group` — error 42P05 `'self_kick_disallowed'`).
5. Delete target's `group_members` row.
6. Return `{ kicked: true }`.

### 4.6 `regenerate_invite_code(p_group_id uuid)`

Returns: `jsonb` — `{ invite_code }`.

Logic:

1. Auth required.
2. Caller must be the **owner** (42501).
3. Mint a new unique code (same charset, 5-retry collision handling).
4. UPDATE `groups.invite_code`. Return.

### 4.7 `update_group(p_group_id uuid, p_name text default null, p_theme text default null)`

Returns: `void`.

Logic:

1. Auth required.
2. Caller must be the **owner** (42501).
3. If `p_name` provided, validate length 1–40, set it.
4. If `p_theme` provided, validate enum, set it.
5. Both nullable means "no change" — at least one must be provided (22023 if both null).

### 4.8 `delete_group(p_group_id uuid)`

Returns: `void`.

Logic:

1. Auth required.
2. Caller must be the **owner** (42501).
3. Delete `groups` row. Cascade deletes all `group_members` rows and sets `challenge_completions.group_id = null` for any historical completions tied to this group.

Distinct from `leave_group`: leave-as-owner transfers ownership when others remain; `delete_group` is the explicit "shut down this group entirely" action even when populated. Both flows live on the settings screen — leave is the member-side affordance, delete is the owner-side affordance.

---

## 5. RLS policies

### 5.1 `groups`

```sql
-- SELECT: only members can see the group row.
create policy groups_select_members on public.groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()));
```

INSERT / UPDATE / DELETE: no policies → only `service_role` (which RPCs run as via `SECURITY DEFINER`) can write.

### 5.2 `group_members`

```sql
-- SELECT: only members of the same group.
create policy group_members_select_same_group on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));
```

INSERT / UPDATE / DELETE: no policies → RPC-only.

### 5.3 Cross-table effect

Once Plan 2 introduces group challenges, the existing `challenges_select_presets` policy needs widening to also allow group challenges visible to members. That's Plan 2's scope — flagged here for awareness, not changed in Plan 1.

---

## 6. UI surfaces

### 6.1 Tab bar grows to four

`app/(tabs)/_layout.tsx` adds:

```tsx
<Tabs.Screen
  name="groups"
  options={{
    title: t('tabs.groups'),
    tabBarIcon: ({ color }) => <Icon.Groups {...ICON_DEFAULTS} color={color as string} />,
  }}
/>
```

`Icon.Groups` is `UsersThree` from Phosphor (added to `src/lib/icons.ts`).

### 6.2 `/(tabs)/groups` — groups list

- Empty state: emoji + "No groups yet" + two CTAs ("Create" → `/groups/create`, "Join via code" → `/groups/join`).
- Populated state: scrollable list of `GroupCard` rows, max 5. Each shows: name, theme accent strip, member count ("8 of 25"), invite-code chip.
- Floating action button (FAB) at bottom-right: "+ Create or join" → action sheet with both choices.

### 6.3 `/groups/[id]/index` — group home

Layout (top to bottom):

- Header: back arrow + group name + theme color accent.
- Member-count chip: "8 of 25 members".
- Avatar row: first 5 member initials (truncated with "+N more").
- Invite-code card: prominently shows `ARENA-XYZ123`, has "Copy" + "Share" buttons.
- Owner-only Settings button (Phosphor `Gear` icon, top-right).
- "Coming soon" placeholder block for group feed/leaderboard (Plan 3).
- "Members" link → `/groups/[id]/members`.

### 6.4 `/groups/[id]/settings` — group settings

Owner-only items at top:

- Edit name (push to `/groups/[id]/edit-name`)
- Edit theme (push to `/groups/[id]/edit-theme`)
- Regenerate invite code (in-place button + confirmation modal)
- Delete group (destructive, in-place button + typed-confirmation modal)

Members see only:

- Leave group (destructive)

### 6.5 `/groups/[id]/members` — full member list

- Each row: avatar + display name + @username + role badge (`Owner` shown, `Member` hidden by default).
- Owner-only: per-row trailing "Kick" button (calls `kick_member` RPC, confirmation modal).
- "Leave group" button at the bottom.

### 6.6 `/groups/create` — create group modal

- Name input (1–40 chars).
- Theme picker: 6 swatches in a row (purple / pink / cyan / flame / lime / gold), one selected.
- Create button (disabled until name valid, busy state during RPC).
- On success: navigate to `/groups/[id]/index` with the new group.

### 6.7 `/groups/join` — join via code modal

- Code input (auto-uppercases, strips spaces, formats with `ARENA-` prefix shown as fixed prefix).
- Paste button.
- Join button (disabled until 6-char code after prefix).
- On success: navigate to `/groups/[id]/index`. On already-member: same destination (idempotent join).

---

## 7. Client architecture (new feature folder)

```
src/features/groups/
├── api/
│   ├── useMyGroups.ts                   # list current user's groups
│   ├── useGroup.ts                      # single group by id
│   ├── useGroupMembers.ts               # member list for a group
│   ├── useCreateGroup.ts                # mutation
│   ├── useJoinGroup.ts                  # mutation
│   ├── useLeaveGroup.ts                 # mutation
│   ├── useKickMember.ts                 # mutation
│   ├── useRegenerateInviteCode.ts       # mutation
│   ├── useUpdateGroup.ts                # mutation
│   ├── useShareInviteCode.ts            # RN Share API wrapper
│   └── useDeleteGroup.ts                # owner-only, calls delete_group RPC (see §4.8)
└── components/
    ├── GroupCard.tsx                    # row in /groups list
    ├── MemberAvatarRow.tsx              # first 5 initials + "+N more"
    ├── InviteCodeCard.tsx               # copy + share affordance
    ├── ThemePicker.tsx                  # 6-swatch picker
    └── KickConfirm.tsx                  # modal
```

`groups.tsx`, `create.tsx`, `join.tsx` live in `app/(tabs)/groups/` and `app/groups/...` respectively (Expo Router file-based).

---

## 8. Analytics events

Add to `src/lib/analytics/events.ts`:

```ts
group_created: {
  group_id: string;
  theme: string;
}
group_join_attempted: {
  code_present: boolean;
}
group_joined: {
  group_id: string;
  new_member_count: number;
}
group_left: {
  group_id: string;
  was_owner: boolean;
  group_deleted: boolean;
}
member_kicked: {
  group_id: string;
}
invite_code_regenerated: {
  group_id: string;
}
invite_code_shared: {
  group_id: string;
}
```

---

## 9. Acceptance criteria

Plan 1 ships when ALL of these are true:

- A signed-in user with 0 groups sees the empty state with two CTAs.
- Tapping "Create" + entering name "Hockey Squad" + theme "flame" + tapping Create → group exists, user is owner, invite code is visible, member count is 1.
- Tapping the invite-code Share button opens the native share sheet with `Join my Challenge Arena group: ARENA-XYZ123` text.
- A second user pasting the code into `/groups/join` → joins successfully → both users see each other in members list, member_count is 2.
- The owner can regenerate the code → new code shows up, old code in another browser tab fails to join with `'invite_code_not_found'`.
- The owner can kick the second user → second user's `group_members` row gone, member_count is 1.
- The second user re-joins with the (regenerated) code → works fine; their old data still attached (any completions on group challenges keep their `group_id`).
- A non-member trying to query `groups` table for the group's id returns 0 rows (RLS).
- The owner creates a 25-member group; the 26th join attempt errors with `'group_full'`.
- A user already in 5 groups attempting a 6th create or join errors with `'too_many_groups'`.
- The owner leaves a group with other members → ownership transfers to the longest-tenured member.
- The sole member of a group leaves → group is deleted; `challenge_completions.group_id` rows previously pointing to it are set to null.
- The owner of a populated group taps Delete → typed-confirmation passes → group is deleted; all members lose access; historical completions retain rows with `group_id = null`.
- All four screens (groups list, group home, settings, members) render correctly on iOS + Android.
- `bun run typecheck`, `bun run lint`, `bun run test` all pass.
- `supabase db reset` applies migrations 0001–0012 cleanly.
- New SQL test files cover: create/join/leave/kick happy paths + 6 edge cases (over-cap, full-group, double-join, non-owner-kick, self-kick, sole-member-leave).

---

## 10. Open questions deferred past Plan 1

- **Onboarding invite-code step** — promising for viral acquisition (Arjun-persona pulls invite from Insta DM), but not blocking. Add to Plan 1 backlog.
- **Admin role** — kept in enum, no UI/RPC path. Promote-to-admin lands when group size needs delegation.
- **Public group discovery** — explicitly out of Doc A scope; never.
- **Group avatars / banner image** — pure aesthetic. Theme color is enough for Plan 1.
- **Notifications on group events** (someone joined, you were kicked) — Slice 3 scope; flagged here for cross-slice awareness.
- **Multi-group digest notification** — when a user has 5 streak flames at risk, collapse into one notification. Slice 3 scope.

---

## 11. Definition of done for this document

- All schema changes specified with column types, constraints, indexes. ✓
- All RPCs specified with input shape, output shape, validation rules, error codes. ✓
- RLS policies specified for both new tables. ✓
- UI surfaces enumerated screen-by-screen. ✓
- Acceptance criteria are testable. ✓
- Analytics events defined. ✓
- Out-of-scope items explicit. ✓

**Next:** `writing-plans` skill produces the implementation plan that drops to `docs/superpowers/plans/2026-06-23-challenge-arena-slice-2-plan-1-implementation.md`.
