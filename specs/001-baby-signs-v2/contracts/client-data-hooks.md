# Contract: client data hooks and writes

All server state goes through React Query hooks in `src/hooks/` (CLAUDE.md). Every mutation has an `onError` toast, and every UPDATE or DELETE uses `.select()` and treats 0 rows as a failure (Principle VI).

| Hook | Query key root | Reads / writes | Notes |
|---|---|---|---|
| `useSignProgress(childId)` *(existing)* | `["child-signs", childId]` | SELECT `child_signs` | Now also returns `focus_since` |
| `useSetSignStatus()` *(existing)* | invalidates `["child-signs"]` | upsert / delete `child_signs` | Unchanged. The UI adds a confirm step when clearing a focus sign |
| `useSetSignFocus()` *(new)* | invalidates `["child-signs"]` | Focus: upsert `{status: existing ?? 'introduced', focus_since: today}`. Unfocus: UPDATE `focus_since = null` `.select()` | Owner-keyed `parent_id`. Maps error `focus_limit_reached` to swap copy |
| `useSignPractice(childId)` *(new)* | `["child-sign-practice", childId]` | SELECT `child_sign_practice` where `practiced_on >= today − 27` | Feeds the weekly total and the coach's 4-week counts |
| `useToggleSignPractice()` *(new)* | invalidates `["child-sign-practice"]` | Tick: insert `ON CONFLICT DO NOTHING`. Un-tick: DELETE `.select()` | Optimistic toggle with rollback on error |
| `useSignPlan(childId)` *(new)* | `["sign-plan", childId]` | SELECT `sign_plans` | Treat as current only if `week_start == planWeekStart(today)` |
| `useGenerateSignPlan()` *(new)* | invalidates `["sign-plan"]` | invoke `generate-sign-plan` | See [generate-sign-plan.md](./generate-sign-plan.md) for error mapping |

Shared helpers (one source of truth, Principle V):
- `planWeekStart(date)` in `src/lib/planWeek.ts`, also adopted by `useActivityPlan` and `useSpeechClass`.
- Today's key is `trackingDayKey(new Date(), resolveTrackingSchedule(child))`.
- Derived values live in `src/lib/signProgress.ts` (see [data-model.md](../data-model.md#derived-values-client-pure-functions-in-srclibsignprogressts)).
