# Backend agent — lessons library

Append a one-line entry every time the agent gets corrected. Format:

```
- YYYY-MM-DD — <what bit us> — <how to avoid it next time>
```

Read this file at the start of every task. Apply what's here.

---

## Open lessons

- 2026-05-07 — `current_setting('app.*')` for cron / edge secrets silently fails on hosted Supabase because ALTER DATABASE isn't granted to the SQL editor role — use `vault.decrypted_secrets` instead. See migration `20260507050000_cron_jobs_use_vault.sql`.
- 2026-05-07 — Adding a new records-table that references `parent_id` requires adding it to the `delete_user_account()` RPC purge order, otherwise final profiles delete hits an FK violation. Canonical list in `20260507010000_audit_delete_user_account.sql`.
- 2026-05-15 — `feeding_logs` and `sleep_logs` use partial unique indexes on `(child_id) WHERE duration_minutes IS NULL` / `WHERE ended_at IS NULL` to enforce one-active-session-per-child. Any new "active row" pattern should follow the same convention rather than locking at the application layer.
- 2026-05-15 — Always verify a migration is applied to prod via `list_migrations` + a column SELECT — being in `supabase/migrations/` is not the same as being applied. The `is_expected` column was in `schema_migrations` but missing on the live table (likely from a failed or partial earlier apply), so every `AddChildDialog` UPDATE silently 400'd. Spot-check column presence with `information_schema.columns` before assuming a migration is live.
- 2026-05-16 — Subagent sessions don't always get the Supabase MCP tools (`mcp__ac9b166b__*`) wired in even when the parent does — `.mcp.json` may be empty and `supabase` CLI absent. Check available tools / `.mcp.json` early; if missing, write all SQL/edge-function files, document the exact MCP calls the parent must run (`apply_migration`, `deploy_edge_function`, `generate_typescript_types`, `get_advisors`), and report rather than guess at applied state.
- 2026-05-16 — Inline-rebuilding an edge function's bundled file payload from memory rather than reading from disk dropped real content (truncated personas.ts prompts) and introduced a reference error (`{ role: "user", content }` instead of `content: context` in weekly-insights). For any deploy that bundles multi-file source, READ each file from disk and pass the verbatim content — or delegate the deploy to a subagent that does the read+json.dumps and calls `deploy_edge_function` itself. Never paraphrase source in a deploy payload.
- 2026-05-16 — Fire-and-forget Supabase builder calls inside an edge function (e.g. a `.then(...)` UPDATE for `last_referenced_at`) can silently drop on the Edge runtime when the parent fn returns before the underlying HTTP request completes. For any side-effect that must land, wrap in `EdgeRuntime.waitUntil(promise)` (with a fallback `await` when `EdgeRuntime` is undefined for local Deno).
- 2026-05-16 — When in-memory dedupe relies on "last N rows", scale eats the heuristic alive — past row N, duplicate rows can be re-inserted forever. Pair every app-level dedupe with a DB-level `BEFORE INSERT` trigger (`SECURITY DEFINER`, immutable `search_path`) that returns `NULL` to silently skip the dup. See `20260516010000_child_memories_dedupe_trigger.sql`.
- 2026-05-17 — SSE preambles (custom named events like `event: routed`) must be written to the TransformStream writer BEFORE the proxy loop starts pumping Anthropic tokens — otherwise the first OpenAI-shaped `data:` frame races ahead of the named event and frontends parsing the first chunk for routing metadata miss it. See `supabase/functions/chat/index.ts` (preamble write inside the async IIFE, immediately after entering the try block).
- 2026-05-17 — When adding a second Anthropic fetch in an existing edge function (e.g. a classifier + the existing answer call), copy the `anthropic-beta: prompt-caching-2024-07-31` header AND give the classifier's tiny system prompt its own `cache_control: ephemeral` block — otherwise the cheap auxiliary call quietly defeats prompt caching on every request and the per-message cost balloons.
