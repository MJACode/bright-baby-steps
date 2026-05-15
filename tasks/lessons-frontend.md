# Frontend agent — lessons library

Append a one-line entry every time the agent gets corrected. Format:

```
- YYYY-MM-DD — <what bit us> — <how to avoid it next time>
```

Read this file at the start of every task. Apply what's here.

---

## Open lessons

- 2026-05-15 — Never put a state setter's source-of-truth (`dialogOpen`) in a `useEffect` dep array that also calls the setter unconditionally — infinite loop.
