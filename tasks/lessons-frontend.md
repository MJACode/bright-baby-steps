# Frontend agent — lessons library

Append a one-line entry every time the agent gets corrected. Format:

```
- YYYY-MM-DD — <what bit us> — <how to avoid it next time>
```

Read this file at the start of every task. Apply what's here.

---

## Open lessons

- 2026-05-15 — Never put a state setter's source-of-truth (`dialogOpen`) in a `useEffect` dep array that also calls the setter unconditionally — infinite loop.
- 2026-05-16 — `activeChild` from `useChildren()` gets a new object reference on every react-query refetch. Effects that depend on `[activeChild]` and call `resetForm()` will wipe in-progress user edits when the refetch fires. Gate one-shot init effects with a `useRef(false)` sentinel.
- 2026-05-16 — react-query v5 removed the `onSuccess`/`onError`/`onSettled` callbacks from `useQuery` (still on `useMutation`). Any code passing them is silently ignored — sync derived state via a `useEffect` keyed on the query data's id instead.
- 2026-05-16 — Every Supabase write mutation needs an `onError` toast. Missing `onError` = silent failure = "I clicked save and nothing happened" bug.
- 2026-05-16 — Form button labels and DB CHECK constraint values must match exactly. `AddChildDialog` shipped with buttons mapped to `["boy", "girl", "other"]` while the `children.gender` CHECK accepts `('male'|'female'|'other'|'prefer_not_to_say')`. Two of three options always failed. **Before adding any field that writes to a constrained column, query the constraint and align values — use a `{ value, label }` map so display copy and stored value are decoupled.**
- 2026-05-16 — Validation that rejects a save can read to users as "save is broken." `DiapersPage` blocks the edit save when changing a wet log → dirty if color/consistency aren't filled in (correct logic, hostile UX). When the underlying data is missing required follow-ups, either pre-fill sensible defaults at the moment the user changes type, or surface the requirement inline next to the changed field — not via a generic destructive toast.
- 2026-05-16 — A pulse / `animate-ping` pseudo-element scales to 2x its parent. Without `pointer-events-none`, the expanded pseudo blocks clicks on siblings rendered below it in a flex column. Any `::before/::after` with `animate-ping` MUST include `before:pointer-events-none`.
- 2026-05-16 — **Meta-lesson (parent-Claude).** Speculative root-causing from code-reading alone produces fixes that look right but don't address the actual bug. For any "X is broken" report: (a) ask the user for the literal error toast / console error text before diagnosing, (b) query the database schema for any column the failing path touches, (c) reproduce the click path through the actual component file to confirm the failing branch — don't trust a sub-agent's diagnosis without checking against the real evidence.
- 2026-05-20 — Module-level event buses (`onChatOpen`/`openChat`) only fire if their subscriber is mounted. When a FAB widget is mounted inside a page-level `<Outlet />` component instead of the layout, every sub-route renders without the subscription and `openChat()` calls silently no-op. Mount global-bus subscribers in `DashboardLayout` (or a layout-level provider), never in a single `Dashboard.tsx`-style page.
- 2026-05-24 — When picking up a partially-written component from a prior session, always read the actual file first and reconcile the service signature with the call site before editing the service. A new PDF builder with `(visit, child, reminders)` shape can't be called by a component that already passes `{ visitId, childId, parentId }` — pick one shape and refactor both ends together in one pass.
- 2026-05-24 — React Query keys match positionally. Put the entity id (childId) at a stable index across every queryKey that touches the same table, and put discriminators (`"next"`, `"recent"`, etc.) at the end. Otherwise a sibling mutation invalidating `["scheduled-visits", childId]` won't prefix-match `["scheduled-visits", "next", childId]` and the consumer stays stale.
- 2026-05-24 — A `useQuery` consumer that renders an empty-state when `data` is undefined will flash "nothing here" during the loading window. Always destructure `isLoading` and branch `isLoading ? <skeleton/loading> : empty ? <empty> : <list>` — three states, not two.
