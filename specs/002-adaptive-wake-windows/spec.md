# Feature Specification: Adaptive Wake Windows

**Feature Branch**: `feat/adaptive-wake-windows`
**Created**: 2026-10-12
**Status**: Approved by founder 2026-10-12 (one project; AI participates within limits; stretches are suggested, never auto-applied)
**Input**: "Wake windows should get longer sooner. Use a combination of rules based on age, have AI customize based on patterns, and give the parent a way to know how this works."

## Problem (Principle III)

Two defects make wake windows feel stuck, both reproduced on the test child Lulu (5.8 mo, 14 days / 70 logs):

1. **Step function.** `WAKE_WINDOW_BY_BRACKET` gives every baby in a bracket the bracket's low end. Lulu's plan says 75 min; she actually holds ~98 min. On her 6-month day the plan jumps 75 → 120 min overnight.
2. **Backward-looking personalization.** `predictNextNap` uses the baby's own 14-day median, so it reproduces yesterday's schedule and never nudges longer.
3. **Opaque.** Parents see a time and a one-line reason; nothing explains where the number came from or how to change it.

**What it replaces / simplifies:** the bracket table as the wake-window source (`WAKE_WINDOW_BY_BRACKET` + `ageDefaultWakeWindowMin`), the wake-window half of the bracket-change heads-up (no more jumps to announce), and the ad-hoc median in `predictNextNap`. One engine replaces three computations (Principle V). No new screen: the explainer is a sheet off the existing Sleep Coach card, and the AI part rides on the existing weekly insight.

## User Scenarios & Testing

### User Story 1 — A wake window that grows with my baby (P1)

A parent of a 5.8-month-old sees a target wake window that reflects both age and what their baby actually does, and it moves smoothly as the baby ages — no overnight jump at a bracket boundary.

**Acceptance**
1. Lulu (5.8 mo, median 98 min over ≥7 logged days, 49 windows): target ≈ clamp(w·98 + (1−w)·132) with w = min(1, n/30) = 1 → 98 min; the Sleep Plan shows the age range "about 1h 30m – 2h 40m, typical 2h 10m" instead of "75-120 min".
2. Same child, age 6.0 mo: age typical moves 132 → 135; nothing in the plan or the coach jumps.
3. A baby with < 7 logged days gets the age typical alone.
4. A preemie uses corrected age everywhere (existing `sleepAgeMonths`).

### User Story 2 — "Why this time?" (P1)

From the Sleep Coach card the parent taps "Why this time?" and a bottom sheet explains, in plain words: the typical range for this age, their baby's last 14 days, any accepted stretch, how confident we are, and how it adapts. Pattern reference: Oura "contributors — each looks at your past 14 days" ([Oura](https://mobbin.com/screens/b67baac0-cc03-4ae0-bdf4-3c8cc7e81347)), Superpower "Why we recommend this" ([Superpower](https://mobbin.com/screens/4d1d2417-0aee-4822-9c84-2b034db19f3d)).

**Acceptance**
1. Sheet lists: age range (min–max, typical), "Your baby's last 14 days: about N min (M naps)", adjustment line if a stretch is active, confidence word, and a collapsible "How this works" paragraph.
2. Works for free users (explanation is not gated), while the prediction itself stays behind the existing `PremiumGate`.

### User Story 3 — Suggested stretch, parent decides (P1)

When the logs say the baby is ready, the app offers one small stretch to the first morning window. The parent taps "Try it" or "Not now". Nothing changes without a tap.

**Acceptance**
1. Lulu, if ≥2 under-tired and 0 overtired signals: "Lulu's first stretch of the day is about 98 min. You might try about 108 min this week and see how her first nap goes. If she shows strong sleepy cues sooner, follow her lead." Try it → the first-window prediction uses 108 min; Not now → no suggestion for 14 days.
2. No stretch suggestion under 4.0 mo corrected, nor between 3.5–4.5 mo (4-month regression).
3. At most one accepted change per 7 days.
4. Five or more days after accepting, if any overtired signal appears, offer "Go back to about 98 min" (no failure framing).
5. Mixed signals → no suggestion. ≥2 overtired signals (or O2 alone) → suggest shortening by the same step.

### User Story 4 — AI weekly read (P2)

The weekly insight (existing `weekly-insights` function, Anthropic) receives the engine's summary and may confirm the engine's suggestion or recommend holding, in one or two warm sentences. It cannot invent a number.

**Acceptance**
1. Request carries an optional `wakeWindow` block (see Contract). Server validates every number and the option list; LLM must answer `choice ∈ options`; anything else falls back to the engine's own pick.
2. The weekly insight page shows the AI's sentence under Sleep; if the choice is a stretch the engine still offers, a "Try it" button applies exactly the engine's step (same mutation as Story 3).

### Edge Cases

- No logs → age typical, low confidence, no suggestion.
- Missing night logs → treated as unknown, never as "slept fine"; data-sufficiency gate blocks suggestions.
- Accepted target falls below the age min as the baby grows → accepted target expires; engine value wins.
- Accepted target above age max or > typical+30 → clamped.
- Partner/caregiver: whoever can save the sleep plan today can accept a stretch (same RLS on `sleep_plans`).
- Calm mode: sheet and suggestion copy unchanged in meaning; the suggestion card is not shown as an alert.

## Requirements

### Functional Requirements

- **FR-001** One pure engine `src/lib/wakeWindow.ts` computes age range, personal target, signals and suggestion. `predictNextNap`, `buildSleepPlan`, the "Why" sheet and the weekly-insights payload all read it (Principle V). No React/Supabase imports; takes `now`.
- **FR-002** Age anchors (corrected months → typical / min / max, minutes), linear interpolation between rows, flat beyond 36:

  | mo | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 15 | 18 | 24 | 36 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | typical | 45 | 60 | 75 | 90 | 105 | 120 | 135 | 150 | 165 | 180 | 190 | 210 | 240 | 300 | 330 | 360 |
  | min | 30 | 40 | 45 | 60 | 75 | 85 | 90 | 105 | 120 | 135 | 150 | 165 | 180 | 240 | 270 | 300 |
  | max | 60 | 75 | 90 | 120 | 135 | 150 | 165 | 180 | 195 | 210 | 225 | 255 | 300 | 345 | 375 | 420 |

- **FR-003** Personal target = clamp(w·median14d + (1−w)·typical, min, min(max, typical+30)), w = min(1, windows/30); age typical alone when < 7 distinct logged days. Prediction keeps its existing time-of-day matching, applied to the personal target via the same blend.
- **FR-004** First / last window offsets (sample day only): <3 mo 0/0; 3–6 mo −15/+15; 6–12 mo −20/+30; ≥12 mo −30/+30 (2 naps) or −15/+15 (1 nap); clamped to bounds.
- **FR-005** Signals over the last 7 days, computed only when ≥5 complete days and ≥10 naps (data gate):
  - U1 holding longer: windows ≥ personal+15 on ≥50% of days and the following nap ≥45 min in ≥70% of those.
  - U2 nap skipped: one fewer nap than the usual (14-day modal) count on ≥3 of 7 days (5 of 7 → nap-transition, not a stretch).
  - U3 split night: an awake gap ≥60 min between 23:00–05:00 on ≥3 nights.
  - U4 day sleep above age high (>4.5h 3–6 mo, >4h 6–9, >3.5h 9–12, >3h 12–18, >2.5h 18+) on ≥5 days.
  - U5 short nap after short window (≥5 mo only): median window before naps <45 min is ≤ personal−10 and shorter than the median window before naps ≥45 min.
  - O1 short naps after long windows: median window before naps <45 min ≥ personal+15.
  - O2 total sleep below `TOTAL_SLEEP_BY_BRACKET.low` on ≥4 days.
  - O3 final morning wake before 06:00 on ≥3 days and last window ≥ personal+30.
  - O4 median bedtime ≥30 min later than the prior 7 days and last window ≥ personal+30.
- **FR-006** Decision: stretch if U ≥ 2 (≥3 at 8–10 mo) and O = 0; shorten if O ≥ 2 or O2; else none. Blocked when age < 4.0, 3.5 ≤ age < 4.5 (stretch only), data gate fails, < 7 days since last accept, < 14 days since last dismiss. Step: 10 min (4–6 mo), 15 min (6–18 mo), 15 min (18 mo+). Result clamped by FR-003 caps. Revert offer per Story 3 #4.
- **FR-007** Persistence without a migration: `sleep_plans.overrides` (jsonb) gains `wake_window_target_min` (number), `wake_window_set_at` (ISO), `wake_window_from_min` (number, for revert copy), `wake_window_dismissed_at` (ISO). Accept/dismiss writes merge into existing overrides and upsert the plan row if none exists. Every write checks `{ error }` and 0 rows and toasts on failure (Principle VI).
- **FR-008** Accepted target applies to the first window of the day (prediction after a night wake) until superseded, reverted, or expired by FR-003 bounds.
- **FR-009** `buildSleepPlan` uses the engine: displays the interpolated range, builds the sample day from the personal target with FR-004 offsets. `upcomingBracketChange` stops announcing wake-window jumps (nap-count changes still announce). `NAPS_BY_BRACKET["6-9mo"]` label becomes "2–3 naps".
- **FR-010** `supabase/functions/_shared/personas.ts` sleep wake-window lines match FR-002 ranges.
- **FR-011** Copy guardrails (Principle I): no "should/must/behind/off track/fix/sleep debt/ideal schedule/overtired baby", no crying-tolerance language; always "cues come first"; stretch copy carries the safe-sleep line "If she dozes off in a car seat or swing, move her to a flat, empty crib on her back when you can."; no pediatrician prompt for short windows alone.
- **FR-012** Weekly insights contract (below). Server-side validation; LLM choice outside options → engine pick; no new data category (derived from sleep logs already sent).

### Contract — `weekly-insights` request addition

```jsonc
{ "childId": "uuid",
  "wakeWindow": {                       // optional; omitted for <4 mo or no data
    "ageTypicalMin": 132, "minMin": 89, "maxMin": 162,   // integers 20..480
    "currentMin": 98,                                  // integer 20..480
    "signals": ["U1","U5"],                            // subset of U1..U5,O1..O4
    "options": [0, 10]                                 // 0 = hold; ±step ints, |x| ≤ 30, ≤ 3 items
} }
```
Response addition: `wakeWindow: { choice: number, note: string /* ≤ 280 chars */ }`. Invalid/absent → omitted (no card change).

### Key Entities

- **WakeWindowRange** { typical, min, max } at an age.
- **WakeWindowState** { range, personalMin, sampleCount, loggedDays, confidence, accepted?: { targetMin, fromMin, setAt }, signals: SignalCode[], suggestion: { kind: 'stretch'|'shorten'|'revert', fromMin, toMin } | null, blockedReason?: string }.

## Success Criteria

- **SC-001** Lulu fixture: plan no longer shows 75 min; no change > 5 min in typical between 5.9 and 6.1 mo; engine unit tests cover anchors, interpolation, blend, every signal, every gate.
- **SC-002** Coach prediction, plan sample day, Why sheet and weekly payload show the same personal minutes for the same logs (one engine, asserted in tests).
- **SC-003** `npm run typecheck && npm test && npm run lint:baseline` green; `CI` green.

## Assumptions

- No migration (overrides jsonb). Merging needs no founder migration sign-off.
- Weekly insights already sends sleep summaries + first name to Anthropic (Privacy § 4); the added derived numbers are within "relevant logged activity". A `docs/legal-review-log.md` entry records this (Principle II).
- Out of scope (follow-ups): deriving windows from observed nap count on 6–9 mo transition days; middle/last-window stretches; regression banners; a `NapTransitionCard`.
