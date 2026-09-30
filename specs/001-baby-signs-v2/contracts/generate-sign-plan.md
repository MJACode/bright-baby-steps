# Contract: `generate-sign-plan` edge function

One-shot, non-streaming. Called with `supabase.functions.invoke`, the same way as `generate-speech-class` and `generate-activity-plan`. CLAUDE.md's SSE rule applies only to streaming calls.

## Request

`POST /functions/v1/generate-sign-plan`, with an `Authorization: Bearer <user JWT>` header.

```ts
type GenerateSignPlanRequest = {
  childId: string;                 // uuid; server resolves the owner via children.parent_id
  weekStart: string;               // "YYYY-MM-DD", a Monday (planWeekStart)
  correctedAgeMonths: number;      // integer 0–60
  signs: Array<{
    slug: string;                  // must be in _shared/signSlugs.ts
    status: "introduced" | "emerging" | "signing" | null;
    isFocus: boolean;
    focusDays: number | null;      // days since focus_since; null if not focus
    practiceDays4w: number;        // 0–28
  }>;                              // at most 20 entries, one per library slug
};
```

The server **ignores** every other field. Name, date of birth, interests, and free text are never read (FR-021).

## Server steps, in order

1. Authenticate the caller. No user → `401 { error: "unauthorized" }`.
2. Check Flare+ (same `subscriptions` lookup as `generate-activity-plan`). Not Flare+ → `403 { error: "premium_required", upgradeUrl: "/upgrade" }` (FR-026).
3. Validate the input. On failure → `400 { error: "invalid_input" }`. The checks:
   - `weekStart` is a Monday within ±1 day of the server's UTC Monday.
   - Every slug is known, with no duplicates.
   - The numbers are in range.
4. Check access and the weekly limit using a client built with the caller's JWT, so RLS applies:
   - `children` row visible and `partner_can_write`, otherwise → `403 { error: "no_write_access" }`.
   - A `sign_plans` row exists for `childId` with `week_start = weekStart` → `409 { error: "plan_exists_this_week" }` (FR-020).
5. Call Anthropic with the `slp` persona plus `SIGN_PLAN_INSTRUCTION`, asking for JSON only.
6. Parse the output and validate it against `SignPlan`, dropping unknown slugs and extra fields. If there are 0 valid focus signs → `422 { error: "unusable_plan" }` (FR-025). If Anthropic returns non-2xx → `502 { error: "coach_unavailable" }`.
7. Upsert into `sign_plans` (`onConflict: child_id`) with `parent_id` set to the child owner. On error → `500`.
8. `200` with the `SignPlan` body.

The server never logs the request body. On a parse failure it logs a truncated model output only.

## Response: `SignPlan`

```ts
type SignPlan = {
  weekStart: string;
  intro: string;                       // ≤ 240 chars, warm, no diagnosis
  focus: Array<{                       // 1–3 items; slugs from the library only
    slug: string;
    why: string;                       // ≤ 140 chars
    moments: string[];                 // 1–2 items, each ≤ 120 chars
  }>;
  stuck: Array<{                       // 0–3 items; only for signs flagged stalled
    slug: string;
    tryThis: string;                   // ≤ 200 chars
  }>;
};
```

## Prompt rules (`SIGN_PLAN_INSTRUCTION`) — these also apply to static copy (Principle I)

- Recommend only slugs from the provided list. Always say the word out loud while signing.
- Celebrate effort. Never diagnose, never mention delays, red flags, "behind", or "should". Never mention days without practice.
- Don't withhold items to force a sign (SLP guidance from v1).
- Moments must be everyday routines (meals, bath, diaper change, play, reading).
- Prefer keeping emerging signs in focus. Move past signs already at `signing`. Offer a stuck tip only for stalled signs.

## Client error mapping (`useGenerateSignPlan`)

| Server result | What the parent sees |
|---|---|
| 403 `premium_required` | Upgrade sheet (feature `baby-signs`) |
| 403 `no_write_access` | "Only parents and caregivers who can edit can build a plan." |
| 409 `plan_exists_this_week` | Refetch and show the existing plan. No error toast |
| 422 / 502 / network | "We couldn't build this week's plan. Your signs are all still here — try again in a bit." |
