# Challenge Arena — Slice 2 Plan 1: Groups Foundation Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the groups foundation — tables, 7 RPCs, RLS, 4-tab navigation, group create/join/leave/kick/delete flows with a polished group home + settings + members screen — so users can form ≤25-member crews with shareable invite codes.

**Architecture:** Postgres-first. All writes through `SECURITY DEFINER` RPCs (no client-side `groups`/`group_members` inserts). RLS denies direct reads to non-members via `is_group_member()` helper. Client uses TanStack Query for fetching, optimistic for joins/leaves, hard-invalidate for everything else. Six new screens in Expo Router file structure (`app/(tabs)/groups`, `app/groups/create`, `app/groups/join`, `app/groups/[id]/index`, `app/groups/[id]/settings`, `app/groups/[id]/members`). One new feature folder `src/features/groups/`.

**Tech Stack:** Postgres (Supabase) + RLS + SQL RPCs; React Native + Expo Router; TanStack Query v5; Zustand (shared with Slice 1); NativeWind; Phosphor icons. No new external services.

## Global Constraints

- Group size cap: **≤25 members per group** (enforced server-side).
- Per-user cap: **≤5 active group memberships** (enforced server-side).
- Invite code format: `ARENA-XXXXXX` where `XXXXXX` is 6 chars from `[A-HJ-NP-Z2-9]` (excludes `0OIL1`).
- Theme allowed values: `'purple' | 'pink' | 'cyan' | 'flame' | 'lime' | 'gold'`.
- Roles in Plan 1: `'owner'` and `'member'` only (admin in enum, no paths).
- Group name: 1–40 chars, trimmed.
- Leave / kick: hard delete. Owner-leave transfers to longest-tenured member. Sole-member-leave deletes the group.
- All RPCs are `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated`.
- All Supabase calls live behind a TanStack hook under `src/features/groups/api/`.
- All user-facing strings via `i18n.t()` under `groups.*` and `tabs.groups`.
- New tab order: Home, Catalog, Groups, Profile.
- Plan 1 does NOT add the deferred-FK constraint on `challenge_completions.group_id` if the migration was already added in a follow-up — check first.

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx                       # MODIFIED — adds Groups tab
│   │   └── groups.tsx                        # NEW — groups list
│   └── groups/
│       ├── create.tsx                        # NEW
│       ├── join.tsx                          # NEW
│       └── [id]/
│           ├── _layout.tsx                   # NEW — nested stack
│           ├── index.tsx                     # NEW — group home
│           ├── settings.tsx                  # NEW
│           ├── members.tsx                   # NEW
│           ├── edit-name.tsx                 # NEW
│           └── edit-theme.tsx                # NEW
├── src/
│   ├── features/
│   │   └── groups/
│   │       ├── api/
│   │       │   ├── useMyGroups.ts            # NEW
│   │       │   ├── useGroup.ts               # NEW
│   │       │   ├── useGroupMembers.ts        # NEW
│   │       │   ├── useCreateGroup.ts         # NEW
│   │       │   ├── useJoinGroup.ts           # NEW
│   │       │   ├── useLeaveGroup.ts          # NEW
│   │       │   ├── useKickMember.ts          # NEW
│   │       │   ├── useRegenerateInviteCode.ts # NEW
│   │       │   ├── useUpdateGroup.ts         # NEW
│   │       │   ├── useDeleteGroup.ts         # NEW
│   │       │   └── useShareInviteCode.ts     # NEW
│   │       └── components/
│   │           ├── GroupCard.tsx             # NEW
│   │           ├── MemberAvatarRow.tsx       # NEW
│   │           ├── InviteCodeCard.tsx        # NEW
│   │           ├── ThemePicker.tsx           # NEW
│   │           └── ThemeAccent.tsx           # NEW — small theme color swatch util
│   ├── lib/
│   │   ├── icons.ts                          # MODIFIED — adds UsersThree, Gear, Copy
│   │   └── i18n/locales/en.json              # MODIFIED — adds groups.* + tabs.groups keys
│   ├── types/
│   │   └── database.ts                       # MODIFIED — adds Group + GroupMember types + RPC signatures
│   └── theme/
│       └── tokens.ts                         # MODIFIED — adds theme color map { purple: '#A855F7', pink: '#EC4899', cyan: '#06B6D4', flame: '#F97316', lime: '#84CC16', gold: '#F59E0B' }
├── supabase/
│   ├── migrations/
│   │   ├── 0012_groups_schema.sql            # NEW — tables + trigger + deferred FK
│   │   ├── 0013_group_rpcs.sql               # NEW — 7 RPCs + helper
│   │   └── 0014_groups_rls.sql               # NEW — RLS policies
│   └── tests/
│       ├── groups_schema.test.sql            # NEW — table shape + trigger
│       ├── group_rpcs.test.sql               # NEW — all 7 RPCs + edge cases
│       └── groups_rls.test.sql               # NEW — RLS visibility
```

**Decomposition rationale:**

- Three SQL migrations split by concern: schema/triggers, RPC logic, RLS. Each migration has its own test file so failures pin the cause.
- All 11 hooks live together — each is a thin wrapper but together they form the feature's API surface.
- 5 components are extracted because each renders in 2+ screens (e.g., `MemberAvatarRow` in group home + members, `ThemePicker` in create + edit-theme).
- `theme/tokens.ts` getting a theme color map is the right home because the values must be consumable from JS (for ThemePicker swatches and group home accent), not just Tailwind classes.

---

## Task 1: Migration 0012 — schema + trigger + deferred FK

**Files:**

- Create: `supabase/migrations/0012_groups_schema.sql`, `supabase/tests/groups_schema.test.sql`

**Interfaces:**

- Produces: `public.groups`, `public.group_members` tables exist with grants for `authenticated`. `update_group_member_count` trigger active. `challenge_completions_group_id_fkey` constraint added.

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/groups_schema.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

-- 1. Tables exist
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='groups') then
    raise exception 'FAIL: public.groups missing'; end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='group_members') then
    raise exception 'FAIL: public.group_members missing'; end if;
end $$;

-- 2. Provision a test user via auth (handle_new_auth_user populates public.users)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-2222-3333-4444-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'g1@local', '', now(), now());

-- 3. Insert a group; member_count starts at 0
insert into public.groups (name, invite_code, created_by, member_count)
values ('Test Crew', 'ARENA-AAAAAA', '11111111-2222-3333-4444-555555555555', 0)
returning id \gset g_

-- 4. Insert owner; trigger should bump member_count to 1
insert into public.group_members (group_id, user_id, role)
values (:'g_id', '11111111-2222-3333-4444-555555555555', 'owner');

do $$
declare c int;
begin
  select member_count into c from public.groups where invite_code='ARENA-AAAAAA';
  if c != 1 then raise exception 'FAIL: trigger should bump member_count to 1, got %', c; end if;
end $$;

-- 5. Insert another user; member_count → 2
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('22222222-3333-4444-5555-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'g2@local', '', now(), now());
insert into public.group_members (group_id, user_id, role)
values (:'g_id', '22222222-3333-4444-5555-666666666666', 'member');

do $$
declare c int;
begin
  select member_count into c from public.groups where invite_code='ARENA-AAAAAA';
  if c != 2 then raise exception 'FAIL: trigger should bump member_count to 2, got %', c; end if;
end $$;

-- 6. Delete a member; member_count → 1
delete from public.group_members
  where group_id=:'g_id' and user_id='22222222-3333-4444-5555-666666666666';

do $$
declare c int;
begin
  select member_count into c from public.groups where invite_code='ARENA-AAAAAA';
  if c != 1 then raise exception 'FAIL: trigger should decrement member_count to 1, got %', c; end if;
end $$;

-- 7. Theme constraint rejects invalid value
do $$ begin
  begin
    insert into public.groups (name, theme, invite_code, created_by)
    values ('X', 'rainbow', 'ARENA-XXXXXX', '11111111-2222-3333-4444-555555555555');
    raise exception 'FAIL: invalid theme should reject';
  exception when check_violation then end;
end $$;

-- 8. Name length constraint
do $$ begin
  begin
    insert into public.groups (name, invite_code, created_by)
    values ('', 'ARENA-YYYYYY', '11111111-2222-3333-4444-555555555555');
    raise exception 'FAIL: empty name should reject';
  exception when check_violation then end;
end $$;

-- Cleanup
delete from public.group_members where group_id=:'g_id';
delete from public.groups where id=:'g_id';
delete from public.users where id in (
  '11111111-2222-3333-4444-555555555555',
  '22222222-3333-4444-5555-666666666666'
);
delete from auth.users where id in (
  '11111111-2222-3333-4444-555555555555',
  '22222222-3333-4444-5555-666666666666'
);

commit;
select 'TEST PASS: groups_schema' as result;
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/groups_schema.test.sql
```

Expected: FAIL — `public.groups missing`.

- [ ] **Step 3: Write migration**

Create `supabase/migrations/0012_groups_schema.sql`:

```sql
-- 0012_groups_schema.sql
-- Groups + group_members tables, member_count trigger, deferred FK from
-- challenge_completions.group_id (was added in Slice 1 without a constraint).

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  theme text not null default 'purple' check (theme in (
    'purple', 'pink', 'cyan', 'flame', 'lime', 'gold'
  )),
  invite_code text unique not null,
  created_by uuid references public.users(id) on delete set null,
  current_streak int not null default 0,
  last_activity_date date,
  member_count int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_groups_invite_code on public.groups (invite_code);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index idx_group_members_user on public.group_members (user_id);
create index idx_group_members_group_role on public.group_members (group_id, role);

-- Grants (RLS policies in 0014 narrow these per-row).
grant select, update, delete on public.groups to authenticated;
grant select on public.group_members to authenticated;

-- Trigger: maintain groups.member_count
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

-- Add the deferred FK from Slice 1 migration 0004.
alter table public.challenge_completions
  add constraint challenge_completions_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete set null;
```

- [ ] **Step 4: Apply + verify**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/groups_schema.test.sql
```

Expected: `TEST PASS: groups_schema`.

- [ ] **Step 5: Smoke-check all earlier SQL tests still pass**

```bash
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

All should still end with `TEST PASS: ...`.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(db): groups + group_members tables + member_count trigger (0012)"
```

---

## Task 2: Migration 0013 — RPCs + Database types

**Files:**

- Create: `supabase/migrations/0013_group_rpcs.sql`, `supabase/tests/group_rpcs.test.sql`
- Modify: `src/types/database.ts`

**Interfaces:**

- Produces:
  - `is_group_member(p_group_id, p_user_id) → boolean` (SECURITY DEFINER, for RLS).
  - `create_group(p_name, p_theme) → jsonb { group_id, invite_code }`.
  - `join_group(p_invite_code) → jsonb { group_id, member_count }`.
  - `leave_group(p_group_id) → jsonb { left, group_deleted, new_owner }`.
  - `kick_member(p_group_id, p_target_user_id) → jsonb { kicked }`.
  - `regenerate_invite_code(p_group_id) → jsonb { invite_code }`.
  - `update_group(p_group_id, p_name?, p_theme?) → void`.
  - `delete_group(p_group_id) → void`.
- `Database['public']['Functions']` extended with all 7 RPC signatures.

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/group_rpcs.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

-- Provision 7 test users
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select
  ('aaaaaaaa-0000-0000-0000-00000000000' || i)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'rpc' || i || '@local', '', now(), now()
from generate_series(1, 7) as i;

-- Set each to JWT
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

-- 1. create_group happy path
do $$
declare result jsonb;
declare gid uuid;
declare code text;
begin
  select public.create_group('Crew One', 'flame') into result;
  gid := (result->>'group_id')::uuid;
  code := result->>'invite_code';
  if code is null then raise exception 'FAIL: invite_code missing'; end if;
  if not (code like 'ARENA-%') then raise exception 'FAIL: invite_code shape wrong: %', code; end if;
  if (select member_count from public.groups where id=gid) != 1 then
    raise exception 'FAIL: member_count should be 1 after create'; end if;
  if (select role from public.group_members where group_id=gid and user_id='aaaaaaaa-0000-0000-0000-000000000001') != 'owner' then
    raise exception 'FAIL: creator should be owner'; end if;
end $$;

-- 2. create_group name too short rejects
do $$ begin
  begin
    perform public.create_group('', 'purple');
    raise exception 'FAIL: empty name should reject';
  exception when sqlstate '22023' then end;
end $$;

-- 3. create_group bad theme rejects
do $$ begin
  begin
    perform public.create_group('X', 'rainbow');
    raise exception 'FAIL: bad theme should reject';
  exception when sqlstate '22023' then end;
end $$;

-- Create 4 more groups for user 1 to hit the 5-group cap (already at 1)
do $$
declare i int;
begin
  for i in 2..5 loop
    perform public.create_group('Crew ' || i, 'purple');
  end loop;
end $$;

-- 4. 6th group rejects with too_many_groups
do $$ begin
  begin
    perform public.create_group('Crew 6', 'purple');
    raise exception 'FAIL: 6th group should reject';
  exception when sqlstate '54023' then end;
end $$;

-- Pull one of user 1's invite codes for join test
\set crew_one_code (select invite_code from public.groups where name='Crew One' limit 1)

-- Switch to user 2
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';

-- 5. join_group happy path
do $$
declare result jsonb;
declare code text;
begin
  select invite_code into code from public.groups where name='Crew One';
  select public.join_group(code) into result;
  if (result->>'member_count')::int != 2 then
    raise exception 'FAIL: member_count should be 2 after join, got %', result->>'member_count'; end if;
end $$;

-- 6. join_group double-join is idempotent (no error)
do $$
declare result jsonb;
declare code text;
begin
  select invite_code into code from public.groups where name='Crew One';
  select public.join_group(code) into result;
  -- Should still return success with current count, not error
  if (result->>'group_id') is null then raise exception 'FAIL: double-join should be idempotent'; end if;
end $$;

-- 7. join_group bad code
do $$ begin
  begin
    perform public.join_group('ARENA-NOPE99');
    raise exception 'FAIL: bad code should reject';
  exception when sqlstate '02000' then end;
end $$;

-- Fill Crew One to 25 members (already 2; need 23 more — use users 3-25)
reset role;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select
  ('bbbbbbbb-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'fill' || i || '@local', '', now(), now()
from generate_series(3, 25) as i;

do $$
declare code text;
declare uid uuid;
begin
  select invite_code into code from public.groups where name='Crew One';
  for i in 3..25 loop
    uid := ('bbbbbbbb-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    execute format($q$ set local "request.jwt.claims" = '{"sub":"%s","role":"authenticated"}' $q$, uid);
    set local role authenticated;
    perform public.join_group(code);
    reset role;
  end loop;
end $$;

-- 8. 26th join rejects with group_full
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('cccccccc-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fill26@local', '', now(), now());

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"cccccccc-0000-0000-0000-000000000026","role":"authenticated"}';

do $$ begin
  begin
    perform public.join_group((select invite_code from public.groups where name='Crew One'));
    raise exception 'FAIL: 26th join should reject';
  exception when sqlstate '54024' then end;
end $$;

reset role;

-- 9. kick_member: user 1 (owner) kicks user 2 from Crew One
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare gid uuid;
declare result jsonb;
begin
  select id into gid from public.groups where name='Crew One';
  select public.kick_member(gid, 'aaaaaaaa-0000-0000-0000-000000000002') into result;
  if (result->>'kicked')::bool != true then raise exception 'FAIL: kick should succeed'; end if;
  if exists (select 1 from public.group_members where group_id=gid and user_id='aaaaaaaa-0000-0000-0000-000000000002') then
    raise exception 'FAIL: kicked user still in group_members'; end if;
end $$;

-- 10. kick_member: non-owner can't kick
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"bbbbbbbb-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Crew One';
  begin
    perform public.kick_member(gid, 'bbbbbbbb-0000-0000-0000-000000000004');
    raise exception 'FAIL: non-owner kick should reject';
  exception when sqlstate '42501' then end;
end $$;

-- 11. kick_member: can't kick self
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Crew One';
  begin
    perform public.kick_member(gid, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FAIL: self-kick should reject';
  exception when sqlstate '42P05' then end;
end $$;

-- 12. regenerate_invite_code: owner can, code changes
do $$
declare gid uuid;
declare old_code text;
declare result jsonb;
declare new_code text;
begin
  select id, invite_code into gid, old_code from public.groups where name='Crew One';
  select public.regenerate_invite_code(gid) into result;
  new_code := result->>'invite_code';
  if new_code = old_code then raise exception 'FAIL: regenerated code matches old'; end if;
  if (select invite_code from public.groups where id=gid) != new_code then
    raise exception 'FAIL: invite_code not updated'; end if;
end $$;

-- 13. update_group: owner can edit name + theme
do $$
declare gid uuid;
begin
  select id into gid from public.groups where name='Crew One';
  perform public.update_group(gid, 'Crew One Renamed', 'lime');
  if (select name from public.groups where id=gid) != 'Crew One Renamed' then
    raise exception 'FAIL: name not updated'; end if;
  if (select theme from public.groups where id=gid) != 'lime' then
    raise exception 'FAIL: theme not updated'; end if;
end $$;

-- 14. leave_group: ownership transfers when owner leaves populated group
do $$
declare gid uuid;
declare result jsonb;
declare new_owner uuid;
begin
  select id into gid from public.groups where name='Crew One Renamed';
  select public.leave_group(gid) into result;
  if (result->>'group_deleted')::bool != false then raise exception 'FAIL: should not delete populated group'; end if;
  new_owner := (result->>'new_owner')::uuid;
  if new_owner is null then raise exception 'FAIL: new_owner missing'; end if;
  if (select role from public.group_members where group_id=gid and user_id=new_owner) != 'owner' then
    raise exception 'FAIL: new_owner does not have owner role'; end if;
end $$;

-- 15. leave_group: sole-member leave deletes the group
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid;
declare result jsonb;
begin
  -- User 1 still owns Crew 2..5 (sole member each)
  select id into gid from public.groups where name='Crew 2';
  select public.leave_group(gid) into result;
  if (result->>'group_deleted')::bool != true then
    raise exception 'FAIL: sole-member leave should delete group'; end if;
  if exists (select 1 from public.groups where id=gid) then
    raise exception 'FAIL: group still exists after sole-member leave'; end if;
end $$;

-- 16. delete_group: owner can delete populated group
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid;
begin
  -- Create a small populated group
  declare result jsonb;
  begin
    select public.create_group('To Delete', 'cyan') into result;
    gid := (result->>'group_id')::uuid;
  end;
  -- Have user 6 join it
  reset role;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000006","role":"authenticated"}';
  perform public.join_group((select invite_code from public.groups where id=gid));
  -- Owner deletes
  reset role;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
  perform public.delete_group(gid);
  if exists (select 1 from public.groups where id=gid) then
    raise exception 'FAIL: delete_group did not remove the group'; end if;
end $$;

reset role;

-- Cleanup
delete from public.group_members where user_id in (
  select id from auth.users where email like 'rpc%@local' or email like 'fill%@local'
);
delete from public.groups where created_by in (
  select id from auth.users where email like 'rpc%@local'
);
delete from public.users where id in (
  select id from auth.users where email like 'rpc%@local' or email like 'fill%@local'
);
delete from auth.users where email like 'rpc%@local' or email like 'fill%@local';

commit;
select 'TEST PASS: group_rpcs' as result;
```

- [ ] **Step 2: Run to verify failure**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/group_rpcs.test.sql
```

Expected: FAIL — RPCs don't exist yet.

- [ ] **Step 3: Write migration 0013**

Create `supabase/migrations/0013_group_rpcs.sql`:

```sql
-- 0013_group_rpcs.sql
-- All RPCs for group lifecycle. SECURITY DEFINER bypasses RLS for these
-- controlled mutation paths; client never inserts/updates groups directly.

-- Helper used by RLS policies in 0014. SECURITY DEFINER avoids recursive RLS
-- evaluation between groups and group_members.
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;

-- Generate a unique invite code from charset that excludes 0OIL1 lookalikes.
create or replace function public.mint_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempts int := 0;
begin
  loop
    v_code := 'ARENA-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + (random() * length(v_chars))::int, 1);
    end loop;
    if not exists (select 1 from public.groups where invite_code = v_code) then
      return v_code;
    end if;
    v_attempts := v_attempts + 1;
    if v_attempts > 5 then
      raise exception 'Could not mint a unique invite code after 5 attempts' using errcode = '23505';
    end if;
  end loop;
end;
$$;

-- 4.2 create_group
create or replace function public.create_group(
  p_name text,
  p_theme text default 'purple'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_name);
  v_code text;
  v_group_id uuid;
  v_existing_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Group name must be 1-40 chars' using errcode = '22023';
  end if;
  if p_theme not in ('purple','pink','cyan','flame','lime','gold') then
    raise exception 'Invalid theme' using errcode = '22023';
  end if;

  select count(*) into v_existing_count from public.group_members where user_id = v_user_id;
  if v_existing_count >= 5 then
    raise exception 'too_many_groups' using errcode = '54023';
  end if;

  v_code := public.mint_invite_code();

  insert into public.groups (name, theme, invite_code, created_by, member_count)
    values (v_name, p_theme, v_code, v_user_id, 0)
    returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_user_id, 'owner');

  return jsonb_build_object('group_id', v_group_id, 'invite_code', v_code);
end;
$$;

grant execute on function public.create_group(text, text) to authenticated;

-- 4.3 join_group
create or replace function public.join_group(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(p_invite_code));
  v_group record;
  v_user_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select id, member_count into v_group from public.groups where invite_code = v_code;
  if not found then
    raise exception 'invite_code_not_found' using errcode = '02000';
  end if;

  -- Idempotent: already a member
  if exists (select 1 from public.group_members where group_id = v_group.id and user_id = v_user_id) then
    return jsonb_build_object('group_id', v_group.id, 'member_count', v_group.member_count);
  end if;

  if v_group.member_count >= 25 then
    raise exception 'group_full' using errcode = '54024';
  end if;

  select count(*) into v_user_count from public.group_members where user_id = v_user_id;
  if v_user_count >= 5 then
    raise exception 'too_many_groups' using errcode = '54023';
  end if;

  insert into public.group_members (group_id, user_id, role)
    values (v_group.id, v_user_id, 'member');

  return jsonb_build_object('group_id', v_group.id, 'member_count', v_group.member_count + 1);
end;
$$;

grant execute on function public.join_group(text) to authenticated;

-- 4.4 leave_group
create or replace function public.leave_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_other_member_count int;
  v_new_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if v_caller_role = 'owner' then
    select count(*) into v_other_member_count
      from public.group_members where group_id = p_group_id and user_id != v_user_id;

    if v_other_member_count = 0 then
      -- Sole member; delete the group (cascades members)
      delete from public.groups where id = p_group_id;
      return jsonb_build_object('left', true, 'group_deleted', true);
    end if;

    -- Transfer ownership to longest-tenured non-owner member
    select user_id into v_new_owner from public.group_members
      where group_id = p_group_id and user_id != v_user_id
      order by joined_at asc limit 1;
    update public.group_members set role = 'owner'
      where group_id = p_group_id and user_id = v_new_owner;
    delete from public.group_members where group_id = p_group_id and user_id = v_user_id;

    return jsonb_build_object(
      'left', true, 'group_deleted', false, 'new_owner', v_new_owner
    );
  end if;

  -- Plain member leaving
  delete from public.group_members where group_id = p_group_id and user_id = v_user_id;
  return jsonb_build_object('left', true, 'group_deleted', false);
end;
$$;

grant execute on function public.leave_group(uuid) to authenticated;

-- 4.5 kick_member
create or replace function public.kick_member(
  p_group_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_target_user_id = v_user_id then
    raise exception 'self_kick_disallowed' using errcode = '42P05';
  end if;

  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_target_user_id
  ) then
    raise exception 'target_not_member' using errcode = '42501';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_target_user_id;
  return jsonb_build_object('kicked', true);
end;
$$;

grant execute on function public.kick_member(uuid, uuid) to authenticated;

-- 4.6 regenerate_invite_code
create or replace function public.regenerate_invite_code(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_new_code text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  v_new_code := public.mint_invite_code();
  update public.groups set invite_code = v_new_code where id = p_group_id;
  return jsonb_build_object('invite_code', v_new_code);
end;
$$;

grant execute on function public.regenerate_invite_code(uuid) to authenticated;

-- 4.7 update_group
create or replace function public.update_group(
  p_group_id uuid,
  p_name text default null,
  p_theme text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_name is null and p_theme is null then
    raise exception 'no_change' using errcode = '22023';
  end if;
  if v_name is not null then
    if char_length(v_name) > 40 then
      raise exception 'name_too_long' using errcode = '22023';
    end if;
    update public.groups set name = v_name where id = p_group_id;
  end if;
  if p_theme is not null then
    if p_theme not in ('purple','pink','cyan','flame','lime','gold') then
      raise exception 'invalid_theme' using errcode = '22023';
    end if;
    update public.groups set theme = p_theme where id = p_group_id;
  end if;
end;
$$;

grant execute on function public.update_group(uuid, text, text) to authenticated;

-- 4.8 delete_group
create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_role text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select role into v_caller_role
    from public.group_members where group_id = p_group_id and user_id = v_user_id;
  if not found or v_caller_role != 'owner' then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  delete from public.groups where id = p_group_id;
end;
$$;

grant execute on function public.delete_group(uuid) to authenticated;
```

- [ ] **Step 4: Apply + verify SQL test passes**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/groups_schema.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/group_rpcs.test.sql
```

Expected: both end with `TEST PASS`.

- [ ] **Step 5: Extend Database type**

In `src/types/database.ts`, replace the `Functions` block with the existing entries PLUS the new ones:

```ts
    Functions: {
      users_finalize_username: {
        Args: { p_username: string; p_user_id?: string };
        Returns: void;
      };
      is_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: void;
      };
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
      create_group: {
        Args: { p_name: string; p_theme?: string };
        Returns: { group_id: string; invite_code: string };
      };
      join_group: {
        Args: { p_invite_code: string };
        Returns: { group_id: string; member_count: number };
      };
      leave_group: {
        Args: { p_group_id: string };
        Returns: { left: boolean; group_deleted: boolean; new_owner?: string };
      };
      kick_member: {
        Args: { p_group_id: string; p_target_user_id: string };
        Returns: { kicked: boolean };
      };
      regenerate_invite_code: {
        Args: { p_group_id: string };
        Returns: { invite_code: string };
      };
      update_group: {
        Args: { p_group_id: string; p_name?: string | null; p_theme?: string | null };
        Returns: void;
      };
      delete_group: {
        Args: { p_group_id: string };
        Returns: void;
      };
    };
```

Also add the table types to `Database['public']['Tables']`:

```ts
groups: {
  Row: GroupRow;
  Insert: Partial<GroupRow> & Pick<GroupRow, 'name' | 'invite_code'>;
  Update: Partial<GroupRow>;
}
group_members: {
  Row: GroupMemberRow;
  Insert: Partial<GroupMemberRow> & Pick<GroupMemberRow, 'group_id' | 'user_id'>;
  Update: Partial<GroupMemberRow>;
}
```

And add the row interfaces near the top of `src/types/database.ts` (alongside `UserRow`, etc.):

```ts
export type GroupTheme = 'purple' | 'pink' | 'cyan' | 'flame' | 'lime' | 'gold';
export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupRow {
  id: string;
  name: string;
  theme: GroupTheme;
  invite_code: string;
  created_by: string | null;
  current_streak: number;
  last_activity_date: string | null;
  member_count: number;
  created_at: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(db): 7 group RPCs + is_group_member helper + Database types (0013)"
```

---

## Task 3: Migration 0014 — RLS policies

**Files:**

- Create: `supabase/migrations/0014_groups_rls.sql`, `supabase/tests/groups_rls.test.sql`

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/groups_rls.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls_a@local', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls_b@local', '', now(), now());

-- User A creates a group
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare result jsonb;
begin
  select public.create_group('Secret Crew', 'pink') into result;
end $$;

-- User B (not a member) sees zero groups
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.groups where name='Secret Crew';
  if n != 0 then raise exception 'FAIL: non-member should see 0 groups, saw %', n; end if;

  select count(*) into n from public.group_members
    where group_id = (select id from public.groups);
  -- The above will see 0 because the inner select itself is RLS-filtered.
  if n != 0 then raise exception 'FAIL: non-member should see 0 group_members, saw %', n; end if;
end $$;

-- User A sees their group
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.groups where name='Secret Crew';
  if n != 1 then raise exception 'FAIL: owner should see 1 group, saw %', n; end if;

  select count(*) into n from public.group_members;
  if n != 1 then raise exception 'FAIL: owner should see 1 group_member row, saw %', n; end if;
end $$;

reset role;

-- Cleanup
delete from public.group_members where user_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
delete from public.groups where created_by in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
delete from public.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

commit;
select 'TEST PASS: groups_rls' as result;
```

- [ ] **Step 2: Run to verify failure**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/groups_rls.test.sql
```

Expected: FAIL — non-member sees 1 instead of 0 (no RLS yet).

- [ ] **Step 3: Write migration**

Create `supabase/migrations/0014_groups_rls.sql`:

```sql
-- 0014_groups_rls.sql
-- RLS policies for groups + group_members. Read access scoped to membership;
-- mutations are RPC-only (no INSERT/UPDATE/DELETE policies).

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy groups_select_members on public.groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()));

create policy group_members_select_same_group on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));
```

- [ ] **Step 4: Apply + verify**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/groups_schema.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/group_rpcs.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/groups_rls.test.sql
```

All three should end with `TEST PASS: ...`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): RLS on groups + group_members (0014)"
```

---

## Task 4: API hooks (11 hooks)

**Files:**

- Create: `src/features/groups/api/useMyGroups.ts`, `useGroup.ts`, `useGroupMembers.ts`, `useCreateGroup.ts`, `useJoinGroup.ts`, `useLeaveGroup.ts`, `useKickMember.ts`, `useRegenerateInviteCode.ts`, `useUpdateGroup.ts`, `useDeleteGroup.ts`, `useShareInviteCode.ts`

**Interfaces:**

- Produces:
  - `useMyGroups()` → `Query<GroupWithMembership[]>` where each row joins the group + caller's role.
  - `useGroup(id)` → `Query<GroupRow | null>`.
  - `useGroupMembers(groupId)` → `Query<MemberWithProfile[]>`.
  - `useCreateGroup()` → `Mutation<{name, theme}, {group_id, invite_code}>`.
  - `useJoinGroup()` → `Mutation<{invite_code}, {group_id, member_count}>`.
  - `useLeaveGroup()` → `Mutation<{group_id}, void>`. Invalidates myGroups + group + members.
  - `useKickMember()` → `Mutation<{group_id, user_id}, void>`.
  - `useRegenerateInviteCode()` → `Mutation<{group_id}, {invite_code}>`.
  - `useUpdateGroup()` → `Mutation<{group_id, name?, theme?}, void>`.
  - `useDeleteGroup()` → `Mutation<{group_id}, void>`.
  - `useShareInviteCode(code)` → `Mutation<void, void>` (calls RN Share).

---

- [ ] **Step 1: Create read hooks**

Create `src/features/groups/api/useMyGroups.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { GroupRole, GroupRow } from '@/types/database';

export type GroupWithMembership = GroupRow & { my_role: GroupRole };

export function useMyGroups() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['groups', 'mine', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<GroupWithMembership[]> => {
      // Members table is RLS-filtered to caller's groups; join to groups for shape.
      const { data, error } = await supabase
        .from('group_members')
        .select('role, group:groups(*)')
        .eq('user_id', userId!)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as { role: GroupRole; group: GroupRow }[])
        .filter((r) => r.group)
        .map((r) => ({ ...r.group, my_role: r.role }));
    },
  });
}
```

Create `src/features/groups/api/useGroup.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { GroupRow } from '@/types/database';

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: ['groups', 'single', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<GroupRow | null> => {
      const { data, error } = await supabase.from('groups').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as GroupRow | null;
    },
  });
}
```

Create `src/features/groups/api/useGroupMembers.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { GroupRole, UserRow } from '@/types/database';

export type MemberWithProfile = {
  user_id: string;
  role: GroupRole;
  joined_at: string;
  user: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ['groups', 'members', groupId],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<MemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, joined_at, user:users(id, username, display_name, avatar_url)')
        .eq('group_id', groupId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MemberWithProfile[];
    },
  });
}
```

- [ ] **Step 2: Create mutation hooks**

Create `src/features/groups/api/useCreateGroup.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; theme: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('create_group', {
        p_name: vars.name,
        p_theme: vars.theme,
      });
      if (error) throw error;
      const result = data as { group_id: string; invite_code: string };
      analytics.track('group_created', { group_id: result.group_id, theme: vars.theme });
      return result;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] });
    },
  });
}
```

Create `src/features/groups/api/useJoinGroup.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { invite_code: string }) => {
      analytics.track('group_join_attempted', { code_present: vars.invite_code.length > 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('join_group', {
        p_invite_code: vars.invite_code,
      });
      if (error) throw error;
      const result = data as { group_id: string; member_count: number };
      analytics.track('group_joined', {
        group_id: result.group_id,
        new_member_count: result.member_count,
      });
      return result;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] });
    },
  });
}
```

Create `src/features/groups/api/useLeaveGroup.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('leave_group', {
        p_group_id: vars.group_id,
      });
      if (error) throw error;
      const result = data as { left: boolean; group_deleted: boolean; new_owner?: string };
      analytics.track('group_left', {
        group_id: vars.group_id,
        was_owner: Boolean(result.new_owner) || result.group_deleted,
        group_deleted: result.group_deleted,
      });
      return result;
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] }),
        qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'members', vars.group_id] }),
      ]);
    },
  });
}
```

Create `src/features/groups/api/useKickMember.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

export function useKickMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string; user_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('kick_member', {
        p_group_id: vars.group_id,
        p_target_user_id: vars.user_id,
      });
      if (error) throw error;
      analytics.track('member_kicked', { group_id: vars.group_id });
    },
    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'members', vars.group_id] }),
      ]);
    },
  });
}
```

Create `src/features/groups/api/useRegenerateInviteCode.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

export function useRegenerateInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('regenerate_invite_code', {
        p_group_id: vars.group_id,
      });
      if (error) throw error;
      analytics.track('invite_code_regenerated', { group_id: vars.group_id });
      return data as { invite_code: string };
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] });
    },
  });
}
```

Create `src/features/groups/api/useUpdateGroup.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string; name?: string; theme?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('update_group', {
        p_group_id: vars.group_id,
        p_name: vars.name ?? null,
        p_theme: vars.theme ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups', 'single', vars.group_id] }),
        qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] }),
      ]);
    },
  });
}
```

Create `src/features/groups/api/useDeleteGroup.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { group_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('delete_group', {
        p_group_id: vars.group_id,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      qc.removeQueries({ queryKey: ['groups', 'single', vars.group_id] });
      qc.removeQueries({ queryKey: ['groups', 'members', vars.group_id] });
      await qc.invalidateQueries({ queryKey: ['groups', 'mine', userId] });
    },
  });
}
```

Create `src/features/groups/api/useShareInviteCode.ts`:

```ts
import { Share } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

export function useShareInviteCode() {
  return useMutation({
    mutationFn: async (vars: { group_id: string; group_name: string; invite_code: string }) => {
      const message = t('groups.share.message', {
        name: vars.group_name,
        code: vars.invite_code,
      });
      await Share.share({ message });
      analytics.track('invite_code_shared', { group_id: vars.group_id });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
bun run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(groups): 11 API hooks for read + 7 mutations + share"
```

---

## Task 5: Components (5 reusable bits)

**Files:**

- Create: `src/features/groups/components/GroupCard.tsx`, `MemberAvatarRow.tsx`, `InviteCodeCard.tsx`, `ThemePicker.tsx`, `ThemeAccent.tsx`
- Modify: `src/theme/tokens.ts` (add theme color map)

**Interfaces:**

- Produces:
  - `<GroupCard group onPress />` — row in groups list.
  - `<MemberAvatarRow members maxShown={5} />`.
  - `<InviteCodeCard code onShare onRegenerate? isOwner />`.
  - `<ThemePicker value onChange />`.
  - `<ThemeAccent theme size? />` (renders a small color swatch).
  - `THEME_COLORS: Record<GroupTheme, string>` exported from tokens.

---

- [ ] **Step 1: Extend theme tokens**

Edit `src/theme/tokens.ts`. Add at the bottom:

```ts
import type { GroupTheme } from '@/types/database';

export const THEME_COLORS: Record<GroupTheme, string> = {
  purple: '#A855F7',
  pink: '#EC4899',
  cyan: '#06B6D4',
  flame: '#F97316',
  lime: '#84CC16',
  gold: '#F59E0B',
} as const;
```

- [ ] **Step 2: ThemeAccent**

Create `src/features/groups/components/ThemeAccent.tsx`:

```tsx
import { View } from 'react-native';
import { THEME_COLORS } from '@/theme/tokens';
import type { GroupTheme } from '@/types/database';

type Props = { theme: GroupTheme; size?: number };

export function ThemeAccent({ theme, size = 12 }: Props) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: THEME_COLORS[theme],
      }}
    />
  );
}
```

- [ ] **Step 3: ThemePicker**

Create `src/features/groups/components/ThemePicker.tsx`:

```tsx
import { Pressable, View } from 'react-native';
import { THEME_COLORS } from '@/theme/tokens';
import type { GroupTheme } from '@/types/database';

const THEMES: GroupTheme[] = ['purple', 'pink', 'cyan', 'flame', 'lime', 'gold'];

type Props = { value: GroupTheme; onChange: (theme: GroupTheme) => void };

export function ThemePicker({ value, onChange }: Props) {
  return (
    <View className="flex-row gap-3">
      {THEMES.map((theme) => (
        <Pressable
          key={theme}
          onPress={() => onChange(theme)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: THEME_COLORS[theme],
            borderWidth: value === theme ? 3 : 0,
            borderColor: '#F4F4F8',
          }}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: GroupCard**

Create `src/features/groups/components/GroupCard.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { ThemeAccent } from './ThemeAccent';
import type { GroupRow } from '@/types/database';

type Props = { group: GroupRow; onPress: () => void };

export function GroupCard({ group, onPress }: Props) {
  return (
    <Pressable onPress={onPress} className="rounded-2xl bg-bg-surface p-4 active:opacity-80">
      <View className="flex-row items-center gap-3">
        <ThemeAccent theme={group.theme} size={16} />
        <View className="flex-1">
          <Text className="font-display text-lg text-text-primary">{group.name}</Text>
          <Text className="text-xs text-text-muted">{group.member_count} of 25 members</Text>
        </View>
        <View className="rounded-full bg-bg-elevated px-3 py-1">
          <Text className="text-xs font-semibold text-text-muted">{group.invite_code}</Text>
        </View>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 5: MemberAvatarRow**

Create `src/features/groups/components/MemberAvatarRow.tsx`:

```tsx
import { Text, View } from 'react-native';
import type { MemberWithProfile } from '../api/useGroupMembers';

type Props = { members: MemberWithProfile[]; maxShown?: number };

export function MemberAvatarRow({ members, maxShown = 5 }: Props) {
  const shown = members.slice(0, maxShown);
  const extra = Math.max(0, members.length - maxShown);
  return (
    <View className="flex-row items-center">
      {shown.map((m, idx) => (
        <View
          key={m.user_id}
          className="-ml-2 h-10 w-10 items-center justify-center rounded-full border-2 border-bg-base bg-primary-500/30"
          style={{ marginLeft: idx === 0 ? 0 : -8 }}
        >
          <Text className="font-display text-base text-text-primary">
            {(m.user.username ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ))}
      {extra > 0 && (
        <View
          className="h-10 w-10 items-center justify-center rounded-full border-2 border-bg-base bg-bg-elevated"
          style={{ marginLeft: -8 }}
        >
          <Text className="text-xs font-semibold text-text-muted">+{extra}</Text>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 6: InviteCodeCard**

Create `src/features/groups/components/InviteCodeCard.tsx`:

```tsx
import * as Clipboard from 'expo-clipboard';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { t } from '@/lib/i18n';

type Props = {
  code: string;
  isOwner: boolean;
  onShare: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
};

export function InviteCodeCard({ code, isOwner, onShare, onRegenerate, regenerating }: Props) {
  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    Alert.alert(t('groups.home.codeCopied'));
  }

  return (
    <View className="rounded-2xl bg-bg-surface p-4">
      <Text className="mb-2 text-xs font-semibold tracking-widest text-text-muted">
        {t('groups.home.inviteCode')}
      </Text>
      <Pressable onPress={handleCopy} className="mb-3 active:opacity-60">
        <Text className="font-display text-2xl text-text-primary">{code}</Text>
      </Pressable>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button onPress={onShare}>{t('groups.home.share')}</Button>
        </View>
        {isOwner && onRegenerate && (
          <View className="flex-1">
            <Button variant="ghost" onPress={onRegenerate} disabled={regenerating}>
              {t('groups.home.regenerate')}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 7: Install expo-clipboard**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
bunx expo install expo-clipboard
```

- [ ] **Step 8: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): GroupCard + MemberAvatarRow + InviteCodeCard + ThemePicker + ThemeAccent"
```

---

## Task 6: i18n keys + tab bar + Groups list screen

**Files:**

- Modify: `src/lib/i18n/locales/en.json`, `src/lib/icons.ts`, `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/groups.tsx`

**Interfaces:**

- Produces: 4-tab bar with Groups, groups list screen showing user's ≤5 groups or empty state with create/join CTAs.

---

- [ ] **Step 1: Add i18n keys**

In `src/lib/i18n/locales/en.json`, add to the existing `tabs` block:

```json
"tabs": {
  "home": "Home",
  "catalog": "Catalog",
  "groups": "Groups",
  "profile": "Profile"
},
```

Add a whole new top-level `groups` block (place alphabetically near `home`):

```json
"groups": {
  "title": "Groups",
  "list": {
    "empty": {
      "title": "Your crew, your challenges",
      "body": "Create a group or join with an invite code.",
      "create": "Create a group",
      "join": "Join with code"
    },
    "memberCount": "{{count}} of 25"
  },
  "create": {
    "title": "Create a group",
    "namePlaceholder": "Hockey Squad",
    "themeLabel": "Theme",
    "button": "Create"
  },
  "join": {
    "title": "Join a group",
    "prompt": "Drop in the invite code your friend shared.",
    "codePlaceholder": "XXXXXX",
    "paste": "Paste",
    "button": "Join"
  },
  "home": {
    "memberCount": "{{count}} of 25 members",
    "inviteCode": "INVITE CODE",
    "share": "Share",
    "regenerate": "New code",
    "codeCopied": "Copied to clipboard",
    "settings": "Settings",
    "members": "Members",
    "comingSoon": "Feed & leaderboard coming in the next update."
  },
  "settings": {
    "title": "Group settings",
    "editName": "Edit name",
    "editTheme": "Edit theme",
    "regenerateCode": "Regenerate invite code",
    "regenerateConfirm": "Regenerating invalidates the old code. Friends with the old code won't be able to join until you share the new one. Continue?",
    "delete": "Delete group",
    "deleteConfirmTitle": "Delete {{name}}?",
    "deleteConfirmBody": "This wipes the group and removes all members. There is no undo.",
    "deleteConfirmAction": "Yes, delete the group",
    "leave": "Leave group",
    "leaveConfirmTitle": "Leave {{name}}?",
    "leaveConfirmBody": "You can rejoin later if you still have the invite code.",
    "leaveConfirmAction": "Leave",
    "saved": "Saved"
  },
  "members": {
    "title": "Members",
    "roleOwner": "Owner",
    "kick": "Kick",
    "kickConfirmTitle": "Kick @{{username}}?",
    "kickConfirmBody": "They'll be removed immediately and won't be able to rejoin unless you regenerate the invite code.",
    "kickConfirmAction": "Yes, kick"
  },
  "edit": {
    "nameTitle": "Group name",
    "themeTitle": "Group theme",
    "save": "Save"
  },
  "share": {
    "message": "Join my Challenge Arena group \"{{name}}\": {{code}}"
  },
  "errors": {
    "tooManyGroups": "You're already in 5 groups. Leave one to join another.",
    "groupFull": "This group is full (25 of 25).",
    "codeNotFound": "Invite code not found. Double-check with whoever shared it.",
    "notOwner": "Only the group owner can do that.",
    "selfKick": "Use Leave to remove yourself."
  }
}
```

- [ ] **Step 2: Add UsersThree icon**

Edit `src/lib/icons.ts` — extend with the new icon:

```ts
import { BookOpenText, Gear, House, User, UsersThree, Copy } from 'phosphor-react-native';

export const Icon = {
  Home: House,
  Catalog: BookOpenText,
  Profile: User,
  Groups: UsersThree,
  Settings: Gear,
  Copy: Copy,
} as const;

export const ICON_DEFAULTS = {
  size: 24,
  weight: 'duotone' as const,
};
```

- [ ] **Step 3: Add Groups tab to tab bar**

Edit `app/(tabs)/_layout.tsx` — add a 3rd `Tabs.Screen` between Catalog and Profile:

```tsx
<Tabs.Screen
  name="groups"
  options={{
    title: t('tabs.groups'),
    tabBarIcon: ({ color }) => <Icon.Groups {...ICON_DEFAULTS} color={color as string} />,
  }}
/>
```

- [ ] **Step 4: Groups list screen**

Create `app/(tabs)/groups.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { GroupCard } from '@/features/groups/components/GroupCard';
import { useMyGroups } from '@/features/groups/api/useMyGroups';
import { t } from '@/lib/i18n';

export default function GroupsTab() {
  const router = useRouter();
  const { data: groups, isLoading } = useMyGroups();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-6 pb-3 pt-4">
        <Text className="font-display text-3xl text-text-primary">{t('groups.title')}</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : !groups || groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState emoji="👥" label={t('groups.list.empty.body')} />
          <View className="mt-4 w-full gap-3">
            <Button onPress={() => router.push('/groups/create')}>
              {t('groups.list.empty.create')}
            </Button>
            <Button variant="ghost" onPress={() => router.push('/groups/join')}>
              {t('groups.list.empty.join')}
            </Button>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ padding: 24, gap: 12, paddingBottom: 100 }}
            renderItem={({ item }) => (
              <GroupCard group={item} onPress={() => router.push(`/groups/${item.id}`)} />
            )}
          />
          <View className="absolute bottom-24 left-0 right-0 px-6">
            {groups.length < 5 ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button onPress={() => router.push('/groups/create')}>
                    {t('groups.list.empty.create')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="ghost" onPress={() => router.push('/groups/join')}>
                    {t('groups.list.empty.join')}
                  </Button>
                </View>
              </View>
            ) : null}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): 4-tab nav + Groups list screen + i18n keys"
```

---

## Task 7: Create + Join modals

**Files:**

- Create: `app/groups/create.tsx`, `app/groups/join.tsx`

---

- [ ] **Step 1: Create group modal**

Create `app/groups/create.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { ThemePicker } from '@/features/groups/components/ThemePicker';
import { useCreateGroup } from '@/features/groups/api/useCreateGroup';
import { t } from '@/lib/i18n';
import type { GroupTheme } from '@/types/database';

export default function CreateGroup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<GroupTheme>('purple');
  const mutation = useCreateGroup();

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '54023') return t('groups.errors.tooManyGroups');
    return e.message;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('groups.create.title')}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('groups.create.namePlaceholder')}
          placeholderTextColor="#8B8B98"
          maxLength={40}
          className="mb-6 rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <Text className="mb-3 text-xs font-semibold tracking-widest text-text-muted">
          {t('groups.create.themeLabel')}
        </Text>
        <ThemePicker value={theme} onChange={setTheme} />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || name.trim().length < 1}
          onPress={async () => {
            try {
              const result = await mutation.mutateAsync({ name, theme });
              router.replace(`/groups/${result.group_id}`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groups.create.button')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Join group modal**

Create `app/groups/join.tsx`:

```tsx
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useJoinGroup } from '@/features/groups/api/useJoinGroup';
import { t } from '@/lib/i18n';

export default function JoinGroup() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const mutation = useJoinGroup();

  function normalize(v: string): string {
    return v
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, '')
      .slice(0, 6);
  }

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    // Accept either "ARENA-XXXXXX" or just "XXXXXX"
    const stripped = text.replace(/^ARENA-/i, '');
    setCode(normalize(stripped));
  }

  function mapError(e: Error): string {
    const code = (e as unknown as { code?: string }).code;
    if (code === '54023') return t('groups.errors.tooManyGroups');
    if (code === '54024') return t('groups.errors.groupFull');
    if (code === '02000') return t('groups.errors.codeNotFound');
    return e.message;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-2 font-display text-2xl text-text-primary">
          {t('groups.join.title')}
        </Text>
        <Text className="mb-8 text-base text-text-muted">{t('groups.join.prompt')}</Text>
        <View className="mb-4 flex-row items-center rounded-2xl bg-bg-surface px-4 py-3">
          <Text className="font-display text-lg text-text-muted">ARENA-</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(normalize(v))}
            placeholder={t('groups.join.codePlaceholder')}
            placeholderTextColor="#8B8B98"
            autoCapitalize="characters"
            autoCorrect={false}
            className="ml-1 flex-1 font-display text-lg text-text-primary"
          />
        </View>
        <View className="self-start">
          <Button variant="ghost" onPress={handlePaste}>
            {t('groups.join.paste')}
          </Button>
        </View>
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || code.length !== 6}
          onPress={async () => {
            try {
              const result = await mutation.mutateAsync({ invite_code: `ARENA-${code}` });
              router.replace(`/groups/${result.group_id}`);
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), mapError(e as Error));
            }
          }}
        >
          {t('groups.join.button')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): create + join modals with error code mapping"
```

---

## Task 8: Group home + members screens + nested stack

**Files:**

- Create: `app/groups/[id]/_layout.tsx`, `app/groups/[id]/index.tsx`, `app/groups/[id]/members.tsx`

---

- [ ] **Step 1: Nested layout**

Create `app/groups/[id]/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function GroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0F' },
        headerTintColor: '#F4F4F8',
        headerTitleStyle: { color: '#F4F4F8' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="edit-name" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="edit-theme" options={{ presentation: 'modal', title: '' }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Group home**

Create `app/groups/[id]/index.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { ThemeAccent } from '@/features/groups/components/ThemeAccent';
import { MemberAvatarRow } from '@/features/groups/components/MemberAvatarRow';
import { InviteCodeCard } from '@/features/groups/components/InviteCodeCard';
import { useGroup } from '@/features/groups/api/useGroup';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useShareInviteCode } from '@/features/groups/api/useShareInviteCode';
import { useRegenerateInviteCode } from '@/features/groups/api/useRegenerateInviteCode';
import { useAuthStore } from '@/features/auth/store';
import { Icon, ICON_DEFAULTS } from '@/lib/icons';
import { t } from '@/lib/i18n';

export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group, isLoading } = useGroup(id);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);
  const shareMutation = useShareInviteCode();
  const regenerateMutation = useRegenerateInviteCode();

  if (isLoading || !group) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <ThemeAccent theme={group.theme} size={20} />
            <Text className="font-display text-3xl text-text-primary">{group.name}</Text>
          </View>
          <Pressable onPress={() => router.push(`/groups/${group.id}/settings`)} className="p-2">
            <Icon.Settings {...ICON_DEFAULTS} color="#F4F4F8" />
          </Pressable>
        </View>

        <Text className="text-text-muted">
          {t('groups.home.memberCount', { count: group.member_count })}
        </Text>

        <Pressable onPress={() => router.push(`/groups/${group.id}/members`)}>
          <MemberAvatarRow members={members ?? []} maxShown={5} />
        </Pressable>

        <InviteCodeCard
          code={group.invite_code}
          isOwner={isOwner}
          onShare={() =>
            shareMutation.mutate({
              group_id: group.id,
              group_name: group.name,
              invite_code: group.invite_code,
            })
          }
          onRegenerate={
            isOwner ? () => regenerateMutation.mutate({ group_id: group.id }) : undefined
          }
          regenerating={regenerateMutation.isPending}
        />

        <View className="items-center rounded-2xl bg-bg-surface px-4 py-8">
          <Text className="mb-2 text-2xl">🚧</Text>
          <Text className="text-center text-sm text-text-muted">{t('groups.home.comingSoon')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Members screen**

Create `app/groups/[id]/members.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useKickMember } from '@/features/groups/api/useKickMember';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

export default function GroupMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: members, isLoading } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);
  const kickMutation = useKickMember();

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  function confirmKick(username: string, targetId: string) {
    Alert.alert(
      t('groups.members.kickConfirmTitle', { username }),
      t('groups.members.kickConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groups.members.kickConfirmAction'),
          style: 'destructive',
          onPress: () => kickMutation.mutate({ group_id: id, user_id: targetId }),
        },
      ],
    );
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
      <FlatList
        data={members ?? []}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={{ padding: 24, gap: 8 }}
        renderItem={({ item }) => {
          const isSelf = item.user_id === userId;
          const canKick = isOwner && !isSelf;
          return (
            <View className="flex-row items-center gap-3 rounded-2xl bg-bg-surface p-4">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-500/30">
                <Text className="font-display text-base text-text-primary">
                  {(item.user.username ?? '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-text-primary">{item.user.display_name}</Text>
                <Text className="text-xs text-text-muted">@{item.user.username}</Text>
              </View>
              {item.role === 'owner' && (
                <View className="rounded-full bg-primary-500/20 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-primary-500">
                    {t('groups.members.roleOwner')}
                  </Text>
                </View>
              )}
              {canKick && (
                <Button
                  variant="ghost"
                  onPress={() => confirmKick(item.user.username, item.user_id)}
                  disabled={kickMutation.isPending}
                >
                  {t('groups.members.kick')}
                </Button>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): group home + members screen + nested stack layout"
```

---

## Task 9: Group settings + edit name + edit theme

**Files:**

- Create: `app/groups/[id]/settings.tsx`, `app/groups/[id]/edit-name.tsx`, `app/groups/[id]/edit-theme.tsx`

---

- [ ] **Step 1: Settings screen**

Create `app/groups/[id]/settings.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView } from 'react-native';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { useGroup } from '@/features/groups/api/useGroup';
import { useGroupMembers } from '@/features/groups/api/useGroupMembers';
import { useLeaveGroup } from '@/features/groups/api/useLeaveGroup';
import { useDeleteGroup } from '@/features/groups/api/useDeleteGroup';
import { useRegenerateInviteCode } from '@/features/groups/api/useRegenerateInviteCode';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group } = useGroup(id);
  const { data: members } = useGroupMembers(id);
  const userId = useAuthStore((s) => s.session?.user.id);

  const leaveMutation = useLeaveGroup();
  const deleteMutation = useDeleteGroup();
  const regenerateMutation = useRegenerateInviteCode();

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === 'owner');

  function confirmRegenerate() {
    Alert.alert(t('groups.settings.regenerateCode'), t('groups.settings.regenerateConfirm'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: t('groups.settings.regenerateCode'),
        onPress: () => regenerateMutation.mutate({ group_id: id }),
      },
    ]);
  }

  function confirmLeave() {
    if (!group) return;
    Alert.alert(
      t('groups.settings.leaveConfirmTitle', { name: group.name }),
      t('groups.settings.leaveConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groups.settings.leaveConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            await leaveMutation.mutateAsync({ group_id: id });
            router.replace('/(tabs)/groups');
          },
        },
      ],
    );
  }

  function confirmDelete() {
    if (!group) return;
    Alert.alert(
      t('groups.settings.deleteConfirmTitle', { name: group.name }),
      t('groups.settings.deleteConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('groups.settings.deleteConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            await deleteMutation.mutateAsync({ group_id: id });
            router.replace('/(tabs)/groups');
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg-base"
      contentContainerStyle={{ padding: 16, paddingTop: 24 }}
    >
      {isOwner && (
        <SettingsSection title="OWNER">
          <SettingsRow
            label={t('groups.settings.editName')}
            value={group?.name ?? ''}
            onPress={() => router.push(`/groups/${id}/edit-name`)}
          />
          <SettingsRow
            label={t('groups.settings.editTheme')}
            value={group?.theme ?? ''}
            onPress={() => router.push(`/groups/${id}/edit-theme`)}
          />
          <SettingsRow
            label={t('groups.settings.regenerateCode')}
            onPress={confirmRegenerate}
            last
          />
        </SettingsSection>
      )}

      <SettingsSection title="MEMBERSHIP">
        <SettingsRow label={t('groups.settings.leave')} destructive onPress={confirmLeave} last />
      </SettingsSection>

      {isOwner && (
        <SettingsSection title="DANGER ZONE">
          <SettingsRow
            label={t('groups.settings.delete')}
            destructive
            onPress={confirmDelete}
            last
          />
        </SettingsSection>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Edit name modal**

Create `app/groups/[id]/edit-name.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useGroup } from '@/features/groups/api/useGroup';
import { useUpdateGroup } from '@/features/groups/api/useUpdateGroup';
import { t } from '@/lib/i18n';

export default function EditName() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group } = useGroup(id);
  const [name, setName] = useState(group?.name ?? '');
  const mutation = useUpdateGroup();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('groups.edit.nameTitle')}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholderTextColor="#8B8B98"
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || name.trim().length < 1}
          onPress={async () => {
            try {
              await mutation.mutateAsync({ group_id: id, name });
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('groups.edit.save')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Edit theme modal**

Create `app/groups/[id]/edit-theme.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { ThemePicker } from '@/features/groups/components/ThemePicker';
import { useGroup } from '@/features/groups/api/useGroup';
import { useUpdateGroup } from '@/features/groups/api/useUpdateGroup';
import { t } from '@/lib/i18n';
import type { GroupTheme } from '@/types/database';

export default function EditTheme() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group } = useGroup(id);
  const [theme, setTheme] = useState<GroupTheme>(group?.theme ?? 'purple');
  const mutation = useUpdateGroup();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('groups.edit.themeTitle')}
        </Text>
        <ThemePicker value={theme} onChange={setTheme} />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending}
          onPress={async () => {
            try {
              await mutation.mutateAsync({ group_id: id, theme });
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('groups.edit.save')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(groups): settings + edit-name + edit-theme + leave/delete confirmations"
```

---

## Task 10: Analytics event registry + final sweep

**Files:**

- Modify: `src/lib/analytics/events.ts`

**Interfaces:**

- Produces: 7 new typed analytics events callable from the hooks added in Task 4.

---

- [ ] **Step 1: Register the 7 new event payloads**

Edit `src/lib/analytics/events.ts` — extend the `EventPayloads` type:

```ts
export type EventPayloads = {
  // ... existing events
  app_launched: { is_cold_start: boolean; session_id: string };
  signup_started: { provider: 'apple' | 'google' | 'email' };
  signup_completed: { user_id: string; provider: 'apple' | 'google' | 'email' };
  onboarding_step_completed: {
    step: 'username' | 'interests' | 'notifications';
    skipped: boolean;
  };
  challenge_viewed: { challenge_id: string; category: string };
  challenge_accepted: { challenge_id: string; category: string; proof_type: string };
  proof_submission_started: { accept_id: string; proof_type: 'honor' | 'photo' };
  proof_upload_completed: { accept_id: string; ms_elapsed: number; bytes: number };
  challenge_completed: {
    completion_id: string;
    xp_awarded: number;
    proof_type: string;
    duration_ms: number;
  };
  streak_milestone_hit: { streak_length: number };
  level_up: { from_level: number; to_level: number };
  notification_permission_asked: { outcome: 'granted' | 'denied' | 'undetermined' };
  // Slice 2 Plan 1
  group_created: { group_id: string; theme: string };
  group_join_attempted: { code_present: boolean };
  group_joined: { group_id: string; new_member_count: number };
  group_left: { group_id: string; was_owner: boolean; group_deleted: boolean };
  member_kicked: { group_id: string };
  invite_code_regenerated: { group_id: string };
  invite_code_shared: { group_id: string };
};
```

- [ ] **Step 2: Full sweep — typecheck, lint, test, all SQL tests**

```bash
cd "/Users/vc.aman.chhetri/Library/CloudStorage/OneDrive-ZeeEntertainmentEnterprisesLimited/Desktop/Codes/challenge-arena/"
bun run typecheck
bun run lint
bun run test

supabase db reset
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls; do
  echo "--- $f ---"
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | tail -2
done
```

Expected: all green; all 10 SQL tests end with `TEST PASS: ...`.

- [ ] **Step 3: iOS bundle smoke check**

```bash
rm -rf dist
bunx expo export --platform ios --dump-sourcemap=false
rm -rf dist
```

Expected: `Exported: dist`.

- [ ] **Step 4: Commit + push**

```bash
git add .
git commit -m "feat(analytics): register 7 group events; final Slice 2 Plan 1 sweep"
git push
```

---

## Plan 1 — Acceptance

Plan 1 is complete when ALL of these are true:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run test` — all Jest suites pass
- [ ] `supabase db reset` applies migrations 0001–0014 cleanly
- [ ] All 10 SQL test files pass (Slice 1's 7 + Slice 2 Plan 1's 3)
- [ ] A user can tap the new Groups tab and see the empty state with two CTAs
- [ ] Tapping Create → fill name + pick theme + Create → group exists, user is owner, invite code shown
- [ ] Sharing the invite code opens the native share sheet with the right text
- [ ] A second user in the same dev environment pastes the code → join succeeds → both see each other
- [ ] Owner can regenerate the code; old code rejected on next join attempt with `'invite_code_not_found'`
- [ ] Owner can kick a member; member's row disappears from `group_members`; member_count decremented
- [ ] Owner can edit name + theme; changes persist + visible to all members
- [ ] Owner can delete a populated group; group + members rows gone; historical completions retain rows with `group_id = null`
- [ ] Member can leave; if sole member, group deleted; if owner leaves populated group, ownership transfers to longest-tenured member
- [ ] 26th join attempt rejects with `'group_full'` error UI-mapped
- [ ] 6th group join/create rejects with `'too_many_groups'` UI-mapped
- [ ] Non-member querying `groups` table returns 0 rows (RLS verified via test)
- [ ] `bunx expo export --platform ios` bundles successfully
- [ ] All 7 analytics events fire via typed registry

### Deferred items (not part of Plan 1 acceptance)

- Custom group challenges → **Plan 2**
- Group feed → **Plan 3**
- Group leaderboard → **Plan 3**
- Group streak flame logic → **Plan 3** (`groups.current_streak` stays 0)
- Onboarding "got a code?" step (viral acquisition follow-up)
- Admin role UI / promotion
- Notifications on member-join / kick → Slice 3
- Avatar uploads → Slice 3
- Pull-to-refresh on groups list (deferred; reuse pattern from Home/Catalog)

---

## Self-review notes (already applied while writing)

- All 7 RPCs from the spec have task coverage (Task 2 ships all 7 + tests + Database types).
- RLS test (Task 3) explicitly verifies non-member sees 0 rows on both tables.
- Optimistic UI is _not_ used for joins/leaves — only invalidation. Rationale: RPC errors (over-cap, full-group) need the server's last word; optimistic UI would have to roll back the cap state, which is more code than it's worth. Pure invalidation is simpler and the perceived latency is fine for a once-per-day action.
- `useDeleteGroup` uses `removeQueries` (not just invalidate) on the deleted group to evict its cached entries cleanly — prevents stale data flashing if the user navigates back.
- `mint_invite_code` uses a charset that strips `0OIL1` per the spec. The 5-attempt retry limit prevents pathological infinite loops if the keyspace fills (won't realistically happen at ~33 bits of entropy).
- `kick_member` explicitly forbids `self_kick` so the UI can map error code `42P05` to a "use Leave instead" hint.
- All `i18n` keys exist before the screens reference them (Task 6 sets the full block early).
- Phosphor icons used: `UsersThree` for the tab, `Gear` for settings, `Copy` reserved for future copy-button polish.
- `theme/tokens.ts` extension keeps the THEME_COLORS map next to existing tokens so future per-group theming has one source of truth.

**Next plan after this:** Slice 2 Plan 2 — Custom challenges. Extends `challenges` with non-null `group_id`, adds a create-challenge screen scoped to a group, surfaces group challenges in a per-group catalog rail on the group home.
