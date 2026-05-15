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
