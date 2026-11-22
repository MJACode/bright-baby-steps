# Food page restructure + AI meal plan — Nov 2026

Trigger: founder review of the Food page. One release (founder chose not to phase).

## Decisions (approved by founder, 2026-11-22)
- Vitamins move **fully into More** (founder override; PM flagged daily vitamin D discoverability risk)
- Food page tabs become **Feeding | Solids**
- Solids tab = log solids + allergens + solids history + AI weekly meal plan
- "Solid" is **removed from Log a Feed** — Feeding tab is milk only (breast / bottle / pump)
- Feed-type order: **auto-sort by last-7-day usage + pin one to top**
- Ideas/recipes: **AI weekly meal plan**, Flare+, **1 free plan per child**
- Feeding method: **per child — Baby-led / Traditional / Mix**, asked on first Solids visit, editable
- Vitamins stay **parents-only** (caregiver routes unchanged)
- Solids tab order: **Log solids → method + meal plan → Allergens → history**
- Feed Coach counts **milk feeds only**
- Meal plan safety: **curated food catalog** — the model picks foods from a vetted list; allergens and prep text come from the catalog, not model prose. Keyword filter stays as a second layer on model-written text. Allergen status derived server-side.

## Phase A — Backend (`backend` agent) — CONTAINS A MIGRATION → founder approves merge
- [ ] Migration `children.solids_method text CHECK IN ('blw','traditional','mix')` nullable
- [ ] Migration `meal_plans` — clone of `sign_plans` (UNIQUE child_id, week_start Monday, plan jsonb,
      owner-keyed RLS, no DELETE policy, guard trigger, cascade on child/auth.users)
- [ ] `_shared/mealPlan.ts` — validateInput / buildUserText / sanitizePlan (+ vitest)
      * deterministic hazard filter applied AFTER the model: honey <12mo, whole nuts, whole grapes/
        cherry tomatoes, popcorn, hard raw veg, cow's milk as a drink <12mo, added salt/sugar → drop item
      * never suggest an allergen the child has a reaction logged for
- [ ] `generate-meal-plan` edge function — clone of generate-sign-plan
      * input allowlist: childId, weekStart, correctedAgeMonths, method, introduced allergen slugs,
        reaction allergen slugs. No name, DOB, free text.
      * gate: Flare+ OR (no meal_plans row ever for this child) → else 403
      * 409 if a plan already exists for this week; persists with caller JWT
      * persona: `nutrition` from `_shared/personas.ts`
      * each idea: name, ageFit, blwPrep, traditionalPrep (per method), allergens[], servingTip
- [ ] Regenerate `src/integrations/supabase/types.ts`
- [ ] QA pass

## Phase B — Frontend (`frontend` agent)
- [ ] Mobbin references first (meal-plan / recipe-card screen, iOS) — new pattern
- [ ] `FeedingPage.tsx`: tabs Feeding | Solids; `?tab=allergens` + `?tab=supplements` stay valid
      (allergens → solids; supplements → redirect to More route) so push/Home deep links don't break
- [ ] Vitamins: new route `/dashboard/vitamins` rendering existing `SupplementTracker`; entry in `MorePage`
- [ ] `FeedingLog.tsx`: remove solid type + solid-only fields/allergen chips from the milk dialog;
      history on Feeding tab = milk only
- [ ] Extend `FeedingLog` (prop `mode="solids"`) rather than a new form — reuses solid fields, allergen
      chips, offline queue, edit flow. Solids tab history = solid only.
- [ ] Feed-type order: sort by count in last 7 days (from feeding_logs already loaded); pin via
      `usePreferences.pinnedFeedType` (per device); long-press/⋯ "Keep first"
- [ ] `lastFeedingType` pref: drop "solid"
- [ ] Solids tab layout: method chip → This week's meal plan card → Log solids → Allergens → history
- [ ] `useMealPlan` hook (clone `useSignPlan`); "Log this" on an idea pre-fills the solid log
- [ ] Method picker (first visit) writes `children.solids_method`
- [ ] Update PageInstructions copy; TodayCard/notification allergen path → `?tab=solids`
- [ ] Tests: tab routing/deep links, feed-type sort + pin, solid removed from milk dialog, Log-this prefill
- [ ] QA pass

## Phase C — Legal (`legal` agent) + docs
- [ ] PrivacyPage § 4 + `/subprocessors`: add generate-meal-plan (ninth Anthropic function, data sent)
- [ ] `docs/legal-review-log.md` entry
- [ ] CLAUDE.md "Eight edge functions" → nine
- [ ] Meal plan "not medical advice" + choking-safety footer copy reviewed by `nutrition` + `legal`

## Review — shipped 2026-11-22 (PR #320, deploy run 79 green)
- Live: `meal_plans` (RLS on, 3 policies), `children.solids_method`, migration 20261122000000; `generate-meal-plan` ACTIVE, verify_jwt on.
- Design changed twice after QA: keyword filter → curated 102-food catalog → AI picks foods only (no model text reaches parents). Allergen status derived server-side.
- Disclosure corrected after QA printed the real prompt: food names can reveal tolerated allergens.
- Follow-ups: registered-dietitian review of the catalog; short display names for catalog foods; lazy-load the ~85 KB catalog; outside-counsel questions in the legal log; manual device check of the Solids tab (free / Flare+ / partner; 4–5, 6, 9, 12+ months).

## Open risks
- Vitamins in More: daily vitamin D logging gets harder to find. Watch supplement log volume after ship.
- AI food content to infants: mitigated by hazard filter + nutrition persona + no-free-text input.

# Home card noise reduction — Sept 2026

Trigger: PM review of the Home "Today" card. Three of the five blocks were
saying the same thing (4-month rolling/reaching), the `watch` line reported a
logging gap as a physiological finding, and Next steps was truncated to
illegibility behind four competing affordances on a 64px row.

## Decisions (approved by product)
- [x] Cut `focus` from the briefing — redundant with the "This week" card
- [x] `watch` becomes nullable — renders only when it carries an action
- [x] Stop the missing-log nag (diaper shaming, "hours since last log")
- [x] Kill Next steps entirely (Home-only feature, no other consumer)
- [x] Keep `status` and "This week" as-is

## Backend — `supabase/functions/briefing/index.ts`
- [x] Drop `focus` from prompt, schema, and both fallback paths
- [x] `watch` nullable; model returns null when nothing is actionable
- [x] Forbid commenting on absent logs / asking the parent to log more
- [x] Absent logs = unknown, never reported as low
- [x] Delete `supabase/functions/next-step-peek/`

## Frontend
- [x] `TodayCard.tsx` — drop focus, guard watch, remove NextStepFeed, fix dividers
- [x] Delete NextStepFeed / useNextSteps / useNextStepPeek / nextSteps(.test) / skills
- [x] Update `useBriefing.ts` response type
- [x] Fix stale NextStepFeed comment in `DashboardLayout.tsx`
- [x] CLAUDE.md: "Seven edge functions" -> six
- [x] `docs/legal-review-log.md`: log the removed AI surface

## QA round 1 — Fix-required, all resolved
- [x] Guard `JSON.parse` returning a bare `null`/array — was a 500 that wiped
      the whole briefing region off Home. Risk raised by the new prompt telling
      the model null is the expected default.
- [x] No-data early return fired on a rolling 48h window, so an established
      parent who skipped a weekend got "Welcome! Start logging…" — the exact
      nag this change forbids the model from writing
- [x] `status` asserted raw counts as fact ("a solid day!") — the same
      logging-gap-as-finding defect, relocated into the headline
- [x] Bound the `illness_logs` query to 21 days — an unclosed illness would
      have pinned a warning to Home forever, now the dominant `watch` trigger
- [x] Scrub stale `next-step-peek` mentions in `_shared/childContext.ts`

Resolved on review: QA flagged a missing legal-review-log entry, but it landed
in 5e0c5a5 alongside the page edits; QA reviewed a pre-commit snapshot.

## Review

Merged to main as #233. The card goes from five stacked blocks to two on a
typical day: the `status` headline and the "This week" collapsible, with
`watch` appearing only when it names something the parent can act on.

The finding worth remembering is that **two of the five QA fixes were the same
defect in our own deterministic copy** that the change existed to remove from
the model's. We wrote a prompt rule forbidding the model to ask a parent to log
more, while our own no-data string said "Welcome! Start logging Maya's
activities" to anyone with a quiet 48 hours — and we reframed `watch` off
raw-count assertions while leaving `status` asserting them in the more
prominent line. Writing a rule for the model is not the same as applying it.

## Outstanding — manual, gates the user-visible fix

1. **Redeploy `briefing`.** The frontend tolerates the old response shape
   silently: `TodayCard` ignores an extra `focus` key and renders any non-empty
   `watch`. Until the function is redeployed, production still prints the
   original sleep line behind "More on today" — with no type error and no
   failing test to catch it.
2. **Undeploy `next-step-peek`.** Deleting it from the repo does not undeploy
   it; it stays ACTIVE and keeps accepting authenticated requests against a
   disclosure that no longer covers it. Dashboard only — there is no MCP delete
   tool for edge functions. Precedent: `parse-voice-log` (2026-08-28),
   `detect-milestone` (2026-06-21).

## Deferred, raised not actioned

`weekly-insights/index.ts` has a similar rolling-window empty state ("Start
logging {name}'s sleep to see weekly patterns here"). Milder than the briefing
string was, different surface, out of scope for this change.
