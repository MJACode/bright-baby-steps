# Implementation Plan: Finance Account Finder

**Branch**: `feature/finance-account-finder` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-finance-account-finder/spec.md`

## Summary

Replace the ~850-line `FinancialTab` and its satellites with a two-surface page: an **Account Finder** (two questions → one or two account types) and an **account list** with per-child "I opened this" status and optional sponsored "Open with" buttons. One pure recommendation function in `src/lib` is the single source of truth. Three new child-keyed tables (finder answers, opened status, sponsors) with role-aware RLS. Three one-shot reminder types added to the existing `check-notifications` cron under a new mutable `finance` category. Old finance tables stay in place, unread.

## Technical Context

**Language/Version**: TypeScript 5 (React 18, Vite); Deno for edge functions

**Primary Dependencies**: @tanstack/react-query, shadcn/ui, Tailwind, Supabase JS v2. No new dependencies.

**Storage**: Supabase Postgres — 3 new tables (see [data-model.md](./data-model.md))

**Testing**: Vitest (`npm test`), `npx tsc --noEmit`, `npm run lint`

**Target Platform**: iOS via Capacitor (primary), mobile web

**Project Type**: mobile-first web app + Supabase backend

**Performance Goals**: Finder result renders instantly (pure client function, no network round-trip after page data loads)

**Constraints**: One-handed use, 48px touch targets, brand tokens only, no AI, no SSN collection

**Scale/Scope**: 1 page, ~5 new/rewritten components, 1 lib module, 1 hook, 1 migration, 1 edge-function change

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Calm, Not Clinical | Pass | Reminders are one-shot per child per type, suppressed once opened, no "you haven't" copy, mutable category. |
| II. Child Data Changes Are Legal Changes | Pass (gated) | New per-child data (finder answers, opened status) + new notification category + sponsored links. `docs/legal-review-log.md` entry and Privacy/Terms check ship in the same PR (legal agent review). No edge function retired. No new subprocessor. |
| III. Subtract Before You Add | Pass | Spec states problem + replacement; page goes from ~8 surfaces to 2; removes calculators, calendar, checklist. |
| IV. Removal Keeps Data and Every Role Whole | Pass | No table dropped, no data deleted. Roles: owner — before: full checklist; after: finder + status. Co-parent — before: saw page with their *own* separate checklist; after: shares the child's finder + status. Caregiver/viewer — before: page reachable though role copy says "not finance"; after: hidden, matching role copy. Gap named: legacy checklist progress is no longer displayed — accepted by founder ("remove current setup", 2026-09-30). |
| V. One Source of Truth per Fact | Pass | Account content + figures in `src/lib/accountOptions.ts`; recommendation in `src/lib/accountFinder.ts`; eligibility window in one constant (mirrored in the edge function with a KEEP IN SYNC comment, same convention as `detectOffPlan`). One query-key root `["finance", childId, …]`. |
| VI. No Silent Failures | Pass | All mutations check `{ error }`, treat 0 rows as failure, `onError` toast with next step. |
| VII. Access Is Enforced in the Database | Pass | RLS keyed on `child_id` via a role-aware helper (owner or active co-parent). Sponsors table read-only to authenticated users; writes service-role only. |
| VIII. Prove It by Running It | Pass (gated) | Migration applied to live and confirmed via `list_migrations`; edge function deployed and dry-run; `tsc`, tests, lint run before PR. |

Post-design re-check: no change — all pass.

## Project Structure

### Documentation (this feature)

```text
specs/001-finance-account-finder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
supabase/
├── migrations/20260930000000_finance_account_finder.sql   # NEW: 3 tables, RLS, helper
└── functions/check-notifications/index.ts                  # EDIT: 3 finance reminder types

src/
├── lib/
│   ├── accountOptions.ts            # NEW (replaces savingsOptions.ts): 6 account types, 2026 figures, sources
│   ├── accountFinder.ts             # NEW: pure recommend(), trumpEligible()
│   ├── __tests__/accountFinder.test.ts   # NEW
│   ├── savingsOptions.ts / savingsProjection.ts / financeStages.ts / financeCalendar.ts   # DELETE
│   └── __tests__/financeStages.test.ts / financeCalendar.test.ts                          # DELETE
├── hooks/useFinanceAccounts.ts      # NEW: finder answers, statuses, sponsors + mutations
├── components/financial/
│   ├── AccountFinder.tsx            # NEW (evolves KidSavingsWizard)
│   ├── AccountCard.tsx              # NEW: summary, explainer, opened toggle, sponsor/neutral link
│   ├── FinancePage content (in FinancialTab.tsx, rewritten to ~100 lines)
│   └── KidSavingsWizard / KidSavingsComparison / SavingsGrowthCalculator / ProtectFirstCard  # DELETE
├── pages/dashboard/RecordsPage.tsx  # EDIT: hide Finance for caregiver/viewer
├── pages/dashboard/MorePage.tsx     # EDIT: entry copy; hide for caregiver/viewer
├── pages/dashboard/ProfilePage.tsx  # EDIT: add "Finance" to MUTABLE_CATEGORIES
├── hooks/useNotificationPrefs.tsx   # EDIT: category union
├── lib/homeSections.ts              # EDIT: hint "Accounts for your kid"
└── components/OnboardingWizard.tsx  # EDIT: financial interest copy
docs/legal-review-log.md             # EDIT
```

**Structure Decision**: Existing single-app layout. `FinancialTab.tsx` is kept as the section component (rewritten) so `RecordsPage` wiring and the `/dashboard/financial` route stay unchanged — reuse over new route.

## Delivery order

1. **backend** — migration + types regen + check-notifications change; apply to live; QA.
2. **frontend** — lib + hook + components + entry points + deletions; Mobbin references first for the finder flow.
3. **legal** — review copy, reminders, sponsor placement; log entry.
4. **qa** — full diff review; `tsc`, tests, lint.

## Complexity Tracking

None.
