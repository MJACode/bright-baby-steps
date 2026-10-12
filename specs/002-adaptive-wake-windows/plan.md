# Implementation Plan: Adaptive Wake Windows

**Spec**: [spec.md](./spec.md) · **Branch**: `feat/adaptive-wake-windows` · **One PR**

## Approach

1. **Engine first** (`src/lib/wakeWindow.ts`, pure). Everything else reads it.
2. **Wire the app**: `sleepCoach.predictNextNap` (blend + accepted first-window target), `sleepPlan.buildSleepPlan` (range display, sample day, heads-up), `useSleepCoach` (pass saved plan), Sleep Coach card "Why this time?" sheet + suggestion card, accept/dismiss mutation in `useSleepPlan`.
3. **Weekly insight**: client builds the `wakeWindow` block from the engine; `weekly-insights` validates, prompts, validates the answer; `WeeklyInsightsPage` renders the note + "Try it".
4. **Persona + legal log** in the same PR.

## Reuse (CLAUDE.md "Reuse Before You Build")

- `wakeWindowSamples`, `sampleConfidence`, `CONFIDENCE_DOT_CLASS`, `TOTAL_SLEEP_BY_BRACKET`, `BEDTIME_RANGE_BY_BRACKET`, `sleepAgeMonths` — reused, not reimplemented.
- `sleep_plans.overrides` jsonb — extended, no migration.
- `components/ui/drawer.tsx` (vaul bottom sheet) for the Why sheet; `Card`/`Button` for the suggestion.
- `SleepCoachCard` gains the sheet trigger + suggestion; no new page.

## Constitution Check (v1.0.1)

| Principle | Status |
|---|---|
| I Calm, not clinical | FR-011 guardrails; copy reviewed against them; suggestions optional and dismissible. |
| II Child data = legal | No new category; derived sleep stats to Anthropic within existing § 4 wording. Legal-log entry in this PR. |
| III Subtract before add | Replaces bracket table + median + wake-window heads-up; no new screen. |
| IV Removal keeps data | Nothing removed from the schema; bracket table kept for totals/naps/bedtimes. |
| V One source of truth | Single engine; parity test that coach, plan and weekly payload agree. |
| VI No silent failures | Accept/dismiss mutation checks error and 0 rows, toasts on failure. |
| VII Access in DB | Reuses `sleep_plans` RLS; no new table. |
| VIII Prove it by running | Unit tests + Lulu fixture built from her live 14-day shape; typecheck/test/lint. |

## Risks

- Prediction behavior change for every user → engine tests pin current behavior where w=1 and no accepted target (personal = clamped median, same as today unless outside bounds).
- LLM non-compliance → strict server validation, fallback to engine pick.
