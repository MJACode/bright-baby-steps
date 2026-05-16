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
- 2026-05-16 — A PR description claiming a DB-level dedupe trigger that isn't actually in the migration file is a high-risk gap because the app-level dedupe (last-N-rows) silently weakens as row counts grow. Always cross-check trigger/index claims against the migration SQL — and against the live schema via information_schema/pg_trigger when MCP is available.
- 2026-05-16 — Fire-and-forget Supabase builder calls inside an edge function (`.then(...)` with no await, no `EdgeRuntime.waitUntil`) can silently drop on the Edge runtime if the parent fn returns before the underlying request completes. For any side-effect that must land (analytics stamps, last_referenced_at, etc.), require either `await` or `EdgeRuntime.waitUntil(...)`.
