# Task — Allergen tracking: let a parent remove an entry they added by mistake

Starting an allergen protocol was one tap and permanent. A parent who tapped
"Start First Exposure" on the wrong allergen — or logged exposure #2 they never
actually gave — had no way out: the card stayed In Progress forever and the
exposure showed up in the pediatrician export.

## Decisions
- **No migration.** `delete_own_or_writer_*` DELETE policies already exist on
  `allergen_introductions` / `allergen_exposure_logs` / `allergen_reactions`
  (`20260820000000_child_pivot_log_rls.sql`). Nothing to add server-side.
- **Delete child → parent explicitly.** Reactions reference exposure logs,
  exposure logs reference the introduction. FK cascade behaviour on these
  Lovable-created tables isn't in a local migration, so the client deletes each
  level itself rather than trusting a cascade that may not exist.
- **Two affordances, not one.** Removing the whole entry is too blunt when only
  the most recent exposure was a mistake, so "Undo exposure #N" appears once
  there are 2+ exposures. With a single exposure the two actions are identical,
  so only "Remove tracking" shows.
- **Hard delete, no undo toast.** `useDeleteWithUndo` restores one row of one
  table; an introduction spans three tables, so re-inserting it would need FK
  rewiring. An AlertDialog that names exactly what is being deleted is the
  honest trade — and starting the protocol again is one tap.
- **Reverted status is computed, not guessed.** After an undo, the stored
  `status` / `completed_at` must agree with what `getAllergenStatus` derives, or
  the pediatrician export (which reads the stored status) disagrees with the UI.

## Service — `src/services/allergenService.ts`
- [x] `introStateAfterExposureRemoval(remaining)` — pure, returns the
      `{ status, completed_at }` the introduction row should hold after one of
      its exposures is deleted: `not_started` (nothing left) / `reaction_observed`
      (any reaction survives) / `completed` at the latest remaining `logged_at`
      (2+ clean) / `in_progress` (1 clean)

## Frontend — `src/components/feeding/AllergenTracker.tsx`
- [x] `removeExposure` mutation — deletes the reaction rows for that exposure,
      the exposure log, then rewrites the introduction's status
- [x] `removeIntroduction` mutation — reactions → exposure logs → introduction,
      then returns to the allergen grid
- [x] Both mutations `assertCanWrite` first and assert the DELETE returned rows;
      an RLS-blocked delete comes back as zero rows with no error and would
      otherwise toast success
- [x] Removal block under the reaction history, hidden for viewer-role partners:
      "Undo exposure #N" (2+ exposures) and "Remove <allergen> tracking"
- [x] Two AlertDialogs naming the exposure date / the exposure and reaction
      counts, `touch-target` on every action, destructive styling on confirm
- [x] Error toasts say what happened and what to do next

## Verify
- [x] `npx vitest run` — 400 passed (28 files), incl. 5 new cases covering
      `introStateAfterExposureRemoval`, one asserting it agrees with
      `getAllergenStatus`
- [x] `npx tsc --noEmit` clean
- [x] `npx eslint` clean on the changed files
- [x] `npm run build` succeeds

## Review
The removal path is confined to the detail screen — the grid card still opens
the protocol, which is where the mistake is visible and where the fix now lives.
Nothing about the logging flow changed. Legal-review log untouched: this is
per-entry log deletion under the parent's own control, not a change to the
retention, account-deletion, or consent surfaces Privacy § 8 describes.
