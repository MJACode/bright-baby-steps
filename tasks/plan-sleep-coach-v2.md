# Sleep Coach v2 — scope & future considerations

**Branch (when picked up):** TBD — current investigation lives on `claude/investigate-sleep-coach-PcWKN`.

**Status:** Scoped, not started. Captured 2026-05-19 after a review of the existing implementation against Moms on Call (MoC) and Taking Cara Babies (TCB) as competitor benchmarks.

---

## Problem

Today the "Sleep Coach" does two things only:

1. `src/lib/sleepCoach.ts` — a rule-based 30-minute next-nap-window predictor (age-default wake windows + bucket-medians from up to 60 logs over 14 days).
2. `src/components/WindDownOverlay.tsx` — a 30-second full-screen Forest-Teal countdown ("Breathe slow. Dim the lights." → "Lay them down.").

There is no method selection, no regression banners, no nap-transition prompts, no night-feed-drop guidance, no link from wind-down to a sleep log, and the `Sparkles` icon implies AI that isn't there. The "coach" framing is doing heavy lifting for a predictor + a timer.

---

## Market context — MoC vs TCB

The two market leaders fundamentally disagree, so v2 onboarding must offer a **method picker** stored on `profiles.sleep_method`. Grace Flare's differentiator (per brand voice "warm, never preachy"): let the parent pick the opinion; the app stays neutral.

|                      | Moms on Call                                | Taking Cara Babies                       | Neutral (default)    |
|----------------------|---------------------------------------------|------------------------------------------|----------------------|
| Engine               | By-the-clock (7:30a / 7:30p anchors from 2wk) | Wake-windows until ~5mo, then clock     | AAP general          |
| Start training       | 8-12 wk / 12 lb                             | 5 mo+                                    | 6 mo+                |
| Crying posture       | Accepts crying for the schedule             | "Fewest tears possible"                  | Parent choice        |
| Signature artifact   | Laminated schedule pages (printed book)     | Wake-window chart meme                   | —                    |
| Regressions          | Treated as "schedule drift"                 | Explicit 4 / 8-10 / 12 / 18 mo content   | Generic              |
| Nap transitions      | Implicit in age-bracket schedules           | 5-of-7-day "refused" heuristic           | Age + observation    |
| Night-feed drop      | 12wk / 12lb green-light                     | Lives inside ABCs of Sleep, 5mo+         | Pediatrician sign-off|

TCB published wake-window ladder (use as the deterministic table):

- 0-4 wk: 30-60 min
- 4-12 wk: 60-90 min
- 3-4 mo: 75-120 min
- 5-7 mo: 2-3 hr
- 7-10 mo: 2.5-3.5 hr
- 11-14 mo: 3-4 hr
- 14-24 mo: 4-6 hr

MoC concrete example (8-16 wk bracket): wake 7:00-7:30a; naps after ~45-60 min awake; feeds every ~3 hr; bedtime feed 7:30p; target night 7:30p-7:00a; drop swaddle at 12 wk / 12 lb.

---

## P0 — Makes it feel like a real coach

1. **`MethodPickerDialog`** (one-shot from SleepPage settings) — `moc` / `tcb` / `none`. Presents the 5 training methods (extinction, Ferber check-ins, chair, pick-up/put-down, fading) at equal visual weight. **No "Recommended" badge** on any of them.
2. **`MethodScheduleCard`** (SleepPage) — renders the by-the-clock schedule (MoC) or wake-window targets (TCB) for the child's current age bracket. Driven by static JSON tables (no LLM). Wrapped in `PremiumGate`.
3. **`RegressionBanner`** (dashboard + SleepPage, dismissible per regression) — fires at **4 / 8-10 / 12 / 18 / 24 mo** based on DOB math. Persisted in `profiles.dismissed_regressions jsonb`. TCB users see TCB framing; MoC users see "schedule drift" framing.
4. **`SafeSleepABCsCard`** — AAP Alone / Back / Crib + white-noise 50-65 dB. Onboarding ack (deterministic step in `OnboardingWizard.tsx`, stamps `safe_sleep_acknowledged_at`) **plus** persistent collapsed card on SleepPage.
5. **`WindDownOverlay` deep-link** — on dismiss, insert a `sleep_logs` row with `started_at = now()`. Closes the dead-end the current UX has.
6. **`AskSleepCoachButton`** — one-tap handoff into existing `AIChatWidget` with `persona='sleep'` and last 7 days of `sleep_logs` as system context. Reuses the existing SSE fetch path; no new chat surface.

## P1 — Coach gets smarter

7. **`NapTransitionCard`** — TCB's "5 of 7 days refused" heuristic against `sleep_logs` to prompt 4→3 (~5 mo), 3→2 (~6.5-8 mo), 2→1 (~13-18 mo), 1→0 (~3.5-4 yr). Deterministic rolling 7-day nap count.
8. **`SleepCoachCard` enhancement** — pipe method label into the reason string ("Based on your TCB wake windows…"). Extend `AGE_DEFAULTS_MIN` in `src/lib/sleepCoach.ts` from the current 5 brackets to the TCB 7-row ladder above. Match the canonical sleep persona in `supabase/functions/_shared/personas.ts` so the dev-side math agrees with what the chat tells parents.
9. **Bedtime-routine timer** — generalize `WindDownOverlay` from 30s into a configurable routine (bath → book → song → crib), MoC's 7:30p anchor as default.

## P2 — Nice-to-have

10. **`NightFeedDropCard`** (≥4 mo) — MoC's 12 wk / 12 lb green-light vs TCB's "inside ABCs of Sleep, 5 mo+". Defers specifics to chat handoff.
11. **Regression push notifications** — fire 1 week before each regression date (toggle in notification settings).
12. **Milestone confetti** on completed nap transitions / first 12-hour night.
13. **Partner-aware copy** ("your partner logged the last 3 wakes").

---

## Data model

**New columns on `profiles`** (no new tables — fits the reuse rule):

```sql
ALTER TABLE public.profiles
  ADD COLUMN sleep_method text
    CHECK (sleep_method IN ('moc','tcb','none')) DEFAULT 'none',
  ADD COLUMN dismissed_regressions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN safe_sleep_acknowledged_at timestamptz,
  ADD COLUMN night_feed_drop_started_at timestamptz;
```

**Reused tables / columns:** `children.date_of_birth | is_premature | due_date`, `sleep_logs.started_at | ended_at`, `profiles.subscription_tier` (for `PremiumGate`).

---

## Deterministic vs AI handoff

| Rule-based (static tables in `src/lib/sleepCoach.ts`)        | AI handoff (`AIChatWidget` persona=`sleep`)         |
|--------------------------------------------------------------|-----------------------------------------------------|
| Wake-window math                                             | "Why is she fighting bedtime?"                      |
| Regression-age math (DOB → which banner)                     | Personalized regression coping                      |
| Nap-transition detection (5-of-7-day refused rule)           | Method troubleshooting once parent has picked one   |
| Method schedule rendering (static JSON per age bracket)      | Night-feed-drop specifics                           |
| Safe-sleep ABCs copy                                         | Anything ambiguous or emotional                     |

---

## Convention conflicts to flag during implementation

- **Onboarding stays deterministic.** Safe-sleep ack + initial method pick must be plain form steps in `OnboardingWizard.tsx`. No LLM call. Do **not** revive the `:::CREATE_CHILD:::` marker pattern.
- **AI transport.** `AskSleepCoachButton` enters the existing `AIChatWidget` SSE path (`fetch` + `ReadableStream`). Do not call `supabase.functions.invoke('chat', …)` for the streaming response.
- **Reuse before build.** `PremiumGate` already wraps `SleepCoachCard` — reuse on the new cards. `useSleepCoach` already pulls 14 d × 60 logs — extend its return shape to expose nap-count-per-day rather than spinning up a parallel hook. `AIChatWidget` already accepts a persona prop — no new chat surface.
- **Tone guardrail** (sleep persona, `supabase/functions/_shared/personas.ts:165`): "Be sensitive to parents' comfort levels with crying." Present all five training methods at equal visual weight in `MethodPickerDialog`. No "Recommended" badge.

---

## IP / legal flags

- **Do not reproduce the MoC laminated schedule pages verbatim.** Paraphrase the structure (7:30a wake, 45-60 min awake at 8-16 wk, 7:30p bedtime). Source the minute-marks from the printed *Moms on Call 0-6 Months* and *6-15 Months* books directly when building copy.
- **TCB wake-window numbers** are circulated openly enough to cite as ranges; still don't lift their chart graphic.
- **Don't brand UI as "Moms on Call mode" or "Taking Cara Babies mode."** Use generic labels: "By-the-clock", "Wake-windows", "Neutral / AAP". Method picker can mention the source programs in helper text, but the toggle values stay generic.
- **Update `docs/legal-review-log.md`** if v2 introduces new copy claiming method efficacy or pediatric outcomes.

---

## Open questions for the next session

1. Should `sleep_method` live on `profiles` (per parent) or on `children` (per child)? Argument for per-child: a family with multiple kids might run different methods. Argument for per-profile: simpler, matches today's `primary_interest` pattern.
2. How does the method picker interact with partners? If primary parent picks TCB and partner picks MoC, which wins? (Default proposal: per-profile means each parent sees their own UI but child data is shared.)
3. Should regression banners be opt-in via notification settings, or always-on for the active child? (TCB markets regressions hard — for an anxious-parent audience, always-on may be over-stimulating.)
4. P0 sequencing — ship `MethodPickerDialog` + `RegressionBanner` first (smallest delta, highest "feels like a coach" payoff), or land the migration + data model PR first to unblock both?

---

## Files referenced

- `src/components/SleepCoachCard.tsx` — current dashboard card
- `src/hooks/useSleepCoach.tsx` — fetches up to 60 `sleep_logs` from last 14 days
- `src/lib/sleepCoach.ts` — prediction math, extend `AGE_DEFAULTS_MIN` to 7 brackets
- `src/components/WindDownOverlay.tsx` — P0 deep-link target
- `src/components/OnboardingWizard.tsx` — deterministic safe-sleep ack step
- `src/components/AIChatWidget.tsx` — existing chat surface for `AskSleepCoachButton`
- `src/components/PremiumGate.tsx` — wrap all new premium cards
- `supabase/functions/_shared/personas.ts` (lines 143-166) — canonical sleep persona; v2 numbers must match

---

## Source brief (researcher, 2026-05-19)

Moms on Call: clock-based, schedule-first from 2 wk; sleep-train at 8-12 wk / 12 lb; 7:30p-7a target; soothing-rounds method (5-min check-ins, ≤1 min in-crib soothe, no pickup); treats disruptions as schedule drift.

Taking Cara Babies: wake-window-based until ~5 mo; explicit 4 / 8-10 / 12 / 18 mo regression content; "Crib Hour" for naps + 14-night ABCs of Sleep night protocol (pop-in every 10-15 min, touch first 3 nights then verbal-only); nap-drop heuristic "refuses 5 of 7 days."

Where they disagree with each other or AAP:

- Start age for night sleep training (MoC ~8-12 wk vs TCB 5 mo+ vs AAP-aligned 6 mo+).
- Room-sharing (AAP recommends 6 mo shared; MoC's own-room-from-birth posture is the most-criticized piece; TCB neutral).
- Crying (MoC accepts more; TCB markets "fewest tears").
- Clock vs cues (MoC wakes a sleeping baby to hold the schedule; TCB follows the wake window even if the clock disagrees).
