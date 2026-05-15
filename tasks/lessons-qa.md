# QA agent — lessons library

Append a one-line entry every time the agent misses something or raises a false-positive. Format:

```
- YYYY-MM-DD — <pattern that bit us> — <how to catch it next time>
```

Read this file at the start of every task. Apply what's here.

---

## Open lessons

- 2026-05-15 — `supabase-js` strips `undefined` keys from UPDATE payloads, so `gender: gender || undefined` makes "clear gender" a silent no-op. On every PATCH path, check whether `null` is the intended clear semantics and grep for `|| undefined` in the payload.
- 2026-05-15 — A `catch {}` block in a save mutation hides RLS failures, network errors, and validation errors. Flag every empty catch in any code that talks to Supabase as blocking.
- 2026-05-15 — `column IS NULL` is not automatically an "active session" marker. Before using it that way, confirm the semantic with `SELECT count(*) FROM <table> WHERE <col> IS NULL` on real prod data.
