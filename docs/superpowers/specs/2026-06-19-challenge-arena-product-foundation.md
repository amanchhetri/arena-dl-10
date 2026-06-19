# Challenge Arena — Product Foundation

**Status:** Approved 2026-06-19
**Owner:** Aman
**Scope:** Product vision, personas, gamification philosophy, design-system direction, viral-growth strategy, and slice roadmap. Companion to the Technical Foundation doc.

---

## 1. Vision and positioning

**Challenge Arena is the playful, gamified app where Gen Z challenges themselves and their crews to do anything — and gets XP, streaks, and badges for it.**

The product is a Snap-coded social layer on top of a Duolingo-style streak engine, organized into Discord-style group spaces. It is deliberately category-agnostic: fitness, study, dares, and habits all live on the same surface. The platform itself stays tonally neutral; each group sets its own vibe.

Elevator pitch: *Habitica grew up, joined a friend group, and got a phone.*

### Why this shape wins

- **Generalist apps usually lose to specialists.** We sidestep that trap by pushing identity down to the group level. The *app* is generic; the *group* (Hockey Squad Summer Shred, Finals Week Focus, Dare Friday) is specific.
- **Solo-default + group-optional** keeps the product valuable on day one for users who arrive without friends, which is critical when the network is weak.
- **Public profiles + private groups** gives us a viral surface (the profile, the share card) without exposing user-generated challenge content to strangers — the latter is a content-moderation tarpit we are explicitly avoiding.

### Non-goals

- Not a habit tracker for 30+ professionals (Streaks, Things, Notion own that user).
- Not a public UGC platform — no global discover feed of user submissions.
- Not a marketplace — no XP shop, no virtual currency, no IAP economy.

---

## 2. Personas

### P1 — Mira, 16, primary persona
High-schooler in Mumbai, already in a tight Snap group of 5 close friends. Wants something to *do* together besides chat. Enters via a friend's invite code. The group + group streak drive her engagement. Her social pressure (don't be the one who breaks our flame) is what we are designing for. **She is the retention engine.**

### P2 — Arjun, 19, solo-entry persona
College freshman who saw an Instagram reel and downloaded cold. No friends on the app yet. Lands in solo mode, completes a "drink 8 glasses of water" preset, earns first XP. Comes back tomorrow because of his personal streak. After day 7, gets a soft nudge to invite friends. **He is the acquisition engine** — every download must be valuable to him alone, or we lose him before friends arrive.

### P3 — Sana, 17, group-creator persona
Sports captain at her school. Creates "Hockey Squad Summer Shred", drops the invite code in WhatsApp, seeds the group with five fitness challenges. She is the power user whose engagement drives an entire group's engagement. **She is the supply engine** — when she logs off for two weeks, her whole group churns.

### Non-persona
The 30+ professional looking for a polished habit tracker. We do not design for this user. If a feature only matters to them, it is out of scope.

---

## 3. Locked design pillars

| Pillar | Decision |
|---|---|
| Domain | Category-agnostic; groups carry the vibe |
| Proof model | Tiered: honor / photo / video / peer-approval, chosen at challenge creation |
| Retention loop | Personal streak (primary) + per-group streak flame (secondary) |
| Privacy | Public profiles, private invite-only groups |
| Onboarding | Solo-default, group-optional |
| Personality | Playful, chaotic, Snap-coded, dark-first |
| Age | 13+ (App Store rating 12+) |
| Monetization | Free for MVP — no ads, no IAP |
| Locale | English UI shipped; i18n plumbing in from day one |

Every later decision in this product (and in the Technical Foundation doc) must be checkable against these pillars. If a future feature conflicts with one of them, the pillar wins and the feature changes.

---

## 4. Gamification philosophy

### Three nested loops

**Hour loop — intrinsic dopamine.**
Complete a challenge → immediate haptic + sound + XP animation + streak tick. Must feel polished. Janky animation here is the difference between an app users describe as "satisfying" and one they describe as "fine." Reanimated 3 + Moti, ≤ 250ms per beat.

**Day loop — retention.**
Open app → see today's challenges + streak status + pending votes from peers. Streak owns the day loop. Push notifications are restrained: one nudge at a user-configurable evening time. Never more. We are not Duolingo's notification team.

**Week loop — social.**
Group leaderboards reset weekly; group streak flame persists; friends' activity appears in the group feed. This is the loop that converts solo users into group users.

### XP is progression, not currency

XP can be earned and accumulated. It can be spent only on level-up. There is no shop, no marketplace, no inventory of items. Level-ups unlock cosmetic profile flair (avatar borders, animated frames, badge displays). Cosmetic only — never functional advantage. Reason: shops invite balance arguments and stoke pay-to-win complaints, both of which we are uniquely not equipped to handle in MVP.

### Anti-toxicity guardrails (non-negotiable)

These must be enforced in the technical spec and never relaxed.

- **Missed day resets streak to 0. Never deducts XP.** Punishing failure makes users delete the app.
- **One free streak-freeze per week.** Duolingo recently learned this; we copy the lesson. Second chances reduce churn dramatically.
- **Broken streaks are private.** Only the user sees their own break. No public shaming, no feed entries for misses, ever.
- **No leaderboard demotions or "you fell behind" comparisons in notifications.** Loss-framed messaging is correlated with rage-uninstalls in Gen Z.

---

## 5. Design system direction

### Color (dark-first)

| Token | Hex | Use |
|---|---|---|
| `bg/base` | `#0A0A0F` | App background |
| `bg/surface` | `#16161C` | Cards, sheets |
| `bg/elevated` | `#1F1F28` | Modals, popovers |
| `primary/500` | `#A855F7` | Primary CTA, active state |
| `accent/pink` | `#EC4899` | Highlights, secondary CTAs |
| `accent/cyan` | `#06B6D4` | Tertiary highlights, info |
| `flame/from` | `#F97316` | Streak flame gradient start |
| `flame/to` | `#EF4444` | Streak flame gradient end |
| `xp/gain` | `#84CC16` | XP earned animations |
| `text/primary` | `#F4F4F8` | Body text |
| `text/muted` | `#8B8B98` | Secondary text |

Light mode is a setting, not a default — Gen Z phones live in dark mode.

### Typography

- **Display + numerics:** Space Grotesk Bold. Tabular numerals. XP, streak count, leaderboard rank, level — all rendered oversized in this face. Numbers are the hero of every screen.
- **Body:** Inter (regular, medium, semibold). System fallback for performance.

### Iconography and motion

- Icons: Phosphor (duotone). Friendly without being childish.
- Motion: Reanimated 3 + Moti. Every value that increments animates. Durations ≤ 250ms. Spring physics for organic feel.
- Haptics: light tap on every action, success haptic on challenge completion, notification haptic on level-up.

### Mascot

Working name: **Sparky** — a flame character that lives inside the streak indicator. Full mascot design (illustrated states, animations, sticker pack) is pushed to a focused post-MVP design pass. For MVP, Sparky is an animated SVG flame with two states: alive and broken.

### Component direction

NativeWind + a small custom primitive layer. No heavy component library. Buttons, cards, sheets, and inputs are bespoke and lean into the playful aesthetic (rounded-2xl corners, gradient borders on hero CTAs, oversized type).

---

## 6. Viral growth strategy

Three mechanics, in priority order. Anything not in this list is out of scope for the foreseeable future.

### V1 — Group invite codes (Slice 2, MVP)
Six-character codes (`ARENA-XYZ123`), shareable via WhatsApp / iMessage / Snap. Universal deep link opens the installed app and pre-fills the code; if app is not installed, link routes to App Store / Play Store with the code preserved through install (via deferred deep link). This is the friend-graph loop and it is non-negotiable.

### V2 — Shareable milestone cards (Slice 4, MVP-shaped)
On hitting a milestone (7-day streak, first badge, level-up, weekly leaderboard #1), user gets a one-tap share sheet. Generated card shows their stats, mascot, and a watermark with deep link. Targets Instagram story + Snap. This is how the app reaches strangers.

### V3 — Public profile URLs (Slice 4)
`<final-domain>/u/<username>` (domain TBD — `arena.app` used as illustrative placeholder; real domain decided at brand pass) — a designed-to-convert landing page. When a stranger taps a shared card, they land on a profile with clear "Challenge {name}" CTA. Profile shows public stats: total XP, current streak, badge wall. Never shows actual challenge content (privacy guardrail).

### Explicitly out of scope

- TikTok-style global discover feed of submissions — moderation cost too high, App Store risk.
- Paid referral rewards — attracts the wrong users before product-market fit.
- Influencer partnerships, paid acquisition — premature.
- Cross-posting integrations (auto-post completions to Instagram, etc.) — privacy risk, opt-in burden.

---

## 7. Slice roadmap

Each slice is its own brainstorm → spec → plan → build cycle. Slice 1 ships to TestFlight before Slice 2 is specced in detail.

| Slice | Scope | Ship target | Success metric |
|---|---|---|---|
| **1 — Core loop** | Email + Google + Apple auth, profile creation, preset challenge catalog, accept → complete → proof submit → XP awarded, personal streak. Proof tiers shipped: **honor + photo** (peer + video deferred) | TestFlight in 4–6 weeks | D1 retention > 40% |
| **2 — Social** | Groups, invite codes, group leaderboard, group feed, group streak flame, custom challenges. Proof tiers added: **video** | +3 weeks after Slice 1 | Invite acceptance rate > 30% |
| **3 — Retention** | Achievements, badges, push notifications, streak freeze, daily reminders. Proof tiers added: **peer-approval** | +3 weeks after Slice 2 | D7 retention > 25% |
| **4 — Virality** | Milestone share cards, public profile URLs, rich link previews, deferred-install deep linking | +2 weeks after Slice 3 | K-factor (viral coefficient) > 0.3 |

### What MVP means here

"MVP" is the union of Slices 1 + 2. Slice 1 alone is the technical proof; Slice 2 unlocks the actual product hypothesis (do Gen Z friend groups actually adopt this?). Slice 3 is the retention floor that makes the product survive past month one. Slice 4 is the growth engine.

### Cross-slice constraints

These apply to every slice and must not be violated:

- Every screen works offline-first for read paths (cached data shown immediately, syncs in background).
- Every write action is optimistic (UI updates immediately, reconciles with server).
- Every animation respects `prefers-reduced-motion`.
- Every text string ships through the i18n layer, even if only English exists in MVP.
- Every analytics event is namespaced and documented at the time it is added.

---

## 8. Open questions deferred past foundation

These are real questions but do not block the foundation. They will be revisited at the slice that introduces them.

- **Mascot full design pass** — defer to a focused brand sprint after Slice 1 ships.
- **Sound design** — system sounds for MVP; bespoke sound design post-PMF.
- **Final name** — "Challenge Arena" is working title; revisit before App Store submission with a brand pass given the playful direction may not match the "arena" word.
- **Monetization model** — revisit at the point we have 1,000 weekly active users and a clear PMF signal.
- **Accessibility audit** — every slice gets a basic a11y pass at completion; a full WCAG audit happens before public launch.

---

## 9. Definition of done for this document

This spec is done when:

- All 9 design pillars in §3 have been decided and locked. ✓
- All 3 personas in §2 are written with clear roles in the growth/retention/supply loop. ✓
- The gamification loops (§4) and anti-toxicity guardrails are explicit enough to enforce in code. ✓
- The viral strategy (§6) is ranked and scoped, with clear out-of-scope items. ✓
- The slice roadmap (§7) has a success metric per slice. ✓

Next document: **Technical Foundation** — Supabase schema for the full vision, RN/Expo architecture, folder structure, security model, scalability stance, MVP-vs-future feature cut.
