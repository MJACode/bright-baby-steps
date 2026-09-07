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
