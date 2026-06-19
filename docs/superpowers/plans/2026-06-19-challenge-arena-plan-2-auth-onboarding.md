# Challenge Arena — Plan 2: Auth + Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the three sign-in buttons (Apple, Google, Email magic link) to real Supabase auth and ship the three onboarding screens (username, interests, notifications). After Plan 2 a fresh signup lands the user on a home stub, with `users.username` set to their chosen handle.

**Architecture:** Supabase Auth handles all three providers; session is mirrored to the Zustand `useAuthStore` and persisted to AsyncStorage via the supabase-js client. The root layout becomes the auth router: signed-out → `(auth)/sign-in`, signed-in-but-no-username → `onboarding/*`, signed-in-with-username → `(tabs)/index`. Email magic-link uses Supabase's local Inbucket/Mailpit for dev testing. Apple/Google providers are wired structurally but require OAuth credentials to actually authenticate end-to-end (instructions included).

**Tech Stack additions (beyond Plan 1):** expo-apple-authentication, expo-auth-session, expo-web-browser, expo-crypto, expo-secure-store, expo-notifications. Reuses Supabase client, TanStack Query, Zustand, i18n from Plan 1.

## Global Constraints

- Username regex (enforced at DB + client): `^[a-z0-9_]{3,20}$`
- Apple Sign In MUST appear first in the sign-in screen if any third-party social login is offered (App Store policy)
- Auth deep-link scheme: `arena://auth`
- Local dev magic-link inbox: Mailpit at `http://127.0.0.1:54324`
- All user-facing strings via `i18n.t()` — add new keys under `signIn.*`, `onboarding.*`, `auth.*`
- Wrap every Supabase auth call in a TanStack mutation hook under `src/features/auth/api/`
- Session never written to Zustand directly — only via `onAuthStateChange` subscription in `app/_layout.tsx`
- Onboarding gate: a `public.users` row whose `username` starts with `u_` (the placeholder pattern from migration `0001_users.sql`'s `handle_new_auth_user` trigger) means the user has not completed onboarding
- "Public" username (chosen by user) MUST overwrite the placeholder; the regex ensures no real username can start with `u_` because `u_` is technically a valid prefix — explicit check needed

---

## File structure produced by this plan

```
challenge-arena/
├── app/
│   ├── _layout.tsx                          # MODIFIED — adds auth router + onAuthStateChange
│   ├── (auth)/
│   │   ├── _layout.tsx                      # NEW — signed-out stack
│   │   ├── sign-in.tsx                      # MOVED from app/index.tsx, wired
│   │   └── email-sent.tsx                   # NEW — "check your inbox" waiting screen
│   ├── onboarding/
│   │   ├── _layout.tsx                      # NEW — onboarding stack (no header, no back-to-auth)
│   │   ├── username.tsx                     # NEW
│   │   ├── interests.tsx                    # NEW
│   │   └── notifications.tsx                # NEW
│   ├── (tabs)/
│   │   ├── _layout.tsx                      # NEW (minimal — full tabs in Plan 3)
│   │   └── index.tsx                        # NEW — placeholder home, "Hey @username" + sign-out
│   ├── +not-found.tsx                       # unchanged
│   └── index.tsx                            # REPLACED — redirects based on auth state
├── src/
│   ├── features/auth/
│   │   ├── api/
│   │   │   ├── useSignInWithApple.ts        # NEW
│   │   │   ├── useSignInWithGoogle.ts       # NEW
│   │   │   ├── useSignInWithEmail.ts        # NEW
│   │   │   ├── useSignOut.ts                # NEW
│   │   │   └── useCurrentUserProfile.ts     # NEW
│   │   ├── components/
│   │   │   └── ProviderButton.tsx           # NEW — branded Apple/Google/Email button
│   │   ├── store.ts                         # MODIFIED — adds `profile` field
│   │   ├── store.test.ts                    # MODIFIED
│   │   └── schema.ts                        # NEW — zod schemas (username, email)
│   ├── features/onboarding/
│   │   ├── api/
│   │   │   ├── useClaimUsername.ts          # NEW
│   │   │   ├── useSaveInterests.ts          # NEW
│   │   │   ├── useUsernameAvailable.ts      # NEW — debounced uniqueness check
│   │   │   └── useRegisterPushToken.ts      # NEW
│   │   ├── components/
│   │   │   ├── StepHeader.tsx               # NEW — "Step N of 3" + dots
│   │   │   ├── UsernameInput.tsx            # NEW
│   │   │   └── InterestChip.tsx             # NEW
│   │   └── schema.ts                        # NEW
│   ├── lib/
│   │   ├── deepLinks.ts                     # NEW — universal-link helper
│   │   └── reservedUsernames.ts             # NEW — small disallow list
│   └── lib/i18n/locales/en.json             # MODIFIED — adds auth + onboarding strings
├── supabase/
│   ├── migrations/
│   │   └── 0006_username_finalize.sql       # NEW — adds `public.users_finalize_username()` RPC
│   └── tests/
│       └── username_finalize.test.sql       # NEW
├── .env.local                                # MODIFIED (user-managed) — adds OAuth client IDs
└── .env.example                              # MODIFIED — documents OAuth env vars
```

**Decomposition rationale:**

- Auth and onboarding share session state but are otherwise independent features → separate folders.
- Each provider sign-in is its own mutation hook (separate testable unit) rather than one mega hook.
- The username claim has its own SQL RPC because it needs server-side enforcement of uniqueness + the "no `u_` prefix" rule and must atomically replace the placeholder.

---

## Task 1: Add auth-state listener + auth router in root layout

**Files:**

- Modify: `app/_layout.tsx`
- Modify: `src/features/auth/store.ts`, `src/features/auth/store.test.ts`

**Interfaces:**

- Consumes: `supabase` from Plan 1, `useAuthStore` from Plan 1.
- Produces: `useAuthStore` now exposes `{ session, profile, setSession, setProfile, clearAll }`. RootLayout subscribes to `supabase.auth.onAuthStateChange` and updates the store. Expo Router renders a redirect-based gate that funnels each session state to the right stack.

---

- [ ] **Step 1: Extend Zustand store with `profile` field — write failing test**

Replace `src/features/auth/store.test.ts`:

```ts
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from './store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAll();
  });

  it('starts with null session and null profile', () => {
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it('setSession stores the session', () => {
    const fakeSession = { access_token: 'abc', user: { id: '1' } } as unknown as Session;
    useAuthStore.getState().setSession(fakeSession);
    expect(useAuthStore.getState().session).toBe(fakeSession);
  });

  it('setProfile stores the profile', () => {
    const fakeProfile = { id: '1', username: 'mira_', display_name: 'Mira' } as never;
    useAuthStore.getState().setProfile(fakeProfile);
    expect(useAuthStore.getState().profile).toBe(fakeProfile);
  });

  it('clearAll clears both', () => {
    const s = { access_token: 'x' } as unknown as Session;
    useAuthStore.getState().setSession(s);
    useAuthStore.getState().setProfile({ id: '1' } as never);
    useAuthStore.getState().clearAll();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
bun run test src/features/auth/store.test.ts
```

Expected: FAIL — `setProfile` and `clearAll` not defined.

- [ ] **Step 3: Update store**

Replace `src/features/auth/store.ts`:

```ts
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { UserRow } from '@/types/database';

type AuthState = {
  session: Session | null;
  profile: UserRow | null;
  setSession: (s: Session | null) => void;
  setProfile: (p: UserRow | null) => void;
  clearAll: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  clearAll: () => set({ session: null, profile: null }),
}));
```

- [ ] **Step 4: Tests pass**

```bash
bun run test src/features/auth/store.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Create the `useCurrentUserProfile` hook**

Create `src/features/auth/api/useCurrentUserProfile.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '../store';
import type { UserRow } from '@/types/database';

export function useCurrentUserProfile() {
  const session = useAuthStore((s) => s.session);
  const setProfile = useAuthStore((s) => s.setProfile);

  const query = useQuery<UserRow | null>({
    queryKey: ['users', session?.user.id ?? 'anon'],
    enabled: Boolean(session?.user.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (query.data) setProfile(query.data);
    if (query.data === null) setProfile(null);
  }, [query.data, setProfile]);

  return query;
}
```

- [ ] **Step 6: Wire auth state listener + auth router into root layout**

Replace `app/_layout.tsx`:

```tsx
import '../global.css';
import '@/lib/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { initAnalytics } from '@/lib/analytics/client';
import { initSentry } from '@/lib/sentry';
import { useAuthStore } from '@/features/auth/store';
import { useCurrentUserProfile } from '@/features/auth/api/useCurrentUserProfile';

initSentry();

function AuthRouter() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const segments = useSegments();
  const router = useRouter();
  const { isLoading } = useCurrentUserProfile();

  useEffect(() => {
    if (session && isLoading && !profile) return; // wait for profile

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }
    const needsOnboarding = !profile || profile.username.startsWith('u_');
    if (needsOnboarding) {
      if (!inOnboarding) router.replace('/onboarding/username');
      return;
    }
    if (inAuthGroup || inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [session, profile, segments, router, isLoading]);

  return <Slot />;
}

export default function RootLayout() {
  useEffect(() => {
    void initAnalytics();
    supabase.auth.getSession().then(({ data }) => {
      useAuthStore.getState().setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      useAuthStore.getState().setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthRouter />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Typecheck + commit**

```bash
bun run typecheck
git add .
git commit -m "feat(auth): session listener + auth router gate"
```

---

## Task 2: Move sign-in to `(auth)` route group + ProviderButton

**Files:**

- Move: `app/index.tsx` content → `app/(auth)/sign-in.tsx`
- Create: `app/(auth)/_layout.tsx`, `app/index.tsx` (redirect stub), `src/features/auth/components/ProviderButton.tsx`
- Modify: `src/lib/i18n/locales/en.json`

**Interfaces:**

- Produces: `(auth)` route group with `sign-in` route. `ProviderButton` accepts `{ provider, onPress, busy }`.

---

- [ ] **Step 1: Add i18n keys**

Edit `src/lib/i18n/locales/en.json` — merge the following into the existing JSON:

```json
{
  "auth": {
    "sendingMagicLink": "Sending…",
    "emailSentTitle": "Check your inbox",
    "emailSentBody": "We sent a sign-in link to {{email}}. Tap the link to come back here.",
    "resend": "Resend",
    "useDifferentEmail": "Use a different email",
    "emailPlaceholder": "you@example.com",
    "signOut": "Sign out",
    "errors": {
      "generic": "Something went wrong. Try again."
    }
  }
}
```

Keep existing `app.*`, `signIn.*`, `legal.*`. Final file structure (preserve all keys):

```json
{
  "app": { "name": "Challenge Arena", "tagline": "Get XP for doing literally anything" },
  "signIn": {
    "continueWithApple": "Continue with Apple",
    "continueWithGoogle": "Continue with Google",
    "continueWithEmail": "Continue with Email"
  },
  "auth": {
    /* as above */
  },
  "legal": { "terms": "Terms", "privacy": "Privacy" }
}
```

- [ ] **Step 2: Create `(auth)/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Create `ProviderButton`**

Create `src/features/auth/components/ProviderButton.tsx`:

```tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type Provider = 'apple' | 'google' | 'email';

const iconForProvider: Record<Provider, string> = {
  apple: '',
  google: 'G',
  email: '✉',
};

const labelClassForProvider: Record<Provider, string> = {
  apple: 'text-white',
  google: 'text-text-primary',
  email: 'text-text-primary',
};

const bgClassForProvider: Record<Provider, string> = {
  apple: 'bg-white/95',
  google: 'bg-bg-elevated',
  email: 'bg-transparent',
};

type Props = {
  provider: Provider;
  label: string;
  onPress: () => void;
  busy?: boolean;
};

export function ProviderButton({ provider, label, onPress, busy }: Props) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      className={`items-center justify-center rounded-2xl px-6 py-4 ${bgClassForProvider[provider]} ${
        busy ? 'opacity-60' : 'active:opacity-80'
      }`}
    >
      <View className="flex-row items-center justify-center gap-3">
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Text className={`text-base font-semibold ${labelClassForProvider[provider]}`}>
            {iconForProvider[provider]}
          </Text>
        )}
        <Text
          className={`text-base font-semibold ${provider === 'apple' ? 'text-black' : labelClassForProvider[provider]}`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Move sign-in screen and add redirect stub**

Create `app/(auth)/sign-in.tsx`:

```tsx
import { SafeAreaView, Text, View } from 'react-native';
import { ProviderButton } from '@/features/auth/components/ProviderButton';
import { t } from '@/lib/i18n';

export default function SignIn() {
  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 font-display text-4xl text-text-primary">{t('app.name')}</Text>
        <Text className="mb-12 text-center text-base text-text-muted">{t('app.tagline')}</Text>

        <View className="w-full gap-3">
          <ProviderButton
            provider="apple"
            label={t('signIn.continueWithApple')}
            onPress={() => {}}
          />
          <ProviderButton
            provider="google"
            label={t('signIn.continueWithGoogle')}
            onPress={() => {}}
          />
          <ProviderButton
            provider="email"
            label={t('signIn.continueWithEmail')}
            onPress={() => {}}
          />
        </View>
      </View>
      <View className="flex-row justify-center gap-4 pb-8">
        <Text className="text-xs text-text-muted">{t('legal.terms')}</Text>
        <Text className="text-xs text-text-muted">·</Text>
        <Text className="text-xs text-text-muted">{t('legal.privacy')}</Text>
      </View>
    </SafeAreaView>
  );
}
```

Replace `app/index.tsx` with a redirect (the AuthRouter handles routing, this is just the entry point):

```tsx
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(auth)/sign-in" />;
}
```

- [ ] **Step 5: Verify bundle + commit**

```bash
bun run typecheck && bun run test && bunx expo export --platform ios --dump-sourcemap=false
rm -rf dist
git add .
git commit -m "feat(auth): move sign-in into (auth) group + ProviderButton"
```

---

## Task 3: Email magic-link sign-in + email-sent screen + zod schema

**Files:**

- Create: `src/features/auth/schema.ts`, `src/features/auth/api/useSignInWithEmail.ts`, `app/(auth)/email-sent.tsx`
- Modify: `app/(auth)/sign-in.tsx` (wire Email button to a modal/sheet input or push to a route)

**Interfaces:**

- Produces: `useSignInWithEmail()` mutation. Hitting Email button → modal input → submit → push to `email-sent` route with email param.

---

- [ ] **Step 1: Install zod**

```bash
bun add zod
```

- [ ] **Step 2: Create schema**

Create `src/features/auth/schema.ts`:

```ts
import { z } from 'zod';

export const EmailSchema = z.string().trim().toLowerCase().email({ message: 'Invalid email' });

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-z0-9_]+$/, 'Use only lowercase letters, digits, and underscores')
  .refine((v) => !v.startsWith('u_'), 'Username cannot start with "u_"');

export type EmailInput = z.infer<typeof EmailSchema>;
export type UsernameInput = z.infer<typeof UsernameSchema>;
```

- [ ] **Step 3: Write a quick zod schema test**

Create `src/features/auth/__tests__/schema.test.ts`:

```ts
import { EmailSchema, UsernameSchema } from '../schema';

describe('EmailSchema', () => {
  it('accepts a valid email', () => {
    expect(EmailSchema.parse('Mira@Example.com')).toBe('mira@example.com');
  });
  it('rejects an invalid email', () => {
    expect(() => EmailSchema.parse('not-an-email')).toThrow();
  });
});

describe('UsernameSchema', () => {
  it('lowercases + accepts valid', () => {
    expect(UsernameSchema.parse('Mira_')).toBe('mira_');
  });
  it('rejects too short', () => {
    expect(() => UsernameSchema.parse('ab')).toThrow();
  });
  it('rejects bad chars', () => {
    expect(() => UsernameSchema.parse('mira!')).toThrow();
  });
  it('rejects u_ prefix', () => {
    expect(() => UsernameSchema.parse('u_xyz123')).toThrow();
  });
});
```

Run:

```bash
bun run test src/features/auth/__tests__/schema.test.ts
```

Expected: 5 passing.

- [ ] **Step 4: Create the email mutation hook**

Create `src/features/auth/api/useSignInWithEmail.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';
import { EmailSchema } from '../schema';

export function useSignInWithEmail() {
  return useMutation({
    mutationFn: async (rawEmail: string) => {
      const email = EmailSchema.parse(rawEmail);
      analytics.track('signup_started', { provider: 'email' });
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: 'arena://auth' },
      });
      if (error) throw error;
      return email;
    },
  });
}
```

- [ ] **Step 5: Create email-sent screen**

Create `app/(auth)/email-sent.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { useSignInWithEmail } from '@/features/auth/api/useSignInWithEmail';

export default function EmailSent() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [resentAt, setResentAt] = useState<number | null>(null);
  const mutation = useSignInWithEmail();

  const canResend = !resentAt || Date.now() - resentAt > 30_000;

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-4 text-5xl">✉️</Text>
        <Text className="mb-3 font-display text-2xl text-text-primary">
          {t('auth.emailSentTitle')}
        </Text>
        <Text className="mb-8 text-center text-base text-text-muted">
          {t('auth.emailSentBody', { email: email ?? '' })}
        </Text>
        <Pressable
          disabled={!canResend || mutation.isPending}
          onPress={async () => {
            await mutation.mutateAsync(email ?? '');
            setResentAt(Date.now());
          }}
          className="mb-4"
        >
          <Text
            className={`text-base font-semibold ${canResend ? 'text-primary-500' : 'text-text-muted'}`}
          >
            {t('auth.resend')}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-base text-text-muted">{t('auth.useDifferentEmail')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 6: Wire the Email button on sign-in**

For Plan 2 we use `prompt()` as the email input for speed (a proper modal sheet is a later polish task — captured in deferred items below). Edit `app/(auth)/sign-in.tsx`:

```tsx
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, Text, View } from 'react-native';
import { useSignInWithEmail } from '@/features/auth/api/useSignInWithEmail';
import { ProviderButton } from '@/features/auth/components/ProviderButton';
import { t } from '@/lib/i18n';

export default function SignIn() {
  const router = useRouter();
  const emailMutation = useSignInWithEmail();

  function handleEmail() {
    Alert.prompt(
      t('signIn.continueWithEmail'),
      t('auth.emailPlaceholder'),
      async (input?: string) => {
        if (!input) return;
        try {
          const email = await emailMutation.mutateAsync(input);
          router.push({ pathname: '/(auth)/email-sent', params: { email } });
        } catch (e) {
          Alert.alert(t('auth.errors.generic'), (e as Error).message);
        }
      },
      'plain-text',
      '',
      'email-address',
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 font-display text-4xl text-text-primary">{t('app.name')}</Text>
        <Text className="mb-12 text-center text-base text-text-muted">{t('app.tagline')}</Text>
        <View className="w-full gap-3">
          <ProviderButton
            provider="apple"
            label={t('signIn.continueWithApple')}
            onPress={() => {}}
          />
          <ProviderButton
            provider="google"
            label={t('signIn.continueWithGoogle')}
            onPress={() => {}}
          />
          <ProviderButton
            provider="email"
            label={t('signIn.continueWithEmail')}
            onPress={handleEmail}
            busy={emailMutation.isPending}
          />
        </View>
      </View>
      <View className="flex-row justify-center gap-4 pb-8">
        <Text className="text-xs text-text-muted">{t('legal.terms')}</Text>
        <Text className="text-xs text-text-muted">·</Text>
        <Text className="text-xs text-text-muted">{t('legal.privacy')}</Text>
      </View>
    </SafeAreaView>
  );
}
```

Note: `Alert.prompt` is iOS-only. On Android in Plan 2 the Email button will be a no-op with a TODO toast. A cross-platform sheet input is the first task of Plan 3's polish pass — deferred until then to keep Plan 2 focused.

- [ ] **Step 7: Smoke test against local Supabase + commit**

```bash
bun run typecheck && bun run test
bunx expo export --platform ios --dump-sourcemap=false
rm -rf dist
git add .
git commit -m "feat(auth): email magic-link flow + email-sent screen + zod schemas"
```

Manual verification (when you next run the app):

1. Tap Email → enter `you@local.test` → submit
2. App routes to email-sent screen
3. Open Mailpit at <http://127.0.0.1:54324> → click the magic link in the email
4. Link opens the app (or you re-open it); session is set; auth router gates you into onboarding

---

## Task 4: Apple Sign In

**Files:**

- Create: `src/features/auth/api/useSignInWithApple.ts`
- Modify: `app/(auth)/sign-in.tsx` (wire Apple button)

**Interfaces:**

- Produces: `useSignInWithApple()` mutation. Only enabled on iOS (`Platform.OS === 'ios'`). Calls Apple's native sheet via `expo-apple-authentication`, exchanges the identity token with Supabase.

**Prerequisite:** an Apple Developer account + Service ID + Apple Sign In capability enabled. **Without these, the button calls show "Apple Sign In is not configured" instead of crashing.** Full configuration steps are in `docs/superpowers/specs/2026-06-19-challenge-arena-slice-1-spec.md` §4 (Auth flow detail) — but they require human action in App Store Connect that can't be automated.

---

- [ ] **Step 1: Install Apple auth**

```bash
bunx expo install expo-apple-authentication
```

- [ ] **Step 2: Add plugin to app.json**

Add `"expo-apple-authentication"` to the `plugins` array in `app.json`:

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-status-bar",
      "expo-localization",
      "@sentry/react-native",
      "expo-apple-authentication"
    ],
    "ios": {
      "bundleIdentifier": "app.challengearena",
      "usesAppleSignIn": true
    }
  }
}
```

- [ ] **Step 3: Create the Apple mutation hook**

Create `src/features/auth/api/useSignInWithApple.ts`:

```ts
import * as AppleAuthentication from 'expo-apple-authentication';
import { useMutation } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

export function useSignInWithApple() {
  return useMutation({
    mutationFn: async () => {
      if (Platform.OS !== 'ios') {
        throw new Error('Apple Sign In is only available on iOS');
      }
      analytics.track('signup_started', { provider: 'apple' });
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('No identity token from Apple');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
    },
  });
}
```

- [ ] **Step 4: Wire the button**

Edit `app/(auth)/sign-in.tsx` — replace the Apple ProviderButton onPress:

```tsx
import { useSignInWithApple } from '@/features/auth/api/useSignInWithApple';

// inside the component, alongside emailMutation:
const appleMutation = useSignInWithApple();

function handleApple() {
  appleMutation.mutate(undefined, {
    onError: (e) => Alert.alert(t('auth.errors.generic'), (e as Error).message),
  });
}

// in JSX:
<ProviderButton
  provider="apple"
  label={t('signIn.continueWithApple')}
  onPress={handleApple}
  busy={appleMutation.isPending}
/>;
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(auth): Apple Sign In (requires Apple Developer config to fully run)"
```

---

## Task 5: Google Sign In

**Files:**

- Create: `src/features/auth/api/useSignInWithGoogle.ts`
- Modify: `app/(auth)/sign-in.tsx`, `.env.example`, `.env.local`

**Interfaces:**

- Produces: `useSignInWithGoogle()` mutation using `expo-auth-session` Google provider with PKCE.

**Prerequisite:** Google Cloud OAuth client IDs (iOS, Android, Web). Without them set in `.env.local`, the button shows "Google Sign In is not configured."

---

- [ ] **Step 1: Install auth-session deps**

```bash
bunx expo install expo-auth-session expo-web-browser expo-crypto
```

- [ ] **Step 2: Add env var docs**

Add to `.env.example`:

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

Add the same three to `.env.local` with empty values (you fill them in from Google Cloud Console when ready):

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

- [ ] **Step 3: Create the Google mutation hook**

Create `src/features/auth/api/useSignInWithGoogle.ts`:

```ts
import * as Google from 'expo-auth-session/providers/google';
import { useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics/client';

WebBrowser.maybeCompleteAuthSession();

export function useSignInWithGoogle() {
  const [, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  return useMutation({
    mutationFn: async () => {
      analytics.track('signup_started', { provider: 'google' });
      const result = await promptAsync();
      if (result?.type !== 'success' || !result.params.id_token) {
        throw new Error('Google sign-in cancelled or failed');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: result.params.id_token,
      });
      if (error) throw error;
    },
  });
}
```

- [ ] **Step 4: Wire button** (same pattern as Apple — pull `useSignInWithGoogle()` into the component, attach to the Google `ProviderButton`)

- [ ] **Step 5: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(auth): Google Sign In (requires Google Cloud OAuth IDs in .env.local)"
```

---

## Task 6: Username claim — RPC migration + onboarding screen

**Files:**

- Create: `supabase/migrations/0006_username_finalize.sql`, `supabase/tests/username_finalize.test.sql`
- Create: `src/features/onboarding/api/useClaimUsername.ts`, `src/features/onboarding/api/useUsernameAvailable.ts`, `src/features/onboarding/components/StepHeader.tsx`, `src/features/onboarding/components/UsernameInput.tsx`, `src/lib/reservedUsernames.ts`
- Create: `app/onboarding/_layout.tsx`, `app/onboarding/username.tsx`

**Interfaces:**

- Produces:
  - SQL function `public.users_finalize_username(p_username text)` — atomically claims a username for `auth.uid()`, enforces uniqueness + `^[a-z0-9_]{3,20}$` + no `u_` prefix + reserved-list.
  - `useUsernameAvailable(username)` query — debounced uniqueness check.
  - `useClaimUsername()` mutation — wraps the RPC.
  - `<StepHeader step={1|2|3} />` showing `Step N of 3` + 3 dots.

---

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/tests/username_finalize.test.sql`:

```sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'finalize1@local', '', now(), now()),
  ('f2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'finalize2@local', '', now(), now());

-- Function rejects too-short
do $$ begin
  begin
    perform public.users_finalize_username('ab', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: too short should reject';
  exception when others then end;
end $$;

-- Function rejects bad chars
do $$ begin
  begin
    perform public.users_finalize_username('mira!', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: bad chars should reject';
  exception when others then end;
end $$;

-- Function rejects u_ prefix
do $$ begin
  begin
    perform public.users_finalize_username('u_abc123', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: u_ prefix should reject';
  exception when others then end;
end $$;

-- Function rejects reserved
do $$ begin
  begin
    perform public.users_finalize_username('admin', 'f1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: reserved should reject';
  exception when others then end;
end $$;

-- Happy path
select public.users_finalize_username('mira_', 'f1111111-0000-0000-0000-000000000001');

do $$
declare u text;
begin
  select username into u from public.users where id='f1111111-0000-0000-0000-000000000001';
  if u != 'mira_' then raise exception 'FAIL: username not claimed'; end if;
end $$;

-- Uniqueness
do $$ begin
  begin
    perform public.users_finalize_username('mira_', 'f2222222-0000-0000-0000-000000000002');
    raise exception 'FAIL: duplicate username should reject';
  exception when others then end;
end $$;

delete from public.users where id in (
  'f1111111-0000-0000-0000-000000000001',
  'f2222222-0000-0000-0000-000000000002'
);
delete from auth.users where id in (
  'f1111111-0000-0000-0000-000000000001',
  'f2222222-0000-0000-0000-000000000002'
);

commit;
select 'TEST PASS: username_finalize' as result;
```

- [ ] **Step 2: Run failing test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/username_finalize.test.sql
```

Expected: FAIL — function does not exist.

- [ ] **Step 3: Write migration**

Create `supabase/migrations/0006_username_finalize.sql`:

```sql
-- Reserved usernames (kept in sync with src/lib/reservedUsernames.ts).
-- Application-level validation is the primary check; this is a server backstop.

create or replace function public.users_finalize_username(
  p_username text,
  p_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text := lower(trim(p_username));
  v_reserved text[] := array[
    'admin','administrator','root','support','help','staff','team',
    'arena','challengearena','api','www','app','mobile',
    'signup','signin','login','logout','register','onboarding',
    'me','you','user','users','profile','settings','test'
  ];
begin
  if p_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username format' using errcode = '22023';
  end if;

  if v_normalized like 'u\_%' escape '\' then
    raise exception 'Username cannot start with u_' using errcode = '22023';
  end if;

  if v_normalized = any(v_reserved) then
    raise exception 'Username is reserved' using errcode = '22023';
  end if;

  if exists (select 1 from public.users where username = v_normalized and id != p_user_id) then
    raise exception 'Username already taken' using errcode = '23505';
  end if;

  update public.users set username = v_normalized where id = p_user_id;
end;
$$;

grant execute on function public.users_finalize_username(text, uuid) to authenticated;
grant execute on function public.users_finalize_username(text) to authenticated;
```

- [ ] **Step 4: Apply + verify test passes**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/username_finalize.test.sql
```

Expected: `TEST PASS: username_finalize`.

- [ ] **Step 5: Create reserved-username constant**

Create `src/lib/reservedUsernames.ts`:

```ts
// Mirror of the server-side list in 0006_username_finalize.sql.
// Kept in sync manually; the server check is authoritative.
export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'administrator',
  'root',
  'support',
  'help',
  'staff',
  'team',
  'arena',
  'challengearena',
  'api',
  'www',
  'app',
  'mobile',
  'signup',
  'signin',
  'login',
  'logout',
  'register',
  'onboarding',
  'me',
  'you',
  'user',
  'users',
  'profile',
  'settings',
  'test',
] as const;
```

- [ ] **Step 6: Create the API hooks**

Create `src/features/onboarding/api/useUsernameAvailable.ts`:

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
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('username', username);
      if (error) throw error;
      return { available: (count ?? 0) === 0 };
    },
  });
}
```

Create `src/features/onboarding/api/useClaimUsername.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { UsernameSchema } from '@/features/auth/schema';
import { analytics } from '@/lib/analytics/client';

export function useClaimUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rawUsername: string) => {
      const username = UsernameSchema.parse(rawUsername);
      const { error } = await supabase.rpc('users_finalize_username', { p_username: username });
      if (error) throw error;
      return username;
    },
    onSuccess: async () => {
      analytics.track('onboarding_step_completed', { step: 'username', skipped: false });
      const session = useAuthStore.getState().session;
      if (session?.user.id) {
        await qc.invalidateQueries({ queryKey: ['users', session.user.id] });
      }
    },
  });
}
```

- [ ] **Step 7: Create UI components**

Create `src/features/onboarding/components/StepHeader.tsx`:

```tsx
import { Text, View } from 'react-native';
import { t } from '@/lib/i18n';

export function StepHeader({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="mb-8 flex-row items-center justify-between">
      <Text className="text-sm text-text-muted">{t('onboarding.stepOf', { step, total: 3 })}</Text>
      <View className="flex-row gap-2">
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            className={`h-2 w-2 rounded-full ${n <= step ? 'bg-primary-500' : 'bg-bg-elevated'}`}
          />
        ))}
      </View>
    </View>
  );
}
```

Create `src/features/onboarding/components/UsernameInput.tsx`:

```tsx
import { TextInput, View, Text } from 'react-native';
import { useUsernameAvailable } from '../api/useUsernameAvailable';

type Props = { value: string; onChange: (v: string) => void };

export function UsernameInput({ value, onChange }: Props) {
  const { data, isLoading } = useUsernameAvailable(value);
  const status = !value ? null : isLoading ? 'checking' : data?.available ? 'available' : 'taken';

  return (
    <View>
      <View className="flex-row items-center rounded-2xl bg-bg-elevated px-4 py-3">
        <Text className="text-base text-text-muted">@</Text>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          placeholder="username"
          placeholderTextColor="#8B8B98"
          className="ml-1 flex-1 text-base text-text-primary"
        />
      </View>
      <Text className="mt-2 text-xs text-text-muted">3–20 chars · a–z, 0–9, _</Text>
      {status === 'checking' && <Text className="mt-1 text-xs text-text-muted">Checking…</Text>}
      {status === 'available' && <Text className="mt-1 text-xs text-xp-gain">✓ Available</Text>}
      {status === 'taken' && <Text className="mt-1 text-xs text-accent-pink">Already taken</Text>}
    </View>
  );
}
```

- [ ] **Step 8: Add i18n keys**

Merge into `src/lib/i18n/locales/en.json`:

```json
{
  "onboarding": {
    "stepOf": "Step {{step}} of {{total}}",
    "username": {
      "title": "Pick your username",
      "continue": "Continue"
    },
    "interests": {
      "title": "What's your vibe?",
      "subtitle": "Pick up to 5",
      "skip": "Skip for now",
      "continue": "Continue"
    },
    "notifications": {
      "title": "Keep your flame alive",
      "body": "We'll send one nudge in the evening if your streak's about to break. That's it.",
      "enable": "Turn on reminders",
      "later": "Maybe later"
    }
  }
}
```

- [ ] **Step 9: Create the onboarding layout + username screen**

Create `app/onboarding/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
```

Create `app/onboarding/username.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StepHeader } from '@/features/onboarding/components/StepHeader';
import { UsernameInput } from '@/features/onboarding/components/UsernameInput';
import { useClaimUsername } from '@/features/onboarding/api/useClaimUsername';
import { useUsernameAvailable } from '@/features/onboarding/api/useUsernameAvailable';
import { t } from '@/lib/i18n';

export default function UsernameStep() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const { data: avail } = useUsernameAvailable(value);
  const claim = useClaimUsername();

  const canContinue = Boolean(avail?.available) && !claim.isPending;

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <StepHeader step={1} />
        <Text className="mb-8 font-display text-3xl text-text-primary">
          {t('onboarding.username.title')}
        </Text>
        <UsernameInput value={value} onChange={setValue} />
      </View>
      <View className="px-6 pb-8">
        <Button
          disabled={!canContinue}
          onPress={async () => {
            try {
              await claim.mutateAsync(value);
              router.push('/onboarding/interests');
            } catch (e) {
              Alert.alert(t('auth.errors.generic'), (e as Error).message);
            }
          }}
        >
          {t('onboarding.username.continue')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 10: Verify + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(onboarding): username claim RPC + step screen"
```

---

## Task 7: Onboarding step 2 — interests

**Files:**

- Create: `src/features/onboarding/api/useSaveInterests.ts`, `src/features/onboarding/components/InterestChip.tsx`, `app/onboarding/interests.tsx`

---

- [ ] **Step 1: Create InterestChip**

Create `src/features/onboarding/components/InterestChip.tsx`:

```tsx
import { Pressable, Text } from 'react-native';

type Props = { label: string; emoji: string; selected: boolean; onToggle: () => void };

export function InterestChip({ label, emoji, selected, onToggle }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      className={`flex-row items-center gap-2 rounded-full border px-4 py-3 ${
        selected ? 'border-primary-500 bg-primary-500/20' : 'border-bg-elevated bg-bg-elevated'
      }`}
    >
      <Text className="text-base">{emoji}</Text>
      <Text
        className={`text-base ${selected ? 'font-semibold text-text-primary' : 'text-text-muted'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Create the save-interests mutation**

Create `src/features/onboarding/api/useSaveInterests.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

const VALID_INTERESTS = ['fitness', 'study', 'habit', 'dare', 'creative'] as const;

export function useSaveInterests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (interests: string[]) => {
      const cleaned = interests
        .filter((i): i is (typeof VALID_INTERESTS)[number] => VALID_INTERESTS.includes(i as never))
        .slice(0, 5);
      const session = useAuthStore.getState().session;
      if (!session?.user.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('users')
        .update({ interests: cleaned })
        .eq('id', session.user.id);
      if (error) throw error;
      return cleaned;
    },
    onSuccess: async (cleaned) => {
      analytics.track('onboarding_step_completed', {
        step: 'interests',
        skipped: cleaned.length === 0,
      });
      const session = useAuthStore.getState().session;
      if (session?.user.id) {
        await qc.invalidateQueries({ queryKey: ['users', session.user.id] });
      }
    },
  });
}
```

- [ ] **Step 3: Build the screen**

Create `app/onboarding/interests.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StepHeader } from '@/features/onboarding/components/StepHeader';
import { InterestChip } from '@/features/onboarding/components/InterestChip';
import { useSaveInterests } from '@/features/onboarding/api/useSaveInterests';
import { t } from '@/lib/i18n';

const OPTIONS: ReadonlyArray<{ id: string; emoji: string; label: string }> = [
  { id: 'fitness', emoji: '💪', label: 'Fitness' },
  { id: 'study', emoji: '📚', label: 'Study' },
  { id: 'habit', emoji: '🧘', label: 'Habit' },
  { id: 'creative', emoji: '🎨', label: 'Creative' },
  { id: 'dare', emoji: '🎲', label: 'Dare' },
];

export default function InterestsStep() {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const mutation = useSaveInterests();

  function toggle(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id],
    );
  }

  async function next(interests: string[]) {
    try {
      await mutation.mutateAsync(interests);
      router.push('/onboarding/notifications');
    } catch (e) {
      Alert.alert(t('auth.errors.generic'), (e as Error).message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 px-6 pt-8">
        <StepHeader step={2} />
        <Text className="mb-2 font-display text-3xl text-text-primary">
          {t('onboarding.interests.title')}
        </Text>
        <Text className="mb-8 text-base text-text-muted">{t('onboarding.interests.subtitle')}</Text>
        <View className="flex-row flex-wrap gap-3">
          {OPTIONS.map((opt) => (
            <InterestChip
              key={opt.id}
              label={opt.label}
              emoji={opt.emoji}
              selected={picked.includes(opt.id)}
              onToggle={() => toggle(opt.id)}
            />
          ))}
        </View>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button onPress={() => next(picked)} disabled={mutation.isPending}>
          {t('onboarding.interests.continue')}
        </Button>
        <Button onPress={() => next([])} variant="ghost" disabled={mutation.isPending}>
          {t('onboarding.interests.skip')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(onboarding): interests step (5 chips, multi-select, optional)"
```

---

## Task 8: Onboarding step 3 — notifications

**Files:**

- Create: `src/features/onboarding/api/useRegisterPushToken.ts`, `app/onboarding/notifications.tsx`

---

- [ ] **Step 1: Install expo-notifications + expo-device**

```bash
bunx expo install expo-notifications expo-device
```

- [ ] **Step 2: Create the register-push-token mutation**

Create `src/features/onboarding/api/useRegisterPushToken.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { analytics } from '@/lib/analytics/client';

export function useRegisterPushToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<'granted' | 'denied' | 'undetermined'> => {
      if (!Device.isDevice) {
        analytics.track('notification_permission_asked', { outcome: 'undetermined' });
        return 'undetermined';
      }
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      analytics.track('notification_permission_asked', {
        outcome: (status === 'granted'
          ? 'granted'
          : status === 'denied'
            ? 'denied'
            : 'undetermined') as never,
      });
      if (status !== 'granted') return status === 'denied' ? 'denied' : 'undetermined';

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const token = projectId
        ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
        : (await Notifications.getExpoPushTokenAsync()).data;

      const session = useAuthStore.getState().session;
      if (session?.user.id) {
        await supabase.from('users').update({ push_token: token }).eq('id', session.user.id);
        await qc.invalidateQueries({ queryKey: ['users', session.user.id] });
      }
      return 'granted';
    },
    onSuccess: () => {
      analytics.track('onboarding_step_completed', { step: 'notifications', skipped: false });
    },
  });
}
```

- [ ] **Step 3: Build the screen**

Create `app/onboarding/notifications.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { StepHeader } from '@/features/onboarding/components/StepHeader';
import { useRegisterPushToken } from '@/features/onboarding/api/useRegisterPushToken';
import { analytics } from '@/lib/analytics/client';
import { t } from '@/lib/i18n';

export default function NotificationsStep() {
  const router = useRouter();
  const mutation = useRegisterPushToken();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <StepHeader step={3} />
        <Text className="mb-4 text-6xl">🔥</Text>
        <Text className="mb-3 font-display text-2xl text-text-primary">
          {t('onboarding.notifications.title')}
        </Text>
        <Text className="mb-8 text-center text-base text-text-muted">
          {t('onboarding.notifications.body')}
        </Text>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button
          disabled={mutation.isPending}
          onPress={async () => {
            await mutation.mutateAsync();
            router.replace('/(tabs)');
          }}
        >
          {t('onboarding.notifications.enable')}
        </Button>
        <Button
          variant="ghost"
          onPress={() => {
            analytics.track('onboarding_step_completed', { step: 'notifications', skipped: true });
            router.replace('/(tabs)');
          }}
        >
          {t('onboarding.notifications.later')}
        </Button>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(onboarding): notifications step + push token registration"
```

---

## Task 9: Stub home tab + sign-out + sign-out hook

**Files:**

- Create: `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `src/features/auth/api/useSignOut.ts`

**Interfaces:**

- Produces: minimal tabs layout (just Home for Plan 2). Home shows "Hey @{username}" + a sign-out button. Plan 3 fills out the tab bar.

---

- [ ] **Step 1: Create sign-out hook**

Create `src/features/auth/api/useSignOut.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '../store';
import { analytics } from '@/lib/analytics/client';

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      useAuthStore.getState().clearAll();
      qc.clear();
      analytics.reset();
    },
  });
}
```

- [ ] **Step 2: Create tabs layout**

Create `app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
    </Tabs>
  );
}
```

- [ ] **Step 3: Create home stub**

Create `app/(tabs)/index.tsx`:

```tsx
import { SafeAreaView, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useAuthStore } from '@/features/auth/store';
import { useSignOut } from '@/features/auth/api/useSignOut';
import { t } from '@/lib/i18n';

export default function Home() {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useSignOut();

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="mb-2 font-display text-2xl text-text-primary">
          Hey @{profile?.username ?? '...'}
        </Text>
        <Text className="text-base text-text-muted">Plan 3 fills this out.</Text>
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

- [ ] **Step 4: Verify + commit**

```bash
bun run typecheck && bun run test
git add .
git commit -m "feat(home): stub home tab + sign-out"
```

---

## Plan 2 — Acceptance

Plan 2 is complete when ALL of these are true:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `bun run test` passes (all suites from Plan 1 + new schema + store tests)
- [ ] `supabase db reset` applies migrations 0001–0006 cleanly
- [ ] `psql -f supabase/tests/username_finalize.test.sql` reports `TEST PASS`
- [ ] App launches to sign-in (Apple button visible first per App Store policy)
- [ ] Email magic-link flow works end-to-end against local Supabase using Mailpit
- [ ] After sign-in, app forces onboarding when `users.username` still starts with `u_`
- [ ] Username screen rejects bad input (regex + reserved + uniqueness)
- [ ] Interests screen saves up to 5 categories or skips cleanly
- [ ] Notifications screen prompts for permission and stores push token on grant
- [ ] After completing onboarding, app lands on the home stub showing the chosen username
- [ ] Sign-out clears session, query cache, analytics, and returns to sign-in
- [ ] Re-launching the app after a successful sign-in skips onboarding (session persists)

### Deferred items (not part of Plan 2 acceptance)

- Cross-platform email input UX (currently `Alert.prompt`, iOS only)
- Apple Sign In requires Apple Developer Service ID configuration in App Store Connect — not automatable here
- Google Sign In requires Google Cloud OAuth Client IDs in `.env.local` — not automatable here
- Tab bar polish (Plan 3 lands Catalog + Profile)

---

## Self-review notes (already applied while writing)

- All sign-in mutations track a `signup_started` analytics event with the right `provider` discriminator.
- `useUsernameAvailable` debounces via TanStack Query's `staleTime` + the input filter on the username field that short-circuits non-conforming values via Zod.
- The RPC `users_finalize_username` defaults `p_user_id` to `auth.uid()` so the client never sends it; the second `p_user_id`-bearing signature is granted to `authenticated` so tests (running as service_role) can use it. Service role still ignores RLS as expected.
- Onboarding gate (`username starts with 'u_'`) matches the placeholder pattern from migration 0001's `handle_new_auth_user` trigger.
- All new strings live under typed i18n keys; nothing hardcoded in screens.
- Schema in `src/features/auth/schema.ts` is the single source of truth for both client validation and the RPC's regex (the RPC is the server-side backstop).

**Next plan after this:** Plan 3 — Challenge browsing, accept, 3-tab navigation, home / catalog / profile tabs.
