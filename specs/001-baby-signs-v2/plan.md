# Implementation Plan: Baby Signs v2 — Guided Sign Program with Weekly Coach

**Branch**: `001-baby-signs-v2` (planning work on `001-baby-signs-v2-plan`) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-baby-signs-v2/spec.md`

## Summary

This upgrades `/dashboard/signs` from a flat list of text cards into a guided program. It ships in four independently shippable slices, in spec priority order:

1. **Illustrations**: 20 designer-made inline SVGs that follow the theme, plus Model / Prompt / Celebrate steps and a tip for when a sign isn't catching on on every sign.
2. **Guided path**: a "This week" view of up to 3 focus signs, stored as a new `focus_since` column on the existing `child_signs` table. The full library stays one tap away.
3. **Practice ticks**: a new `child_sign_practice` table, one row per child, sign, and tracking day, shown only as a positive weekly total.
4. **Weekly coach**: a new one-shot `generate-sign-plan` edge function (`slp` persona) that the parent triggers by tapping. The server enforces Flare+, a limit of one plan per week, a minimal input schema with no name or free text, and output restricted to library signs. Results persist to a new `sign_plans` table. Privacy, FAQ, `/subprocessors`, and the legal log update in the same PR.

The details and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5 (React 18 + Vite 5); Deno for Supabase edge functions

**Primary Dependencies**: shadcn/ui, Tailwind, @tanstack/react-query, date-fns, Supabase JS v2. **No new dependencies**: SVGs use Vite's built-in `?raw` import

**Storage**: Supabase Postgres. One column added to `child_signs` (live, 0 rows, verified 2026-09-30), plus 2 new tables (`child_sign_practice`, `sign_plans`). Illustrations are bundled in `src/assets/signs/`, not in Storage

**Testing**: vitest (`npm test`) for pure logic and content checks. Manual and SQL validation per [quickstart.md](./quickstart.md)

**Target Platform**: iOS through Capacitor first, mobile web second. One-handed use

**Project Type**: Mobile-first web app with a Supabase backend

**Performance Goals**: Guided view renders without waiting on the network for content. Only progress loads. A tick feels instant (optimistic update). The coach returns in ≤ 20 s at p95 (SC-006)

**Constraints**: Illustrations ≤ 40 KB each and lazily loaded with the route. Works offline for reading content. Principle I copy rules. COPPA data minimization (bounded slugs, no free text)

**Scale/Scope**: Pre-launch (4 profiles, 2 Flare+). 20 signs, about 7 default sets, 1 page, 1 new sheet, 1 edge function

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. Result: **PASS**, with no violations.*

| # | Principle | Status | How the plan satisfies it |
|---|---|---|---|
| I | Calm, Not Clinical | **Pass** | Only a positive weekly total, hidden at 0. No streak, missed-day, or reminder logic exists anywhere (data-model "Derived values"). Mobbin anti-patterns are explicitly rejected (research R9). The coach prompt rules are applied to static copy too, and a copy-audit step is in quickstart §4.5. SC-007 reviews 20 plans before release |
| II | Child Data Changes Are Legal Changes | **Pass (with required work)** | New data categories: practice days, focus signs, and AI processing of sign progress. Privacy § 4, `/subprocessors`, FAQ, the CoppaDirectNotice line, and a `legal-review-log` entry ship **in the Story 4 PR**. Stories 1–3 add `child_sign_practice`, which is new child data, so the CoppaDirectNotice and legal-log update for ticks ships in the **Story 3 PR**. No new subprocessor |
| III | Subtract Before You Add | **Pass** | The spec states the parent problem and what's replaced: the flat accordion becomes the secondary library. No new home, briefing, or notification surface. The AI is one-shot, with no chat or ask box |
| IV | Removal Keeps Data and Every Role Whole | **Pass** | Unfocusing, clearing a status, and a Flare+ lapse never delete practice history or plans (FR-029). Every role keeps v1 abilities: viewers read, writers write. The v1 clear-status delete gets a confirm step when the sign is a focus sign |
| V | One Source of Truth per Fact | **Pass** | "Today" comes from `trackingDayKey`. The week comes from a new shared `planWeekStart`, also adopted by the two existing plan hooks. Derived values are defined once in `src/lib/signProgress.ts`. The server slug list is test-locked to the client library (R7). Query-key roots are listed in contracts/client-data-hooks.md |
| VI | No Silent Failures | **Pass** | Every mutation has `onError`. Deletes and updates use `.select()`, and 0 rows counts as an error. The focus-limit trigger error maps to swap copy. The coach error table maps each status to what the parent sees |
| VII | Access Is Enforced in the Database | **Pass** | Both new tables ship RLS in the same migration: owner-keyed, SELECT via `has_partner_access`, writes via `partner_can_write`. The focus limit is a DB trigger. The coach writes with the caller's JWT, and premium plus one-per-week are checked on the server |
| VIII | Prove It by Running It | **Pass** | `child_signs` confirmed live (R1). Quickstart requires `list_migrations` and `list_edge_functions` checks on live, and SQL assertions for the limit, dedup, and cascade |

**CLAUDE.md gates**: reuse-first (a column on `child_signs`, and the plan table mirrors the existing ones), the Mobbin rule (R9), the Legal Review log, and routing to the backend, frontend, and qa agents: all accounted for.

## Project Structure

### Documentation (this feature)

```text
specs/001-baby-signs-v2/
├── spec.md
├── plan.md                              # this file
├── research.md                          # R1–R10 decisions
├── data-model.md
├── quickstart.md                        # validation guide
├── contracts/
│   ├── generate-sign-plan.md            # edge function request/response/errors
│   ├── client-data-hooks.md             # hooks, query keys, write rules
│   └── illustration-asset-spec.md       # ← designer brief (hand-off ready)
├── checklists/requirements.md
└── tasks.md                             # next: /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   ├── 2026MMDD000000_child_signs_focus.sql         # Story 2: focus_since + limit trigger
│   ├── 2026MMDD000100_child_sign_practice.sql       # Story 3: ticks table + RLS
│   └── 2026MMDD000200_sign_plans.sql                # Story 4: plan table + RLS
└── functions/
    ├── _shared/signSlugs.ts                         # Story 4: server slug allow-list
    └── generate-sign-plan/index.ts                  # Story 4: new one-shot function

src/
├── assets/signs/{slug}.svg                          # Story 1: designer files (placeholders first)
├── data/
│   ├── signLibrary.ts                               # + steps, stuckTip, SIGN_PATH, getDefaultFocusSet
│   └── signMedia.ts                                 # Story 1: slug → {illustration, alt, video?}
├── lib/
│   ├── planWeek.ts                                  # planWeekStart (adopted by 3 hooks)
│   └── signProgress.ts                              # weeklyPracticeDays, readyForNewSigns, stalled…
├── hooks/
│   ├── useSignProgress.tsx                          # + focus_since, useSetSignFocus
│   ├── useSignPractice.tsx                          # Story 3
│   ├── useSignPlan.tsx                              # Story 4
│   ├── useActivityPlan.tsx, useSpeechClass.tsx      # switch to planWeekStart (no behavior change)
├── components/signs/
│   ├── SignIllustration.tsx                         # inline SVG / emoji fallback / future <video>
│   ├── SignDetailSheet.tsx                          # image + Model/Prompt/Celebrate + status + focus
│   ├── ThisWeekFocus.tsx                            # focus rows + tick + weekly line + ready-for-new
│   └── SignPlanCard.tsx                             # Story 4
├── pages/dashboard/SignsPage.tsx                    # restructured: This week → Plan → All signs
├── pages/PrivacyPage.tsx, SubprocessorsPage.tsx, FAQPage.tsx   # Story 4 disclosures
└── components/CoppaDirectNotice.tsx                 # Story 3 enumeration line
src/test/signs.*.test.ts                             # pure-logic + content-lock tests
docs/legal-review-log.md                             # Story 3 + Story 4 entries
```

**Structure Decision**: This is the existing single-app layout. New UI goes in a `src/components/signs/` folder, the same way `feeding/` and `logging/` group their components. `SignsPage.tsx` is extended, not replaced. The v1 `SignCard` accordion markup is retired in favor of `SignDetailSheet`, which reuses the v1 status controls. Existing `Sheet`, `Card`, `Collapsible`, and `PremiumGate` primitives are reused, and no new UI primitives are added.

## Delivery sequence and routing

| Slice | PR | Agents (CLAUDE.md routing) | Gate to merge |
|---|---|---|---|
| Story 1: illustrations and steps | PR-A | `frontend`, with `slp` for the steps copy, then `qa` | Placeholders are OK to merge behind the existing gate. **Launch** waits for the designer's files (SC-001) |
| Story 2: guided path | PR-B | `backend` (migration, applied to live) → `qa` → `frontend` → `qa` | Migration confirmed live before merge. Main auto-deploys, so this is the v1 lesson |
| Story 3: ticks | PR-C | `backend` → `frontend` → `qa`, plus `legal` for the CoppaDirectNotice line | Legal-log entry in the PR |
| Story 4: coach | PR-D | `backend` (migration and function, deployed) → `frontend` → `qa` → `legal` (disclosures) | SC-007 20-plan review recorded. Disclosures in the PR |

## Open items for the founder (not blocking tasks)

1. **Success criteria at pre-launch scale.** Production has 2 Flare+ accounts and 0 sign rows, so SC-004 and SC-005 (percentage return and tick rates) can't be measured or baselined. I recommend restating them as post-launch targets measured from the first 50 Flare+ users, or replacing them with a founder usability session (5 parents, can they teach a sign from the screen alone?).
2. **Designer timeline.** Story 1 can merge with placeholders, but the guided program feels thin without images. Get the first batch of 4 back early to lock the style.
3. **Free-tier preview** (R10): the default is none. It's a one-line change if you want 3 preview illustrations as an upgrade hook.

## Complexity Tracking

No constitution violations, so nothing to justify. One deliberate duplication is recorded instead: the server-side slug list (`_shared/signSlugs.ts`). Edge functions can't import `src/`, and a vitest check keeps the two lists in sync.
