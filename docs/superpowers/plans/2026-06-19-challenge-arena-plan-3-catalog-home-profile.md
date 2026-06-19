# Challenge Arena — Plan 3: Catalog + Home + Profile + Accept

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three real tabs (Home, Catalog, Profile), a browsable preset challenge catalog, a challenge detail screen with three states, and the ability to accept a challenge so it shows up on Home. Plan 3 stops _just before_ proof submission — submitting and XP are Plan 4.

**Architecture:** Pure read + accept-only — no Edge Functions needed yet. All challenge queries are wrapped as TanStack hooks under `src/features/challenges/api/`. Filters and joins stay on the client (PostgREST is happy doing simple `.eq` / `.in` calls). The accept mutation is optimistic so the Home "Today" list updates instantly. RLS is turned on for `challenges` and `challenge_accepts` so the anon role can only see what it should — this also surfaces any policy gaps before Plan 4's write paths.

**Tech Stack additions:** none beyond Plan 1 + Plan 2. Reuses Supabase client, TanStack Query, Zustand, NativeWind, i18n.

## Global Constraints

- Tabs are stacked in this order: Home (default), Catalog, Profile.
- Tab bar uses text labels in Plan 3 (Phosphor icons land in Plan 4 polish).
- Every Supabase call lives behind a TanStack hook under `src/features/<feature>/api/`. No raw `supabase.from(...)` in screens.
- Catalog list, suggestions, and "Today" rail all share one `ChallengeCard` component.
- Optimistic accept: the Home / Catalog screens flip the card state immediately; reconciliation happens via query invalidation.
- Accept mutation is idempotent at the DB level (unique on `(challenge_id, user_id)`); UI must surface the "already accepted" path cleanly.
- All new strings via `i18n.t()` — new keys under `tabs.*`, `home.*`, `catalog.*`, `challenge.*`, `profile.*`.
- RLS is enabled on `challenges` + `challenge_accepts` + `challenge_completions`. Migration `0007_slice1_rls.sql` lands as Task 1.

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx                      # MODIFIED — 3 real tabs
│   │   ├── index.tsx                        # REPLACED — real Home
│   │   ├── catalog.tsx                      # NEW
│   │   └── profile.tsx                      # NEW
│   ├── challenge/
│   │   └── [id].tsx                         # NEW — detail screen
│   └── _layout.tsx                          # unchanged
├── src/
│   ├── features/
│   │   ├── challenges/
│   │   │   ├── api/
│   │   │   │   ├── usePresetChallenges.ts   # NEW — filtered preset list
│   │   │   │   ├── useChallenge.ts          # NEW — single challenge by id
│   │   │   │   ├── useSuggestedChallenges.ts # NEW — interest-filtered
│   │   │   │   ├── useMyAccepts.ts          # NEW — user's accepts joined with challenge
│   │   │   │   ├── useMyAccept.ts           # NEW — accept-by-challenge for detail screen
│   │   │   │   └── useAcceptChallenge.ts    # NEW — mutation w/ optimistic update
│   │   │   └── components/
│   │   │       ├── ChallengeCard.tsx        # NEW — used by Catalog, Home, Suggested
│   │   │       ├── CategoryChip.tsx         # NEW — Catalog filter chips
│   │   │       ├── DifficultyBadge.tsx      # NEW
│   │   │       └── ProofTypeIcon.tsx        # NEW
│   │   └── streaks/                         # (placeholder for Plan 4 streak header polish)
│   ├── ui/
│   │   └── StatTile.tsx                     # NEW — Profile's XP / streak / completed tiles
│   ├── lib/
│   │   └── challenge.ts                     # NEW — xp threshold/level math (pure fn, unit-tested)
│   └── lib/i18n/locales/en.json             # MODIFIED — adds tab + screen strings
├── supabase/
│   ├── migrations/
│   │   └── 0007_slice1_rls.sql              # NEW — enables RLS on Slice 1 tables
│   └── tests/
│       └── rls_slice1.test.sql              # NEW
└── docs/superpowers/plans/
    └── 2026-06-19-challenge-arena-plan-3-catalog-home-profile.md   # this file
```

**Decomposition rationale:**

- One API hook per data shape (preset list, single, suggested, my accepts, accept-by-challenge, accept mutation). Splitting them is what lets the detail screen and home rail invalidate independently.
- `ChallengeCard` is shared because all three list surfaces (Catalog, Home Today, Home Suggested) render the same atom.
- `lib/challenge.ts` is a pure module so XP/level math can be unit-tested cheaply (and the Plan 4 celebration screen reuses it).

---

## Task 1: Enable RLS on Slice 1 tables

**Files:**

- Create: `supabase/migrations/0007_slice1_rls.sql`, `supabase/tests/rls_slice1.test.sql`

**Interfaces:**

- Produces: anon role can SELECT presets and INSERT/SELECT own accepts. service_role bypasses RLS as usual. Without this migration the anon key reads everything in every table, which is wrong for any multi-user deployment and would silently mask bugs in our queries.

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/rls_slice1.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

-- Two test users
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('r1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls1@local', '', now(), now()),
  ('r2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls2@local', '', now(), now());

-- Pick one preset challenge to reference
do $$
declare preset_id uuid;
begin
  select id into preset_id from public.challenges where group_id is null limit 1;

  -- Each user accepts the same preset (two accepts total)
  insert into public.challenge_accepts (challenge_id, user_id) values
    (preset_id, 'r1111111-0000-0000-0000-000000000001'),
    (preset_id, 'r2222222-0000-0000-0000-000000000002');
end $$;

-- Simulate user 1 by setting JWT claims for the request
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"r1111111-0000-0000-0000-000000000001","role":"authenticated"}';

-- User 1 should see exactly their own accept, not user 2's
do $$
declare n int;
begin
  select count(*) into n from public.challenge_accepts;
  if n != 1 then raise exception 'FAIL: user1 should see exactly 1 accept, saw %', n; end if;
end $$;

-- User 1 can read all preset challenges
do $$
declare n int;
begin
  select count(*) into n from public.challenges where group_id is null;
  if n != 30 then raise exception 'FAIL: user1 should see 30 presets, saw %', n; end if;
end $$;

reset role;

delete from public.challenge_accepts where user_id in (
  'r1111111-0000-0000-0000-000000000001',
  'r2222222-0000-0000-0000-000000000002'
);
delete from public.users where id in (
  'r1111111-0000-0000-0000-000000000001',
  'r2222222-0000-0000-0000-000000000002'
);
delete from auth.users where id in (
  'r1111111-0000-0000-0000-000000000001',
  'r2222222-0000-0000-0000-000000000002'
);

commit;
select 'TEST PASS: rls_slice1' as result;
```

- [ ] **Step 2: Run failing test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_slice1.test.sql
```

Expected: FAIL — `user1 should see exactly 1 accept, saw 2` (no RLS yet → sees both).

- [ ] **Step 3: Write the RLS migration**

Create `supabase/migrations/0007_slice1_rls.sql`:

```sql
-- 0007_slice1_rls.sql
-- Enable RLS on Slice 1 tables. Plan 3 needs the read paths; Plan 4 will add
-- write policies for completions + tighten challenge INSERT once group-scoped
-- challenges are supported in Slice 2.

alter table public.users enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_accepts enable row level security;
alter table public.challenge_completions enable row level security;

-- USERS: own row visible always; public columns visible to others if is_public_profile.
-- Slice 1 client only ever queries its own row; Plan 4 expands when public profiles ship.
create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- CHALLENGES: presets readable by all authenticated users. Group challenges
-- (group_id != null) blocked until Slice 2 adds group_members.
create policy challenges_select_presets on public.challenges
  for select to authenticated
  using (group_id is null);

-- CHALLENGE_ACCEPTS: own only (read + write).
create policy accepts_select_own on public.challenge_accepts
  for select to authenticated
  using (user_id = auth.uid());

create policy accepts_insert_own on public.challenge_accepts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy accepts_update_own on public.challenge_accepts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- CHALLENGE_COMPLETIONS: own only for SELECT (Plan 3 lists them on Profile in
-- aggregate counts). INSERT remains service-role-only (Plan 4's Edge Function).
create policy completions_select_own on public.challenge_completions
  for select to authenticated
  using (user_id = auth.uid());

-- Server-side username availability check. Without this, Plan 2's
-- useUsernameAvailable count query returns 0 for usernames owned by OTHER
-- users (RLS filters before the username filter applies), incorrectly
-- reporting them as available. A SECURITY DEFINER RPC sidesteps RLS for
-- this one specific read.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.users where username = lower(trim(p_username))
  );
$$;

grant execute on function public.is_username_available(text) to authenticated;
```

- [ ] **Step 4: Apply + run test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_slice1.test.sql
```

Expected: `TEST PASS: rls_slice1`.

- [ ] **Step 5: Patch `useUsernameAvailable` to use the new RPC**

Replace `src/features/onboarding/api/useUsernameAvailable.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { RESERVED_USERNAMES } from '@/lib/reservedUsernames';
import { UsernameSchema } from '@/features/auth/schema';

export function useUsernameAvailable(rawUsername: string) {
  const parsed = UsernameSchema.safeParse(rawUsername);
  const username = parsed.success ? parsed.data : null;

  return useQuery({
    queryKey: ['username-available', username],
    enabled: Boolean(username),
    staleTime: 10_000,
    queryFn: async (): Promise<{ available: boolean; reason?: string }> => {
      if (!username) return { available: false };
      if (RESERVED_USERNAMES.includes(username)) return { available: false, reason: 'reserved' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('is_username_available', {
        p_username: username,
      });
      if (error) throw error;
      return { available: Boolean(data) };
    },
  });
}
```

- [ ] **Step 6: Extend Database type with the new RPC**

In `src/types/database.ts`, add to the `Functions` block:

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
    };
```

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(db): enable RLS on Slice 1 tables + is_username_available RPC"
```

---

## Task 2: Pure `challenge.ts` lib + tests (level/xp math)

**Files:**

- Create: `src/lib/challenge.ts`, `src/lib/__tests__/challenge.test.ts`

**Interfaces:**

- Produces:
  - `LEVEL_THRESHOLDS: readonly number[]` — cumulative XP per level (matches Doc C §6).
  - `levelFromXp(xp: number): number` — returns 1..10.
  - `xpToNextLevel(xp: number): { current: number; next: number; ratio: number }`.

---

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/challenge.test.ts`:

```ts
import { levelFromXp, xpToNextLevel, LEVEL_THRESHOLDS } from '../challenge';

describe('LEVEL_THRESHOLDS', () => {
  it('has 10 entries matching Doc C §6', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 100, 200, 400, 700, 1000, 1500, 2000, 3000, 4500]);
  });
});

describe('levelFromXp', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [399, 3],
    [400, 4],
    [4499, 9],
    [4500, 10],
    [99999, 10],
  ])('xp=%i → level=%i', (xp, expected) => {
    expect(levelFromXp(xp)).toBe(expected);
  });
});

describe('xpToNextLevel', () => {
  it('reports 0..1 ratio toward next level', () => {
    const r = xpToNextLevel(150);
    expect(r.current).toBe(150);
    expect(r.next).toBe(200);
    expect(r.ratio).toBeCloseTo(0.5, 2); // (150-100)/(200-100)
  });

  it('returns ratio 1 when at max level', () => {
    const r = xpToNextLevel(5000);
    expect(r.ratio).toBe(1);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
bun run test src/lib/__tests__/challenge.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/challenge.ts`:

```ts
// Level thresholds per Doc C §6. Cumulative XP needed to reach each level.
export const LEVEL_THRESHOLDS = [
  0, // L1
  100, // L2
  200, // L3
  400, // L4
  700, // L5
  1000, // L6
  1500, // L7
  2000, // L8
  3000, // L9
  4500, // L10
] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (xp >= LEVEL_THRESHOLDS[i]!) level = i + 1;
    else break;
  }
  return level;
}

export function xpToNextLevel(xp: number): { current: number; next: number; ratio: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) {
    const cap = LEVEL_THRESHOLDS[MAX_LEVEL - 1]!;
    return { current: cap, next: cap, ratio: 1 };
  }
  const current = LEVEL_THRESHOLDS[level - 1]!;
  const next = LEVEL_THRESHOLDS[level]!;
  const ratio = (xp - current) / (next - current);
  return { current: xp, next, ratio };
}
```

- [ ] **Step 4: Tests pass + commit**

```bash
bun run test src/lib/__tests__/challenge.test.ts
bun run typecheck
git add .
git commit -m "feat(lib): xp/level math (LEVEL_THRESHOLDS, levelFromXp, xpToNextLevel)"
```

---

## Task 3: ChallengeCard + DifficultyBadge + ProofTypeIcon + CategoryChip

**Files:**

- Create: `src/features/challenges/components/ChallengeCard.tsx`, `DifficultyBadge.tsx`, `ProofTypeIcon.tsx`, `CategoryChip.tsx`

**Interfaces:**

- Produces:
  - `<ChallengeCard challenge size="full" | "compact" onPress accepted />` — single card primitive used by Catalog, Home Today, Home Suggested.
  - `<DifficultyBadge difficulty />`, `<ProofTypeIcon proofType />` — small reusable badges.
  - `<CategoryChip label active onPress />` — horizontal filter pill.

---

- [ ] **Step 1: DifficultyBadge**

Create `src/features/challenges/components/DifficultyBadge.tsx`:

```tsx
import { Text, View } from 'react-native';
import type { Difficulty } from '@/types/database';

const colorClass: Record<Difficulty, string> = {
  easy: 'bg-xp-gain/20 text-xp-gain',
  medium: 'bg-accent-cyan/20 text-accent-cyan',
  hard: 'bg-flame-from/20 text-flame-from',
  epic: 'bg-primary-500/20 text-primary-500',
};

const label: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  epic: 'Epic',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${colorClass[difficulty].split(' ')[0]}`}>
      <Text className={`text-xs font-semibold ${colorClass[difficulty].split(' ')[1]}`}>
        {label[difficulty]}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: ProofTypeIcon**

Create `src/features/challenges/components/ProofTypeIcon.tsx`:

```tsx
import { Text } from 'react-native';
import type { ProofType } from '@/types/database';

const glyph: Record<ProofType, string> = {
  honor: '✋',
  photo: '📷',
  video: '🎥',
  peer: '👥',
};

export function ProofTypeIcon({ proofType }: { proofType: ProofType }) {
  return <Text className="text-xs text-text-muted">{glyph[proofType]}</Text>;
}
```

- [ ] **Step 3: CategoryChip**

Create `src/features/challenges/components/CategoryChip.tsx`:

```tsx
import { Pressable, Text } from 'react-native';

type Props = { label: string; active: boolean; onPress: () => void };

export function CategoryChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${
        active ? 'bg-primary-500' : 'bg-bg-elevated'
      } active:opacity-80`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: ChallengeCard**

Create `src/features/challenges/components/ChallengeCard.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import type { ChallengeRow } from '@/types/database';
import { DifficultyBadge } from './DifficultyBadge';
import { ProofTypeIcon } from './ProofTypeIcon';

const categoryEmoji: Record<string, string> = {
  fitness: '💪',
  study: '📚',
  habit: '🧘',
  dare: '🎲',
  creative: '🎨',
  other: '✨',
};

type Props = {
  challenge: ChallengeRow;
  onPress: () => void;
  accepted?: boolean;
  size?: 'full' | 'compact';
};

export function ChallengeCard({ challenge, onPress, accepted = false, size = 'full' }: Props) {
  const isCompact = size === 'compact';

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl bg-bg-surface p-4 active:opacity-80 ${isCompact ? 'w-44' : 'w-full'}`}
    >
      <View className="flex-row items-start justify-between">
        <Text className="text-2xl">{categoryEmoji[challenge.category] ?? '✨'}</Text>
        {accepted && (
          <View className="rounded-full bg-xp-gain/20 px-2 py-0.5">
            <Text className="text-xs font-semibold text-xp-gain">✓ Accepted</Text>
          </View>
        )}
      </View>
      <Text
        className="mt-3 font-display text-base text-text-primary"
        numberOfLines={isCompact ? 2 : 3}
      >
        {challenge.title}
      </Text>
      <View className="mt-3 flex-row items-center gap-2">
        <DifficultyBadge difficulty={challenge.difficulty} />
        <Text className="text-xs text-text-muted">·</Text>
        <Text className="text-xs font-semibold text-text-primary">+{challenge.xp_reward} XP</Text>
        <Text className="text-xs text-text-muted">·</Text>
        <ProofTypeIcon proofType={challenge.proof_type} />
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(challenges): ChallengeCard + DifficultyBadge + ProofTypeIcon + CategoryChip"
```

---

## Task 4: Challenge API hooks

**Files:**

- Create: `src/features/challenges/api/usePresetChallenges.ts`, `useChallenge.ts`, `useSuggestedChallenges.ts`, `useMyAccepts.ts`, `useMyAccept.ts`, `useAcceptChallenge.ts`

**Interfaces:**

- Produces:
  - `usePresetChallenges(category?)` → list of preset challenges, optionally filtered.
  - `useChallenge(id)` → single challenge.
  - `useSuggestedChallenges()` → up to 6 presets matching the user's interests, not yet accepted.
  - `useMyAccepts({ status })` → accepts joined with their challenge (PostgREST relation).
  - `useMyAccept(challengeId)` → single accept by challenge id for the current user (or null).
  - `useAcceptChallenge()` → mutation; optimistic invalidation of accepts and the single-accept query.

---

- [ ] **Step 1: usePresetChallenges + useChallenge + useSuggestedChallenges**

Create `src/features/challenges/api/usePresetChallenges.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRow, Category } from '@/types/database';

export function usePresetChallenges(category?: Category | 'all') {
  return useQuery({
    queryKey: ['challenges', 'presets', category ?? 'all'],
    queryFn: async (): Promise<ChallengeRow[]> => {
      let q = supabase
        .from('challenges')
        .select('*')
        .is('group_id', null)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (category && category !== 'all') q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });
}
```

Create `src/features/challenges/api/useChallenge.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRow } from '@/types/database';

export function useChallenge(id: string | undefined) {
  return useQuery({
    queryKey: ['challenges', 'single', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ChallengeRow | null> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChallengeRow | null;
    },
  });
}
```

Create `src/features/challenges/api/useSuggestedChallenges.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeRow } from '@/types/database';

export function useSuggestedChallenges() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const interests = profile?.interests ?? [];

  return useQuery({
    queryKey: ['challenges', 'suggested', userId, interests.join(',')],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChallengeRow[]> => {
      // 1. Find ids the user has already accepted
      const { data: accepts, error: aErr } = await supabase
        .from('challenge_accepts')
        .select('challenge_id')
        .eq('user_id', userId!);
      if (aErr) throw aErr;
      const acceptedIds = (accepts ?? []).map((a) => a.challenge_id);

      // 2. Query presets matching interests (or fallback to all if user picked none)
      let q = supabase
        .from('challenges')
        .select('*')
        .is('group_id', null)
        .eq('is_active', true)
        .limit(6);
      if (interests.length > 0) q = q.in('category', interests);
      if (acceptedIds.length > 0) q = q.not('id', 'in', `(${acceptedIds.join(',')})`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });
}
```

- [ ] **Step 2: useMyAccepts + useMyAccept**

Create `src/features/challenges/api/useMyAccepts.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeRow, AcceptStatus } from '@/types/database';

export type AcceptWithChallenge = {
  id: string;
  challenge_id: string;
  user_id: string;
  status: AcceptStatus;
  accepted_at: string;
  challenge: ChallengeRow;
};

export function useMyAccepts(status: AcceptStatus | 'all' = 'accepted') {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['accepts', 'mine', userId, status],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AcceptWithChallenge[]> => {
      let q = supabase
        .from('challenge_accepts')
        .select('id, challenge_id, user_id, status, accepted_at, challenge:challenges(*)')
        .eq('user_id', userId!)
        .order('accepted_at', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AcceptWithChallenge[];
    },
  });
}
```

Create `src/features/challenges/api/useMyAccept.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import type { ChallengeAcceptRow } from '@/types/database';

export function useMyAccept(challengeId: string | undefined) {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['accepts', 'single', userId, challengeId],
    enabled: Boolean(userId && challengeId),
    queryFn: async (): Promise<ChallengeAcceptRow | null> => {
      const { data, error } = await supabase
        .from('challenge_accepts')
        .select('*')
        .eq('user_id', userId!)
        .eq('challenge_id', challengeId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChallengeAcceptRow | null;
    },
  });
}
```

- [ ] **Step 3: useAcceptChallenge (optimistic)**

Create `src/features/challenges/api/useAcceptChallenge.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';
import type { ChallengeRow } from '@/types/database';

type Vars = { challenge: ChallengeRow };

export function useAcceptChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challenge }: Vars) => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('challenge_accepts')
        .insert({ challenge_id: challenge.id, user_id: userId })
        .select('id, challenge_id, user_id, status, accepted_at')
        .single();
      if (error) {
        // Unique violation = already accepted → treat as success, refresh queries
        if ((error as { code?: string }).code === '23505') {
          return null;
        }
        throw error;
      }
      analytics.track('challenge_accepted', {
        challenge_id: challenge.id,
        category: challenge.category,
        proof_type: challenge.proof_type,
      });
      return data;
    },
    onSuccess: async (_data, { challenge }) => {
      const userId = useAuthStore.getState().session?.user.id;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
        qc.invalidateQueries({ queryKey: ['accepts', 'single', userId, challenge.id] }),
        qc.invalidateQueries({ queryKey: ['challenges', 'suggested', userId] }),
      ]);
    },
  });
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(challenges): API hooks (preset list, single, suggested, accepts, accept mutation)"
```

---

## Task 5: Three-tab layout + Catalog screen

**Files:**

- Modify: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/catalog.tsx`, `app/(tabs)/profile.tsx` (stub for now — Task 8 fills profile)

**Interfaces:**

- Produces: Home / Catalog / Profile tabs with text labels and active-tint colors. Catalog filters across All / Fitness / Study / Habit / Dare / Creative.

---

- [ ] **Step 1: Add i18n keys**

Merge into `src/lib/i18n/locales/en.json` (keep all existing keys):

```json
{
  "tabs": {
    "home": "Home",
    "catalog": "Catalog",
    "profile": "Profile"
  },
  "catalog": {
    "title": "Catalog",
    "all": "All",
    "fitness": "Fitness",
    "study": "Study",
    "habit": "Habit",
    "dare": "Dare",
    "creative": "Creative"
  }
}
```

- [ ] **Step 2: Tabs layout**

Replace `app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { t } from '@/lib/i18n';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#A855F7',
        tabBarInactiveTintColor: '#8B8B98',
        tabBarStyle: { backgroundColor: '#16161C', borderTopColor: '#1F1F28' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="catalog" options={{ title: t('tabs.catalog') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
```

- [ ] **Step 3: Profile stub (Task 8 fills this in)**

Create `app/(tabs)/profile.tsx`:

```tsx
import { SafeAreaView, Text, View } from 'react-native';

export default function ProfileTab() {
  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center">
        <Text className="text-text-primary">profile (filled in Task 8)</Text>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Catalog screen**

Create `app/(tabs)/catalog.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, Text, View, ScrollView } from 'react-native';
import { CategoryChip } from '@/features/challenges/components/CategoryChip';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { usePresetChallenges } from '@/features/challenges/api/usePresetChallenges';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
import { t } from '@/lib/i18n';
import type { Category } from '@/types/database';

const FILTERS: { id: Category | 'all'; labelKey: string }[] = [
  { id: 'all', labelKey: 'catalog.all' },
  { id: 'fitness', labelKey: 'catalog.fitness' },
  { id: 'study', labelKey: 'catalog.study' },
  { id: 'habit', labelKey: 'catalog.habit' },
  { id: 'dare', labelKey: 'catalog.dare' },
  { id: 'creative', labelKey: 'catalog.creative' },
];

export default function CatalogTab() {
  const router = useRouter();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const { data: challenges, isLoading } = usePresetChallenges(category);
  const { data: accepts } = useMyAccepts('accepted');
  const acceptedIds = new Set((accepts ?? []).map((a) => a.challenge_id));

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="px-6 pb-3 pt-4">
        <Text className="font-display text-3xl text-text-primary">{t('catalog.title')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
        className="mb-3 max-h-12"
      >
        {FILTERS.map((f) => (
          <CategoryChip
            key={f.id}
            label={t(f.labelKey)}
            active={category === f.id}
            onPress={() => setCategory(f.id)}
          />
        ))}
      </ScrollView>
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 24, gap: 12 }}
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              accepted={acceptedIds.has(item.id)}
              onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(catalog): 3-tab layout + Catalog screen with category filter"
```

---

## Task 6: Challenge detail screen + accept flow

**Files:**

- Create: `app/challenge/[id].tsx`
- Modify: `src/lib/i18n/locales/en.json`

**Interfaces:**

- Produces: `/challenge/:id` route rendering one of three states:
  1. Not accepted → Accept button (calls `useAcceptChallenge`)
  2. Accepted, not completed → "Submit proof" button (stub — Plan 4 wires the flow)
  3. Completed → checkmark + XP earned summary (Plan 4 reads from `challenge_completions`)

---

- [ ] **Step 1: Add i18n keys**

Merge into `src/lib/i18n/locales/en.json`:

```json
{
  "challenge": {
    "accept": "⚡ Accept Challenge",
    "submitProof": "Submit Proof",
    "completedToday": "Completed today",
    "comingSoon": "Submit flow lands in Plan 4",
    "proofRequired": {
      "honor": "Honor system — tap to mark done",
      "photo": "Snap a photo to complete",
      "video": "Record a short clip to complete",
      "peer": "Group members vote to approve"
    }
  }
}
```

- [ ] **Step 2: Challenge detail screen**

Create `app/challenge/[id].tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { DifficultyBadge } from '@/features/challenges/components/DifficultyBadge';
import { ProofTypeIcon } from '@/features/challenges/components/ProofTypeIcon';
import { useChallenge } from '@/features/challenges/api/useChallenge';
import { useMyAccept } from '@/features/challenges/api/useMyAccept';
import { useAcceptChallenge } from '@/features/challenges/api/useAcceptChallenge';
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

  if (isLoading || !challenge) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const state: 'fresh' | 'accepted' | 'completed' =
    accept?.status === 'completed' ? 'completed' : accept ? 'accepted' : 'fresh';

  // Fire one analytics event per detail-view
  analytics.track('challenge_viewed', { challenge_id: challenge.id, category: challenge.category });

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
          <Button
            onPress={() => Alert.alert(t('challenge.submitProof'), t('challenge.comingSoon'))}
          >
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
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(challenge): detail screen + accept flow (3 states)"
```

---

## Task 7: Real Home screen

**Files:**

- Replace: `app/(tabs)/index.tsx`

**Interfaces:**

- Produces: Home shows streak header (placeholder pulse for Plan 4), level + XP-to-next bar, "Today" list of accepted challenges, "Suggested for you" horizontal rail.

---

- [ ] **Step 1: Add i18n keys**

Merge into `src/lib/i18n/locales/en.json`:

```json
{
  "home": {
    "greeting": "Hey @{{username}}",
    "today": "TODAY",
    "suggested": "SUGGESTED FOR YOU",
    "emptyToday": "No active challenges. Pick one from the Catalog →",
    "loading": "Loading…",
    "level": "Level {{level}}",
    "xpProgress": "{{current}} / {{next}}",
    "streakDays": "{{count}} day streak",
    "streakDay": "1 day streak",
    "noStreak": "Start your streak"
  }
}
```

- [ ] **Step 2: Replace home screen**

Replace `app/(tabs)/index.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { ChallengeCard } from '@/features/challenges/components/ChallengeCard';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
import { useSuggestedChallenges } from '@/features/challenges/api/useSuggestedChallenges';
import { useAuthStore } from '@/features/auth/store';
import { levelFromXp, xpToNextLevel } from '@/lib/challenge';
import { t } from '@/lib/i18n';

export default function Home() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { data: accepts, isLoading: acceptsLoading } = useMyAccepts('accepted');
  const { data: suggested } = useSuggestedChallenges();

  const totalXp = Number(profile?.total_xp ?? 0);
  const level = levelFromXp(totalXp);
  const xp = xpToNextLevel(totalXp);
  const currentStreak = profile?.current_streak ?? 0;

  const streakLabel =
    currentStreak === 0
      ? t('home.noStreak')
      : currentStreak === 1
        ? t('home.streakDay')
        : t('home.streakDays', { count: currentStreak });

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-2xl text-text-primary">
            {t('home.greeting', { username: profile?.username ?? '' })}
          </Text>
          <View className="flex-row items-center gap-1 rounded-full bg-flame-from/15 px-3 py-1">
            <Text className="text-base">🔥</Text>
            <Text className="text-sm font-semibold text-flame-from">{streakLabel}</Text>
          </View>
        </View>

        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-muted">{t('home.level', { level })}</Text>
            <Text className="text-xs text-text-muted">
              {t('home.xpProgress', { current: xp.current, next: xp.next })}
            </Text>
          </View>
          <View className="mt-2 h-2 overflow-hidden rounded-full bg-bg-elevated">
            <View
              className="h-full bg-primary-500"
              style={{ width: `${Math.min(100, Math.round(xp.ratio * 100))}%` }}
            />
          </View>
        </View>

        <Text className="mt-8 text-xs font-semibold tracking-widest text-text-muted">
          {t('home.today')}
        </Text>
        {acceptsLoading ? (
          <ActivityIndicator className="mt-4" />
        ) : !accepts || accepts.length === 0 ? (
          <Text className="mt-4 text-sm text-text-muted">{t('home.emptyToday')}</Text>
        ) : (
          <View className="mt-3 gap-3">
            {accepts.map((a) => (
              <ChallengeCard
                key={a.id}
                challenge={a.challenge}
                accepted
                onPress={() =>
                  router.push({ pathname: '/challenge/[id]', params: { id: a.challenge.id } })
                }
              />
            ))}
          </View>
        )}

        <Text className="mt-8 text-xs font-semibold tracking-widest text-text-muted">
          {t('home.suggested')}
        </Text>
      </ScrollView>
      <View className="absolute bottom-20 left-0 right-0">
        <FlatList
          horizontal
          data={suggested ?? []}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              size="compact"
              onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: item.id } })}
            />
          )}
        />
      </View>
    </SafeAreaView>
  );
}
```

Note: the suggested rail is absolutely positioned above the tab bar to keep the layout simple. A cleaner solution lives in Plan 5 polish.

- [ ] **Step 3: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(home): real Home screen — streak header, level bar, Today list, Suggested rail"
```

---

## Task 8: Real Profile screen

**Files:**

- Replace: `app/(tabs)/profile.tsx`
- Create: `src/ui/StatTile.tsx`

**Interfaces:**

- Produces: Profile shows avatar placeholder, @username, level, three stat tiles (XP, current streak, completed count), Sign Out button at bottom. Completed count comes from `useMyAccepts('completed')` length (always 0 in Plan 3; Plan 4 populates it via the submit flow).

---

- [ ] **Step 1: Add i18n keys**

Merge into `src/lib/i18n/locales/en.json`:

```json
{
  "profile": {
    "stats": {
      "xp": "XP",
      "streak": "streak",
      "completed": "completed",
      "longest": "Longest streak: {{n}} day",
      "longestPlural": "Longest streak: {{n}} days"
    }
  }
}
```

- [ ] **Step 2: StatTile**

Create `src/ui/StatTile.tsx`:

```tsx
import { Text, View } from 'react-native';

type Props = { value: string | number; label: string; accent?: 'default' | 'flame' };

export function StatTile({ value, label, accent = 'default' }: Props) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-bg-surface px-4 py-4">
      <Text
        className={`font-display text-2xl ${accent === 'flame' ? 'text-flame-from' : 'text-text-primary'}`}
      >
        {value}
      </Text>
      <Text className="mt-1 text-xs text-text-muted">{label}</Text>
    </View>
  );
}
```

- [ ] **Step 3: Replace profile screen**

Replace `app/(tabs)/profile.tsx`:

```tsx
import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StatTile } from '@/ui/StatTile';
import { useAuthStore } from '@/features/auth/store';
import { useSignOut } from '@/features/auth/api/useSignOut';
import { useMyAccepts } from '@/features/challenges/api/useMyAccepts';
import { levelFromXp } from '@/lib/challenge';
import { t } from '@/lib/i18n';

export default function ProfileTab() {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useSignOut();
  const { data: completed } = useMyAccepts('completed');

  const level = levelFromXp(Number(profile?.total_xp ?? 0));
  const longest = profile?.longest_streak ?? 0;
  const longestLabel =
    longest === 1
      ? t('profile.stats.longest', { n: 1 })
      : t('profile.stats.longestPlural', { n: longest });

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <View className="items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-primary-500/30">
            <Text className="text-4xl">{(profile?.username ?? '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text className="mt-4 font-display text-2xl text-text-primary">
            @{profile?.username ?? '...'}
          </Text>
          <Text className="mt-1 text-sm text-text-muted">{t('home.level', { level })}</Text>
        </View>

        <View className="mt-8 flex-row gap-3">
          <StatTile value={profile?.total_xp ?? 0} label={t('profile.stats.xp')} />
          <StatTile
            value={`${profile?.current_streak ?? 0} 🔥`}
            label={t('profile.stats.streak')}
            accent="flame"
          />
          <StatTile value={(completed ?? []).length} label={t('profile.stats.completed')} />
        </View>

        <Text className="mt-4 text-center text-xs text-text-muted">{longestLabel}</Text>
      </View>
      <View className="px-6 pb-8">
        <Button variant="ghost" onPress={() => signOut.mutate()}>
          {t('auth.signOut')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(profile): real Profile tab with stat tiles + StatTile primitive"
```

---

## Plan 3 — Acceptance

Plan 3 is complete when ALL of these are true:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run test` passes (Plan 1+2 suites + new `challenge.test.ts`)
- [ ] `supabase db reset` applies migrations 0001–0007 cleanly
- [ ] `psql -f supabase/tests/rls_slice1.test.sql` reports `TEST PASS`
- [ ] `psql -f supabase/tests/username_finalize.test.sql` still passes
- [ ] App launches into Home tab after sign-in + onboarding
- [ ] Home shows the greeting + streak chip + level bar + "Today" empty state + Suggested rail (filled if user picked interests)
- [ ] Catalog tab lists 30 challenges across category chips; tapping a chip filters; tapping a card opens the detail screen
- [ ] Challenge detail screen shows the right state (Accept / Submit / Completed) and the Accept button creates a `challenge_accepts` row, returning to Catalog where the card now shows ✓ Accepted, and to Home where it appears under Today
- [ ] Accept is idempotent: tapping Accept on a challenge that's already accepted does NOT crash (treated as success via 23505 unique-violation handling)
- [ ] Profile tab shows username initials avatar, level, three stat tiles (XP / streak / completed), and Sign Out

### Deferred items (not part of Plan 3 acceptance)

- Submit proof flow + XP awarding + streak tick → **Plan 4**
- Phosphor icons on tabs and challenge categories → **Plan 5 polish**
- Suggested rail layout (currently absolutely positioned) → **Plan 5 polish**
- Public profile route + share cards → **Plan 5** (per Doc A virality)
- Pull-to-refresh on Home / Catalog → **Plan 5 polish**
- Empty-state illustrations → **Plan 5 polish**

---

## Self-review notes (already applied while writing)

- One Supabase call per hook; screens never touch the client directly.
- Accept mutation invalidates three query families (mine, single, suggested). Catalog's `acceptedIds` set comes from `useMyAccepts('accepted')` which is one of the invalidated queries, so the ✓ Accepted badge appears optimistically after `mutateAsync` resolves.
- RLS test exercises the actual policy enforcement under the `authenticated` role with JWT claims set — not just service_role.
- Suggested-challenges query uses a server-side `NOT IN` to filter accepted IDs; if the user has accepted many challenges this stays a single PostgREST call.
- Idempotent accept: Postgres `23505` from the unique constraint is caught and treated as success, matching the spec's expectation that re-tapping Accept never crashes or double-counts.
- `levelFromXp` is unit-tested with a parameterized matrix; reused by Home and Profile.
- All screen strings flow through i18n; the `home.streakDays / streakDay` split avoids singular/plural drift.
- `useAcceptChallenge` no longer ships an `onMutate` optimistic cache update — invalidations on `onSuccess` are simpler and the mutation is fast (single insert). If Plan 4 makes accept slower (e.g., server-side validation), revisit with `onMutate` + rollback.

**Next plan after this:** Plan 4 — Proof submission + XP engine + celebration. Wires the Submit Proof button on the challenge detail screen, ships honor + photo proof flows, implements the `submit-completion` Edge Function with the 5 validation cases, fires the streak trigger end-to-end, and animates the celebration screen.
