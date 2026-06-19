# Challenge Arena — Slice 1: Core Loop Spec

**Status:** Approved 2026-06-19
**Owner:** Aman
**Scope:** Slice 1 only — authentication, onboarding, preset challenge catalog, accept → complete → photo/honor proof → XP awarded → personal streak. Three-tab app.
**Ship target:** TestFlight + Google Play internal track in 4–6 weeks.
**Companion to:** `2026-06-19-challenge-arena-product-foundation.md` (Doc A), `2026-06-19-challenge-arena-technical-foundation.md` (Doc B).

---

## 1. What's in Slice 1

| In scope | Out of scope (later slices) |
|---|---|
| Email magic-link, Google, Apple auth | Phone auth, anonymous mode |
| Onboarding: username, interests, notif ask | Avatar upload (placeholder avatars only) |
| Three tabs: Home, Catalog, Profile | Groups, Feed (Slice 2) |
| Preset challenges (~30, seeded) | User-created / group challenges (Slice 2) |
| Accept challenge | Decline / abandon flows (lightweight only) |
| Honor and photo proof | Video, peer-approval proof (Slices 2 & 3) |
| Server-side XP award via Edge Function | Client-side XP (never) |
| Personal streak (tick + reset cron) | Group streak, freezes, achievements |
| Level-up animation (1–10 only) | Levels 11+, badges (Slice 3) |
| Settings: notif time, profile visibility, account, delete | Group-level settings |
| Analytics events (PostHog) | A/B testing harness |
| Crash reporting (Sentry) | Performance monitoring deep dive |
| i18n plumbing, English-only ship | Hindi or any second locale |

---

## 2. Screen-by-screen wireframes and behavior

### Screen 1 — `(auth)/sign-in`

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│           Challenge                 │
│            Arena                    │
│                                     │
│       (mascot Sparky flame)         │
│                                     │
│      Get XP for doing literally     │
│           anything                  │
│                                     │
│                                     │
│   ┌───────────────────────────┐     │
│   │   🍎  Continue with Apple │     │
│   └───────────────────────────┘     │
│   ┌───────────────────────────┐     │
│   │   G   Continue with Google│     │
│   └───────────────────────────┘     │
│   ┌───────────────────────────┐     │
│   │   ✉   Continue with Email │     │
│   └───────────────────────────┘     │
│                                     │
│       Terms · Privacy               │
└─────────────────────────────────────┘
```

**Behavior:**
- Apple/Google → native sheet → on success, route to onboarding step 1 if `users.username` is null, else `(tabs)/index`.
- Email → push to `(auth)/email-sent` screen, supabase sends magic link.
- Apple Sign In button **must** appear if any third-party social login is offered (App Store rule). Order: Apple first.

### Screen 2 — `(auth)/email-sent`

```
┌─────────────────────────────────────┐
│  ← back                             │
│                                     │
│             ✉                       │
│                                     │
│       Check your inbox              │
│                                     │
│   We sent a sign-in link to         │
│       mira@example.com              │
│                                     │
│   Tap the link to come back here.   │
│                                     │
│   [ Resend in 30s ]                 │
│   [ Use a different email ]         │
└─────────────────────────────────────┘
```

**Behavior:** universal link `arena://auth?token=...` opens the app and Supabase exchanges the token for a session.

### Screen 3 — `onboarding/username`

```
┌─────────────────────────────────────┐
│  Step 1 of 3        ● ○ ○           │
│                                     │
│      Pick your username             │
│                                     │
│   ┌───────────────────────────┐     │
│   │ @mira_____                │     │
│   └───────────────────────────┘     │
│                                     │
│   3–20 chars · a–z, 0–9, _          │
│   ✓ Available                       │
│                                     │
│                                     │
│   ┌───────────────────────────┐     │
│   │         Continue          │     │
│   └───────────────────────────┘     │
└─────────────────────────────────────┘
```

**Validation:** regex `^[a-z0-9_]{3,20}$`. Uniqueness checked via debounced query (300ms). Disallow reserved usernames (`admin`, `support`, `api`, etc. — list in `src/lib/reservedUsernames.ts`).

### Screen 4 — `onboarding/interests`

```
┌─────────────────────────────────────┐
│  Step 2 of 3        ● ● ○           │
│                                     │
│      What's your vibe?              │
│      Pick up to 5                   │
│                                     │
│   [💪 Fitness]   [📚 Study]         │
│   [🧘 Habit]     [🎨 Creative]      │
│   [🎲 Dare]                         │
│                                     │
│                                     │
│   ┌───────────────────────────┐     │
│   │         Continue          │     │
│   └───────────────────────────┘     │
│   ┌───────────────────────────┐     │
│   │       Skip for now        │     │
│   └───────────────────────────┘     │
└─────────────────────────────────────┘
```

**Behavior:** selections stored in `users.interests text[]` (column added by Slice 1's migration). Used to seed Home's "Suggested for you" rail.

### Screen 5 — `onboarding/notifications`

```
┌─────────────────────────────────────┐
│  Step 3 of 3        ● ● ●           │
│                                     │
│           🔥                        │
│                                     │
│   Keep your flame alive             │
│                                     │
│   We'll send one nudge in the       │
│   evening if your streak's          │
│   about to break. That's it.        │
│                                     │
│   ┌───────────────────────────┐     │
│   │   Turn on reminders       │     │
│   └───────────────────────────┘     │
│   ┌───────────────────────────┐     │
│   │       Maybe later         │     │
│   └───────────────────────────┘     │
└─────────────────────────────────────┘
```

**Behavior:** triggers native push permission prompt. On grant, store Expo Push token in `users.push_token`. Either button routes to `(tabs)/index`.

### Screen 6 — `(tabs)/index` (Home)

```
┌─────────────────────────────────────┐
│  Hey @mira         🔥 5 day streak  │
│                                     │
│  Level 3 · 240 XP                   │
│  ▓▓▓▓▓▓░░░░  240 / 400              │
├─────────────────────────────────────┤
│  TODAY                              │
│  ┌─────────────────────────────┐    │
│  │ 💧 Drink 8 glasses          │    │
│  │ Habit · Easy · 30 XP        │    │
│  │ [ Submit proof → ]          │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 📚 Read 20 pages            │    │
│  │ Study · Medium · 50 XP      │    │
│  │ [ Submit proof → ]          │    │
│  └─────────────────────────────┘    │
│                                     │
│  SUGGESTED FOR YOU                  │
│  ┌──────────┐ ┌──────────┐          │
│  │ 🏃 5K run│ │ 🧘 Yoga  │ ...      │
│  └──────────┘ └──────────┘          │
├─────────────────────────────────────┤
│   [Home] [Catalog] [Profile]        │
└─────────────────────────────────────┘
```

**Sections (top to bottom):**
1. **Streak header** — username, streak count with flame icon, level + XP-to-next bar.
2. **Today** — `challenge_accepts` rows with `status='accepted'` AND not yet completed today. Empty state: "No active challenges. Pick one from the Catalog →" with deep link.
3. **Suggested for you** — 6 preset challenges matching interests, not yet accepted. Horizontal scroll.

**Pull-to-refresh** invalidates all home queries.

### Screen 7 — `(tabs)/catalog`

```
┌─────────────────────────────────────┐
│  Catalog                            │
│                                     │
│  [All][Fitness][Study][Habit]...    │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │ 💧 Drink 8 glasses          │    │
│  │ Habit · Easy · 30 XP · 📷   │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 📚 Read 20 pages            │    │
│  │ Study · Medium · 50 XP · ✋ │    │
│  └─────────────────────────────┘    │
│  ...                                │
├─────────────────────────────────────┤
│   [Home] [Catalog] [Profile]        │
└─────────────────────────────────────┘
```

**Behavior:**
- Horizontal scrolling filter chips: All / Fitness / Study / Habit / Dare / Creative.
- List of preset challenges where `group_id IS NULL AND is_active = true`.
- Tap card → `challenge/[id]`.
- Already-accepted challenges show a small `✓ Accepted` badge.

### Screen 8 — `(tabs)/profile`

```
┌─────────────────────────────────────┐
│  Profile                  [⚙ ]      │
│                                     │
│         (avatar circle)             │
│                                     │
│         @mira_                      │
│       Display Name                  │
│         Level 3                     │
│                                     │
│  ┌───────┬───────┬───────┐          │
│  │  240  │  5 🔥 │  12   │          │
│  │   XP  │streak │ done  │          │
│  └───────┴───────┴───────┘          │
│                                     │
│  Longest streak: 12 days            │
│                                     │
│  ┌───────────────────────────┐      │
│  │       Sign out            │      │
│  └───────────────────────────┘      │
├─────────────────────────────────────┤
│   [Home] [Catalog] [Profile]        │
└─────────────────────────────────────┘
```

**Behavior:** ⚙ icon → `settings`. Sign out clears session and Zustand store, routes to `(auth)/sign-in`.

### Screen 9 — `challenge/[id]`

Three states based on accept/completion status.

**State A — not accepted:**
```
┌─────────────────────────────────────┐
│  ← back                             │
│                                     │
│             💧                      │
│      Drink 8 glasses                │
│      of water today                 │
│                                     │
│  Habit · Easy · 30 XP · 📷 Photo    │
│                                     │
│  Hydrate, bestie. Snap a pic of     │
│  your last glass to complete.       │
│                                     │
│  ┌───────────────────────────┐      │
│  │   ⚡ Accept Challenge      │      │
│  └───────────────────────────┘      │
│                                     │
│  ▸ 1,247 people completed this      │
└─────────────────────────────────────┘
```

**State B — accepted, not completed:** "Accept" button replaced with "Submit Proof". Adds "Abandon" link as a small text button.

**State C — completed:** Big checkmark, "Completed today · +30 XP", proof preview if photo.

**Behavior:** "Accept" inserts a `challenge_accepts` row (optimistic). "Submit Proof" routes to proof flow (sheet OR full screen depending on proof_type).

### Screen 10 — `challenge/[id]/celebrate` (modal overlay)

```
┌─────────────────────────────────────┐
│                                     │
│               🎉                    │
│                                     │
│            +30 XP                   │
│      (animated count-up)            │
│                                     │
│       🔥 6 day streak               │
│       (flame pulses)                │
│                                     │
│   ┌───────────────────────────┐     │
│   │       Continue            │     │
│   └───────────────────────────┘     │
└─────────────────────────────────────┘
```

**Behavior:**
- Mounted right after Edge Function returns. Uses its response payload (no extra query needed).
- If `level_changed: true`, after the XP/streak beat, plays a level-up overlay (`Level 4!` with cosmetic unlock if any).
- Haptic on enter, success haptic on count-up complete, notification haptic on level-up.
- "Continue" routes back to home (replaces the celebration in the stack, not push).

### Screen 11 — `settings`

```
┌─────────────────────────────────────┐
│  ← Settings                         │
│                                     │
│  NOTIFICATIONS                      │
│  Evening reminder time   20:00 ›    │
│                                     │
│  PRIVACY                            │
│  Public profile          [ON]       │
│                                     │
│  ACCOUNT                            │
│  Display name            ›          │
│  Username                ›          │
│  Email                   ›          │
│                                     │
│                                     │
│  [ Sign out ]                       │
│  [ Delete account ]                 │
└─────────────────────────────────────┘
```

**Behavior:**
- Evening reminder time → time picker, stored on `users.notification_pref_evening_time`.
- Public profile toggle → updates `users.is_public_profile`.
- Delete account → confirmation modal → calls `delete-account` Edge Function (cascades).

---

## 3. Preset challenge seed (30)

Seeded via `supabase/seed.sql`. All `group_id NULL`, all `created_by NULL`, all `is_active true`.

### Habit (8)
| Title | Difficulty | XP | Proof |
|---|---|---|---|
| Drink 8 glasses of water | Easy | 30 | photo |
| Make your bed | Easy | 20 | honor |
| No social media for 1 hour | Medium | 40 | honor |
| Sleep by 11pm | Medium | 50 | honor |
| Meditate for 5 minutes | Easy | 30 | honor |
| Take a cold shower | Hard | 70 | photo |
| Call a family member | Easy | 30 | honor |
| Write a gratitude journal entry | Easy | 30 | photo |

### Study (8)
| Title | Difficulty | XP | Proof |
|---|---|---|---|
| Read 20 pages | Medium | 50 | photo |
| Study 30 min phone-free | Medium | 60 | photo |
| Learn 5 new words | Easy | 30 | honor |
| Watch an educational video (>10 min) | Easy | 30 | honor |
| Plan tomorrow tonight | Easy | 20 | photo |
| Organize your desk | Easy | 30 | photo |
| Practice instrument for 15 min | Medium | 50 | honor |
| Take detailed notes on a topic | Medium | 50 | photo |

### Fitness (8)
| Title | Difficulty | XP | Proof |
|---|---|---|---|
| 10 pushups | Easy | 30 | honor |
| 20 squats | Easy | 30 | honor |
| 5K walk | Medium | 60 | honor |
| 30-second plank | Easy | 30 | honor |
| 50 jumping jacks | Easy | 30 | honor |
| 15-min yoga session | Medium | 60 | honor |
| Hit 10,000 steps | Hard | 80 | honor |
| 5-min full body stretch | Easy | 20 | honor |

### Dare (4)
| Title | Difficulty | XP | Proof |
|---|---|---|---|
| Compliment a stranger | Medium | 50 | honor |
| Try a food you've never had | Medium | 50 | photo |
| Take a selfie at a place you've never been | Hard | 80 | photo |
| Ask politely for a discount somewhere | Hard | 70 | honor |

### Creative (2)
| Title | Difficulty | XP | Proof |
|---|---|---|---|
| Sketch something for 10 minutes | Easy | 30 | photo |
| Write a haiku | Easy | 30 | photo |

XP rounded to multiples of 10. Difficulty bands: Easy 20–30 · Medium 40–60 · Hard 70–80 · (Epic reserved for later).

---

## 4. Authentication flow detail

### Apple / Google
1. User taps button → native OAuth flow via `expo-apple-authentication` / `expo-auth-session` Google provider.
2. Provider returns identity → exchanged with Supabase Auth → session created.
3. Trigger on `auth.users` insert creates `public.users` row with defaults (username NULL).
4. App detects: `session exists AND users.username IS NULL` → route to `onboarding/username`.

### Email magic link
1. User enters email → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'arena://auth' } })`.
2. Supabase sends email with link.
3. User taps link → universal link opens app → Supabase exchanges token → session created.
4. Same onboarding gate as above.

### Session lifecycle
- JWT stored in AsyncStorage via `supabase-js` default storage.
- Zustand auth slice mirrors session for synchronous reads.
- Auto-refresh handled by `supabase-js`.
- Sign out clears AsyncStorage + Zustand + invalidates all TanStack queries.

---

## 5. Level economy (Slice 1)

| Level | XP needed to reach | Cosmetic unlock |
|---|---|---|
| 1 | 0 | (default) |
| 2 | 100 | Profile color: cyan |
| 3 | 200 | — |
| 4 | 400 | Profile color: pink |
| 5 | 700 | — |
| 6 | 1,000 | Profile border: gradient |
| 7 | 1,500 | — |
| 8 | 2,000 | Profile color: gold |
| 9 | 3,000 | — |
| 10 | 4,500 | Animated avatar frame |

Levels 11+ scoped post-Slice-1. The cosmetic "unlock" in Slice 1 is just a color/border on the profile screen — no separate inventory UI.

---

## 6. Edge Function: `submit-completion`

### Inputs
```ts
{
  accept_id: string;        // uuid
  proof_url?: string;       // required if challenge.proof_type === 'photo'
}
```
Auth context: bearer JWT from client.

### Validation steps (each must pass or return 400 with reason)
1. `accept_id` exists AND belongs to `auth.uid()`.
2. `challenge_accepts.status === 'accepted'` (not already completed/expired/abandoned).
3. Lookup `challenges` row. If `proof_type === 'honor'`, `proof_url` must be absent. If `proof_type === 'photo'`, `proof_url` must be present, start with `proof/<auth.uid()>/`, AND Storage object must exist at that path (HEAD check).
4. If `challenges.deadline_type === 'expires_at'`, `now() < challenges.expires_at`.
5. No existing `challenge_completions` row with this `accept_id`.

### On success (atomic in a single transaction)
- Insert into `challenge_completions` with `xp_awarded = challenges.xp_reward`, `verification_status = 'auto'`.
- Update `challenge_accepts.status = 'completed'`.
- Update `users.total_xp += xp_reward`.
- Recompute `users.level` from `total_xp` against the level table (capped at 10 for Slice 1).
- Streak trigger fires automatically — updates `current_streak`, `longest_streak`, `last_completion_date`.

### Response
```ts
{
  completion_id: string;
  xp_awarded: number;
  new_total_xp: number;
  new_level: number;
  level_changed: boolean;
  new_streak: number;
  streak_changed: boolean;        // true if streak incremented (not just kept)
  unlock?: { kind: 'color' | 'border' | 'frame', value: string };
}
```

The client uses this single response to drive every animation on the celebration screen — no follow-up query.

### Errors
| Code | Reason |
|---|---|
| 401 | No / invalid JWT |
| 403 | accept_id not owned by user |
| 404 | accept_id not found, proof file not found |
| 409 | Already completed, accept expired |
| 422 | Proof type mismatch, deadline passed |

---

## 7. Streak rules (concrete)

### Trigger on `challenge_completions` insert
```
day := completed_at::date
last := users.last_completion_date

if last is NULL:
    current_streak = 1
elif day = last:
    -- already counted today, no change
elif day = last + 1:
    current_streak += 1
elif day > last + 1:
    -- gap detected
    if users.streak_freezes_available > 0:
        -- consume freeze, treat as continuous (Slice 3 only — in Slice 1, no freezes used)
    else:
        current_streak = 1

last_completion_date = day
longest_streak = greatest(longest_streak, current_streak)
```

In Slice 1, `streak_freezes_available` stays at default 1 but the freeze-consumption branch is **not active** (no UI to refer to it, no Edge Function uses it). The column exists for forward compatibility.

### Nightly cron: `streak-reset-cron`
Runs daily at 03:00 UTC (configurable). For each user where `last_completion_date < CURRENT_DATE - INTERVAL '1 day'` AND `current_streak > 0`:
- Set `current_streak = 0`.

Tested by mocking `now()` in integration tests.

---

## 8. Analytics events (Slice 1)

All registered in `src/lib/analytics/events.ts` as typed constants.

| Event | Payload | Trigger |
|---|---|---|
| `app_launched` | `{ is_cold_start, session_id }` | App foreground |
| `signup_started` | `{ provider }` | Auth button tapped |
| `signup_completed` | `{ user_id, provider }` | After username chosen |
| `onboarding_step_completed` | `{ step, skipped }` | Each step done |
| `challenge_viewed` | `{ challenge_id, category }` | Detail screen shown |
| `challenge_accepted` | `{ challenge_id, category, proof_type }` | Accept tapped |
| `proof_submission_started` | `{ accept_id, proof_type }` | Picker opens / honor confirmed |
| `proof_upload_completed` | `{ accept_id, ms_elapsed, bytes }` | Upload finishes (photo only) |
| `challenge_completed` | `{ completion_id, xp_awarded, proof_type, duration_ms }` | Edge Fn returns success |
| `streak_milestone_hit` | `{ streak_length }` | At 1, 3, 7, 14, 30 |
| `level_up` | `{ from_level, to_level }` | Level changed in Edge Fn response |
| `notification_permission_asked` | `{ outcome }` | Onboarding step 3 outcome |

---

## 9. Acceptance criteria (Definition of Done)

Slice 1 ships when ALL of these are true:

### Functional
- All 11 screens implemented and navigable on iOS and Android.
- All 3 auth providers complete a full sign-in to home tab.
- Onboarding shows once per fresh account; never shown to returning users.
- Honor proof flow: accept → confirm → celebrate → home. < 2s end-to-end with good network.
- Photo proof flow: accept → camera/picker → preview → upload → celebrate → home. < 8s end-to-end for a typical 1080p photo on 4G.
- XP awarded matches `challenges.xp_reward` exactly; verified server-side.
- Streak ticks correctly on first completion of a new day.
- Streak resets to 0 after `streak-reset-cron` runs when a day was missed.
- Level-up animation plays only when level actually changes.
- Settings: notif time updates persist; profile visibility toggle updates `users.is_public_profile`; sign-out works; delete account works (cascades).

### Edge Function correctness
- All 5 validation rejection cases verified by integration tests.
- XP and streak updates atomic — no partial state visible.
- Idempotency: re-submitting same `accept_id` returns 409, never duplicates XP.

### Quality
- Crash-free session rate > 99.5% on internal builds before TestFlight push.
- All animations respect `prefers-reduced-motion`.
- No hardcoded strings in screen files — all routed through `i18n.t()`.
- All analytics events fire as specified.
- Zero TypeScript errors, zero ESLint errors in CI.
- Lighthouse-ish manual perf check: cold start to home tab < 3s on iPhone 12 / Pixel 6.

### Release
- App icon, splash screen, App Store / Play Store screenshots prepared.
- Privacy policy + Terms of Service URLs live (placeholder for personal-project URLs is OK).
- App Store Connect listing drafted, App Privacy questionnaire filled.
- TestFlight build uploaded with 10+ internal testers added.
- Google Play internal track build uploaded.

---

## 10. Open questions deferred past Slice 1

- **Mascot full design pass** — Sparky placeholder ships in Slice 1; full character sheet post-MVP.
- **Sound design** — system sounds only in Slice 1; bespoke sounds post-PMF.
- **Onboarding A/B testing** — defer until we have signal on funnel drop-off.
- **Avatar uploads** — placeholder avatars in Slice 1; user upload added in Slice 3 alongside profile customization.

---

## 11. Definition of done for this document

- All 11 screens have wireframes + behavior notes. ✓
- Preset challenge seed has exact text + difficulty + XP + proof type. ✓
- Auth flow detail covers all 3 providers + session lifecycle. ✓
- Level table is concrete with cosmetic unlocks. ✓
- `submit-completion` Edge Function spec includes inputs, validations, response, errors. ✓
- Streak rules are pseudocode-explicit. ✓
- Analytics event registry is complete. ✓
- Acceptance criteria are testable and measurable. ✓

**Next:** invoke `writing-plans` skill to produce the TDD-flavored implementation plan that an engineering session will work from. The plan saves to `docs/superpowers/plans/2026-06-19-challenge-arena-slice-1-implementation.md`.
