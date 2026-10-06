# Edge functions

Every folder here is a deployed Supabase Edge Function. Folders starting with
`_` (for example `_shared`) are shared code, not functions.

## How deploys work

`.github/workflows/deploy-functions.yml` runs on every push to `main` that
touches this folder or `supabase/migrations/`. First its `migrate` job applies
any migration files **added** by the push (oldest first, each in one
transaction with its `schema_migrations` row; already-recorded versions are
skipped). A failed migration stops the run before any function deploys. Then
it deploys **all** functions here with
`supabase functions deploy --prune`, so production always matches `main`:

- **New function:** add its folder **and** a `[functions.<name>]` entry with
  `verify_jwt` in `supabase/config.toml`. Without an entry it defaults to
  `verify_jwt = true`.
- **Retire a function:** delete its folder and update Privacy § 4,
  `/subprocessors` and `docs/legal-review-log.md` in the same PR. On merge,
  `--prune` deletes it from production. A retired function that is still
  deployed is a live, undisclosed data flow (constitution Principle II).
- **Never deploy by hand** from a branch or the dashboard. A manual deploy is
  overwritten by the next merge, and code that only exists in production is
  lost.
- **Migrations:** write them so they could run twice safely (`IF NOT EXISTS`,
  `DROP ... IF EXISTS`), and keep them transaction-safe (no
  `CREATE INDEX CONCURRENTLY`). Merging the PR applies them to production.
