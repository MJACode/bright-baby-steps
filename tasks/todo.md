# Home card noise reduction — Sept 2026

Trigger: PM review of the Home "Today" card. Three of the five blocks were
saying the same thing (4-month rolling/reaching), the `watch` line reported a
logging gap as a physiological finding, and Next steps was truncated to
illegibility behind four competing affordances on a 64px row.

## Decisions (approved by product)
- [ ] Cut `focus` from the briefing — redundant with the "This week" card
- [ ] `watch` becomes nullable — renders only when it carries an action
- [ ] Stop the missing-log nag (diaper shaming, "hours since last log")
- [ ] Kill Next steps entirely (Home-only feature, no other consumer)
- [ ] Keep `status` and "This week" as-is

## Backend — `supabase/functions/briefing/index.ts`
- [ ] Drop `focus` from prompt, schema, and both fallback paths
- [ ] `watch` nullable; model returns null when nothing is actionable
- [ ] Forbid commenting on absent logs / asking the parent to log more
- [ ] Absent logs = unknown, never reported as low
- [ ] Delete `supabase/functions/next-step-peek/`

## Frontend
- [x] `TodayCard.tsx` — drop focus, guard watch, remove NextStepFeed, fix dividers
- [x] Delete NextStepFeed / useNextSteps / useNextStepPeek / nextSteps(.test) / skills
- [x] Update `useBriefing.ts` response type
- [x] Fix stale NextStepFeed comment in `DashboardLayout.tsx:141`

## Follow-ups (not in this change)
- [ ] Undeploy the live `next-step-peek` edge function (manual, Supabase dashboard)
- [ ] CLAUDE.md: "Seven edge functions" -> six
- [ ] `docs/legal-review-log.md`: log the removed AI surface

## Review
_(filled in when the work lands)_
