# Weekly Development Content + Push

## Goal
Add "what to expect this week" developmental content in-app, age-driven (0–24 mo),
and nudge parents to it weekly via the existing notification pipeline.

## Plan
- [ ] `src/data/developmentContent.ts` — typed buckets (weeks 1–12, months 4–24),
      global non-diagnostic disclaimer, `getDevelopmentContentForChild(child)` helper.
- [ ] `getAgeInWeeks()` added to `useChildren.tsx` (prematurity-aware, mirrors getAgeInMonths).
- [ ] `WhatToExpectCard.tsx` — Dashboard card (milestones module color, Collapsible
      for full bullets + tip). Brand-compliant.
- [ ] Wire card into `Dashboard.tsx` and as a section on `MilestonesPage.tsx`.
- [ ] `check-notifications/index.ts` — new `weekly_development` type, 7-day dedupe,
      fires for born children within content range. Fans out to partners (existing loop).
- [ ] `NotificationBell.tsx` — 📚 icon for `weekly_development`.
- [ ] QA pass, commit, push, draft PR.

## Contract
- Notification type string: `weekly_development`
- Notification copy: generic nudge, no content duplicated server-side.
- "Push" = existing notifications table → NotificationBell (the app's notification
  mechanism). No FCM/web-push infra exists; this is consistent with every other reminder.

## Review
- All plan items done. `getAgeInWeeks` added; static content file with 25 buckets
  (weeks 1–12, months 4/5/6/7/8/9/10/11/12/15/18/21/24) + non-diagnostic disclaimer;
  `WhatToExpectCard` on Dashboard (after QuickNavGrid) and atop MilestonesPage;
  `weekly_development` notification (7-day cadence) + 📚 bell icon.
- `npx tsc --noEmit` → exit 0. QA verdict: Pass (two low-severity latent notes,
  both hardened: empty-first-name fallback + documented ≥3-bullets invariant).
- "Push" uses the existing notifications table → NotificationBell pipeline (the app's
  notification mechanism, generated server-side by the check-notifications cron). No
  FCM/web-push infra exists in the app; this matches every other reminder type.
- Manual checks left for on-device: visual render of the card on both surfaces, and a
  one-shot check-notifications run in dev confirming exactly one weekly_development row.
