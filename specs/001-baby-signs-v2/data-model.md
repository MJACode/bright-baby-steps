# Data Model: Baby Signs v2

**Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Two kinds of data: **static content** that ships with the app (not user data, no RLS) and **per-child records** in Postgres (user data, RLS, COPPA surface).

---

## Static content (client, `src/data/`)

### Sign — extends `Sign` in `src/data/signLibrary.ts`

| Field | Type | New in v2 | Notes |
|---|---|---|---|
| slug | string | | Stable key, stored in DB. Never rename a shipped slug |
| label, emoji, stageId, howTo, whenToUse, tip? | string | | Unchanged from v1 |
| steps | `{ model: string; prompt: string; celebrate: string }` | ✅ | FR-006. SLP-reviewed |
| stuckTip | string | ✅ | FR-007: "If it isn't catching on" |
| media | `SignMedia` (see below) | ✅ | FR-001 to FR-005. Resolved from `src/data/signMedia.ts` so the text library doesn't import binary assets |

### SignMedia — `src/data/signMedia.ts`

| Field | Type | Notes |
|---|---|---|
| illustration | string (imported asset URL) \| null | null means the asset isn't delivered yet, so the emoji and text are shown instead (spec edge case) |
| illustrationAlt | string | Required. Describes how to make the sign. Written by us and SLP-checked, not by the designer |
| video | string (URL) \| undefined | Future. When present it takes the illustration's place: muted, looping, `playsinline`, no autoplay with sound (FR-005) |
| videoPoster | string \| undefined | Future. Defaults to `illustration` |

### SignPath — `src/data/signLibrary.ts` (new export)

An ordered array of sets: `{ id: string; signSlugs: string[] /* 2–3 */; fromMonths: number }[]`. The default path (FR-009) follows the existing stage order. `getDefaultFocusSet(correctedAgeMonths, progress)` returns the first set that has signs not yet at `signing` and is suitable for the child's age. It is a pure function with unit tests.

---

## Per-child records (Postgres)

All tables key RLS on the **child owner** (`children.parent_id`), never on the writer. This is the owner-keyed pattern from `20260606030000_sleep_todo_owner_keyed.sql` and `child_signs` v1. Policies: SELECT uses `auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)`; DELETE uses `partner_can_write(parent_id)`; INSERT and UPDATE WITH CHECK use `partner_can_write(parent_id) AND EXISTS (SELECT 1 FROM public.children c WHERE c.id = <table>.child_id AND c.parent_id = <table>.parent_id)`. The `EXISTS` clause binds `child_id` to its real owner. Without it, any signed-in user could write rows for another family's child by stamping their own uid as `parent_id` (the v1 hole fixed in `20260930010000_child_signs_rls_bind_child.sql`). Every new table in this feature MUST include it.

### `child_signs` (existing) — add one column

| Column | Type | Change | Notes |
|---|---|---|---|
| id, child_id, parent_id, sign_slug, status, first_signed_at, created_at, updated_at | — | unchanged | |
| **focus_since** | `date NULL` | ✅ new | Non-null means a focus sign. Set to the tracking-day date when focused, and set to null when unfocused. Unfocusing never deletes the row |

**Constraint (new trigger)** `child_signs_focus_limit`: BEFORE INSERT OR UPDATE OF focus_since. If `NEW.focus_since IS NOT NULL` and the child already has 3 other rows with `focus_since IS NOT NULL`, raise `P0001` with message `focus_limit_reached`. The client maps it to "You have 3 focus signs — swap one out first."

**State transitions** (status is unchanged from v1 and moves both ways):

```
(no row) ──focus──▶ introduced + focus_since
(no row) ──set status──▶ introduced | emerging | signing
any ──unfocus──▶ same status, focus_since = null
any ──clear status (v1 re-tap)──▶ row deleted  (UI confirms first if focus_since is set)
```

### `child_sign_practice` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| child_id | uuid NOT NULL → children(id) ON DELETE CASCADE | |
| parent_id | uuid NOT NULL → auth.users(id) ON DELETE CASCADE | Child **owner** |
| sign_slug | text NOT NULL | Bounded slug. No FK to `child_signs`, so history survives a cleared status (FR-029) |
| practiced_on | date NOT NULL | Tracking-day key (research R4) |
| created_at | timestamptz NOT NULL default now() | |

- `UNIQUE (child_id, sign_slug, practiced_on)`: at most one tick per child, sign, and day (FR-014). Inserts use `ON CONFLICT DO NOTHING`.
- Index `(child_id, practiced_on)` for weekly and 4-week range reads.
- No UPDATE policy (rows are only inserted or deleted). SELECT, INSERT, and DELETE follow the pattern above.
- No free text of any kind (FR-019). The table comment says "Do NOT widen to free text", as v1 does.

### `sign_plans` (new) — mirrors `speech_practice_plans`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| child_id | uuid NOT NULL → children(id) ON DELETE CASCADE, **UNIQUE** | One current plan per child. Replaced each week |
| parent_id | uuid NOT NULL → auth.users(id) ON DELETE CASCADE | Child owner |
| week_start | date NOT NULL | Monday (research R4/R5) |
| plan | jsonb NOT NULL | `SignPlan` shape, see [contracts/generate-sign-plan.md](./contracts/generate-sign-plan.md) |
| created_at, updated_at | timestamptz | `update_updated_at` trigger, as in activity_plans |

RLS follows the standard pattern. Rows are written only by the edge function, using the caller's JWT, so a read-only viewer's generate attempt fails at the database as well as in the UI. The client code only reads.

### Deletion and retention

- All three tables cascade on `children` and `auth.users`, so `delete_user_account()` and the inactive-account purge need no new lines. This matches v1's reasoning and is verified in quickstart §6.
- A Flare+ lapse deletes nothing (FR-029, Principle IV).

### Derived values (client, pure functions in `src/lib/signProgress.ts`)

| Value | Definition |
|---|---|
| `weeklyPracticeDays` | Count of distinct `practiced_on` in [planWeekStart, planWeekStart + 6] for this child. Shown as "You modeled signs on N days this week". Hidden when N = 0 (FR-015, FR-016) |
| `readyForNewSigns` | All current focus signs are at `emerging` or `signing`, OR the earliest `focus_since` is 14 or more days ago (FR-012) |
| `practiceDays4w[slug]` | Distinct practice days in the last 28 tracking days. Coach input |
| `stalled[slug]` | Focus for 14+ days, status still `introduced`, and practiced on at least 1 day. Coach input and a static stall tip |

There is no streak, consecutive-day, or last-practiced calculation anywhere (FR-016).
