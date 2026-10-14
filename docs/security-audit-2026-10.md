# Security audit — 14 October 2026

Review of Grace Flare (React 18 / TypeScript / Vite, Supabase project `ieuznbvvwdvhtirzwkly`, Vercel, Resend, Capacitor iOS). The app stores children's records, so row access, COPPA consent, and anything that runs with the service-role key were treated as in scope.

This pass is read-only against production except for the code and the migration in this pull request. **The migration is not applied.** Merging it to `main` applies it. It needs the owner's approval first.

## How this was checked

- Live catalog, read-only, on 14 October 2026: RLS on every `public` table, policies, function grants, `SECURITY DEFINER` and `search_path`, table grants, storage buckets and `storage.objects` policies, and the security advisor.
- Source: `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`, `src/`, `vercel.json`, `capacitor.config.ts`, `.env.example`.
- `npm audit` against the lockfile after the dependency bumps in this PR.
- Git history was searched for a service-role key and for `sb_secret_` values committed as secrets. None were found. The anon key in `src/integrations/supabase/client.ts` is the publishable key.

No child names, emails, or row contents were copied into this report.

## Summary

| Severity | Open before this PR | Fixed here | Left open, with a reason |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 6 | 6 | 0 |
| Medium | 6 | 4 | 2 |
| Low | several | 2 | the rest, accepted or dev-only |

Already fixed on `main` before this pass, and confirmed on live: `family_moments` is `security_invoker` with no anon access (PR #275, `20261008020000`); anon has no table privileges except `rights_requests` INSERT (PR #287, `20261009000000`); new functions are not executable by anon or authenticated by default; signup consent is stamped by `handle_new_user` (PR #293).

## Critical

### C1. Unauthenticated callers could run the account-purge and reactivation jobs

**Status: fixed in this PR.**

`inactive-account-purge` and `reactivate-nudge` are deployed with `verify_jwt = false` (`supabase/config.toml`) and previously ignored the request. Both create a service-role client. Anyone who could reach the function URL could start the job.

- `inactive-account-purge` lists users, sends "your account will be deleted" email, and calls `purge_inactive_account` for accounts that are past the warning window. That deletes the account and the child's records.
- `reactivate-nudge` calls `users_with_no_logs_since` and inserts notifications that include the child's first name.

The cron already sends `Authorization: Bearer <app_service_role_key>` from Vault (`20260507050000_cron_jobs_use_vault.sql`). The functions now compare that header to `SUPABASE_SERVICE_ROLE_KEY` before doing any work (`supabase/functions/_shared/serviceRoleAuth.ts`). A missing key fails closed. The compare does not trust a decoded JWT `role` claim.

The same helper gates `check-notifications` and the service-role path of `send-visit-reminder-email`.

## High

### H1. Visit-reminder email trusted an unsigned JWT role

**Status: fixed in this PR.**

`send-visit-reminder-email` has `verify_jwt = false`. It used to base64-decode the bearer token and treat `role: "service_role"` as the cron. The signature was not checked. That path sends mail through Resend as Grace Flare and does not check that the recipient is the caller. A forged payload could send a visit email to any address.

The service-role path is now the same constant-time bearer compare as C1. Any other caller must pass `auth.getUser()` on the anon key, and the recipient has to match that user's email.

### H2. Any signed-in user could run the notification job

**Status: fixed in this PR.**

`check-notifications` has `verify_jwt = true`, which accepts a normal user JWT as well as the service-role key. The function then uses the service-role key to read every child and insert notifications, including visit emails. The HTTP response is only counts (`processed`, `suppressed`), so it is not a direct data leak, but a signed-in caller could create notifications for other families.

The bearer must now equal the service-role key. The cron already sends that key.

### H3. A parent could mark COPPA consent complete on their own profile

**Status: fixed in this PR. Migration `20261014120000_security_audit_fixes.sql` must be approved before merge.**

`profiles` UPDATE is `auth.uid() = id` with no column restriction. `enforce_vpc_on_child_insert` allows a child insert only when `profiles.vpc_completed_at` is set for that user (`20260507000000_vpc_email_plus.sql`). A signed-in user could set `vpc_completed_at`, `vpc_first_confirmation_at`, and `vpc_second_token` through PostgREST and skip both confirmation emails.

The second-confirmation token was also stored in plaintext on the same row the user can read, so opening the email was not required once the token existed.

The migration adds `protect_profile_server_columns`, a BEFORE UPDATE trigger. A normal session cannot change `id`, `email`, `vpc_*`, `inactive_purge_warned_at`, or `data_consent_*`. `postgres` and `service_role` still can, which is how `handle_new_user`, `sync_email_confirmation_to_vpc`, `send-vpc-email`, `complete_vpc_second_confirmation`, and the purge job write those columns. `CoppaDirectNotice` still writes the typed-name attestation columns. That is the in-app signature. The database gate remains `vpc_completed_at`.

`send-vpc-email` now stores `sha256:<hex>` of the token. The email still contains the raw token. The RPC hashes the link token and compares. Existing plaintext tokens are rewritten to the same hash in the migration, so a link that was already sent still works, and a profile read no longer returns a usable token. The rewrite skips values that already start with `sha256:`, so it is safe to run twice.

### H4. A caregiver or co-parent could take ownership of a child

**Status: fixed in this PR. Same migration.**

`children` UPDATE allows `auth.uid() = parent_id OR partner_can_write(parent_id)`. `partner_can_write` is true for an active, in-entitlement caregiver or co-parent (`partner_can_write` on live). The WITH CHECK uses the **new** row. A partner who can update the owner's child could set `parent_id` to their own user id. The original owner then fails `select_own_or_partner_children`, and records that follow `children.parent_id` move with the child. There is no trigger today that blocks the change. DELETE was already owner-only (`20261008010000`).

`protect_child_owner` rejects any change to `id` or `parent_id`, including from the service role. There is no product flow that transfers a child.

The INSERT policy `insert_own_or_writer_children` also allowed `partner_can_write(parent_id)`. Combined with `enforce_vpc_on_child_insert`, which only checks VPC when `NEW.parent_id = auth.uid()`, a partner could insert a child owned by the other adult and skip the VPC check. INSERT is now `auth.uid() = parent_id` only. The app already inserts with the signed-in user's id (`useChildren`).

### H5. An owner could grant child access to someone who never accepted

**Status: fixed in this PR. Same migration.**

`partner_access` UPDATE is `auth.uid() = owner_id`, and WITH CHECK falls back to that expression, so the new `owner_id` must stay the caller. `partner_id` was not pinned. The owner could point an existing seat at any user id. That user would then pass `has_partner_access` without an invite or a consent stamp. The owner could also rewrite `consent_acknowledged_at`.

`protect_partner_access_identity` rejects changes to `id`, `owner_id`, `partner_id`, and `created_at` for every role. `consent_acknowledged_at` can change only as `postgres` or `service_role` (the accept RPC). Role, status, label, pause, and revoke still update, which is what `PartnerManagement` does.

### H6. Accepting an invite recorded consent even when the API was called without it

**Status: fixed in this PR. Same migration. The web client is updated in this PR.**

`accept_partner_invitation(text)` always set `consent_acknowledged_at` to `now()` (or kept an older stamp on re-accept). The checkbox in `AcceptInvite.tsx` only disabled the button. A direct RPC call recorded consent that was not given.

The one-argument function is dropped. The replacement requires `_consent` to be true and raises `CONSENT_REQUIRED` otherwise. Re-accept stamps `now()` again. Execute is granted to `authenticated` only. `AcceptInvite` sends `_consent: true` only after the box is checked.

An iOS build that still bundles the old client will get a function-not-found error until that build is updated. The website picks this up on deploy.

## Medium

### M1. Invite QR codes were rendered by a third party

**Status: fixed in this PR.**

`InviteShareSheet` loaded `https://api.qrserver.com/v1/create-qr-code/?data=<invite url>`. The invite URL contains the invite code (32 random bytes, `partner_invitations.invite_code`). That code is what `accept_partner_invitation` accepts. api.qrserver.com is not on `/subprocessors`. The QR is now drawn on the device with the `qrcode` package. The code does not leave the phone.

### M2. Several record tables still key access off the author's `parent_id`

**Status: not changed. Needs its own pass.**

Confirmed on live. These tables still use `auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)` for SELECT, and `partner_can_write(parent_id)` for writes:

`activity_plans`, `child_activities`, `child_signs`, `child_sign_practice`, `ferber_check_ins`, `scheduled_visits`, `sign_plans`, `sleep_day_todos`, `sleep_plans`, `speech_practice_plans`.

`20261008010000_role_permissions.sql` fixed this shape on twelve records tables and left these for later. It is not a cross-family read: `partner_can_write` and `has_partner_access` are pinned to `auth.uid()`. The failure is inside a family. A row whose `parent_id` is the partner's id is invisible to the owner, and some of these screens write `parent_id: user.id` (`SleepPage`, and others). View-only partners can read, which matches their role. They cannot write, because `partner_can_write` excludes `viewer`.

Rewriting these policies to `can_access_child` / `can_write_child` changes who can see partner-authored rows. That should be a dedicated change with the same assertions as `20260820000000_child_pivot_log_rls.sql`, not folded into this lockdown.

### M3. Claude-connection approval navigated to whatever URL the server returned

**Status: fixed in this PR.**

`McpConsentPage` assigned `window.location` from the approve response with no scheme check. Registration in `mcp/index.ts` already rejects non-https URIs (http only for localhost). The page now applies that same check before navigating, including on the deny path, and builds the deny query with `URL.searchParams` so an existing query string is not broken.

Dynamic client registration of arbitrary https redirect URIs is how this MCP server is designed (public PKCE client, consent screen). It is not locked down further here.

### M4. The site sent no baseline security headers

**Status: fixed in this PR, except Content-Security-Policy.**

`vercel.json` now sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a Permissions-Policy that leaves camera and microphone to this origin (the web app uses them) and turns geolocation and payment off.

A strict Content-Security-Policy was not added. `index.html` runs an inline script to set the theme before paint, and the page loads Google Fonts. A policy that blocks those would blank the app. A follow-up can hash the inline script and allow the font hosts.

### M5. React Router and Capacitor advisories in the production bundle

**Status: partially fixed in this PR.**

- `@capacitor/ios` `<=8.3.4` ([GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv)): remote content could be loaded at the app origin through Capacitor's internal HTTP proxy. Bumped `@capacitor/core`, `@capacitor/ios`, and `@capacitor/cli` to 8.5.3. There is no `ios/` project in this repo; the next native build has to pick up the new package.
- `react-router-dom` 6.30.1 had open-redirect advisories fixed in 6.30.2 and 6.30.4 ([GHSA-9jcx-v3wj-wh4m](https://github.com/advisories/GHSA-9jcx-v3wj-wh4m), [GHSA-2j2x-hqr9-3h42](https://github.com/advisories/GHSA-2j2x-hqr9-3h42)). Bumped to 6.30.6, which brings `@remix-run/router` 1.23.x.
- Two React Router advisories are only fixed in 7.18 ([GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) backslash open redirect, [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) SSR `deserializeErrors`). This app is a Vite SPA on React Router 6 and does not use the SSR hydration path. Jumping to v7 is a breaking upgrade and was not done.

`capacitor.config.ts` already sets `limitsNavigationsToAppBoundDomains: true` and `allowNavigation: ['*.supabase.co']`. The server scheme is `graceflare`. That config does not by itself fix GHSA-rvm3; the package bump does.

### M6. Storage buckets have no size or type limits

**Status: not changed.**

Live buckets `child-photos`, `milestone-photos`, and `pediatrician-exports` are private. Every `storage.objects` policy requires the first folder to be `auth.uid()`. There is no anon policy. `file_size_limit` and `allowed_mime_types` are null, so a signed-in user can upload a large file into their own folder. A limit was not added here because a pediatrician PDF or a photo could be rejected without a chosen ceiling.

`feedback-screenshots` is not a live bucket. Uploads fail. Policies for it still include a SELECT. That is a broken feature, not a leak. Called out in the 12 October legal-log entry.

Partners cannot read the owner's files. The policies are per user, not per child. That is the stricter choice.

## Low and accepted

### L1. Chart styles were interpolated into a `<style>` tag

**Status: fixed in this PR.**

`src/components/ui/chart.tsx` writes CSS from `ChartConfig` with `dangerouslySetInnerHTML`. No product screen uses `ChartContainer` today (charts use Recharts directly). Colors and keys are now limited to a hex / `hsl()` / `var(--token)` allowlist, so a future caller cannot close the style tag.

Sign illustrations are a separate allowlist, tested in `src/test/signMedia.test.ts`. They were not reopened.

### L2. Dependency findings that are not in the shipped app

**Status: not bulk-upgraded.** After the bumps above, `npm audit` reports 3 critical and 29 high.

- Critical: `vitest` UI file read ([GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)), `tinypool` (pulled in by vitest), and `tar` (install tooling). None of these run in the user's browser or in an edge function.
- High: `vite` dev-server path bugs, `eslint` / `tailwind` / `postcss` toolchain, `lodash` via tooling. `npm audit fix --force` wants major upgrades. Those were left alone so this PR does not swap the build tool or the router major.

### L3. Password reset, deep links, and sessions

**Status: reviewed, not changed.**

`ResetPassword` exchanges a PKCE `code` or accepts the recovery hash, then `updateUser({ password })`. The form requires 8 characters. `Auth.tsx` sends `redirectTo` to this origin's `/reset-password` and `/auth`, not to a caller-supplied URL.

`DeepLinkHandler` (native only) calls `setSession` with tokens from a `graceflare://` URL. That is the Supabase redirect the app registered. A custom scheme can be claimed by another app on some Android versions. iOS uses the associated domain as well (`/.well-known/apple-app-site-association` in `vercel.json`). Changing this would break password reset in the app.

### L4. Edge-function CORS is `*`

**Status: accepted.**

The functions authenticate with `Authorization`, not cookies. A page on another origin cannot read the user's token. Tightening the allowlist would break the Capacitor origin (`graceflare://localhost`) and local dev unless both are listed. Not changed.

### L5. Intentional anon RPCs

**Status: accepted. The security advisor still warns.**

Live, anon can execute exactly three functions, all `SECURITY DEFINER` with `search_path=public`:

- `complete_vpc_second_confirmation(text)` — the email link is often opened with no session. Token is 32 random bytes, single use, 72 hours.
- `get_home_program(text)` and `toggle_home_program_day(text, smallint)` — the SLP share page. `share_token` defaults to `encode(gen_random_bytes(32), 'hex')`. The function returns the plan only when the token matches an active, unexpired row, and returns null otherwise. These functions are live and not in this repo's migrations.

Every other `public` function has `search_path` set. None of the trigger functions are executable by anon or authenticated. Admin RPCs (`_purge_user_data`, `purge_inactive_account`, `users_with_no_logs_since`) are not client-executable.

`lookup_partner_invitation` is authenticated-only and returns the invite's role and label to someone who already has the code. The code is 32 bytes. That is the invite.

### L6. RLS coverage

**Status: confirmed, no change.**

Every `public` table has RLS enabled. The only view, `family_moments`, is `security_invoker` and not granted to anon. `mcp_clients`, `mcp_authorization_grants`, and `mcp_access_tokens` have RLS and no policies, and authenticated has no table grant (PR #287). The advisor info "RLS enabled, no policy" on those three is the intended lock. Reference data (`allergens`, `speech`, `speech_categories`, `financial_checklist_items`) is `SELECT` with `USING (true)` for `authenticated` only. That is a catalog, not a child's records.

`subscriptions` is SELECT-own-row only. There is no INSERT or UPDATE policy, so a user cannot set their own tier. `start_pro_trial` is security definer, requires an `slp_profiles` row, and only moves a free row with no prior trial to a 14-day pro trial.

Anon table grants on live: only `rights_requests` INSERT. That is the public privacy-request form. The INSERT policy forces `status = 'received'` and nulls the admin columns.

### L7. No inbound webhooks

Resend is called outbound. There is no Stripe webhook and no signature secret to check. Nothing to fix.

### L8. Secrets

**No rotation is required from this review.**

- No service-role key, `sb_secret_` value, Anthropic key, or Resend key is in the tree or turned up by a history search for those assignments.
- The anon JWT in the client bundle is the publishable key. It is meant to be public. It is not a reason to rotate.
- If the service-role key is rotated later, Vault secret `app_service_role_key` has to be updated in the same change. The May 2026 key rotation left the cron jobs failing until 2 October 2026 because Vault still held the old key (legal log, 2 October).

### L9. Defaults this project cannot change

`postgres` default privileges in the `storage` schema still grant anon full rights on tables created there. This repo does not create tables in `storage`. `supabase_admin`'s defaults in `public` still grant anon; `postgres` cannot change them. Both were left as P3 in the 9 October entry. `relforcerowsecurity` is off. The table owner (`postgres`) bypasses RLS. PostgREST uses `anon` / `authenticated`, which do not.

### L10. Purge job only saw the first 200 users

**Status: fixed in this PR.**

`inactive-account-purge` called `listUsers` for page 1 only (200 users). Past that, an inactive account would never be warned or deleted, which misses Privacy § 8. It now walks pages, up to 50 pages (10,000 users), and loads profile warning timestamps in batches of 100.

## What this PR changes

- `supabase/migrations/20261014120000_security_audit_fixes.sql` — owner approval required before merge.
- Edge functions: `inactive-account-purge`, `reactivate-nudge`, `check-notifications`, `send-visit-reminder-email`, `send-vpc-email`, plus `_shared/serviceRoleAuth.ts`.
- Client: invite accept sends `_consent: true`; invite QR is local; MCP consent checks the redirect; chart CSS is allowlisted; security headers in `vercel.json`.
- Dependencies: `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli` 8.5.3; `react-router-dom` 6.30.6; `qrcode` 1.5.4.

## Follow-ups

1. After the owner merges: confirm the migration's assertions passed in the migrate job, then on live confirm `protect_child_owner` and `protect_profile_server_columns` are enabled, anon cannot execute `accept_partner_invitation`, and a profile read does not show a raw `vpc_second_token`. Re-run the security advisor.
2. Rebuild the iOS app so Capacitor 8.5.3 is what ships.
3. Re-pivot the ten `parent_id` tables in M2, with the child-pivot assertions from `20260820000000`.
4. Add a Content-Security-Policy once the inline theme script is hashed.
5. Choose a storage upload size limit, and either create `feedback-screenshots` with an INSERT policy or remove the screenshot picker (12 October legal log).
6. The two React Router issues that only have a fix in v7, when the app next upgrades the router.
