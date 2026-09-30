# Quickstart: Validating Baby Signs v2

These are runnable checks that prove each story works (Principle VIII). The data shapes are in [data-model.md](./data-model.md) and the edge function contract is in [contracts/generate-sign-plan.md](./contracts/generate-sign-plan.md).

## 0. Prerequisites

- `npm install`, then `npm run dev`. The app runs at the Vite URL.
- A dev Flare+ account with one child aged about 8 months, a second account invited as a **coparent**, and a third invited as a **viewer**.
- Migrations applied, **confirmed on live** with the Supabase MCP `list_migrations` (not just present in the repo):
  - `child_signs.focus_since` and the `child_signs_focus_limit` trigger
  - `child_sign_practice`
  - `sign_plans`
- `generate-sign-plan` deployed and ACTIVE (`list_edge_functions`).

## 1. Local gate (every PR)

```sh
npx tsc --noEmit
npm test
npm run lint:baseline
```

Expected: all pass, and lint adds nothing above the baseline. The new unit tests to include:
- `getDefaultFocusSet`
- `readyForNewSigns`, `weeklyPracticeDays`, `stalled` (including a DST week and a 07:00 day-start)
- the server slug list matches the library
- every sign has an `illustrationAlt`, and no SVG contains `<script` or `on*=`

## 2. Story 1: illustrations

1. Open `/dashboard/signs`, then **All signs**, then MORE. You should see the illustration above the how-to text and the numbered Model / Prompt / Celebrate steps.
2. Toggle dark mode. The linework switches to the light color and the arrows stay orange.
3. VoiceOver: focus the image. It should announce the alt text.
4. Temporarily set one sign's `illustration` to `null`. You should see the emoji and text, with no broken image.

## 3. Story 2: guided path

1. On a fresh child, "This week" shows MILK, MORE, and ALL DONE (the default first set).
2. From All signs, make BATH a focus sign. It should say there are 3 focus signs already and offer to swap one.
3. Swap EAT in for ALL DONE. As the coparent, reload. You should see the same 3 signs.
4. Set all focus signs to "Trying it". "Ready for new signs?" should appear. Tap it. The next set should appear, with the old signs keeping their status.
5. SQL check: `select count(*) from child_signs where child_id = … and focus_since is not null` returns 3 or fewer. An attempt to insert a 4th row directly should fail with `focus_limit_reached`.

## 4. Story 3: practice ticks

1. Tick MILK, reload, and it is still ticked. The weekly line should read "You modeled signs on 1 day this week".
2. At the same time, tick MILK as the coparent. There should still be one row for that day (`select count(*) … where practiced_on = today`).
3. Un-tick MILK. The row should be deleted and the weekly line hidden.
4. As the **viewer**, the toggle should be disabled with an explanation. A forced API delete should return 0 rows, and the UI should show an error.
5. Copy audit: search the rendered page and `src/data/signLibrary.ts` for "streak", "missed", "haven't", "in a row". There should be no matches (Principle I).
6. Clear MILK's status (with confirmation). Its practice rows should still exist.

## 5. Story 4: weekly coach

1. Seed the data: MILK `signing`, MORE `emerging` with 5 practice days, EAT `introduced` in focus for 15 days with 1 practice day.
2. Tap **Build this week's sign plan**. Within about 20 s you should see 1–3 focus signs from the library, with EAT among the `stuck` items. Tap **Use these signs**, and focus should update.
3. Tap generate again. The button should be gone and the existing plan shown. A direct `curl` should return `409 plan_exists_this_week`.
4. As a free-tier account, `curl` the function and get `403 premium_required`. Send a body with `childName` added: the function still works, and the Anthropic request payload (logged in dev only) contains no name.
5. Temporarily force an Anthropic failure (for example, an invalid key in a dev branch). You should see the friendly error, and the guided path and ticks should still work.
6. **Content review (SC-007)**: generate 20 plans across varied seeded profiles. Record in the PR that there are zero diagnostic, delay, or guilt phrases and zero slugs outside the library.

## 6. Data lifecycle

1. Delete the test child. Rows in `child_signs`, `child_sign_practice`, and `sign_plans` for that child should be gone.
2. Run `delete_user_account()` for a test user. No rows should remain in the three tables.
3. Let Flare+ lapse (flip the dev subscription). The page shows the teaser. Restore Flare+, and all focus signs, ticks, and plans should be back.

## 7. Disclosure check (Principle II): same PR as Story 4

- Privacy § 4 and `/subprocessors` (Anthropic row) name the Baby Signs plan and its data: age in months, curated sign progress, and practice-day counts.
- FAQ AI answer mentions it.
- CoppaDirectNotice already lists signs. Add "and the days you mark a sign as practiced".
- `docs/legal-review-log.md` has a new entry, and CLAUDE.md's edge-function count is updated.
