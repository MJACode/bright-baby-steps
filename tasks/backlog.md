# Backlog — parked for founder decision

Items raised during the Finance Account Finder work and production catch-up (2026-09-30 → 2026-10-03). Nothing here is scheduled; each needs a founder yes/no before work starts. Newest context first.

## Decisions waiting on the founder

- [ ] **Lapsed Flare+ partners keep write access.** When an owner's Flare+ lapses, partners lose read access, but `can_write_child` was not updated, so child-scoped write policies may still let them insert/update logs. Option: add the `owner_has_plus` check to `can_write_child` in a follow-up migration so they lose both. *Recommendation: yes.* (Legal log 2026-10-01.)
- [ ] **Partner-facing copy for the Flare+ requirement.** Terms, FAQ, and the partner invite / accept screens don't say partner access depends on the owner's Flare+ subscription. *Recommendation: yes; route through legal review.*
- [ ] **Undeploy retired edge functions.** `parse-voice-log`, `detect-milestone`, and `next-step-peek` are still ACTIVE in production even though the features were retired. Constitution Principle II requires undeploying them. *Recommendation: yes — low risk, nothing calls them.*
- [ ] **Alert on failing scheduled jobs.** The pg_cron jobs failed silently from ~June to 2026-10-02 (stale Vault key). Add an alert on any non-2xx in `net._http_response` (or a daily health check). *Recommendation: yes.*
- [ ] **Engage securities counsel for Finance ads.** Brief is ready at `docs/counsel-brief-finance-ads.md`. No `finance_account_sponsors` row may be set active until counsel signs off. Contracts must be flat-fee or per-click only.

## Follow-ups (no decision needed, just not done yet)

- [ ] **Finance reminders delivery check.** Confirm the first `finance_*` notifications landed after quiet hours, and the 02:30 UTC inactive-account purge ran (first run since the key fix).
- [ ] **Runbook note:** rotating Supabase API keys also requires updating `app_service_role_key` in Vault.
- [ ] **Visit-reminder email secrets.** `send-visit-reminder-email` needs `RESEND_API_KEY` (and `VPC_FROM_EMAIL` / `APP_URL`) set before visit emails send; until then it fails and check-notifications retries quietly.
- [ ] **Manual QA of the Account Finder** on a real device: finder in ≤3 taps, "I opened this" / Undo, child switching, caregiver/viewer hidden, outbound links (IRS, trumpaccounts.gov, FDIC were only verified via search).
- [ ] **COPPA material-change question** (counsel brief Q5): do the new finance data + DOB-timed reminders need renewed notice for parents who consented before 2026-09-30?
- [ ] **Trump Account rules watch.** Treasury proposed auto-enrollment on 2026-09-29; update `src/lib/accountOptions.ts` copy if the final rule changes the "claim" step.
- [ ] **Yearly figures refresh** in `accountOptions.ts` (gift exclusion, IRA limit, Trump contribution indexing).

## Housekeeping found during the drift audit

- [ ] `ai_memories` exists in production but has no migration in the repo.
- [ ] Two local migrations never applied by name: `20260503000000_grant_test_account_premium` (likely applied by hand) and `20260619180000_reconcile_financial_checklist_to_live` (review before ever applying — it deletes checklist rows).
- [ ] Five live migrations missing from `main`: `slp_pro_core`, `slp_home_program_rpcs`, `start_pro_trial` (only on the SLP branch), `child_signs_focus` (no file anywhere).
- [ ] `owner_has_plus` checks only `tier='plus'`; align with `usePremium` if the SLP "pro" tier ships.
- [ ] Hand-deployed edge functions (`send-vpc-email`, `extract-memory`, `generate-speech-class`, `generate-activity-plan`) haven't been diffed against repo source; the CI deploy from #248 will overwrite them on the next functions change.
