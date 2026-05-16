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
