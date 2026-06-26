# Challenge Arena

Gen Z gamified challenges — solo + private groups, XP, streaks, group flame + leaderboard. iOS-first React Native app on Expo.

**Repo:** `github.com/amanchhetri/arena-dl-10` (personal account; pull via SSH alias `github-personal` if you have the dual-account setup).

---

## Status snapshot

**Shipped on `main`** (no feature branches — direct commits):

- **Slice 1** (foundation + auth + catalog + home + profile + submit/XP/celebration + release prep) — Plans 1-5
- **Slice 2 Plan 1** — groups CRUD (private invite-only, 25-member cap, 5-group-per-user cap)
- **Slice 2 Plan 2** — custom group challenges
- **Slice 2 Plan 3a** — group activity feed + streak flame (lenient rule, calendar-week cron at 03:30 UTC)
- **Slice 2 Plan 3b** — group leaderboard (this-week + all-time, podium home preview)

**Next up:** Slice 2 Plan 3c — group home assembly + polish (will also absorb 7 deferred Minor findings from 3a/3b reviews). Then Slice 3 (real-time, push, peer proof).

**Test status:** 14 SQL test files pass; 7 Jest suites / 26 tests pass; iOS bundle exports clean.

---

## Tech stack

- **Mobile:** Expo SDK 56, React 19.2, React Native 0.85, Expo Router v4
- **Styling:** NativeWind v4 (`darkMode: 'class'`), tokens in `src/theme/tokens.ts`
- **State:** TanStack Query v5 (server data), Zustand v4 (auth session + ephemeral UI)
- **Backend:** Supabase (Postgres + Auth + Storage), all writes via SECURITY DEFINER RPCs
- **Analytics:** PostHog with typed `EventPayloads` registry
- **Errors:** Sentry
- **Pkg manager:** Bun
- **Testing:** Jest 29 + jest-expo 56; SQL tests are plain `.sql` files run via psql

---

## Run / test / bundle

**One-time setup on a fresh machine:**

```bash
git clone git@github-personal:amanchhetri/arena-dl-10.git challenge-arena
cd challenge-arena
bun install
cp .env.example .env.local   # fill in Supabase + PostHog + Sentry keys
supabase start                # boots local Postgres + Auth + Storage on Docker
supabase db reset             # applies migrations 0001–0021 + seed
```

**Daily commands:**

```bash
bun start                     # Expo dev server
bun run typecheck             # tsc --noEmit
bun run lint                  # eslint
bun run test                  # 7 suites / 26 tests
```

**Before merging anything to main:**

```bash
rm -f .expo/types/router.d.ts && bun run typecheck   # stale generated file pinch
bun run lint
bun run test
# Full SQL sweep:
supabase db reset
for f in schema_constraints streak_trigger username_finalize rls_slice1 submit_completion streak_reset_cron delete_account groups_schema group_rpcs groups_rls group_challenges activity_events proof_group_visibility group_leaderboard; do
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "supabase/tests/${f}.test.sql" 2>&1 | grep -E "TEST PASS|FAIL|ERROR" | head -1
done
# iOS bundle smoke:
rm -rf dist && bunx expo export --platform ios --dump-sourcemap=false
```

---

## Repo map

```
challenge-arena/
├── app/                      # Expo Router file-based routes
│   ├── (tabs)/               # home, catalog, groups, profile tabs
│   ├── challenge/[id].tsx    # challenge detail + accept/submit
│   └── groups/[id]/          # group home, members, settings, feed, leaderboard
├── src/
│   ├── features/             # auth, challenges, completions, groups (each has api/ + components/)
│   ├── lib/                  # supabase client, queryClient, i18n, analytics, icons
│   ├── theme/                # NativeWind tokens
│   ├── types/database.ts     # hand-written Supabase Database type
│   └── ui/                   # generic UI atoms
├── supabase/
│   ├── migrations/           # 0001–0021, append-only
│   ├── tests/                # 14 .sql files, all idempotent (begin; … commit;)
│   └── seed.sql
└── docs/
    ├── superpowers/specs/    # design docs per slice/plan (the WHY)
    ├── superpowers/plans/    # implementation plans (the HOW, task-by-task)
    └── release/              # App Store privacy + release checklists
```

---

## Where to read what

Specs and plans are dated and named by slice/plan. Read them in order if you want the full story:

| What                                                   | Where                                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Product foundation (the original pillars)              | `docs/superpowers/specs/2026-06-19-challenge-arena-product-foundation.md`                                       |
| Technical foundation (stack + RLS model + RPC pattern) | `docs/superpowers/specs/2026-06-19-challenge-arena-technical-foundation.md`                                     |
| Slice 1 spec                                           | `docs/superpowers/specs/2026-06-19-challenge-arena-slice-1-spec.md`                                             |
| Slice 2 specs                                          | `docs/superpowers/specs/2026-06-23-…-plan-1-spec.md`, `…plan-2-spec.md`, `…plan-3a-spec.md`, `…plan-3b-spec.md` |
| Implementation plans (task-by-task code)               | `docs/superpowers/plans/`                                                                                       |
| App Store privacy answers                              | `docs/release/`                                                                                                 |

The newest specs+plans are the most accurate; older ones describe shipped reality.

---

## Locked design decisions (don't re-litigate)

These are settled and influence everything downstream. Touch only with an explicit decision-reversal note in a spec.

- **Category-agnostic.** "Groups carry the vibe" — no per-category UX branches.
- **Tiered proof.** `honor` and `photo` shipped; `video` and `peer` deferred to Slice 3.
- **Personal + group streak.** Personal streak resets on missed day. Group flame uses **lenient** rule: ANY member completion grows the flame; flame breaks only on a day with zero activity. Cron at 03:30 UTC.
- **Private groups only.** Invite-code-based join, 25-member cap, max 5 groups per user.
- **Solo-default onboarding.** Group features are opt-in after sign-up.
- **Dark-first, playful design.** Snap-coded; flame/podium/medal emojis are intentional.
- **Calendar-week leaderboards.** Monday 00:00 UTC reset (`date_trunc('week', now() at time zone 'UTC')`).
- **All writes via SECURITY DEFINER RPCs.** No direct INSERT/UPDATE/DELETE policies on user tables; the RPC owns validation + side effects in one transaction.
- **Hand-written `src/types/database.ts`.** Not regenerated. Update by hand when you add a table/RPC. `supabase.rpc as any` cast is required because the hand-written type narrows RPC returns to `never`.
- **No worktrees, no feature branches.** All work direct on `main`. Plans + specs live in `docs/superpowers/`.

---

## Non-obvious gotchas (the stuff that bit us)

- **Edge Functions pivoted to RPCs + pg_cron.** Corporate network blocks `deno.land` TLS, so `submit_completion` is an RPC (not Edge Function) and the streak/flame resets are `pg_cron` jobs (not scheduled Edge Functions). `supabase/config.toml` has `edge_runtime` disabled.
- **`bun test` ≠ `bun run test`.** `bun test` runs bun's built-in test runner. Always use `bun run test` to invoke Jest.
- **Jest 30 + jest-expo 56 is broken** (`clearMocksOnScope not a function`). Pinned Jest 29.
- **`react-dom` must match `react`.** Pinned `react-dom@19.2.3` for web builds.
- **`react-native-worklets` must match `react-native-reanimated@4.x`.** Pinned `react-native-worklets@0.8.3`.
- **Sentinel `group_id = 'ffffffff-…'`.** Three pre-Slice-2 SQL test fixtures use this UUID to satisfy the `challenges_creator_consistency` CHECK (added in migration 0015). `challenges.group_id` has no FK so it works. **But** `challenge_completions.group_id` DOES have an FK to `groups(id)` (added in migration 0012). `submit_completion` v2 defensively NULLs the propagated `group_id` if the resolved group doesn't exist — see migration 0019.
- **`groups` table has no UPDATE RLS policy.** Direct `UPDATE public.groups` from a SQL test running as `authenticated` silently affects 0 rows. In tests, `reset role;` first.
- **`storage.objects` blocks direct DELETE.** Storage tests use `rollback` instead of `commit` to clean up.
- **psql `\gset` variables don't substitute inside `do $$ … $$` blocks.** Use a session GUC (`set local "my.var"` + `current_setting('my.var')`) for that case.
- **Within one transaction, `now() = transaction_start_time`.** Sequential `join_group()` calls in a test all share the same `joined_at`. Tests that assert tie-breaker behavior on `joined_at` must explicitly UPDATE the rows to spread timestamps.
- **Stale `.expo/types/router.d.ts`** trips typecheck. Always `rm -f .expo/types/router.d.ts` before `bun run typecheck`.
- **Dual GitHub SSH config.** `github.com` = work, `github-personal` = alias for this repo. `~/.ssh/config` aliases the personal key. Clone via `git@github-personal:amanchhetri/arena-dl-10.git`.
- **NativeWind `darkMode: 'class'`** must be set in `tailwind.config.js` or RN throws a runtime warning.
- **`<ChallengeCard challenge={null} />` will crash.** `useMyAccepts` must `.filter(a => a.challenge != null)` because RLS hides soft-deleted (`is_active = false`) challenges from joined queries.

---

## Pick-up-on-new-machine checklist

1. Clone via `github-personal` SSH alias.
2. `bun install`.
3. Copy `.env.example` → `.env.local`; fill keys (ask Aman for Supabase project URL + anon key; PostHog + Sentry can be empty for local dev).
4. `supabase start && supabase db reset` (needs Docker running).
5. `bun run typecheck && bun run lint && bun run test` — should all pass.
6. Run the SQL sweep (block above) — should print 14 `TEST PASS` lines.
7. Read `docs/superpowers/specs/2026-06-19-challenge-arena-technical-foundation.md` for the architecture, then skim the most recent spec to see where we are.
8. Check `git log --oneline -20` to see the recent commit story.

---

## Workflow conventions

- **Brainstorm → spec → plan → execute.** Driven by the `superpowers:` skills (brainstorming, writing-plans, executing-plans, subagent-driven-development). Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.
- **Verbatim TDD plans → inline execution.** Subagent-driven dev is reserved for plans with significant judgment work. Five-task transcription plans (like 3b) work fine inline.
- **Commits use Conventional Commits prefixes** (`feat`, `fix`, `chore`, `docs`, `test`) and end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **lint-staged + husky** auto-format on commit. Don't fight the formatter.
- **No PRs.** Direct push to `main`. CI is not configured for this repo (yet).
