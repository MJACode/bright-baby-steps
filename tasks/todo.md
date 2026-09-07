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
- [x] Fix stale NextStepFeed comment in `DashboardLayout.tsx:141`

## Follow-ups (not in this change)
- [ ] Undeploy the live `next-step-peek` edge function (manual, Supabase dashboard)
- [x] CLAUDE.md: "Seven edge functions" -> six
- [x] `docs/legal-review-log.md`: log the removed AI surface

## QA round 1 — Fix-required, in progress
- [ ] Guard `JSON.parse` returning a bare `null`/array — currently a 500 that
      wipes the whole briefing region off Home. Risk raised by the new prompt
      telling the model null is the expected default.
- [ ] No-data early return fires on a rolling 48h window, so an established
      parent who skips a weekend gets "Welcome! Start logging…" — the exact
      nag this change forbids the model from writing
- [ ] `status` still asserts raw counts as fact ("a solid day!") — the same
      logging-gap-as-finding defect, relocated into the headline
- [ ] Bound the `illness_logs` query — an unclosed illness would pin a warning
      to Home forever, now the dominant failure mode for `watch`
- [ ] Scrub stale `next-step-peek` mentions in `_shared/childContext.ts`

Resolved on review: QA flagged a missing legal-review-log entry, but it landed
in 5e0c5a5 alongside the page edits; QA reviewed a pre-commit snapshot.

## Deployment — gates the whole change
The frontend tolerates the old response shape silently: `TodayCard` ignores an
extra `focus` key and renders any non-empty `watch`. So merging without
redeploying `briefing` ships an app that *looks* fixed while still printing
the reported defect behind "More on today", with no type error or test to
catch it. Redeploy `briefing` and confirm the ACTIVE version incremented.

## Review
_(filled in when the work lands)_
