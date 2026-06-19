# Challenge Arena — Technical Foundation

**Status:** Approved 2026-06-19
**Owner:** Aman
**Scope:** Stack, architecture, folder structure, full Supabase schema, RLS / security model, state-management split, media pipeline, notifications, observability, scalability stance, MVP-vs-future cut.
**Companion to:** `2026-06-19-challenge-arena-product-foundation.md` (Doc A).

---

## 1. Stack

| Layer | Choice | Rationale |
|---|---|---|
| App framework | **Expo SDK 53 + Expo Router v4** | File-based routing, native deep-linking, RSC-shaped mental model. Bare workflow unnecessary at this scale. |
| Language | **TypeScript** (strict) | `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Treat warnings as errors in CI. |
| Styling | **NativeWind v4** | Tailwind ergonomics, design tokens in `tailwind.config.js` mirror Doc A's color scale. |
| Server state | **TanStack Query v5** | Optimistic mutations, query invalidation on app foreground, cache TTL per query family. |
| Client state | **Zustand** (+ `persist` middleware) | Auth, draft UI state, persisted preferences only. Not for server data. |
| Forms | **React Hook Form + Zod** | Zod schemas are reused in Supabase Edge Functions for end-to-end type safety. |
| Backend | **Supabase** (Postgres + Auth + Storage + Edge Functions) | Single source of truth. RLS does authorization; Edge Functions guard server-only writes (XP, invites). |
| Realtime | **Supabase Realtime** — opt-in, Slice 3 onward, group-feed channel only | Avoid per-connection-minute cost across whole app. |
| Push | **Expo Push** for MVP | Free, native to Expo. Re-evaluate OneSignal post-PMF if we need segmentation. |
| Media | **Supabase Storage** + `expo-image-manipulator` client-side compression | Cheapest path; signed URLs for private buckets. |
| Analytics | **PostHog** | Self-host-capable; generous free tier; cohort analysis built in. |
| Crashes | **Sentry** | Mature RN SDK; source-map upload via Expo plugin. |
| CI | **EAS Build + GitHub Actions** | EAS for native builds; GH Actions for type-check, lint, test. |
| i18n | **i18next + expo-localization** | Plumbing day-one even though English-only ships in MVP. |

---

## 2. Architecture overview

```
┌────────────────────────────────────────┐
│  Expo app (iOS + Android)              │
│  ┌──────────────────────────────────┐  │
│  │ Expo Router (file-based screens) │  │
│  ├──────────────────────────────────┤  │
│  │ TanStack Query cache             │  │ ← optimistic mutations, foreground invalidation
│  ├──────────────────────────────────┤  │
│  │ Zustand (auth + ephemeral UI)    │  │ ← persist subset to AsyncStorage
│  ├──────────────────────────────────┤  │
│  │ Supabase client (RLS-guarded)    │  │
│  └────────────────┬─────────────────┘  │
└───────────────────┼────────────────────┘
                    │ HTTPS (REST/PostgREST) + WSS (Realtime, Slice 3+)
                    ▼
┌────────────────────────────────────────┐
│  Supabase                              │
│  ┌─────────────┬────────────────────┐  │
│  │ Postgres    │ Auth (GoTrue)      │  │
│  │ + RLS       │ — email, Google,   │  │
│  │             │   Apple            │  │
│  ├─────────────┼────────────────────┤  │
│  │ Storage     │ Edge Functions     │  │ ← server-trusted writes:
│  │ (signed     │ (Deno, TypeScript) │  │   XP award, invite mint,
│  │  URLs)      │                    │  │   streak reset cron,
│  │             │                    │  │   share-card generation
│  └─────────────┴────────────────────┘  │
└────────────────────────────────────────┘
```

**Trust boundary:** the client may issue *any* read (RLS decides what they see) but **may not** insert into `challenge_completions`, mint invite codes, or modify `users.total_xp` / `users.current_streak` directly. Those writes go through Edge Functions with `service_role` after server-side validation.

---

## 3. Folder structure (feature-first)

```
challenge-arena/
├── app/                              # Expo Router file routes
│   ├── _layout.tsx                   # Root providers (Query, Zustand, theme)
│   ├── (auth)/                       # Signed-out screens
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── (tabs)/                       # Signed-in tab navigator
│   │   ├── _layout.tsx
│   │   ├── index.tsx                 # Home (today's challenges + streak)
│   │   ├── groups.tsx                # My groups
│   │   ├── feed.tsx                  # Activity feed
│   │   └── profile.tsx               # Me + settings
│   ├── challenge/[id].tsx            # Challenge detail + accept/submit proof
│   ├── group/[id]/
│   │   ├── index.tsx                 # Group home
│   │   ├── leaderboard.tsx
│   │   └── settings.tsx
│   ├── onboarding/                   # First-run only
│   │   ├── username.tsx
│   │   ├── interests.tsx
│   │   └── notifications.tsx
│   └── +not-found.tsx
│
├── src/
│   ├── features/                     # ONE folder per product domain
│   │   ├── auth/
│   │   │   ├── api/                  # Supabase calls + TanStack Query hooks
│   │   │   ├── components/
│   │   │   ├── store/                # Zustand slice (auth session)
│   │   │   └── schema.ts             # Zod schemas
│   │   ├── challenges/
│   │   ├── groups/
│   │   ├── streaks/
│   │   ├── badges/
│   │   ├── leaderboards/
│   │   └── feed/
│   ├── ui/                           # Cross-feature primitives
│   │   ├── Button.tsx, Card.tsx, Sheet.tsx
│   │   ├── XPBadge.tsx, FlameIcon.tsx, LevelRing.tsx
│   │   └── animations/               # Shared Reanimated presets
│   ├── lib/
│   │   ├── supabase.ts               # Single client instance
│   │   ├── queryClient.ts            # TanStack defaults
│   │   ├── i18n/                     # i18next config + en/ namespace
│   │   ├── analytics/
│   │   │   ├── client.ts             # PostHog wrapper
│   │   │   └── events.ts             # Typed event registry — no string events
│   │   ├── haptics.ts
│   │   └── deepLinks.ts
│   ├── theme/
│   │   ├── tokens.ts                 # Mirrors NativeWind config
│   │   └── typography.ts
│   └── types/
│       └── database.ts               # `supabase gen types typescript`
│
├── supabase/
│   ├── config.toml
│   ├── migrations/                   # Versioned SQL — every schema change committed
│   ├── functions/                    # Edge Functions
│   │   ├── submit-completion/        # validates proof, awards XP, updates streak
│   │   ├── join-group/               # validates invite code, inserts group_member
│   │   ├── create-group/             # mints invite code, makes owner
│   │   ├── streak-reset-cron/        # nightly reset of dead streaks
│   │   └── generate-share-card/      # composites stats over template
│   └── seed.sql                      # ~30 preset challenges seeded
│
├── assets/
│   ├── fonts/                        # SpaceGrotesk, Inter (bundled)
│   ├── icons/                        # App icon, adaptive icon sources
│   └── images/                       # Static brand assets
│
├── e2e/                              # Maestro flows (post-Slice 1)
├── docs/superpowers/
│   ├── specs/                        # Brainstormed designs (this doc, Doc A, etc.)
│   └── plans/                        # Implementation plans, slice-by-slice
│
├── app.json                          # Expo config
├── eas.json                          # EAS Build profiles (dev / preview / production)
├── tailwind.config.js                # NativeWind tokens
├── tsconfig.json
└── package.json
```

### Cross-cutting rules

- **No feature imports another feature.** If two features need the same thing, it's promoted to `src/ui/` or `src/lib/`.
- **Routes (`app/`) are thin** — they compose feature components, never contain business logic.
- **Every Supabase call is wrapped in a TanStack hook** living in `features/<feature>/api/`. No raw `supabase.from(...)` calls in components.
- **Schemas in `schema.ts`** are the single source of truth — used by RHF, Edge Functions, and runtime guards.

---

## 4. Supabase schema (full vision)

This is the schema for the complete product. Not all tables are created in Slice 1; see §11 for the per-slice migration cut.

### 4.1 Identity

```sql
-- Mirrors auth.users 1:1; additional profile fields live here.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null,
  avatar_url text,
  bio text,
  level int not null default 1,
  total_xp bigint not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_completion_date date,
  streak_freezes_available int not null default 1,
  is_public_profile bool not null default true,
  locale text not null default 'en',
  interests text[] not null default '{}',           -- category tags picked at onboarding
  push_token text,                                  -- Expo Push token
  notification_pref_evening_time time default '20:00',
  created_at timestamptz not null default now()
);

create index idx_users_total_xp on users (total_xp desc);
create index idx_users_current_streak on users (current_streak desc);
```

### 4.2 Groups

```sql
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  theme text not null default 'purple',             -- preset palette key
  invite_code text unique not null,                 -- ARENA-XYZ123, generated by Edge Function
  created_by uuid not null references users(id),
  current_streak int not null default 0,            -- group flame
  last_activity_date date,
  member_count int not null default 1,              -- denormalized for fast listing
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index idx_group_members_user on group_members (user_id);
```

### 4.3 Challenges

A single `challenges` table holds both global presets (group_id NULL, created_by NULL) and group-created challenges.

```sql
create table challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,        -- NULL = global preset
  title text not null check (char_length(title) between 1 and 80),
  description text,
  category text not null check (category in ('fitness','study','dare','habit','creative','other')),
  difficulty text not null check (difficulty in ('easy','medium','hard','epic')),
  xp_reward int not null check (xp_reward between 0 and 1000),
  proof_type text not null check (proof_type in ('honor','photo','video','peer')),
  deadline_type text not null check (deadline_type in ('none','daily','one_time','expires_at')) default 'none',
  expires_at timestamptz,                                       -- only if deadline_type='expires_at'
  created_by uuid references users(id),                         -- NULL for system presets
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  check (deadline_type != 'expires_at' or expires_at is not null)
);

create index idx_challenges_group on challenges (group_id) where group_id is not null;
create index idx_challenges_preset_category on challenges (category) where group_id is null;
```

### 4.4 User actions on challenges

```sql
create table challenge_accepts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  status text not null check (status in ('accepted','completed','expired','abandoned')) default 'accepted',
  unique (challenge_id, user_id)
);

create table challenge_completions (
  id uuid primary key default gen_random_uuid(),
  accept_id uuid not null unique references challenge_accepts(id) on delete cascade,
  user_id uuid not null references users(id),                   -- denormalized for leaderboard speed
  challenge_id uuid not null references challenges(id),         -- denormalized
  group_id uuid references groups(id),                          -- denormalized; NULL for preset/solo
  proof_url text,                                                -- supabase storage path; NULL for honor
  proof_type text not null,                                      -- snapshot of challenge.proof_type
  completed_at timestamptz not null default now(),
  xp_awarded int not null,                                       -- set by Edge Function, NEVER client-trusted
  verification_status text not null check (verification_status in ('auto','pending_peer','approved','rejected')) default 'auto'
);

create index idx_completions_user_date on challenge_completions (user_id, completed_at desc);
create index idx_completions_group_date on challenge_completions (group_id, completed_at desc) where group_id is not null;
```

### 4.5 Peer verification (Slice 3)

```sql
create table peer_votes (
  completion_id uuid not null references challenge_completions(id) on delete cascade,
  voter_id uuid not null references users(id) on delete cascade,
  vote text not null check (vote in ('approve','reject')),
  voted_at timestamptz not null default now(),
  primary key (completion_id, voter_id)
);
```

### 4.6 Badges (Slice 3)

```sql
create table badges (
  id text primary key,                                           -- 'streak_7', 'first_completion'
  name text not null,
  description text not null,
  icon text not null,                                            -- Phosphor icon name
  rarity text not null check (rarity in ('common','rare','epic','legendary'))
);

create table user_badges (
  user_id uuid not null references users(id) on delete cascade,
  badge_id text not null references badges(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
```

### 4.7 Activity feed (Slice 2)

Denormalized event log for read performance. One row per visible event.

```sql
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,         -- NULL = solo event
  actor_user_id uuid not null references users(id) on delete cascade,
  event_type text not null check (event_type in (
    'challenge_completed','streak_milestone','badge_earned','joined_group','level_up'
  )),
  target_id uuid,                                                -- polymorphic — challenge_id, badge_id, etc
  payload jsonb,                                                  -- thin context blob
  created_at timestamptz not null default now()
);

create index idx_activity_group_date on activity_events (group_id, created_at desc) where group_id is not null;
create index idx_activity_user_date on activity_events (actor_user_id, created_at desc);
```

### 4.8 Notifications (Slice 3)

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on notifications (user_id, created_at desc) where read_at is null;
```

### 4.9 Streak maintenance (triggers + cron)

Trigger on `challenge_completions` insert updates the user's streak counters atomically and (if `group_id` present) the group's flame:

```sql
-- Pseudocode for the trigger logic:
-- if last_completion_date = today:                        no-op
-- elsif last_completion_date = today - 1:                 increment current_streak
-- elsif last_completion_date < today - 1 and freezes > 0: use freeze, current_streak unchanged
-- else:                                                    current_streak = 1
-- update last_completion_date = today
-- update longest_streak = greatest(longest_streak, current_streak)
```

A nightly cron Edge Function (`streak-reset-cron`) finds users with active streaks whose `last_completion_date < CURRENT_DATE - 1` and no freezes, and resets `current_streak` to 0. Same for group streaks.

**Why denormalized counters and not computed-on-demand:** leaderboards must be O(1) per user, not O(lifetime completions). The trigger pays the write cost; the read is free. Invariant complexity is acceptable because the trigger logic is small and well-tested.

---

## 5. RLS / security model

### 5.1 Trust boundary

| Surface | Trust level |
|---|---|
| Client-issued reads | Trusted to ask; RLS decides what they see. |
| Client-issued writes to `challenge_accepts`, `peer_votes`, profile-mutable fields | Trusted, RLS-checked. |
| Client-issued writes to `challenge_completions`, `users.total_xp`, `users.current_streak`, `groups.invite_code` | **NOT trusted.** Must go through Edge Function with `service_role`. |

### 5.2 RLS policies (per table)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | Public fields if `is_public_profile=true`; full row if `auth.uid()=id` | (auto via auth trigger) | Own row, only mutable fields | Disallowed (account delete via Edge Fn) |
| `groups` | Members only | Authenticated | Owner / admin only | Owner only |
| `group_members` | Members only | **Edge Fn only** (validates invite code) | Disallowed | Own row OR owner removing member |
| `challenges` | Presets: all. Group: members only. | Presets: service_role only. Group: group members. | Creator or group admin | Creator or group admin |
| `challenge_accepts` | Own + group-mates | Own only | Own only (status changes) | Disallowed |
| `challenge_completions` | Own + group-mates | **Edge Fn only** | Disallowed | Disallowed |
| `peer_votes` | Group members | Group members, one per completion | Disallowed | Own only |
| `user_badges` | Public (if profile public) + own | **Edge Fn only** | Disallowed | Disallowed |
| `notifications` | Own only | **Edge Fn only** | Own only (mark read) | Own only |
| `activity_events` | Group members for group events; own for solo | **Edge Fn only** | Disallowed | Disallowed |

### 5.3 Storage policies

| Bucket | Privacy | Read | Write |
|---|---|---|---|
| `avatars` | Public | Anyone | Own user only, max 2MB |
| `proof` | Private | Signed URL via Edge Fn; group-mates only | Own user only via Edge Fn, max 10MB |
| `share-cards` | Public | Anyone | Edge Fn only |

### 5.4 Auth

- Email magic link (Supabase Auth default).
- Google OAuth.
- Apple Sign In — **required by App Store** if any third-party social login is offered.
- All providers funnel to the same `auth.users` row; a trigger creates the matching `public.users` row with default values.

### 5.5 Sensitive data

- No PII in client logs (Sentry scrubs email, push token).
- Proof media URLs never publicly accessible.
- Push tokens stored only on user row, never logged.
- Account deletion (required for App Store) cascades all user data via FK `on delete cascade`.

---

## 6. State management split

| Lives in | Examples |
|---|---|
| **TanStack Query** | Current user profile, challenge list, accepts, completions, groups, leaderboards, activity feed, notifications. Anything served by Supabase. |
| **Zustand** | Auth session (JWT, user id), draft challenge form, draft proof submission (file picked but not uploaded), open-sheet flags, current onboarding step. |
| **AsyncStorage (via Zustand persist)** | Auth session, last-known user profile cache (for offline cold launch), theme preference, locale, notification consent state. |

**Hard rule:** server data never lives in Zustand. If you copy TanStack data into a store, you're doing it wrong — invalidate the query instead.

### Cache TTLs (TanStack defaults overridden per query family)

| Query family | `staleTime` | Notes |
|---|---|---|
| Current user | 5 min | Refetched on app foreground |
| Challenge list | 1 min | Optimistic on accept/complete |
| Leaderboard | 30 sec | Refetched on app foreground |
| Activity feed | 15 sec | Realtime channel attached in Slice 3 |
| Notifications | 10 sec | Refetched on app foreground |

All families: `refetchOnAppForeground: true`, `refetchOnWindowFocus: false` (RN doesn't have window focus).

---

## 7. Media pipeline

1. User taps "Submit proof" → `expo-image-picker` opens camera or library (photo and short video, ≤ 15s).
2. `expo-image-manipulator` compresses photos to 1080×1080 JPEG @ 80% quality client-side. Video kept as-is; client-side enforces 15s and < 10MB.
3. Direct upload to Supabase Storage private bucket `proof/`, path `<user_id>/<accept_id>.<ext>`. Resumable upload via `supabase-js` chunked uploads.
4. Client calls `submit-completion` Edge Function with `accept_id` + storage path.
5. Edge Function validates: user owns the accept, storage object exists at the claimed path, proof_type matches challenge, no existing completion. Inserts `challenge_completion`, computes XP, updates streak via trigger.
6. Group-mates render proof via `useSignedProofUrl(completion_id)` hook — issues signed URL with 1-hour expiry, cached in TanStack Query.

Avatars use the same compression pipeline but go to the public `avatars/` bucket. Share cards are generated server-side via a `generate-share-card` Edge Function using `satori` + `resvg` to composite stats over a template.

---

## 8. Notifications

- **Provider:** Expo Push. OneSignal evaluated post-PMF if segmentation needs grow.
- **Permission ask timing:** never on app launch. Asked at end of onboarding ("turn on reminders to keep your flame alive") AND opportunistically after first challenge completion.
- **Notification budget (hard caps):**
  - Max 1 streak reminder per day per user, at user-configured evening time (default 20:00 local).
  - Direct social events (someone voted on your submission, someone invited you to a group) bypass the budget but coalesce within a 30-min window.
- **Server-side scheduler:** `streak-reset-cron` Edge Function runs nightly, queues evening reminders for users at risk of losing a streak.
- **Local notifications:** none in MVP. Everything goes through Expo Push so we have one delivery path.

---

## 9. Observability + analytics

### PostHog event taxonomy

All events live in a typed registry: `src/lib/analytics/events.ts`. Adding an event = adding a typed constant. No string events at call sites.

Core events (Slice 1):

| Event | Payload | When |
|---|---|---|
| `app_launched` | `{session_id, is_cold_start}` | Every app foreground |
| `signup_started` | `{provider}` | User taps Apple/Google/Email |
| `signup_completed` | `{user_id, provider}` | After username chosen |
| `challenge_viewed` | `{challenge_id, category}` | Challenge detail screen shown |
| `challenge_accepted` | `{challenge_id, category, proof_type}` | Accept button tapped |
| `proof_submission_started` | `{accept_id, proof_type}` | User opens picker |
| `challenge_completed` | `{completion_id, xp_awarded, proof_type, duration_ms}` | Edge Fn confirms |
| `streak_milestone_hit` | `{streak_length}` | 1, 3, 7, 14, 30, 60, 100 |
| `level_up` | `{new_level}` | When XP crosses threshold |

### Crash + error

- Sentry RN SDK with EAS source-map upload.
- Breadcrumbs: navigation, API calls (sanitized).
- Sample rate: 100% errors, 10% transactions.

### Funnels to monitor (Slice 1)

- `signup_started` → `signup_completed` (target > 70%)
- `signup_completed` → `challenge_accepted` (target > 80% within first session)
- `challenge_accepted` → `challenge_completed` (target > 60% within 24h)
- D1 retention (target > 40%)

---

## 10. Scalability stance

We design for **~10k DAU** as the explicit ceiling for the MVP architecture. That's well above any plausible MVP load and well below what would justify infra cost work.

### Hot paths

- **Leaderboards** — indexed on `(group_id, total_xp desc)` and `(group_id, current_streak desc)`. If a group ever exceeds 1k members we add a materialized "top 100 per group" view, refreshed on completion-trigger or hourly.
- **Activity feed** — indexed on `(group_id, created_at desc)`. Cursor pagination with `last_id` + `last_created_at` tiebreaker.
- **Streak trigger contention** — for global preset challenges accepted by hundreds simultaneously, we accept eventual consistency and batch streak updates per user, not per completion.
- **Edge Function cold starts** — keep them warm via a 5-min cron ping for the hot ones (`submit-completion`, `join-group`).

### What we do not pre-optimize for

- Sharding, read replicas, multi-region. Supabase scales vertically through their plans; we move when we feel pain, not before.
- Custom CDN for media. Supabase Storage CDN is good enough at MVP scale.
- Server-side rendering of feed for SEO — there's no public feed.

---

## 11. MVP-vs-future feature cut

### Slice 1 (Core loop) — tables built

`users`, `challenges` (preset rows only), `challenge_accepts`, `challenge_completions`.

**Migration note:** `challenge_completions.group_id` references `groups(id)`. Since `groups` is not populated until Slice 2, the FK column is created **nullable with no FK constraint** in Slice 1. The FK constraint is added by Slice 2's migration as part of creating `groups`. This avoids a chicken-and-egg migration order while keeping the column shape stable.

### Slice 1 — Edge Functions built

`submit-completion`, `streak-reset-cron`.

### Slice 1 — features

Email + Google + Apple auth → onboarding (username + interest tags + notif permission ask) → home (today's accepted challenges + streak indicator) → challenge detail → accept → submit proof (honor or photo) → XP awarded + streak tick + level-up animation. Profile screen (own stats, sign out, settings stub).

### Slice 2 (Social) — added

`groups`, `group_members`, `activity_events`. Group challenges (`challenges.group_id` populated). Edge Functions: `create-group`, `join-group`. Realtime: NOT yet — feed and leaderboards refetched on view + foreground. Video proof tier added.

### Slice 3 (Retention) — added

`badges`, `user_badges`, `peer_votes`, `notifications`. Push notifications wired (Expo Push). Peer-approval proof tier. Selective Realtime on the group feed channel. Streak freezes consumable.

### Slice 4 (Virality) — added

`generate-share-card` Edge Function. Public profile route at `<final-domain>/u/<username>`. Universal links + deferred deep-linking through install.

### Explicitly NOT in MVP (Slices 1–4 combined)

- Global discover feed of submissions.
- In-app messaging / DMs.
- IAP / subscriptions / ads.
- Web app (mobile-first; web is a future product, not an MVP slice).
- HealthKit / Google Fit integration.
- AI proof verification.

---

## 12. Definition of done for this document

- Every layer of the stack has a named choice with a one-line rationale. ✓
- The trust boundary between client and server is explicit. ✓
- Every table in the full vision is sketched with columns + indexes. ✓
- Every table has an RLS policy summary. ✓
- The state-management split has a hard rule. ✓
- The media pipeline is end-to-end. ✓
- Per-slice migration cut is unambiguous. ✓

Next document: **Doc C — Slice 1 spec** (auth + core challenge loop). After Doc C, we move to `writing-plans` skill to produce the implementation plan for Slice 1.
