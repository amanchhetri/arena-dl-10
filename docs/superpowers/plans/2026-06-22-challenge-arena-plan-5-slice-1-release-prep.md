# Challenge Arena — Plan 5: Slice 1 Release Prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Slice 1 so the app is ready for TestFlight + Google Play internal track. Add the Settings screen, polish the visible UI (tab icons, suggested-rail layout, pull-to-refresh, empty states), wire a "share my profile" stub, add a top-level error boundary so the app degrades gracefully instead of white-screening, and prepare release-side metadata (EAS build profiles, privacy questionnaire content, store-listing draft).

**Architecture:** No new external services. One new SQL migration (`delete_my_account` RPC). One new feature folder (`src/features/settings/`). Phosphor icons replace text labels on the tab bar; emoji-as-category-icon is intentionally kept on Challenge cards because it fits the playful tone (Doc A §5). Pull-to-refresh uses RN's built-in `RefreshControl` invalidating the relevant TanStack queries. Share button uses RN's `Share` API with a placeholder URL (real share-card generation is Slice 4).

**Tech Stack additions:** `phosphor-react-native`, `react-native-svg` (peer for Phosphor). No new state-management or networking deps.

## Global Constraints

- Settings screen is `/settings` (root stack, not under tabs — settings is a destination, not a peer of Home).
- Delete account is a destructive action behind a confirmation modal showing the username + final "Yes, delete" button.
- All settings writes use the existing `users` table RLS (own-row update from Plan 3 migration 0007).
- Phosphor variant is "duotone" per Doc A §5 design direction.
- Pull-to-refresh tint color is `primary-500` (`#A855F7`).
- Empty states never use Lottie; emoji + concise copy + (optional) primary CTA is the pattern. Real illustrations are post-PMF.
- Error boundary catches render errors only (not promise rejections — Sentry's auto-instrumentation covers those).
- EAS profiles: `development`, `preview`, `production`. Production profile bumps the bundle identifier check + uses the real version from `app.json`.
- No new i18n keys without a matching English string in `en.json`.

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx                       # MODIFIED — Phosphor icons
│   │   ├── index.tsx                         # MODIFIED — pull-to-refresh + rail layout fix
│   │   ├── catalog.tsx                       # MODIFIED — pull-to-refresh + empty state
│   │   └── profile.tsx                       # MODIFIED — settings link + share button
│   ├── settings/
│   │   ├── _layout.tsx                       # NEW
│   │   ├── index.tsx                         # NEW — main settings list
│   │   ├── notification-time.tsx             # NEW — time picker route
│   │   ├── display-name.tsx                  # NEW — edit display name
│   │   └── delete-account.tsx                # NEW — confirmation route
│   ├── _layout.tsx                           # MODIFIED — wrap with ErrorBoundary
│   └── +error.tsx                            # NEW — Expo Router error route fallback
├── src/
│   ├── features/
│   │   ├── settings/
│   │   │   ├── api/
│   │   │   │   ├── useUpdateNotifTime.ts     # NEW
│   │   │   │   ├── useUpdateDisplayName.ts   # NEW
│   │   │   │   ├── useToggleProfileVisibility.ts # NEW
│   │   │   │   └── useDeleteAccount.ts       # NEW (calls delete_my_account RPC)
│   │   │   └── components/
│   │   │       ├── SettingsRow.tsx           # NEW — generic row primitive
│   │   │       └── SettingsSection.tsx       # NEW — section header + grouping
│   │   └── share/
│   │       └── api/
│   │           └── useShareProfile.ts        # NEW — uses RN Share API
│   ├── ui/
│   │   ├── ErrorBoundary.tsx                 # NEW
│   │   └── EmptyState.tsx                    # NEW — reusable empty/zero-state primitive
│   └── lib/
│       └── icons.ts                          # NEW — Phosphor re-exports w/ consistent props
├── supabase/
│   ├── migrations/
│   │   └── 0011_delete_account.sql           # NEW — delete_my_account RPC
│   └── tests/
│       └── delete_account.test.sql           # NEW
├── eas.json                                  # NEW — build profiles
└── docs/release/
    ├── app-store-privacy.md                  # NEW — answers for App Privacy questionnaire
    ├── store-listing-draft.md                # NEW — title / subtitle / description / keywords
    └── screenshots.md                        # NEW — screen size + content checklist
```

**Decomposition rationale:**

- Settings sub-routes (`notification-time`, `display-name`, `delete-account`) keep the main `settings/index.tsx` focused on the list; each leaf is one concrete action.
- `SettingsRow` + `SettingsSection` are extracted because they're reused across at least 4 rows and feel atomic.
- `EmptyState` is general (Catalog filter empty, Home today empty, future "no results" cases all use it).
- `lib/icons.ts` centralizes Phosphor imports so we can change icon styles (duotone → fill) in one place later.
- `docs/release/` separates content authoring from code — these files are markdown briefs the engineer copies into App Store Connect / Play Console at submission time.

---

## Task 1: `delete_my_account` RPC + SQL test

**Files:**

- Create: `supabase/migrations/0011_delete_account.sql`, `supabase/tests/delete_account.test.sql`

**Interfaces:**

- Produces: SQL function `public.delete_my_account()` that deletes the caller's `auth.users` row, which cascades through every `on delete cascade` FK to wipe `public.users`, `challenge_accepts`, `challenge_completions`, and any Storage objects under their folder.

---

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/delete_account.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'del1@local', '', now(), now());

update public.users set username = 'will_delete' where id = 'd1111111-0000-0000-0000-000000000001';

-- Seed an accept + completion to verify cascade
insert into public.challenge_accepts (id, challenge_id, user_id)
select 'd1111111-aaaa-aaaa-aaaa-000000000001', id,
       'd1111111-0000-0000-0000-000000000001'
  from public.challenges where group_id is null limit 1;

insert into public.challenge_completions (accept_id, user_id, challenge_id, proof_type, xp_awarded)
select 'd1111111-aaaa-aaaa-aaaa-000000000001',
       'd1111111-0000-0000-0000-000000000001',
       challenge_id, 'honor', 30
  from public.challenge_accepts where id = 'd1111111-aaaa-aaaa-aaaa-000000000001';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"d1111111-0000-0000-0000-000000000001","role":"authenticated"}';

-- Call the function
select public.delete_my_account();

reset role;

-- Verify cascade
do $$
declare n int;
begin
  select count(*) into n from public.users where id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: public.users row not cascaded (% rows)', n; end if;

  select count(*) into n from auth.users where id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: auth.users row not deleted'; end if;

  select count(*) into n from public.challenge_accepts
    where user_id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: accepts not cascaded (% rows)', n; end if;

  select count(*) into n from public.challenge_completions
    where user_id='d1111111-0000-0000-0000-000000000001';
  if n != 0 then raise exception 'FAIL: completions not cascaded (% rows)', n; end if;
end $$;

commit;
select 'TEST PASS: delete_my_account' as result;
```

- [ ] **Step 2: Run failing test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/delete_account.test.sql
```

Expected: FAIL — function does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0011_delete_account.sql`:

```sql
-- 0011_delete_account.sql
-- Self-service account deletion. Removes auth.users row, which cascades to
-- public.users (via FK) and then onward to accepts, completions, badges, etc.
-- Storage objects under proof/<user_id>/ are intentionally NOT auto-removed
-- here — Slice 1's bucket policies prevent reads after the auth row is gone,
-- so they become inaccessible immediately. A scheduled cleanup job to garbage-
-- collect orphaned objects is post-PMF work.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Deleting the auth.users row triggers FK cascade through public.users
  -- and from there through accepts + completions.
  delete from auth.users where id = v_user_id;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
```

- [ ] **Step 4: Apply + verify test passes**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/delete_account.test.sql
```

Expected: `TEST PASS: delete_my_account`.

- [ ] **Step 5: Extend Database type**

In `src/types/database.ts`, add to the `Functions` block:

```ts
      delete_my_account: {
        Args: Record<string, never>;
        Returns: void;
      };
```

- [ ] **Step 6: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(db): delete_my_account RPC with cascade verification"
```

---

## Task 2: Settings list screen + 4 mutation hooks

**Files:**

- Create: `app/settings/_layout.tsx`, `app/settings/index.tsx`
- Create: `src/features/settings/api/{useUpdateNotifTime,useUpdateDisplayName,useToggleProfileVisibility,useDeleteAccount}.ts`
- Create: `src/features/settings/components/{SettingsRow,SettingsSection}.tsx`
- Modify: `src/lib/i18n/locales/en.json`

**Interfaces:**

- Produces:
  - 4 mutation hooks, each invalidating the `['users', userId]` query on success.
  - `SettingsRow` accepts `{ label, value?, onPress?, destructive?, last? }`.
  - `SettingsSection` accepts `{ title, children }` — wraps rows with a section header.
  - `/settings/index` lists all rows, navigates to sub-routes for time picker / display name / delete confirmation.

---

- [ ] **Step 1: i18n keys**

Merge into `src/lib/i18n/locales/en.json`:

```json
{
  "settings": {
    "title": "Settings",
    "notifications": {
      "section": "NOTIFICATIONS",
      "eveningTime": "Evening reminder time",
      "set": "Set time"
    },
    "privacy": {
      "section": "PRIVACY",
      "publicProfile": "Public profile",
      "publicProfileHint": "Lets your stats appear on shared cards"
    },
    "account": {
      "section": "ACCOUNT",
      "displayName": "Display name",
      "username": "Username",
      "email": "Email"
    },
    "danger": {
      "section": "DANGER ZONE",
      "deleteAccount": "Delete account",
      "deleteConfirmTitle": "Delete @{{username}}?",
      "deleteConfirmBody": "This wipes your XP, streaks, accepts, completions, and any uploaded proof. There is no undo.",
      "deleteConfirmAction": "Yes, delete everything",
      "deleting": "Deleting…"
    },
    "saved": "Saved",
    "displayName": {
      "title": "Display name",
      "placeholder": "How others see you",
      "save": "Save"
    }
  }
}
```

- [ ] **Step 2: Settings layout**

Create `app/settings/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { t } from '@/lib/i18n';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0F' },
        headerTintColor: '#F4F4F8',
        headerTitleStyle: { color: '#F4F4F8' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="notification-time" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="display-name" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="delete-account" options={{ presentation: 'modal', title: '' }} />
    </Stack>
  );
}
```

- [ ] **Step 3: SettingsRow + SettingsSection**

Create `src/features/settings/components/SettingsRow.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';

type Props = {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  rightSlot?: React.ReactNode;
};

export function SettingsRow({ label, value, onPress, destructive, last, rightSlot }: Props) {
  const Container = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      className={`flex-row items-center justify-between px-4 py-4 ${
        last ? '' : 'border-b border-bg-elevated'
      } ${onPress ? 'active:bg-bg-elevated' : ''}`}
    >
      <Text className={`text-base ${destructive ? 'text-accent-pink' : 'text-text-primary'}`}>
        {label}
      </Text>
      {rightSlot ?? (value ? <Text className="text-sm text-text-muted">{value}</Text> : null)}
    </Container>
  );
}
```

Create `src/features/settings/components/SettingsSection.tsx`:

```tsx
import { Text, View } from 'react-native';

type Props = { title: string; children: React.ReactNode };

export function SettingsSection({ title, children }: Props) {
  return (
    <View className="mb-6">
      <Text className="mb-2 px-4 text-xs font-semibold tracking-widest text-text-muted">
        {title}
      </Text>
      <View className="mx-0 overflow-hidden rounded-2xl bg-bg-surface">{children}</View>
    </View>
  );
}
```

- [ ] **Step 4: Mutation hooks**

Create `src/features/settings/api/useUpdateNotifTime.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useUpdateNotifTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (timeHHMM: string) => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ notification_pref_evening_time: timeHHMM })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
```

Create `src/features/settings/api/useUpdateDisplayName.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useUpdateDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 40) {
        throw new Error('Display name must be 1-40 characters');
      }
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ display_name: trimmed })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
```

Create `src/features/settings/api/useToggleProfileVisibility.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';

export function useToggleProfileVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isPublic: boolean) => {
      const userId = useAuthStore.getState().session?.user.id;
      if (!userId) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('users') as any)
        .update({ is_public_profile: isPublic })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      const userId = useAuthStore.getState().session?.user.id;
      await qc.invalidateQueries({ queryKey: ['users', userId] });
    },
  });
}
```

Create `src/features/settings/api/useDeleteAccount.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('delete_my_account');
      if (error) throw error;
    },
    onSuccess: async () => {
      // Sign out client-side; auth.users row is already gone server-side
      await supabase.auth.signOut();
      useAuthStore.getState().clearAll();
      qc.clear();
      analytics.reset();
    },
  });
}
```

- [ ] **Step 5: Settings list screen**

Create `app/settings/index.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { ScrollView, Switch } from 'react-native';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { useAuthStore } from '@/features/auth/store';
import { useToggleProfileVisibility } from '@/features/settings/api/useToggleProfileVisibility';
import { t } from '@/lib/i18n';

export default function SettingsIndex() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const toggleVisibility = useToggleProfileVisibility();

  return (
    <ScrollView
      className="flex-1 bg-bg-base"
      contentContainerStyle={{ padding: 16, paddingTop: 24 }}
    >
      <SettingsSection title={t('settings.notifications.section')}>
        <SettingsRow
          label={t('settings.notifications.eveningTime')}
          value={profile?.notification_pref_evening_time?.slice(0, 5) ?? '20:00'}
          onPress={() => router.push('/settings/notification-time')}
          last
        />
      </SettingsSection>

      <SettingsSection title={t('settings.privacy.section')}>
        <SettingsRow
          label={t('settings.privacy.publicProfile')}
          rightSlot={
            <Switch
              value={profile?.is_public_profile ?? true}
              onValueChange={(v) => toggleVisibility.mutate(v)}
              trackColor={{ true: '#A855F7' }}
            />
          }
          last
        />
      </SettingsSection>

      <SettingsSection title={t('settings.account.section')}>
        <SettingsRow
          label={t('settings.account.displayName')}
          value={profile?.display_name ?? ''}
          onPress={() => router.push('/settings/display-name')}
        />
        <SettingsRow label={t('settings.account.username')} value={`@${profile?.username ?? ''}`} />
        <SettingsRow label={t('settings.account.email')} value="—" last />
      </SettingsSection>

      <SettingsSection title={t('settings.danger.section')}>
        <SettingsRow
          label={t('settings.danger.deleteAccount')}
          destructive
          onPress={() => router.push('/settings/delete-account')}
          last
        />
      </SettingsSection>
    </ScrollView>
  );
}
```

- [ ] **Step 6: Commit**

```bash
bun run typecheck
git add .
git commit -m "feat(settings): settings list + 4 mutation hooks + row/section primitives"
```

---

## Task 3: Settings sub-routes — display name, notification time, delete account

**Files:**

- Create: `app/settings/display-name.tsx`, `app/settings/notification-time.tsx`, `app/settings/delete-account.tsx`

---

- [ ] **Step 1: Display name editor**

Create `app/settings/display-name.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useUpdateDisplayName } from '@/features/settings/api/useUpdateDisplayName';
import { t } from '@/lib/i18n';

export default function DisplayNameEdit() {
  const router = useRouter();
  const current = useAuthStore((s) => s.profile?.display_name ?? '');
  const [value, setValue] = useState(current);
  const mutation = useUpdateDisplayName();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('settings.displayName.title')}
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={t('settings.displayName.placeholder')}
          placeholderTextColor="#8B8B98"
          maxLength={40}
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || value.trim().length < 1}
          onPress={async () => {
            try {
              await mutation.mutateAsync(value);
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('settings.displayName.save')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Notification time picker (text input fallback)**

We avoid `@react-native-community/datetimepicker` for now (extra native dep, not strictly required for Slice 1). Use a simple HH:MM TextInput with validation. The native picker can be a Plan 6 polish task.

Create `app/settings/notification-time.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useUpdateNotifTime } from '@/features/settings/api/useUpdateNotifTime';
import { t } from '@/lib/i18n';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function NotificationTimeEdit() {
  const router = useRouter();
  const current = useAuthStore((s) => s.profile?.notification_pref_evening_time ?? '20:00');
  const [value, setValue] = useState(current.slice(0, 5));
  const mutation = useUpdateNotifTime();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-6 font-display text-2xl text-text-primary">
          {t('settings.notifications.eveningTime')}
        </Text>
        <TextInput
          value={value}
          onChangeText={(v) => setValue(v.replace(/[^0-9:]/g, '').slice(0, 5))}
          placeholder="20:00"
          placeholderTextColor="#8B8B98"
          keyboardType="numbers-and-punctuation"
          className="rounded-2xl bg-bg-surface px-4 py-3 text-base text-text-primary"
        />
        <Text className="mt-2 text-xs text-text-muted">24h format · HH:MM</Text>
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={mutation.isPending || !HHMM.test(value)}
          onPress={async () => {
            try {
              await mutation.mutateAsync(`${value}:00`);
              router.back();
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('settings.notifications.set')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Delete account confirmation**

Create `app/settings/delete-account.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useDeleteAccount } from '@/features/settings/api/useDeleteAccount';
import { t } from '@/lib/i18n';

export default function DeleteAccount() {
  const router = useRouter();
  const username = useAuthStore((s) => s.profile?.username ?? '');
  const mutation = useDeleteAccount();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <Text className="mb-4 font-display text-2xl text-accent-pink">
          {t('settings.danger.deleteConfirmTitle', { username })}
        </Text>
        <Text className="mb-8 text-base text-text-muted">
          {t('settings.danger.deleteConfirmBody')}
        </Text>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button
          disabled={mutation.isPending}
          onPress={async () => {
            try {
              await mutation.mutateAsync();
              // AuthRouter in root layout sees no session → routes to (auth)/sign-in
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {mutation.isPending
            ? t('settings.danger.deleting')
            : t('settings.danger.deleteConfirmAction')}
        </Button>
        <Button variant="ghost" disabled={mutation.isPending} onPress={() => router.back()}>
          Cancel
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Add settings link to Profile + remove sign-out (move it to settings)**

Edit `app/(tabs)/profile.tsx` — add a Settings row in place of sign-out button at the bottom, and add sign-out as a settings row in `app/settings/index.tsx`.

Settings: add to bottom of the settings list (after Danger Zone section), and add i18n key:

In `app/settings/index.tsx`, after the Danger Zone section, add:

```tsx
<SettingsSection title="SESSION">
  <SettingsRow label={t('auth.signOut')} onPress={() => useSignOutMutation()} last />
</SettingsSection>
```

Or actually keep sign-out on Profile too (Doc C §C2 wireframe has it there) but ALSO add a settings entry. To avoid clutter, keep just one place — Profile already had it from Plan 3. Decision: **keep sign-out on Profile**; settings is for changing settings, sign-out is a session action.

Modify `app/(tabs)/profile.tsx` to add the settings link icon at the top (in place of the placeholder `⚙` from Doc C). For now, a simple "Settings" row link above the sign-out button:

```tsx
import { Pressable } from 'react-native';
// inside the bottom <View className="px-6 pb-8">, add before sign-out:
<Pressable
  onPress={() => router.push('/settings')}
  className="mb-3 items-center rounded-2xl bg-bg-surface px-4 py-3"
>
  <Text className="font-semibold text-text-primary">Settings</Text>
</Pressable>;
```

Add `useRouter` import + `const router = useRouter();` if not present.

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(settings): display name, notif time, delete account routes + profile link"
```

---

## Task 4: Phosphor icons on tab bar

**Files:**

- Create: `src/lib/icons.ts`
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**

- Produces: `Icon` re-exports from Phosphor (`House`, `BookOpenText`, `User`, etc.) with consistent default props. Tab bar shows icons + labels.

---

- [ ] **Step 1: Install Phosphor + svg peer**

```bash
bunx expo install react-native-svg
bun add phosphor-react-native
```

- [ ] **Step 2: Re-export configured icons**

Create `src/lib/icons.ts`:

```ts
import { BookOpenText, House, User } from 'phosphor-react-native';

export const Icon = {
  Home: House,
  Catalog: BookOpenText,
  Profile: User,
} as const;

export const ICON_DEFAULTS = {
  size: 24,
  weight: 'duotone' as const,
};
```

- [ ] **Step 3: Wire into tab bar**

Replace `app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { Icon, ICON_DEFAULTS } from '@/lib/icons';
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
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <Icon.Home {...ICON_DEFAULTS} color={color} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: t('tabs.catalog'),
          tabBarIcon: ({ color }) => <Icon.Catalog {...ICON_DEFAULTS} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <Icon.Profile {...ICON_DEFAULTS} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 4: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(ui): Phosphor duotone icons on tab bar"
```

---

## Task 5: Pull-to-refresh on Home + Catalog

**Files:**

- Modify: `app/(tabs)/index.tsx`, `app/(tabs)/catalog.tsx`

**Interfaces:**

- Produces: pull-down on Home invalidates accepts + suggested + user profile; pull-down on Catalog invalidates challenges + accepts.

---

- [ ] **Step 1: Home pull-to-refresh**

In `app/(tabs)/index.tsx`, replace `<ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 160 }}>` with a refreshable version. Add imports:

```tsx
import { RefreshControl } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
```

Inside the component:

```tsx
const qc = useQueryClient();
const userId = useAuthStore((s) => s.session?.user.id);
const [refreshing, setRefreshing] = useState(false);
async function onRefresh() {
  setRefreshing(true);
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
    qc.invalidateQueries({ queryKey: ['challenges', 'suggested', userId] }),
    qc.invalidateQueries({ queryKey: ['users', userId] }),
  ]);
  setRefreshing(false);
}
```

Replace the opening ScrollView with:

```tsx
<ScrollView
  contentContainerStyle={{ padding: 24, paddingBottom: 160 }}
  refreshControl={
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
  }
>
```

- [ ] **Step 2: Catalog pull-to-refresh**

Same pattern in `app/(tabs)/catalog.tsx`. Add to the `FlatList`:

```tsx
import { RefreshControl } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
```

Inside component:

```tsx
const qc = useQueryClient();
const userId = useAuthStore((s) => s.session?.user.id);
const [refreshing, setRefreshing] = useState(false);
async function onRefresh() {
  setRefreshing(true);
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['challenges', 'presets'] }),
    qc.invalidateQueries({ queryKey: ['accepts', 'mine', userId] }),
  ]);
  setRefreshing(false);
}
```

Add to FlatList props:

```tsx
refreshControl={
  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />
}
```

- [ ] **Step 3: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(home+catalog): pull-to-refresh wired to query invalidation"
```

---

## Task 6: EmptyState primitive + fix Home suggested-rail layout

**Files:**

- Create: `src/ui/EmptyState.tsx`
- Modify: `app/(tabs)/index.tsx`, `app/(tabs)/catalog.tsx`

**Interfaces:**

- Produces: `<EmptyState emoji label cta? />` primitive used by Home Today, Catalog (filter empty), and future surfaces. Removes the `position: absolute` hack on Home's suggested rail in favor of a proper inline horizontal scroll inside the ScrollView.

---

- [ ] **Step 1: EmptyState**

Create `src/ui/EmptyState.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';

type Props = {
  emoji: string;
  label: string;
  cta?: { label: string; onPress: () => void };
};

export function EmptyState({ emoji, label, cta }: Props) {
  return (
    <View className="items-center px-6 py-8">
      <Text className="mb-3 text-5xl">{emoji}</Text>
      <Text className="mb-4 text-center text-base text-text-muted">{label}</Text>
      {cta && (
        <Pressable
          onPress={cta.onPress}
          className="rounded-full bg-primary-500 px-6 py-3 active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">{cta.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Home — inline suggested rail (remove absolute positioning)**

In `app/(tabs)/index.tsx`, restructure so the suggested rail is part of the ScrollView (not absolutely positioned). Replace the bottom `<View className="absolute …">` block. The Today empty-state also uses `EmptyState` now:

```tsx
// ...inside ScrollView, where Today section is rendered:
<Text className="mt-8 text-xs font-semibold tracking-widest text-text-muted">
  {t('home.today')}
</Text>;
{
  acceptsLoading ? (
    <ActivityIndicator className="mt-4" />
  ) : !accepts || accepts.length === 0 ? (
    <EmptyState
      emoji="🎯"
      label={t('home.emptyToday')}
      cta={{
        label: t('tabs.catalog'),
        onPress: () => router.push('/(tabs)/catalog'),
      }}
    />
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
  );
}

<Text className="mt-8 text-xs font-semibold tracking-widest text-text-muted">
  {t('home.suggested')}
</Text>;
{
  suggested && suggested.length > 0 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingTop: 12 }}
    >
      {suggested.map((c) => (
        <ChallengeCard
          key={c.id}
          challenge={c}
          size="compact"
          onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}
        />
      ))}
    </ScrollView>
  ) : null;
}
```

Delete the old `<View className="absolute bottom-20 …">` block at the bottom of the screen entirely. Reduce the ScrollView's `paddingBottom` from 160 back down to 32 (no longer reserving space for an absolute rail).

- [ ] **Step 3: Catalog empty state for filtered category**

Inside the FlatList, set `ListEmptyComponent`:

```tsx
ListEmptyComponent={
  <EmptyState
    emoji="🔍"
    label={`No ${category === 'all' ? '' : category} challenges yet`}
  />
}
```

- [ ] **Step 4: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(ui): EmptyState primitive + inline suggested rail (no more absolute hack)"
```

---

## Task 7: Share profile stub + ErrorBoundary + +error route

**Files:**

- Create: `src/features/share/api/useShareProfile.ts`, `src/ui/ErrorBoundary.tsx`, `app/+error.tsx`
- Modify: `app/(tabs)/profile.tsx`, `app/_layout.tsx`

**Interfaces:**

- Produces:
  - `useShareProfile()` — wraps RN `Share.share`, posts a placeholder URL `https://arena.app/u/<username>` (real domain TBD per Doc A). Logs an analytics event.
  - `ErrorBoundary` — class component catching render errors, reports to Sentry, shows a friendly fallback.
  - `+error.tsx` — Expo Router's per-route error fallback (different from class-based boundary; covers routing-level errors).

---

- [ ] **Step 1: i18n keys**

Merge into `en.json`:

```json
{
  "share": {
    "profile": {
      "title": "Check out my Challenge Arena profile",
      "message": "I'm @{{username}} on Challenge Arena — {{xp}} XP, {{streak}} day streak 🔥"
    }
  },
  "errors": {
    "boundary": {
      "title": "Something broke",
      "body": "We logged the error and the team will look at it. Try restarting the app.",
      "reload": "Reload"
    }
  }
}
```

- [ ] **Step 2: useShareProfile**

Create `src/features/share/api/useShareProfile.ts`:

```ts
import { Share } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/lib/i18n';

// Real share-card generation + final domain are Slice 4 scope.
const PLACEHOLDER_BASE = 'https://arena.app/u';

export function useShareProfile() {
  return useMutation({
    mutationFn: async () => {
      const profile = useAuthStore.getState().profile;
      if (!profile) throw new Error('No profile loaded');
      const url = `${PLACEHOLDER_BASE}/${profile.username}`;
      const message = t('share.profile.message', {
        username: profile.username,
        xp: profile.total_xp,
        streak: profile.current_streak,
      });
      await Share.share({
        title: t('share.profile.title'),
        message: `${message}\n${url}`,
        url, // iOS-only
      });
    },
  });
}
```

- [ ] **Step 3: Add Share button to Profile**

In `app/(tabs)/profile.tsx`, add a Share button above Sign out:

```tsx
import { useShareProfile } from '@/features/share/api/useShareProfile';
// inside component:
const shareMutation = useShareProfile();
// in JSX (in the bottom <View className="px-6 pb-8">):
<Button variant="ghost" onPress={() => shareMutation.mutate()} disabled={shareMutation.isPending}>
  Share my profile
</Button>;
```

- [ ] **Step 4: ErrorBoundary**

Create `src/ui/ErrorBoundary.tsx`:

```tsx
import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { t } from '@/lib/i18n';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View className="flex-1 items-center justify-center bg-bg-base px-6">
        <Text className="mb-3 font-display text-2xl text-text-primary">
          {t('errors.boundary.title')}
        </Text>
        <Text className="mb-8 text-center text-base text-text-muted">
          {t('errors.boundary.body')}
        </Text>
        <Pressable
          onPress={() => this.setState({ hasError: false, error: undefined })}
          className="rounded-2xl bg-primary-500 px-6 py-3"
        >
          <Text className="text-base font-semibold text-white">{t('errors.boundary.reload')}</Text>
        </Pressable>
      </View>
    );
  }
}
```

- [ ] **Step 5: Expo Router +error route**

Create `app/+error.tsx`:

```tsx
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { t } from '@/lib/i18n';

export default function RouterErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center bg-bg-base px-6">
      <Text className="mb-3 font-display text-2xl text-text-primary">
        {t('errors.boundary.title')}
      </Text>
      <Text className="mb-2 text-center text-base text-text-muted">
        {t('errors.boundary.body')}
      </Text>
      <Text className="mb-8 text-center text-xs text-text-muted">{error.message}</Text>
      <Pressable onPress={retry} className="rounded-2xl bg-primary-500 px-6 py-3">
        <Text className="text-base font-semibold text-white">{t('errors.boundary.reload')}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 6: Wrap root layout**

In `app/_layout.tsx`, wrap `<AuthRouter />` inside `<ErrorBoundary>`:

```tsx
import { ErrorBoundary } from '@/ui/ErrorBoundary';

// in render:
return (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <AuthRouter />
    </ErrorBoundary>
  </QueryClientProvider>
);
```

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(share+errors): share profile stub + class ErrorBoundary + +error route"
```

---

## Task 8: EAS build profiles + release docs

**Files:**

- Create: `eas.json`, `docs/release/app-store-privacy.md`, `docs/release/store-listing-draft.md`, `docs/release/screenshots.md`

**Interfaces:**

- Produces:
  - `eas.json` with 3 build profiles (`development`, `preview`, `production`).
  - Release docs the human submitter copy-pastes into App Store Connect / Play Console.

---

- [ ] **Step 1: EAS profiles**

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 2: Privacy questionnaire content**

Create `docs/release/app-store-privacy.md`:

```markdown
# Challenge Arena — App Privacy Questionnaire Answers

Paste each section verbatim into App Store Connect's App Privacy section.

## Data Collected and Linked to Identity

### Contact Info

- **Email Address** — used for: App Functionality (sign-in via magic link), Account Management.

### User Content

- **Photos or Videos** — used for: App Functionality (challenge proof submission). Stored in private bucket; visible only to the user (group-mates added in Slice 2).
- **Other User Content** — display name, bio, avatar URL.

### Identifiers

- **User ID** — Supabase-issued UUID. Used for: App Functionality, Analytics.

### Usage Data

- **Product Interaction** — challenges viewed/accepted/completed, level-ups, streak milestones. Used for: Analytics, Product Personalization.

### Diagnostics

- **Crash Data** — via Sentry. Used for: App Functionality.
- **Performance Data** — via Sentry. Used for: App Functionality.

## Data NOT Collected

- Location, health/fitness data, financial info, contacts, browsing history,
  search history, advertising data, sensor data, other diagnostic data.

## Tracking

- We do NOT track users across other companies' apps and websites.

## Data Use Disclosures

- Email is used solely for sign-in delivery (transactional). No marketing emails.
- Analytics events are not joined with any external advertising graph.
```

- [ ] **Step 3: Store listing draft**

Create `docs/release/store-listing-draft.md`:

```markdown
# Challenge Arena — Store Listing Copy

## App Name

Challenge Arena

## Subtitle (iOS, max 30 chars)

XP for doing literally anything

## Short Description (Android, max 80 chars)

The playful XP app where you and your crew take on real-world challenges.

## Full Description (max 4000 chars iOS / Android)

Challenge Arena turns your day into a game.

Pick a challenge — anything from "drink 8 glasses of water" to "compliment a
stranger" to "study 30 minutes phone-free" — accept it, do it, snap a photo if
needed, and rack up XP. Build a streak. Level up. Show off.

Why people use Challenge Arena:

• 30+ preset challenges across fitness, study, habits, dares, and creative
• Daily streak that keeps you honest (with a free weekly grace day)
• Levels and XP rewards that mean nothing — and somehow everything
• Tiered proof: honor system for the little wins, photo for the bigger ones
• Private by default — your stuff is yours, your friends' is theirs

This is just Slice 1. Groups, leaderboards, and shareable streak cards are
coming next.

Built for Gen Z, the playful crowd, and anyone who treats their phone like
a friend.

## Keywords (iOS, max 100 chars, comma-separated)

challenge,xp,streak,gamification,habit,duolingo,bereal,fitness,study,daily

## Promotional Text (iOS, max 170 chars)

Get XP for the things you already do. Pick a challenge, submit proof, watch
your streak grow. New here? Start with a preset and see how it feels.

## Support URL

https://github.com/amanchhetri/arena-dl-10 (placeholder — replace before submit)

## Marketing URL (optional)

(leave blank for v0.1)

## Privacy Policy URL

(REQUIRED — generate a simple page at e.g. https://amanchhetri.github.io/arena-privacy/
before submit)

## Age Rating

- iOS: 12+ (Infrequent/Mild Cartoon or Fantasy Violence: No; everything else: No)
- Android: Teen (13+)

## Category

- Primary: Health & Fitness
- Secondary: Lifestyle
```

- [ ] **Step 4: Screenshot checklist**

Create `docs/release/screenshots.md`:

```markdown
# Challenge Arena — Screenshot Requirements

Final assets go in `assets/store/{ios,android}/`.

## iOS (required sizes for App Store Connect, 2025+)

- **6.7" iPhone (1290×2796)** — REQUIRED. Use iPhone 15 Pro Max simulator.
- **6.5" iPhone (1284×2778 or 1242×2688)** — REQUIRED for older review device.
- **5.5" iPhone (1242×2208)** — OPTIONAL.
- iPad — OPTIONAL since we set `supportsTablet: false`.

## Android (Play Console)

- **Phone screenshots: 1080×1920 minimum, 7680×3840 max**, 16:9 or 9:16.
- 2 minimum, 8 recommended.
- Feature graphic: 1024×500 PNG (no transparency).

## Content per screen (3-shot set, both platforms)

1. **Catalog** — show category chips with one selected; cards visible
   showing variety of categories. Caption overlay: "Pick from 30+ challenges."
2. **Home with streak** — username + 7-day streak chip + two Today cards +
   suggested rail. Caption: "Build a streak. Show off."
3. **Celebration** — XP counter mid-animation + flame tick + level-up overlay
   visible. Caption: "Win something every day."

## Capture tips

- Use a sample account with username "mira\_" pre-seeded with realistic data
  (level 3, ~240 XP, 5-day streak, 2 accepted challenges).
- Disable status bar clock variability via simulator override (Cmd+1 in
  Simulator → Device → Status Bar... pinned 9:41).
- Don't forget Dynamic Island clearance on the 6.7" capture.
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore(release): EAS profiles + App Privacy / store listing / screenshot specs"
```

---

## Plan 5 — Acceptance

Plan 5 is complete when ALL of these are true:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run test` — all suites pass
- [ ] `supabase db reset` applies migrations 0001–0011 cleanly
- [ ] `psql -f supabase/tests/delete_account.test.sql` reports `TEST PASS`
- [ ] Settings tab is reachable from Profile; all sections render correctly
- [ ] Display name + notification time edits persist to `public.users`
- [ ] Public profile toggle persists to `is_public_profile`
- [ ] Delete account: confirmation → tap → server cascades → client signed out → returns to sign-in
- [ ] Tab bar shows Phosphor icons + labels (Home / Catalog / Profile)
- [ ] Pull-to-refresh on Home + Catalog triggers query invalidation (verify via Reactotron / RN debugger if available; otherwise visual)
- [ ] Suggested rail is no longer absolutely positioned; scrolls inline with the rest of Home
- [ ] Empty Today shows the new `EmptyState` with a "Catalog" CTA
- [ ] Empty Catalog filter shows the new `EmptyState`
- [ ] "Share my profile" button on Profile opens the native share sheet with the placeholder URL
- [ ] Triggering a render error inside any screen shows the ErrorBoundary fallback instead of a white screen (test by temporarily throwing in a component)
- [ ] `eas.json` exists with 3 valid profiles (verify with `bunx eas build --profile development --platform ios --non-interactive --dry-run` if EAS CLI is configured)
- [ ] All three release docs exist under `docs/release/`

### Deferred items (not part of Plan 5 acceptance)

- Real Phosphor icons on challenge category emojis (kept emoji for playful tone)
- Native time picker (`@react-native-community/datetimepicker`) — text input is sufficient for Slice 1
- Lottie or SVG illustrations on empty states — emoji + copy good enough
- Email field in settings showing the actual email (requires reading `auth.users` from the client — server function or session.user.email handling — small task, deferred to first polish pass)
- Settings → notification permission re-prompt (if user denied originally)
- Real share-card image generation → **Slice 4**
- Public profile route at `/u/<username>` → **Slice 4**
- App icon final art → designer task; current placeholder ships in EAS preview builds
- Privacy policy URL hosted page → human task before App Store submit
- TestFlight + Play internal upload — requires Apple Developer account + Google Play Console enrollment (human steps)

---

## Self-review notes (already applied while writing)

- `delete_my_account` cascades through `auth.users → public.users → challenge_accepts/completions` via the existing FKs from migrations 0001/0003/0004. Storage objects under `proof/<user_id>/` become inaccessible immediately (RLS policy from 0008 requires `auth.uid()` match). GC of orphaned objects is a separate post-PMF cron.
- ErrorBoundary catches RENDER errors only. Promise rejections and event-handler throws are caught by Sentry's auto-instrumentation already wired in `src/lib/sentry.ts`.
- `+error.tsx` is Expo Router's per-route error boundary — kicks in for navigation-level errors that escape the class boundary.
- Settings hooks all invalidate `['users', userId]`, which is the query key `useCurrentUserProfile` uses. Profile updates flow back into the Zustand store via the existing effect in `useCurrentUserProfile`.
- Phosphor icons are kept simple (3 icons in re-export) so swapping the icon style (duotone → fill / regular) is one-line.
- Suggested-rail fix removes `position: absolute` debt from Plan 3 — flagged in Plan 3's deferred items.
- All new strings live in i18n; no hardcoded UI text.
- `eas.json` uses `appVersionSource: "remote"` so version is managed by EAS, not the local `app.json` — fewer merge conflicts.

**Next plan after this:** **Slice 1 Real Device Testing + TestFlight upload** — needs Apple Developer enrollment + a working iOS Simulator (xcode-select). After that, **Slice 2** brainstorm: groups, invite codes, group leaderboards, group feed.
