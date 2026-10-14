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

## Secrets

Set in Supabase dashboard → Edge Functions → Secrets (never in the repo).
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
provided by the platform.

| Secret | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | briefing, weekly-insights, chat, extract-memory, generate-activity-plan, generate-sign-plan, generate-speech-class, visit-prep-questions | |
| `RESEND_API_KEY` | send-vpc-email, send-visit-reminder-email, inactive-account-purge | |
| `VPC_FROM_EMAIL` | send-vpc-email, send-visit-reminder-email, inactive-account-purge | Resend-verified sender |
| `APP_URL` | the three email senders, mcp | deployed frontend origin |
| `JWT_SECRET` | mcp (via `_shared/mintUserJwt.ts`) | |
| `APNS_KEY` | check-notifications (`_shared/apns.ts`) | Full contents of the APNs `AuthKey_XXXXXXXXXX.p8` (PKCS#8 PEM). Real newlines or `\n` escapes both work. |
| `APNS_KEY_ID` | check-notifications | 10-char Key ID of that key (Apple Developer → Keys) |
| `APNS_TEAM_ID` | check-notifications | 10-char Apple Developer Team ID |
| `APNS_TOPIC` | check-notifications | Optional. Defaults to `com.graceflare.app` |

If any of `APNS_KEY` / `APNS_KEY_ID` / `APNS_TEAM_ID` is missing,
check-notifications logs `push: APNS_* secrets not set, in-app only` and
keeps inserting in-app notifications; nothing else changes. One `.p8` key
works for both the production and sandbox APNs hosts; each device row in
`public.push_devices` records which one its token belongs to.

Who gets a push: only rows that were actually inserted (after mutes, quiet
hours and the daily cap), and of those not viewer-partner copies
(`PUSH_ROLES` in `_shared/pushNotify.ts`) and not an `appointment_reminder`
that survived quiet hours; those stay in-app only. The payload is the fixed
alert plus `route`, nothing else. Rows in `push_devices` unseen for 90 days
are deleted daily by the pg_cron job `push-devices-stale-purge-daily`.
