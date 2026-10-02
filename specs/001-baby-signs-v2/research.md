# Research: Baby Signs v2

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-30

Each entry records the decision, the reasoning, and the alternatives we rejected.

---

## R1. Is the v1 `child_signs` table live? *(Principle VIII)*

**Checked against the live project `ieuznbvvwdvhtirzwkly` on 2026-09-30:**

- Migration `20260828154351 child_signs` is present in `supabase_migrations.schema_migrations`.
- Its columns match `supabase/migrations/20260828000000_child_signs.sql` exactly.
- All four RLS policies exist (`child_signs_select/insert/update/delete`).
- **Row count: 0.** Production is pre-launch: 4 profiles, 2 children, 2 Flare+ subscriptions, and 0 rows in `activity_plans` and `speech_practice_plans`.

**Decision**: Build on `child_signs` as-is. The table is empty, so an additive column carries no backfill risk.

**Consequence for the spec**: SC-004 and SC-005 (return and tick rates) cannot be measured before launch. There is no v1 baseline to capture. See "Open items for the founder" in plan.md.

---

## R2. Where do focus signs live?

**Decision**: Add a nullable `focus_since date` column to `child_signs`. A sign is a focus sign when `focus_since IS NOT NULL`. Making a sign a focus sign creates its row with `status = 'introduced'` if none exists; picking a sign to focus on means you're starting to use it. A BEFORE INSERT/UPDATE trigger enforces at most 3 focus signs per child.

**Rationale**: This follows CLAUDE.md's reuse-first rule and the "new column rather than new table" guidance. `child_signs` already holds exactly one row per (child, sign), shared across caregivers, with owner-keyed RLS that is already proven. Focus is a property of that relationship.

**Alternatives rejected**:
- *New `child_sign_focus` table*: duplicates the (child, sign) key, needs its own RLS, and brings back the owner-keying pitfall for no benefit.
- *Focus stored in `localStorage` or `usePreferences`*: breaks FR-010, which requires focus signs shared across caregivers.

**Known interaction**: v1's "tap the active status again to clear" deletes the row, which would silently drop focus. v2 resolves this in the UI. Clearing the status of a focus sign asks first, then removes it from focus. Practice history survives either way because it lives in its own table (R3).

---

## R3. Where do practice ticks live?

**Decision**: A new table `child_sign_practice` with one row per (child, sign, `practiced_on` date) and `UNIQUE (child_id, sign_slug, practiced_on)`. Ticking inserts a row and un-ticking deletes it. The table is owner-keyed on `parent_id` with the same RLS as `child_signs`, including the owner-binding `EXISTS` check added in `20260930010000_child_signs_rls_bind_child.sql` (see data-model.md), and cascades on child and user deletion.

**Rationale**:
- Toggles from two caregivers at the same time are safe with no read-modify-write. The unique constraint makes a duplicate tick a no-op (`ON CONFLICT DO NOTHING`), which satisfies the spec edge case "two caregivers → one tick".
- History survives clearing a sign's status and removing it from focus (FR-029).
- Weekly totals are a simple range query.

**Alternatives rejected**:
- *`practice_dates date[]` on `child_signs`*: avoids a new table, but needs an RPC for atomic array edits, loses history when v1's clear-deletes-row runs, and grows without bound on one row.
- *Reuse `completed_days smallint[]` on a plan row (the activity-plan pattern)*: that records per-day completion of a plan, not per sign, and resets every week. It would lose the 4-week per-sign history the coach needs.

---

## R4. What is "today" and "this week"? *(Principle V)*

**Decision**:
- **Today** for a tick is `trackingDayKey(new Date(), schedule)` from `src/lib/trackingDay.ts`, using the child's `day_start_time`. This is the same engine GroupedLogList and useSleepPatterns use for "today".
- **This week** is the Monday-start week of the tracking day. Weekly plans already compute `format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")` inline in `useActivityPlan` and `useSpeechClass`. v2 would add a third copy, so we extract `planWeekStart(date)` into `src/lib/` and point all three callers at it. This is a zero-behavior-change refactor that satisfies Principle V.

**Rationale**: Principle V was written after clock and boundary bugs became the largest lesson category. A sign-specific "today" would be a second engine for the same fact.

**Spec change**: the "Timezone and today" edge case in spec.md was updated to say tracking day instead of calendar day.

---

## R5. Weekly sign plan storage and the one-per-week rule

**Decision**: A new table `sign_plans` that mirrors `speech_practice_plans` and `activity_plans` (`UNIQUE (child_id)`, `week_start date`, `plan jsonb`, owner-keyed RLS with the same owner-binding `EXISTS` check as `child_signs`) without `completed_days`, since ticks cover completion. The edge function enforces one plan per child per week before it calls Anthropic, then persists the row itself using the caller's JWT so RLS applies.

**Rationale**:
- It matches the established pattern and fits cleanly into React Query and RLS.
- In the existing plan functions the client upserts and the server enforces no limit. The spec requires a real one-per-week limit (FR-020), and a server check is the only thing that stops repeated paid calls.
- Persisting on the server keeps the check and the write in one place.

**Week boundary on the server**: the client sends `weekStart` (from `planWeekStart`). The server accepts it only if it is a Monday within ±1 day of the Monday computed in UTC, which covers every U.S. timezone. It refuses with `409 plan_exists_this_week` if a `sign_plans` row with that `week_start` already exists.

**Alternatives rejected**:
- *Add a `kind` column to `activity_plans`*: changes a live UNIQUE constraint and couples two features' lifecycles.
- *A generic `ai_plans` table covering all three plan types*: the right long-term shape, but a cross-feature migration outside this spec. Logged as a follow-up.

---

## R6. New edge function or a mode on an existing one?

**Decision**: A new edge function, `supabase/functions/generate-sign-plan/`, using the `slp` persona from `_shared/personas.ts`.

**Rationale**:
- Every existing weekly plan has its own function (`generate-speech-class`, `generate-activity-plan`), each with its own input validation and output schema. The sign plan has a different input (per-sign status and practice counts), a different output schema, and a different persona.
- A mode flag inside `generate-activity-plan` would put two unrelated prompts and validators behind conditionals, which is the "significant conditionals" case where CLAUDE.md says a new file is right.
- The new function also enforces one plan per week, which the others don't.

**Cost of the choice**: CLAUDE.md's Legal Review list ("six edge functions invoke it") becomes seven. Privacy § 4, `/subprocessors`, and the FAQ describe AI by feature, so each gets a new "Baby Signs plan" clause. Anthropic is not a new processor. The data categories are new (Principle II).

**Follow-up (not in scope)**: all three plan functions duplicate the premium gate, the Anthropic call, and JSON cleaning. A `_shared/oneShotJson.ts` extraction is worth doing once a fourth caller appears or as its own refactor.

---

## R7. Coach input: data minimization

**Decision**: The client sends only the following:
- `correctedAgeMonths` (integer)
- `signs`: an array of `{ slug, status | null, isFocus, focusDays, practiceDays4w }`, limited to library slugs
- `weekStart`

The server ignores any other field. It MUST NOT receive the child's name, date of birth, gender, interests, journal words, or any free text (FR-021). The server also rejects any slug not in its copy of the library slug list.

**Rationale**: This is less data than any existing AI feature, because the others send the first name. It keeps the new Privacy § 4 clause short and easy to defend: "age in months, which curated signs you're working on and their progress, and how many days each was practiced."

**Output validation**: the server parses JSON and drops any recommended slug not in the library. If fewer than 1 valid focus sign remains, it returns `422`. The client validates the shape again before rendering (FR-025).

**Server copy of the slug list**: `supabase/functions/_shared/signSlugs.ts` holds a flat list of the 20 slugs. Principle V risk: it duplicates `src/data/signLibrary.ts`. Mitigation: a vitest test in `src/test/` imports both and asserts they match.

---

## R8. Illustration hosting, and video later

**Decision**: Bundle illustrations with the app. Files go in `src/assets/signs/`, are imported through a static map in `src/data/signMedia.ts`, and are code-split with the Signs page. SVGs are imported with Vite's built-in `?raw` and rendered inline. The files are bundled and trusted, and a test checks that none contains `<script` or `on*=` attributes. Inline rendering lets the designer's `sign-line`, `sign-ghost`, `sign-motion`, and `sign-fill` classes pick up theme tokens in CSS, so illustrations follow light and dark mode with no hex values in product code and no new dependency such as svgr. Video is not in scope for v2. The content model has an optional `video` field (a URL string) that can later point either at a bundled asset or at a public Storage URL, with no schema or layout change.

**Rationale**:
- Bundled assets work offline in the Capacitor shell, need no Storage bucket or policy, add no subprocessor, and cost nothing to serve.
- 20 optimized SVGs (target ≤ 40 KB each) add under 1 MB to a lazily loaded route.
- Video (about 20 × 300–600 KB) is the point where Storage or a CDN should be considered. That decision is deferred to the video phase.

**Alternatives rejected**:
- *Supabase Storage now*: adds a bucket, policies, network dependence, and loading states for 20 static images.
- *Third-party CDN*: a new subprocessor (Principle II) for no gain.

---

## R9. UI pattern references *(CLAUDE.md Mobbin rule)*

The codebase has no step-illustration or "focus this week" pattern. Mobbin references (iOS):

| Pattern | Reference | What we take | What we don't |
|---|---|---|---|
| Sign detail: one image on top, numbered steps below | [Bevel — exercise guide](https://mobbin.com/screens/d1ca39dc-4d94-438f-b944-2d9973b21580), [Hevy — how to](https://mobbin.com/screens/c1d69923-1d1c-4344-b33c-cad4270ee276) | A single 4:3 illustration at the top of a sheet, with the Model / Prompt / Celebrate steps numbered below | Tabs (About/Guide); our sheet is one scroll |
| Line-art motion with arrows | [How We Feel — breathing step](https://mobbin.com/screens/026e6052-47e6-40b9-9066-c0857b9e0ba6) | Simple line art with curved motion arrows. This is the style reference for the designer | The full-bleed dark card; we use `bg-milestones-bg` |
| Instruction list with icons | [Withings — how to use](https://mobbin.com/screens/63f2e1ea-7a56-4834-8ed8-336c2b32c35b) | Icon plus short sentence rows for "when to use" moments | — |
| Focus rows with a check on the right | [Liven — to-do](https://mobbin.com/screens/f399e97e-14c4-488e-9df8-9ea7f5a59147) | Emoji or thumbnail, label, and a 48px check circle on the right of each focus-sign row. "0 of 3" becomes a positive weekly line | The date strip |
| **Anti-patterns (Principle I)** | [Finch — week dots and "earn a star"](https://mobbin.com/screens/2ae59897-7aee-4055-a1c5-53f2e3d69295), [Todoist — weekly streak](https://mobbin.com/screens/e9a360e1-5dc6-4efd-a0dd-d9de9ee94a9f), [Numo — heatmap](https://mobbin.com/screens/9ccb7deb-86a2-4246-a947-1c14810da55e) | Nothing. Week-dot rows show missed days as gaps, and streak and heatmap views are exactly what Principle I bans | Everything |

Brand translation: colors are `milestones` tokens, headings are Quicksand, body text is Nunito, radius comes from `--radius`, and touch targets are at least 48px. No values are carried over from the references.

---

## R10. Free tier

**Decision (default, founder may override)**: Free users keep v1's teaser, which shows the program copy and hides the library and guided view behind `PremiumGate` feature `baby-signs`. No illustration preview in v2.

**Rationale**: The spec leaves the preview as a pricing call. Showing none is the zero-work default and keeps the gate identical to v1. A preview is a one-line change later (render 3 illustrations above the gate).
