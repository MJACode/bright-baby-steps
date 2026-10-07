# Tasks: Baby Signs v2 — Guided Sign Program with Weekly Coach

**Input**: Design documents from `specs/001-baby-signs-v2/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. The plan and quickstart §1 explicitly call for vitest unit tests covering the pure logic, content locks, and SVG safety. All tests are in `src/test/`, run with `npm test`.

**Organization**: One phase per user story, and each story phase is **one PR**, following the plan's delivery sequence (PR-A → PR-D). Agent routing follows CLAUDE.md: `backend` owns `supabase/**`, `frontend` owns `src/**`, `qa` reviews after each non-trivial change, and `legal` reviews disclosure copy. Every PR passes the local gate (`npm run typecheck && npm test && npm run lint:baseline`) and the `CI` workflow before merge.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 = illustrations, US2 = guided path, US3 = practice ticks, US4 = weekly coach
- **Owner** is shown in *(italics)* at the end of each task

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: Shared helpers and folders that every story uses. Ships at the start of PR-A.

- [X] T001 Create `src/assets/signs/` with a `README.md` that points to `specs/001-baby-signs-v2/contracts/illustration-asset-spec.md` and states the naming rule `{slug}.svg` *(frontend)*
- [X] T002 [P] Create `src/lib/planWeek.ts` exporting `planWeekStart(date: Date = new Date()): string`, which returns `format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")` (research R4) *(frontend)*
- [X] T003 [P] Add `src/test/planWeek.test.ts`: Monday stays the same, Sunday maps to the previous Monday, and a DST-transition week returns the correct Monday *(frontend)*
- [X] T004 Switch `src/hooks/useActivityPlan.tsx` (line ~92) and `src/hooks/useSpeechClass.tsx` (line ~94) from their inline `startOfWeek` calls to `planWeekStart()`. This is a zero-behavior-change refactor (Principle V); remove unused imports *(frontend)*

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Content-model extensions that all four stories read. Ships in PR-A.

**⚠️ CRITICAL**: No story work can start until this phase is done.

- [X] T005 Extend `Sign` in `src/data/signLibrary.ts` with `steps: { model: string; prompt: string; celebrate: string }` and `stuckTip: string` (data-model "Sign"). Keep all existing fields and v1 program constants unchanged (FR-008) *(frontend)*
- [X] T006 Write the `steps` and `stuckTip` copy for all 20 signs in `src/data/signLibrary.ts`. Rules: Model always says the word aloud; Prompt never withholds the item; Celebrate counts approximations; no diagnostic, delay, "should", or guilt wording (FR-006, FR-007, Principle I). **Route the draft through the `slp` agent for review before commit** *(frontend + slp)*
- [X] T007 [P] Create `src/lib/signProgress.ts` with pure functions and no React or Supabase imports. They take `now` and a `TrackingSchedule` as parameters (data-model "Derived values"):
  - `weeklyPracticeDays(practiceRows, weekStart)`: distinct `practiced_on` in [weekStart, weekStart+6]
  - `readyForNewSigns(focusRows, now)`: all focus rows `emerging|signing`, OR earliest `focus_since` ≥ 14 days ago
  - `practiceDays4w(practiceRows, today)`: per slug, distinct days in the last 28 tracking days
  - `stalled(focusRows, practiceDays4w, now)`: focus ≥ 14 days AND status `introduced` AND ≥ 1 practice day

  No streak or consecutive-day function may exist (FR-016). *(frontend)*
- [X] T008 [P] Add `src/test/signProgress.test.ts` covering each function, including a DST week and a child with `day_start_time = '07:00'` *(frontend)*
- [X] T009 [P] Add `src/test/signLibrary.content.test.ts`. It asserts that:
  - every sign has non-empty `steps.model/prompt/celebrate` and `stuckTip`
  - no copy in `signLibrary.ts` matches `/streak|in a row|missed|haven't|behind|delay|should/i`
  - slugs are unique kebab-case

  *(frontend)*

**Checkpoint**: The content model and pure logic are ready.

---

## Phase 3: User Story 1 — See how to make each sign (P1) 🎯 MVP · **PR-A**

**Goal**: Every sign shows a step-by-step illustration (or its emoji fallback), numbered Model / Prompt / Celebrate steps, and a stuck tip, in a detail sheet.

**Independent Test**: quickstart §2. Open MORE: you see the illustration, the how-to, and the three numbered steps. Dark mode recolors the lines. VoiceOver reads the alt text. With `illustration: null`, the emoji shows instead.

### Tests for US1

- [X] T010 [P] [US1] Add `src/test/signMedia.test.ts`. It asserts that:
  - every `SIGN_LIBRARY` slug has a `SIGN_MEDIA` entry with non-empty `illustrationAlt`
  - every bundled SVG (read through `import.meta.glob('/src/assets/signs/*.svg', { query: '?raw', eager: true })`) contains no `<script`, no `on\w+=` attribute, no `<image`, and no external `href`
  - every SVG has `viewBox="0 0 400 300"`

  *(frontend)*

### Implementation for US1

- [X] T011 [P] [US1] Add 20 placeholder SVGs, one per slug (`milk.svg` … `hurt.svg`), to `src/assets/signs/`. Each uses `viewBox="0 0 400 300"` and a simple outline with classes `sign-line`, `sign-ghost`, and `sign-motion` per the asset spec §3. They get replaced one-for-one when the designer's files arrive *(frontend)*
- [X] T012 [US1] Create `src/data/signMedia.ts`. It exports `type SignMedia = { illustration: string | null; illustrationAlt: string; video?: string; videoPoster?: string }` and `SIGN_MEDIA: Record<string, SignMedia>`. Illustrations are imported with `?raw`, and `illustrationAlt` is written from each sign's `howTo` (FR-002, FR-003, data-model "SignMedia") *(frontend)*
- [X] T013 [US1] Create `src/components/signs/SignIllustration.tsx`, which renders in this order:
  1. if `media.video`: `<video muted loop playsInline autoPlay={false} poster>` with the illustration as fallback (FR-005)
  2. otherwise, if `media.illustration`: inline SVG in a `role="img"` wrapper with `aria-label={illustrationAlt}`
  3. otherwise: the sign's emoji at large size

  The container uses `bg-milestones-bg rounded-xl aspect-[4/3]` *(frontend)*
- [X] T014 [US1] Add scoped CSS for the illustration classes in `src/index.css`, using tokens only (no hex):
  - `.sign-illustration .sign-line { stroke: hsl(var(--foreground)) }`
  - `.sign-ghost { stroke: hsl(var(--foreground)); opacity: .35 }`
  - `.sign-motion { stroke: hsl(var(--accent)); fill: hsl(var(--accent)) }`
  - `.sign-fill { fill: hsl(var(--milestones) / .12) }`

  *(frontend)*
- [X] T015 [US1] Create `src/components/signs/SignDetailSheet.tsx` using the existing shadcn `Sheet` (bottom). Layout, per research R9 (Bevel/Hevy pattern):
  - `SignIllustration` at the top
  - Quicksand title
  - How / When text from v1
  - numbered list 1 Model, 2 Prompt, 3 Celebrate
  - "If it isn't catching on" collapsible
  - the v1 3-state status buttons, moved over unchanged from `SignCard` with their `useSetSignStatus` wiring

  All controls are ≥ 48px. How-to text renders even if the media fails (FR-004) *(frontend)*
- [X] T016 [US1] Update `src/pages/dashboard/SignsPage.tsx` so each library row opens `SignDetailSheet` instead of the inline `Collapsible` accordion. Keep the stage grouping, the progress summary line, `PremiumGate` (`baby-signs`), and every v1 footer constant with its Early Intervention link. Delete the now-unused `SignCard` *(frontend)*
- [x] T017 [US1] Invoke the **`qa`** agent on the PR-A diff. Focus: brand tokens, 48px targets, inline-SVG safety, v1 copy unchanged, and the zero-behavior-change `planWeekStart` refactor. Fix and re-run until Pass *(qa)*
- [x] T018 [US1] Run the local gate, open PR-A, and merge per the CLAUDE.md auto-merge policy. **Launch gate**: the designer's files (SC-001) replace the placeholders in a follow-up PR that changes only `src/assets/signs/*.svg` *(parent)*

**Checkpoint**: US1 is fully usable with placeholders and complete once the designer's files arrive.

---

## Phase 4: User Story 2 — Follow a guided week-by-week path (P1) · **PR-B**

**Goal**: "This week" shows up to 3 shared focus signs with a default path, swap from the library, and "Ready for new signs?".

**Independent Test**: quickstart §3. On a fresh child you see MILK, MORE, ALL DONE. A 4th focus sign is refused with a swap offer. The coparent sees the same focus signs. "Ready for new signs?" appears once all focus signs are at "Trying it". A direct 4th insert fails with `focus_limit_reached`.

### Backend (first, then QA)

- [x] T019 [US2] Create `supabase/migrations/<timestamp>_child_signs_focus.sql`. It must:
  - run `ALTER TABLE public.child_signs ADD COLUMN IF NOT EXISTS focus_since date NULL`
  - add a partial index on `(child_id) WHERE focus_since IS NOT NULL`
  - add a `BEFORE INSERT OR UPDATE OF focus_since` trigger function `child_signs_focus_limit()`: when `NEW.focus_since IS NOT NULL` and the count of *other* rows for `NEW.child_id` with `focus_since IS NOT NULL` is ≥ 3, `RAISE EXCEPTION 'focus_limit_reached' USING ERRCODE = 'P0001'`
  - update `COMMENT ON COLUMN`
  - be idempotent (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`)

  *(backend)*
- [x] T020 [US2] Apply the migration to **live** with the Supabase MCP `apply_migration`. Confirm with `list_migrations` and with `execute_sql` checks that the column exists and a 4th focus insert raises `focus_limit_reached` (Principle VIII; the v1 lesson that `main` auto-deploys) *(backend)*
- [x] T021 [US2] Regenerate `src/integrations/supabase/types.ts` with `generate_typescript_types` so `child_signs` includes `focus_since`. Do not hand-patch *(backend)*
- [x] T022 [US2] Invoke **`qa`** on the migration: idempotency, trigger correctness on UPDATE (unfocus → focus doesn't count itself), and RLS unchanged *(qa)*
- [x] T022a [US2] Bind `child_signs` writes to the child's real owner (`supabase/migrations/20260930010000_child_signs_rls_bind_child.sql`): closes a v1 cross-tenant write hole that the focus limit turned into a lock-out. Applied live; verified with role-switched tests (stranger rejected both ways, owner 3 focus OK, 4th blocked, upsert at 3/3 OK) *(backend)*

### Frontend

- [x] T023 [P] [US2] Add `SIGN_PATH: { id: string; signSlugs: string[]; fromMonths: number }[]` to `src/data/signLibrary.ts`: about 7 sets of 2–3 slugs following stage order, the first set `["milk","more","all-done"]`. Also add a pure `getDefaultFocusSet(correctedAgeMonths, progressBySlug)` that returns the first age-appropriate set with any sign not at `signing` (FR-009) *(frontend)*
- [x] T024 [P] [US2] Add `src/test/signPath.test.ts`:
  - every path slug exists in the library
  - no set has more than 3 slugs
  - `getDefaultFocusSet` for a 7-month-old with no progress returns the first set
  - it skips fully `signing` sets
  - it returns an empty array when the whole library is signed

  *(frontend)*
- [x] T025 [US2] Add `useSetSignFocus()` to `src/hooks/useSignProgress.tsx` (contracts/client-data-hooks.md):
  - **focus** upserts `{ child_id, parent_id: childOwnerId, sign_slug, status: existing ?? 'introduced', focus_since: trackingDayKey(new Date(), resolveTrackingSchedule(child)) }` on `child_id,sign_slug`
  - **unfocus** runs `UPDATE focus_since = null … .select()` and treats 0 rows as an error (Principle VI)
  - error `focus_limit_reached` maps to the toast "You have 3 focus signs — swap one out first."
  - invalidates `["child-signs"]`

  Owner-keyed, the same as `useSetSignStatus` *(frontend)*
- [x] T026 [US2] Create `src/components/signs/ThisWeekFocus.tsx`:
  - header "This week"
  - one row per focus sign (emoji or thumbnail, label, status chip), per the Liven row pattern in research R9; tapping a row opens `SignDetailSheet`
  - when there are no focus signs, a single "Start with these signs" button that focuses the `getDefaultFocusSet` result
  - when `readyForNewSigns`, a gentle "Ready for new signs?" card that focuses the next path set without changing old statuses (FR-012)
  - a celebratory "You've worked through the whole library" state when the path is exhausted

  *(frontend)*
- [x] T027 [US2] Add "Make this a focus sign" and "Remove from focus" to `src/components/signs/SignDetailSheet.tsx`. When 3 focus signs already exist, show a swap picker listing the current 3 (spec edge case "All focus slots full"). When clearing the status of a focus sign, first show an `AlertDialog` confirmation ("This also removes it from this week's signs") (data-model state transitions) *(frontend)*
- [x] T028 [US2] Restructure `src/pages/dashboard/SignsPage.tsx` inside `PremiumGate`: `ThisWeekFocus` first, then the "All signs" library (stage-grouped rows from US1) *(frontend)*
- [x] T029 [US2] Read-only viewer handling: disable the focus controls, with the helper text "Only parents and caregivers who can edit can change this week's signs." Use the existing role hook (`useCurrentRole`) (FR-018) *(frontend)*
- [x] T030 [US2] Invoke **`qa`** on the PR-B frontend: owner-keyed writes, 0-row checks, query keys, the no-auto-advance rule, and viewer gating matching RLS *(qa)*
- [ ] T031 [US2] Run the local gate and the quickstart §3 steps, then open and merge PR-B. The migration must already be confirmed live (T020) *(parent)*

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Tick off practice with a light touch (P2) · **PR-C**

**Goal**: A "Modeled today" toggle on each focus sign, shared per child and day, with a positive weekly line only.

**Independent Test**: quickstart §4. A tick survives a reload. Simultaneous ticks from two caregivers produce one row. Un-tick removes the row. A viewer can't tick. The copy audit is clean. Clearing a status keeps practice rows.

### Backend (first, then QA)

- [x] T032 [US3] Create `supabase/migrations/<timestamp>_child_sign_practice.sql` per data-model:
  - `id uuid PK default gen_random_uuid()`
  - `child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE`
  - `parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (child **owner**)
  - `sign_slug text NOT NULL`
  - `practiced_on date NOT NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `CONSTRAINT child_sign_practice_once UNIQUE (child_id, sign_slug, practiced_on)`
  - index `(child_id, practiced_on)`
  - RLS enabled, with SELECT through `auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)` INSERT WITH CHECK through `partner_can_write(parent_id) AND EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_sign_practice.child_id AND c.parent_id = child_sign_practice.parent_id)` (same owner binding as `child_signs` after T022a), and DELETE through `partner_can_write(parent_id)`; **no UPDATE policy**
  - `COMMENT ON TABLE` that includes "bounded slug — Do NOT widen to free text"

  *(backend)*
- [x] T033 [US3] Apply the migration to live with the MCP `apply_migration`. Confirm with `list_migrations`, and check the unique-constraint dedup and cascade on child delete with `execute_sql` in a transaction that is rolled back *(backend)*
- [x] T034 [US3] Regenerate `src/integrations/supabase/types.ts` with `generate_typescript_types` *(backend)*
- [x] T035 [US3] Invoke **`qa`** on the migration: RLS parity with `child_signs` (including the owner-binding check, tested with a role-switched stranger insert), no UPDATE path, cascade on both FKs, and no free-text column *(qa)*

### Frontend

- [x] T036 [P] [US3] Create `src/hooks/useSignPractice.tsx` (contracts/client-data-hooks.md):
  - **`useSignPractice(childId)`** uses query key `["child-sign-practice", childId]`. It selects rows with `practiced_on >= today − 27` tracking days.
  - **`useToggleSignPractice()`**:
    - Tick: insert `{ child_id, parent_id: childOwnerId, sign_slug, practiced_on: todayKey }`. A duplicate-key error counts as success.
    - Un-tick: `delete … .select()`. 0 rows is an error.
    - The toggle is optimistic, with rollback and an `onError` toast that explains what to do next (FR-017).

  *(frontend)*
- [x] T037 [US3] Add a 48px "Modeled today" check toggle to each row in `src/components/signs/ThisWeekFocus.tsx` (`aria-pressed`, label "Modeled {SIGN} today") *(frontend)*
- [x] T038 [US3] Add the weekly line to the `ThisWeekFocus` header: "You modeled signs on {n} day(s) this week", using `weeklyPracticeDays` with `planWeekStart`. **Render nothing when n = 0.** Never show a streak, gaps, day dots, or "missed" wording (FR-015, FR-016; research R9 anti-patterns) *(frontend)*
- [x] T039 [US3] Disable the tick for viewers, reusing the T029 helper text *(frontend)*
- [x] T040 [US3] **Disclosure (Principle II, same PR)**:
  - update the child-data enumeration in `src/components/CoppaDirectNotice.tsx` (line ~67, "sign-language signs you mark as…") to add "and the days you mark a sign as practiced"
  - append a dated entry to `docs/legal-review-log.md` describing the new `child_sign_practice` data category, its retention (cascade with child or account), and that no AI flow reads it yet

  **Route both through the `legal` agent** *(frontend + legal)*
- [x] T041 [US3] Invoke **`qa`** on the PR-C frontend: the optimistic rollback, the tracking-day key, the n = 0 hidden state, and a copy audit (grep for `streak|missed|haven't|in a row` in `src/components/signs/**` and `src/data/signLibrary.ts`) *(qa)*
- [ ] T042 [US3] Run the local gate and the quickstart §4 steps, then open and merge PR-C *(parent)*

**Checkpoint**: US1–US3 work. The coach can now read real practice data.

---

## Phase 6: User Story 4 — Get a personalized weekly sign plan (P3) · **PR-D**

**Goal**: A one-shot, tap-triggered, Flare+-only, once-per-week AI plan limited to library signs, with minimal input. Disclosures ship in the same PR.

**Independent Test**: quickstart §5:
- The seeded profile yields 1–3 library signs, with EAT stuck.
- "Use these signs" updates focus.
- A second generate returns 409.
- Free tier returns 403.
- An extra `childName` field never reaches Anthropic.
- A forced failure leaves the page usable.
- The 20-plan content review finds 0 violations.

### Backend (first, then QA)

- [ ] T043 [US4] Create `supabase/migrations/<timestamp>_sign_plans.sql`, mirroring `20260606000000_speech_practice_plans.sql` without `completed_days`:
  - `id uuid PK`
  - `child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE`, `CONSTRAINT sign_plans_one_per_child UNIQUE (child_id)`
  - `parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `week_start date NOT NULL`
  - `plan jsonb NOT NULL`
  - `created_at`, `updated_at`, with the `update_updated_at` trigger
  - RLS: SELECT through `auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)`; INSERT and UPDATE WITH CHECK through `partner_can_write(parent_id) AND EXISTS (SELECT 1 FROM public.children c WHERE c.id = sign_plans.child_id AND c.parent_id = sign_plans.parent_id)` (owner binding, as in T022a); no DELETE policy (cascades only); all owner-keyed. `week_start` CHECK is a Monday; a BEFORE INSERT/UPDATE guard trigger (`sign_plans_guard_write()`) rejects a week_start more than 1 day ahead, any UPDATE that doesn't move week_start forward, and any change of child_id/parent_id — the edge function's weekly limit reads this row, so the row must not be deletable or backdatable by a client

  *(backend)*
- [ ] T044 [P] [US4] Create `supabase/functions/_shared/signSlugs.ts` exporting `SIGN_SLUGS` as a readonly array of the 20 slugs, in `src/data/signLibrary.ts` order (research R7) *(backend)*
- [ ] T045 [US4] Create `supabase/functions/generate-sign-plan/index.ts` following [contracts/generate-sign-plan.md](./contracts/generate-sign-plan.md) exactly, in this order:
  1. auth → 401
  2. Flare+ check (copy the `subscriptions` lookup from `generate-activity-plan`) → 403 `premium_required`
  3. input validation → 400 `invalid_input`:
     - `weekStart` is a Monday within ±1 day of the UTC Monday
     - slugs are in `SIGN_SLUGS`, with no duplicates
     - `correctedAgeMonths` is an integer 0–60
     - `practiceDays4w` is 0–28
     - at most 20 sign entries
     - **every other body field is ignored**
  4. with a user-JWT client, check the child is visible and `partner_can_write` (else 403 `no_write_access`), and that no `sign_plans` row exists for this `week_start` (else 409 `plan_exists_this_week`)
  5. Anthropic call using `PERSONA_PROMPTS.slp` plus `SIGN_PLAN_INSTRUCTION` (the prompt rules from the contract), same model and headers as `generate-activity-plan`, `max_tokens` 1500
  6. parse, and validate against `SignPlan`:
     - drop unknown slugs, extra fields, and over-length strings
     - 0 valid focus signs → 422 `unusable_plan`
     - non-2xx from Anthropic → 502 `coach_unavailable`
  7. upsert `sign_plans` on `child_id` with the owner `parent_id`
  8. return 200 with the `SignPlan`

  Never log the request body. Add a file header comment in the style of `generate-activity-plan` *(backend)*
- [ ] T046 [US4] Apply the migration to live and deploy `generate-sign-plan` with the MCP `deploy_edge_function`. Confirm with `list_migrations` and `list_edge_functions` (ACTIVE). Smoke-test 401, 403, and 400 with `curl` *(backend)*
- [ ] T047 [US4] Regenerate `src/integrations/supabase/types.ts` with `generate_typescript_types` *(backend)*
- [ ] T048 [P] [US4] Add `src/test/signSlugs.sync.test.ts`, asserting that `supabase/functions/_shared/signSlugs.ts` `SIGN_SLUGS` equals `SIGN_LIBRARY.map(s => s.slug)` (research R7; Principle V lock) *(frontend)*
- [ ] T049 [US4] Invoke **`qa`** on the function and migration:
  - data minimization (no name, DOB, or free text read)
  - server-side premium and weekly-limit checks
  - RLS on writes through the caller's JWT
  - output sanitization
  - no body logging

  *(qa)*

### Frontend

- [ ] T050 [US4] Create `src/hooks/useSignPlan.tsx`:
  - **`useSignPlan(childId)`** uses query key `["sign-plan", childId]`. It returns the row only if `week_start === planWeekStart()`.
  - **`useGenerateSignPlan()`** calls `supabase.functions.invoke("generate-sign-plan", { body: { childId, weekStart, correctedAgeMonths, signs } })`. It builds `signs` from `useSignProgress`, `practiceDays4w`, and focus state, and **never sends the name or DOB**.
  - Errors map per the contract table:
    - 403 `premium_required` → `PremiumRequiredError`
    - 403 `no_write_access` → a message
    - 409 → silently refetch
    - 422, 502, or network → "We couldn't build this week's plan. Your signs are all still here — try again in a bit."

  *(frontend)*
- [ ] T051 [US4] Create `src/components/signs/SignPlanCard.tsx`:
  - a "Build this week's sign plan" button, hidden once this week's plan exists or for viewers
  - a loading state while generating
  - the rendered plan: intro, focus signs (each with its why and 1–2 moments), and stuck tips
  - a "Use these signs" button that calls `useSetSignFocus` to replace the current focus set (FR-023)
  - no text input anywhere (FR-024)

  *(frontend)*
- [ ] T052 [US4] Place `SignPlanCard` in `src/pages/dashboard/SignsPage.tsx` between `ThisWeekFocus` and "All signs", inside `PremiumGate` *(frontend)*
- [ ] T053 [US4] **Disclosures (Principle II, same PR)**, routed through the `legal` agent:
  - Add a Baby Signs plan clause to the AI paragraph in `src/pages/PrivacyPage.tsx` § 4 (line ~53): "for Baby Signs plans, we send your child's age in months, which curated signs you're working on and their progress, and how many days each was practiced — not your child's name".
  - Add the same clause to the Anthropic `dataCategories` in `src/pages/SubprocessorsPage.tsx` (line ~30).
  - Add "Baby Signs plans" to the AI answer in `src/pages/FAQPage.tsx` (line ~25).
  - Bump "Last reviewed" on the pages you touch.
  - Append a `docs/legal-review-log.md` entry.
  - Update the CLAUDE.md "Six edge functions invoke it" line to seven and add `generate-sign-plan`.

  *(frontend + legal)*
- [ ] T054 [US4] Invoke **`qa`** on the PR-D frontend: no name in the payload, error mapping, the plan hidden for a stale week, no free-text input, and the disclosures matching the actual payload field-for-field *(qa)*
- [ ] T055 [US4] **SC-007 content review**: seed 20 varied progress profiles in dev, generate one plan each, and record in the PR body a table showing 0 diagnostic, delay, or guilt phrases and 0 slugs outside the library. Any failure goes back to T045's prompt *(parent)*
- [ ] T056 [US4] Run the local gate and the quickstart §5 and §7 steps, then open and merge PR-D *(parent)*

**Checkpoint**: All four stories are live.

---

## Phase 7: Polish and cross-cutting

- [ ] T057 Run the quickstart §6 data-lifecycle checks (child delete, `delete_user_account()`, Flare+ lapse and restore) against dev, and record the results in the PR-D description or a follow-up PR *(backend + qa)*
- [ ] T058 [P] Swap in the designer's final SVGs in `src/assets/signs/` (asset-only PR). Re-run `src/test/signMedia.test.ts`, check light and dark mode on an iOS build, and get SLP sign-off on accuracy per the asset spec §6 *(frontend + slp)*
- [ ] T059 [P] Write a review section in `tasks/todo-baby-signs.md` linking this spec and PRs A–D, and append any corrections to `tasks/lessons-frontend.md` / `tasks/lessons-backend.md` (CLAUDE.md lessons protocol) *(parent)*
- [ ] T060 Log the follow-ups from the research (not in scope): extract `_shared/oneShotJson.ts` from the three plan functions (R6), consider a generic `ai_plans` table (R5), and decide on video hosting (R8). Record them in `tasks/todo-baby-signs.md` *(parent)*

---

## Dependencies and execution order

### Phase dependencies

- **Setup (P1)** → **Foundational (P2)** → stories. All ship in PR-A together with US1.
- **US1 (PR-A)**: needs Foundational only.
- **US2 (PR-B)**: needs Foundational and reuses `SignDetailSheet` from US1 (T015). Its backend (T019–T022) can start in parallel with US1's frontend.
- **US3 (PR-C)**: needs `ThisWeekFocus` from US2 (T026). Its backend (T032–T035) can start any time after Setup.
- **US4 (PR-D)**: needs focus (US2) and practice data (US3) to build the coach input, and `useSetSignFocus` for "Use these signs". Its backend (T043–T049) can be built after Setup but should merge last.
- **Polish**: T058 depends only on the designer. The rest follow PR-D.

### Within each story

Backend migration → **applied to live and confirmed** → types regenerated → QA → frontend → QA → local gate → PR → merge. Disclosure tasks sit inside the same PR as the data change (Principle II).

### Parallel opportunities

- T002/T003 are parallel with T001. T007, T008, and T009 are parallel with each other after T005.
- US1: T010 and T011 are parallel. T012 → T013 → T015 are sequential.
- **Across stories**: US2's backend (T019–T022), US3's backend (T032–T035), and US4's T044/T045 can be written by the `backend` agent while the `frontend` agent builds US1.
- US2: T023/T024 are parallel with T025.
- US4: T044 and T048 are parallel. T050 depends on T047 (types).

## Parallel example: PR-A window

```text
frontend agent:  T005 → T006 (slp review) → T011, T012 → T013 → T014 → T015 → T016
frontend agent:  T007 + T008 + T009 + T010   (pure logic and tests, [P])
backend agent:   T019 → T020 → T021          (US2 schema, lands before PR-B)
backend agent:   T032 → T033 → T034          (US3 schema, can land early; unused until PR-C)
```

## Implementation strategy

### MVP first (User Story 1)

1. Phases 1–3 make PR-A: illustrations with placeholders, teaching steps, and the detail sheet.
2. **Stop and validate** with quickstart §2. It's shippable behind the existing Flare+ gate.
3. Hand the designer the brief (`contracts/illustration-asset-spec.md`) at the start of this phase, not the end.

### Incremental delivery

PR-A (US1) → PR-B (US2, the full guided program) → PR-C (US3, ticks) → PR-D (US4, coach). Each PR is independently valuable and passes its quickstart section before the next one starts. The designer's asset PR (T058) can land at any point after PR-A.

### Agent routing summary

| Surface | Agent | QA gate |
|---|---|---|
| `supabase/migrations/**`, `supabase/functions/**`, live apply/deploy, types regen | `backend` | T022, T035, T049 |
| `src/**` UI, hooks, data, tests | `frontend` | T017, T030, T041, T054 |
| Sign teaching copy, illustration accuracy | `slp` | T006, T058 |
| CoppaDirectNotice, Privacy, Subprocessors, FAQ, legal log | `legal` | T040, T053 |
