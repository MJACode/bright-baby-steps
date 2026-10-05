# Handoff: partners, Your team, role permissions, cron caller check

**From:** Claude session `session_016f9JDvMVdemGsgKxhHLFz9` (2026-09-30 → 2026-10-05)
**To:** the founder's other active Claude session, which now owns this work. The founder decided on 2026-10-05 that one session handles all of it, so the two sessions stop overwriting each other on live.
**This session has stopped making live changes.** Everything below is either on `main` or on a pushed branch.

---

## 1. Already live and verified

| What | Where | Verified on live |
|---|---|---|
| Admin RPC lockdown: `_purge_user_data`, `purge_inactive_account`, `users_with_no_logs_since` revoked from anon/authenticated | `20260930090000_lock_down_admin_rpcs.sql`, PR #252 | `has_function_privilege` false for anon/auth, true for service_role |
| Free plan 1 partner seat / Flare+ 2; lapse keeps the longest-standing partner; `partner_within_entitlement()` used by all 4 RLS helpers; `can_access_child` guarded by `auth.uid()`; EXECUTE matrix asserted | `20260930100000_free_partner_seat.sql` (applied 2026-10-02 as `free_partner_seat_1_functions` + `free_partner_seat_2_index_and_acl`), PR #258 | ACL matrix correct; `partner_seat_limit` returns ELSE 1; both seat triggers present |
| Owner-only `set_partner_role(_partner_id, _role)` | `20260930110000_set_partner_role.sql` (applied as `set_partner_role`) | anon false, authenticated true |
| Paywall unsupported claims removed; billing launch kit | PR #247, `docs/billing-launch-kit.md` | n/a (copy) |

**Watch out:** `20261001000000_can_write_child_requires_owner_plus.sql` (from your session) adds an `owner_has_plus` gate to `can_write_child`. That contradicts the free seat: a free owner's partner could read but not write. Live currently has the correct entitlement body, because `free_partner_seat_1_functions` ran after it. Branch `claude/your-team-page` adds `20261003000000_can_write_child_entitlement.sql` so a fresh `db push` converges on live. **Don't re-apply `20261001000000` to live.**

---

## 2. Founder-approved, not done yet (in priority order)

### 2a. Redeploy `check-notifications` from `main` (approved 2026-10-05, after QA)
Deployed v28 (from your session) still uses the **Flare+ partner gate**, so free-plan partners get no notifications. `main` (PR #258) filters each partner through `partner_within_entitlement` and fails closed. Before deploying:
- diff v28's source (`get_edge_function`) against `main`;
- keep v28's finance reminders, quiet hours and daily cap;
- run QA;
- deploy, then confirm the next 3-hourly run returns 200.

### 2b. Security: caller check on `reactivate-nudge` and `inactive-account-purge` (open gap)
Both have `verify_jwt=false` and **no caller check in code**. Anyone who knows the URL can trigger a service-role run, including purge warning emails and purges. Branch **`claude/fix-cron-auth`** (`9448024`, `fdb85fd`, `0398120`) has a fix, but it assumed a new `sb_secret_` key named `cron` sent on the `apikey` header. On 2026-10-02 you stored the **legacy service-role key** in Vault and cron sends it as `Authorization: Bearer`, which works. So:
- **Do NOT apply `20261003030000_cron_jobs_apikey_header.sql`.**
- Adapt `_shared/requireCronKey.ts` to compare `Authorization: Bearer` against `SUPABASE_SERVICE_ROLE_KEY` in constant time (fail closed), or move fully to new keys deliberately.
- The branch's nudge dedupe (max 1 reactivation nudge per parent per 7 days, which honours the mute) is **founder-approved**. Keep it.
- The branch also deletes 14 lines of `docs/legal-review-log.md` relative to current main. That is a stale-base artifact. Rebase or merge `main` and keep main's log.

### 2c. Role permissions don't match the app's promises (approved 2026-10-03, apply after QA)
Confirmed on live 2026-10-03: these 12 tables have `FOR ALL USING (auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id))`, so **View-only partners can write and delete**:

`birth_certificates, child_checklist_items, college_contributions, college_savings, cry_analyses, dental_visits, ei_providers, ei_tracker, health_insurance, life_insurance, pediatrician_visits, vaccinations`

Also, `children` policy `delete_own_or_writer_children` lets **caregivers delete a child**.

Approved target:
- **View-only:** read only.
- **Caregiver:** reads plus writes on daily-care and health logs; **no finance read or write** (college_*, life_insurance; decide health_insurance against `can_manage_child_finance`).
- **Co-parent:** everything except team management.
- **Only the owner** can delete a child.

Mirror the pattern in `20260501010000_harden_partner_role_rls.sql` / `20260820000000`.

### 2d. Consent enforcement on `accept_partner_invitation` (approved)
The RPC stamps `consent_acknowledged_at` even when the checkbox wasn't ticked, and a re-accept keeps the old stamp. Plan:
- Replace it with `accept_partner_invitation(_invite_code text, _consent boolean DEFAULT NULL)`, and drop the 1-arg overload in the same migration to avoid PostgREST ambiguity.
- `_consent = false` raises `CONSENT_REQUIRED`. NULL is allowed until the new client ships.
- The re-accept path re-stamps with `now()`.
- Revoke anon and assert.

### 2e. Team member names: QA blocker for the Your team page
Live `profiles` RLS is own-row only, so the owner can't see partner names and every member shows as "Team member". Plan:
- Add `get_team_names()` (SECURITY DEFINER). It returns partner full_name + email for the caller's team rows, and only the owner's full_name for a caller who is a partner. Revoke PUBLIC and anon, grant authenticated, assert.
- Add the owner's first name to `lookup_partner_invitation`, or add `get_invite_owner_name(code)`, for AcceptInvite.
- **Don't widen `profiles` RLS** (it holds `vpc_second_token`).

### 2f. Your team page: finish and ship (branch `claude/your-team-page`, head `009e5fd`)
Built and passing (834+ tests, build OK). QA returned **Fix-required** and the legal pre-review returned must-fixes; both are folded into the brief in §4 below. Ship order: 2c, 2d and 2e live (after QA) → frontend pass from §4 → QA → PR → merge.

Founder decisions recorded for this work:
- dedicated page;
- share-link invites only;
- owner can remove, pause/resume and change role;
- partners see a read-only view;
- "Pediatrician" and "Daycare" removed from the role suggestions (HIPAA/CMIA risk, an outside-counsel trigger);
- **legal's Terms / Privacy / COPPA notice wording approved**. Legal judged it not a material change, so no 30-day notice is needed. Bump "Last reviewed".

---

## 3. Open items (not yet decided or scheduled)

- **Admin RPC exposure incident (2026-05 → 2026-09-30):** children's first names and account deletion were reachable with the anon key for about 5 months. Logs cover only about 24h and show no calls. CLAUDE.md lists "material breach" as an outside-counsel trigger, so **the founder needs to decide on a counsel review**. The facts are in the legal log, 2026-09-30.
- **Advisor ERROR:** the view `public.family_moments` is SECURITY DEFINER and bypasses the querier's RLS.
- **Root cause:** `pg_default_acl` grants EXECUTE on new `public` functions directly to anon and authenticated. Every SECURITY DEFINER migration must revoke from anon and authenticated explicitly and assert with `has_function_privilege`. Changing the default privileges is an option, with a tradeoff.
- The `partner_access` owner UPDATE policy has no column restriction: an owner could change `partner_id` to any uuid and move a seat to someone who never consented. Add a trigger refusing changes to `partner_id`, `owner_id` and `created_at`.
- `delete_user_account()` is still anon-executable. It is `auth.uid()`-guarded; confirm a NULL uid is a no-op.
- **QR remediation:** until branch `claude/your-team-page`, "Show QR" sent the live invite URL to `api.qrserver.com`, an undisclosed third party. Run `git log -S qrserver` to get the window, then check whether any invites accepted in that window were by unknown users. The legal log entry is drafted in §4.
- `pending_invite` is written to localStorage (AcceptInvite) but read from sessionStorage (Auth.tsx). New invitees are routed into onboarding's "I am the parent" step instead of the invite.
- A partner who was removed or is on hold is routed into onboarding instead of seeing a neutral "no longer have access" screen.
- **Cron monitoring:** `cron.job_run_details` reports "succeeded" even when the HTTP call fails. Alert on non-2xx in `net._http_response`.

---

## 4. Your team frontend brief (QA + legal fixes, founder-approved)


## From QA (Fix-required)
1. **Names.** Use the new `get_team_names()` RPC (backend adds it) for member names in useTeam / useMyTeamAccess. Use `get_invite_owner_name(code)`, or the extended `lookup_partner_invitation`, in AcceptInvite.
   - Fallback order: label → full_name → email → "Team member".
   - Add an owner-editable "Name" (`partner_access.label`) field in the member drawer, so unnamed members can be told apart.
   - Remove the stale comment.
2. **AcceptInvite "expired" state.** It is also set for `status !== 'pending'` (already accepted or cancelled). Split it: expired keeps the current copy; used or cancelled → "This invite link no longer works" / "Ask the person who invited you for a new link."
3. **Resuming a paused member on the free plan** when their rank is above the limit: they go straight to on-hold. Warn before resuming: "{Name} will be on hold — your free spot is used by {kept}. Restart Flare+ or remove {kept} to bring {Name} back." Don't show the "back in" toast in that case.
4. **rankSeatHolders.** Compare created_at to microsecond precision (string compare of the full ISO timestamp with microseconds works when the format is uniform from PostgREST; or parse the fractional part).
5. **useChildContext.** Nothing uses it. Revert the change or delete the hook (prefer deleting it if it truly has no consumers).
6. **Expired invite "Send a new link"**: hide it when `!seats.canInvite`.
7. Add one hook-level test for useTeam with a mocked supabase client covering the 0-row guard on remove/cancel.

## From legal (founder approved: apply legal's wording; remove Pediatrician/Daycare)
- **A. AcceptInvite** "What you'll see" box: role-specific line per role:
  - coparent: "Everything logged for this child: their profile (name, birth date, photo, prematurity), daily logs, health records (illness, medication, temperature, allergens, visits), finance planning, and AI briefings and insights. You can add and change anything."
  - caregiver: "This child's profile and daily care logs (sleep, feeding, diapers, allergens, illness, medication, temperature). You can add to them. You won't see finance or settings."
  - viewer: "This child's profile and logs, view only. You can't add or change anything."
- Bullets for every role:
  - "You'll use your own account. {Owner} stays in charge of this child's records and decides who's on the team."
  - "Anything you log becomes part of {Owner}'s records and stays with them if you leave the team."
  - "{Owner} can change your role, pause, or remove your access at any time. We don't send a notice when that happens."
  - "If {Owner}'s Flare+ plan ends, your access may pause until it restarts. Nothing you logged is deleted."
  - "We don't sell your data or share it for advertising. Details: Privacy Policy · Subprocessors."
- DELETE the "co-controller" sentence.
- Checkbox: "I'm 18 or older, {Owner} has invited me to help care for this child, and I agree to the Terms of Service and Privacy Policy."
- Use "the account owner" when there's no name. Pass `_consent: true` to `accept_partner_invitation` (new 2-arg signature).
- text-[11px] → text-xs. Title "Join {owner}'s team"; fallback "a family's Grace Flare team".
- **B1 Privacy § 5**, replace the Partner Access bullet: "People you invite to Your team (for example a co-parent, grandparent, or sitter). Each person uses their own Grace Flare account and can see your child's records. Depending on the role you choose, they can also add to them. How many people you can invite depends on your plan. You can change roles, pause, or remove anyone at any time in More → Your team, and their access stops immediately."
- **B2 Privacy § 7**, first sentence → "Accounts are only for adults age 18 or older. Only a child's parent or legal guardian may add that child; other adults can see a child's records only if that parent or guardian invites them to their team."
- **B3 Privacy § 7**, new bullet after "Direct notice": "Invited adults. Your child's records are shared with someone else only when you send them an invite. They see nothing until they create their own account, confirm they are 18 or older, and accept our Terms and this policy. Pausing or removing them stops their access immediately. Records they logged stay in your account."
- **B4 Privacy § 10**: "We use Postgres row-level security policies so that each user can access only their own data and the records of children they added or were invited to by that child's parent or guardian."
- **C1 Terms § 3**: "You must be at least 18 years old. You may add a child only if you are that child's parent or legal guardian. If you join another family's team by invitation, you must have the account owner's permission to help care for that child, and you may use the app only for that purpose. Children under 18 may not register for or use Grace Flare on their own behalf."
- **C2 Terms § 7**, replace the last clause: "…or add a child, or log information about a child, unless you are that child's parent or legal guardian or an adult they have invited to their team."
- **C3 Terms**: add a "Teams" paragraph wherever subscription/Flare+ terms live, or if none, as a new paragraph at the end of § 6: "Teams. The free plan includes one invited person and Flare+ includes two. If Flare+ ends, the person who joined first keeps access and anyone else is paused until Flare+ restarts; nothing is deleted. The account owner controls the team and may change roles, pause, or remove members at any time without notice to them. Disagreements between team members about access are between them; we follow the account owner's settings."
- **D CoppaDirectNotice** "Who we share it with": "…each under a written data-processing agreement, plus any adults you choose to invite to Your team (for example a co-parent, grandparent, or sitter). They can see your child's records and, depending on the role you give them, add to them, until you pause or remove them. We do not sell or share your child's data for advertising."
- **E1 UpgradeSheet multi-caregiver.sub** and the Upgrade.tsx row: "Free includes 1 extra person. Flare+ adds a second — co-parent, sitter, or grandparent — synced live. If Flare+ ends, the person who joined first keeps access and the other is paused until you restart."
- **E2 LapseBanner**, append (only when there's a kept member): "Or, to stay on the free plan with {held} instead, remove {kept} — their spot moves to {held}."
- **E3 Invite drawer description** (InviteShareSheet and TeamPage): "They'll make their own account and see {baby}'s records — what they can change depends on the role. You can pause or remove them anytime."
- **E4 Free-full card**: "Bring in a grandparent or sitter too — Flare+ includes 2 spots. Or remove someone to free your spot."
- **F FAQ**: "Yes. Invite people from More → Your team. The free plan includes one extra person; Flare+ includes two. Co-parents can see and change everything, including finance. Caregivers can view and log daily care but not finance or settings. View-only members can see logs but can't change anything. If Flare+ ends, the person who joined first keeps access and anyone else is paused until you restart — nothing is deleted. You can change roles, pause, or remove anyone at any time. Removed people aren't notified, and anything they logged stays in your records." (Ships with the role-permission DB fix, which goes live before this PR merges.)
- **G ROLE_COPY subs**:
  - caregiver: "Nanny · Sitter · Grandparent"
  - viewer: "Grandparent · Family friend"
  - coparent: "Everything except managing your team". Verify co-parents can't manage the team (partner_access UPDATE is owner-only, so they can't).
- **pending_invite storage mismatch**: AcceptInvite writes localStorage but Auth.tsx reads sessionStorage. Use localStorage in both places and remove the entry once it's consumed.
- **Removed or paused partner**: on next launch, show neutral text instead of routing into onboarding: "You no longer have access to {child}'s records. If you think this is a mistake, ask the person who invited you." Check how DashboardLayout routes a user who has no children but does have a revoked/paused partner_access row or an on-hold row.
- Bump "Effective / Last reviewed" on PrivacyPage and TermsPage to 2026-10-03 (keep the Effective date if that's the convention; read the files).
- **Legal-review-log entry**: "2026-10-03 — "Your team" page; free 1 / Flare+ 2 copy; invite QR generated on-device (api.qrserver.com retired)". Use legal's draft; fill in the placeholders from the backend report (QR window, invite counts). Supersede the 2026-10-02 "partner write access ends when owner's Flare+ lapses" claim (the 20261003000000 migration reverses it), and close the "partner-facing copy should say access depends on the owner's Flare+" item.

---

## 5. Lessons from this session
- **Container restarts have repeatedly destroyed uncommitted agent work.** Have agents commit and push after every step.
- MCP `apply_migration` records new version timestamps. Check `supabase_migrations.schema_migrations` **by name**, and verify by schema objects.
- Large single migrations can time out over MCP while waiting on table locks. Split them and `SET LOCAL lock_timeout`.
- `profiles` RLS is own-row only. Other users' names need a narrow SECURITY DEFINER RPC.
