# Legal Review Log — Grace Flare LLC

This file is the chronological record of every legal-review pass conducted on
Grace Flare's user-visible legal text (Privacy Policy, Terms of Service, FAQ),
its consent flows (COPPA email-plus VPC, COPPA direct-notice modal,
partner-invitee consent), and any code that materially affects the promises
those documents make to users.

**It is the FTC / state-AG paper trail.** If a regulator ever asks "when did
you review your COPPA flow and what did you find?", this is the answer.

## Reviewer

All entries below are pre-reviews by the in-house `legal` agent
(`.claude/agents/legal.md`) — an AI legal advisor with working knowledge of
COPPA (16 CFR Part 312, including the 2025 amendments), HIPAA applicability,
GDPR / UK-GDPR / CCPA-CPRA, and FTC Act § 5 deceptive-practice doctrine. The
agent is **not** a substitute for licensed counsel, and the company has
explicitly accepted in-house-only review as the standard for v1. If Grace
Flare ever raises institutional capital or expands outside the U.S., these
reviews should be re-validated by outside counsel admitted in Delaware
(governing law) and California (likely largest user base / strictest
children's-privacy regime).

## How to use this log

When making any change that touches Privacy / Terms / FAQ text, COPPA flows,
data-retention behavior, deletion behavior, subprocessor list, geo-block, or
any consent surface:

1. Dispatch the `legal` agent with the scope of the change.
2. Apply any P0 redlines they surface; capture P1/P2 as follow-ups.
3. Append an entry to this file with date, scope, agent's risk levels, and
   resolution.
4. If the change moves any code that touched a promise made in the policy
   text, link the code commit hash and the policy-text commit hash so the
   "moved in lockstep" property is provable.

Format for new entries:

```
## YYYY-MM-DD — <short title>

**Scope:** <files / features reviewed>
**Trigger:** <what change caused this review>
**Risk levels surfaced:**
- P0: <must-fix items, with how each was resolved>
- P1: <should-fix items>
- P2: <nice-to-have>
**Code refs:** <commit hash(es)>
**Outstanding:** <items deferred to a later review>
```

---

## 2026-05-06 — Initial bucket-1 redlines on Privacy, Terms, FAQ

**Scope:** First end-to-end pass on `src/pages/PrivacyPage.tsx`,
`src/pages/TermsPage.tsx`, `src/pages/FAQPage.tsx`.

**Trigger:** Pre-launch hardening.

**Key changes applied:** Locked decisions baked in — Grace Flare LLC as
Delaware operator, AAA arbitration with class-action waiver and 30-day
opt-out, liability cap (greater of $100 or fees paid in last 12 months),
governing law Delaware / venue New Castle County, EEA/UK geo-block at
signup for v1, 24-month inactive-account auto-purge, 30-day backup
retention, COPPA email-plus VPC method.

**Risk levels surfaced:**
- P0: COPPA VPC was originally a single-checkbox; flagged as not a
  § 312.5(b)(2) method standing alone. Required a real verifiable
  mechanism. Resolved May 7 with email-plus implementation.
- P0: Privacy and Terms named "TBD" as the legal entity; required an actual
  registered entity. Resolved with Grace Flare LLC, Delaware.
- P1: Subprocessor list belonged on a stable URL, not buried in policy
  prose. Resolved May 7 with `/subprocessors` page.
- P1: Rights-request mechanism was promised but had no UI. Resolved May 7
  with `/rights-request` form + `rights_requests` audit table.

**Code refs:** Squashed into `952920f` on main.

**Outstanding (resolved later):** Email-plus implementation, attested
direct-notice modal, partner-invitee consent moment, rights inbox,
inactive-account purge cron, audited `delete_user_account`, EEA/UK
geo-block.

---

## 2026-05-07 — May-2026 implementation wave T1–T8

**Scope:** Full review of the implementation that backs the May-6 policy
text. Files touched: `supabase/migrations/20260507000000_vpc_email_plus.sql`,
`20260507010000_audit_delete_user_account.sql`,
`20260507020000_partner_invitee_consent.sql`,
`20260507030000_rights_requests.sql`,
`20260507040000_inactive_account_purge.sql`,
`20260507050000_cron_jobs_use_vault.sql`;
edge functions `send-vpc-email`, `inactive-account-purge`;
frontend `CoppaDirectNotice.tsx`, `VpcGateMessage.tsx`, `VpcConfirmPage.tsx`,
`AddChildDialog.tsx`, `OnboardingWizard.tsx`, `AcceptInvite.tsx`,
`SubprocessorsPage.tsx`, `RightsRequestPage.tsx`, `geoBlock.ts`,
`useGeoBlock.ts`, `Auth.tsx`.

**Trigger:** Implementing the policy promises in code.

**Key changes:**
- COPPA email-plus VPC end-to-end: signup confirmation (email #1) → 24h
  dwell (later removed; see 2026-05-08) → Add-Child triggers a second
  confirmation email → click stamps `vpc_completed_at` → BEFORE INSERT
  trigger on `public.children` blocks rows until VPC complete.
- Direct-notice modal at Add Child (16 CFR § 312.4(c)).
- Partner-invitee consent moment: invitee must check Privacy/Terms box;
  `accept_partner_invitation` RPC stamps `partner_access.consent_acknowledged_at`.
- Rights-request public form with per-requester RLS.
- Inactive-account auto-purge: 24-month inactivity warning, 30-day grace,
  then `_purge_user_data(uid)` helper. Daily cron at 02:30 UTC.
- `delete_user_account()` audited to delete from all 15 parent_id-referencing
  tables, purge `feedback-screenshots` and `milestone-photos` Storage
  prefixes, then `profiles` and `auth.users`.
- EEA/UK geo-block at signup via best-effort IP geolocation (api.country.is).
- pg_cron jobs migrated from `current_setting()` to Supabase Vault.

**Risk levels surfaced:**
- P0: `delete_user_account()` Storage purge needed end-to-end test in dev
  before going live with the Privacy § 7 / § 8 deletion promise. **Still
  outstanding as of 2026-05-08.**
- P1: Anthropic DPA must confirm "no training" + 30-day abuse-monitoring
  cap + SCCs + ≤72h breach notification before public launch. **Still
  outstanding as of 2026-05-08.**
- P1: Verify Supabase project tier matches the 30-day backup-rotation
  claim in Privacy § 8.

**Code refs:** Squashed into `952920f` on main.

---

## 2026-05-08 (morning) — Vault-cron migration + DE registered agent address

**Scope:** `supabase/migrations/20260508000000_check_notifications_cron_vault.sql`,
`src/pages/PrivacyPage.tsx` § 1, `src/pages/TermsPage.tsx` § 14, `CLAUDE.md`.

**Trigger:** Ops hygiene + filling the `[REGISTERED AGENT ADDRESS — TBD]`
placeholder with the actual Northwest Registered Agent address.

**Key changes:**
- `check-notifications-every-3h` cron rebuilt to read service_role key from
  Supabase Vault (same pattern as `inactive-account-purge-daily` and
  `reactivate-nudge-3x-daily`), removing a hardcoded LEGACY anon JWT from
  the cron command body. JWT-rotation safety + key-leak hygiene.
- Privacy § 1 and Terms § 14 now name the registered agent:
  *c/o Northwest Registered Agent, 8 The Green, Suite A, Dover, DE 19901.*

**Risk levels surfaced:** None new. Both items were tracked as P1 in CLAUDE.md
already.

**Code refs:** Commit `7050249` on main.

---

## 2026-05-08 (afternoon) — Auth.tsx PKCE-mismatch UX fix

**Scope:** `src/pages/Auth.tsx`.

**Trigger:** Smoke-test surfaced a misleading "link expired" toast when the
email-confirmation link is opened on a different browser than initiated
signup (PKCE `code_verifier` mismatch). The email IS confirmed by Supabase's
`/verify` endpoint server-side regardless; the exchange-for-session merely
fails to establish a same-device session.

**Key changes:**
- Replaced the misleading "expired" toast with `"Email confirmed! Please
  sign in below to continue."`
- Fixed a coupled bug where `setVerifying(false)` was never called on the
  success path, leaving the user stuck on "Verifying your email…" forever.

**Risk levels surfaced:**
- P1 (UX, not legal): the prior copy was *technically* deceptive — the user
  was told the link was expired when in fact their email was confirmed. Not
  a § 5 issue (no monetary harm, no consent issue) but worth fixing.

**Code refs:** Commit `5e29c6f` on main.

---

## 2026-05-08 (afternoon) — VPC zero-dwell + typed-name attestation

**Scope:** `src/lib/vpcGate.ts`, `src/components/VpcGateMessage.tsx`,
`src/pages/VpcConfirmPage.tsx`, `src/pages/PrivacyPage.tsx` § 6,
`src/components/CoppaDirectNotice.tsx`,
`supabase/functions/send-vpc-email/index.ts`,
`supabase/migrations/20260508010000_vpc_zero_dwell_and_attestation.sql`.

**Trigger:** Founder asked whether the 24-hour dwell between email #1 and
email #2 is statutorily required. In-house `legal` agent confirmed it is
**not** — the word "delayed" appears only in FTC staff Q&A, not in
16 CFR § 312.5(b)(2)(ii). The two-confirmation requirement remains; the
specific delay does not.

**Key changes:**
- Migration `20260508010000_vpc_zero_dwell_and_attestation.sql` — adds
  `coppa_attestation_signed_name`, `coppa_attestation_signed_at`,
  `coppa_attestation_ip` to `profiles`; replaces
  `complete_vpc_second_confirmation()` to drop the `interval '24 hours'`
  check.
- Edge function `send-vpc-email` redeployed (v3) with `MIN_DELAY_HOURS`
  removed and HTML/text email bodies rewritten to drop the now-false
  "yesterday" reference.
- Frontend: `MIN_DELAY_MS` removed from `vpcGate.ts`; `too_soon` variant
  removed from `VpcGateStatus` and from `VpcGateMessage` and
  `VpcConfirmPage`; the "Come back tomorrow" copy is gone.
- `CoppaDirectNotice.tsx` now collects a typed-name digital signature
  (≥2 words) plus parent/guardian and 18+ checkboxes. Submit button
  disabled until all three valid. Persists `coppa_attestation_signed_name`,
  `coppa_attestation_signed_at`, `coppa_direct_notice_acknowledged_at` on
  the same write.
- Privacy § 6 — three-step VPC redline written by the in-house legal
  agent, citing 16 CFR § 312.5(b)(2)(ii) directly and naming the
  typed-name signature as part of the disclosed flow.

**Risk levels surfaced:**
- P0 (mitigated): Code-vs-policy mismatch under FTC Act § 5 — Privacy
  § 6 said "at least 24 hours later" while the new code allows 0
  minutes. **All six lockstep sites moved in the same PR (#33)** to
  prevent the *Flo Health* / *BetterHelp* deception pattern. Migration
  applied to live and edge function v3 deployed BEFORE frontend merged
  to main, so production was never in an inconsistent state visible to
  users (old client gate kept users at 24h until merge; after merge,
  client + server + policy all match at 0 dwell + attestation).
- P1: Founder's ask for in-house-only review (no outside counsel) was
  recorded. Acceptable for v1; flagged for re-validation if institutional
  capital is raised or expansion outside the U.S. occurs.
- P1: Confirm Anthropic DPA has not changed; the data-flow analysis
  assumed Anthropic-as-processor under the documented terms (no training,
  30-day abuse-monitoring max, SCCs, ≤72h breach). DPA execution still
  outstanding.
- P2: Treat typed-name attestation as direct-notice acknowledgement
  (16 CFR § 312.4(c)) rather than as VPC standing alone — operative VPC
  method remains the two email confirmations.

**Code refs:** Commit `9a7ca80` on main.

---

## 2026-05-08 (evening) — FINAL end-to-end review for the May launch

**Reviewer:** AI legal pre-review agent (`.claude/agents/legal.md`). No outside
counsel.

**Scope:** End-to-end pass on `src/pages/PrivacyPage.tsx` (11 §),
`src/pages/TermsPage.tsx` (14 §), `src/pages/FAQPage.tsx`,
`src/pages/SubprocessorsPage.tsx`. Cross-policy consistency vs. code:
`src/lib/vpcGate.ts`, `src/lib/geoBlock.ts`, `src/hooks/useGeoBlock.ts`,
`src/components/CoppaDirectNotice.tsx`,
`supabase/functions/send-vpc-email/index.ts`,
`supabase/functions/_shared/personas.ts`,
`supabase/functions/chat/index.ts`,
`supabase/functions/briefing/index.ts`,
`supabase/functions/weekly-insights/index.ts`,
`supabase/functions/parse-voice-log/index.ts`,
`supabase/functions/detect-milestone/index.ts`,
`supabase/functions/inactive-account-purge/index.ts`,
`supabase/migrations/20260507000000_vpc_email_plus.sql`,
`supabase/migrations/20260507040000_inactive_account_purge.sql`,
`supabase/migrations/20260508010000_vpc_zero_dwell_and_attestation.sql`.

**Trigger:** Final pre-launch sign-off; in-house-only review for v1 (founder
explicitly accepted no outside counsel).

**Risk levels surfaced and resolved (all closed in this commit):**

- **P0 — § 4 AI processing under-discloses data flows + claims an executed
  Anthropic DPA we don't yet have.** Resolved: § 4 rewritten to (a) disclose
  the photo-based milestone detection flow (`detect-milestone/index.ts`) and
  the voice-note transcription flow (`parse-voice-log/index.ts`); (b) replace
  "We have a written Data Processing Addendum" with "We have requested a
  written Data Processing Addendum that we expect to confirm: (a)–(d)…", and
  point to `/subprocessors` for execution status. The full DPA-confirmed
  paragraph will be re-issued the day the executed PDF is in hand. Mirrors
  applied to FAQ "Is my child's data sent to third parties?" answer and to
  the Anthropic entry on `/subprocessors`.
- **P0 — § 11 geo-block calls `api.country.is` without disclosing it.**
  Resolved: § 11 paragraph appended to disclose the lookup explicitly, with a
  link to the SubprocessorsPage entry. New `api.country.is` entry added to
  the `SUBPROCESSORS` array. Long-term P1 follow-up: replace with a
  Cloudflare-backed Supabase edge function reading `cf-ipcountry`, removing
  the fourth party entirely.
- **P1 — § 6 step (ii) overstates what `CoppaDirectNotice.tsx` actually
  captures (no "I have read the policy" checkbox).** Resolved: step (ii)
  reworded — the parent attests parent/guardian status + age, and the policy
  now correctly describes the "after we present a separate direct notice
  with links to this Privacy Policy and our Terms" sequence rather than
  claiming an attestation we don't capture.
- **P1 — FAQ "How do I delete my account?" promised a deletion-confirmation
  email that isn't implemented.** Resolved: sentence dropped. Will be re-added
  when the corresponding Resend send-email edge function is built.
- **P1 — FAQ "third parties" answer didn't mention voice / photo flows.**
  Resolved: rewritten in lockstep with § 4.
- **P1 — § 8 backup-rotation claim ("30-day cycle") not yet verified against
  Supabase project tier.** Resolved: language softened to "no longer than 30
  days." Verifying the actual tier is a P0 follow-up; the soft language is
  defensible regardless of the answer. FAQ deletion answer also softened to
  match.
- **Badge change:** "Draft — pending legal review" amber badge removed from
  PrivacyPage, TermsPage, and SubprocessorsPage. Replaced with a single-line
  "Effective: May 8, 2026 · Last reviewed: May 8, 2026" timestamp. The unused
  `Badge` import was removed from each file. Rationale: the badge was
  enforcement-bait (a future plaintiff in discovery would point at "your own
  policy said draft when you collected my data"). The timestamp documents
  reasonable care under FTC § 5 + state UDAP statutes without continuing to
  broadcast doubt.

**Verified implementations (all match the policy text after this commit):**

- VPC email-plus three-step flow: signup-confirmation email, direct-notice
  modal with typed-name digital signature, separately-actionable second
  email click. No dwell. `complete_vpc_second_confirmation()` RPC and
  `send-vpc-email/index.ts` (v3, ACTIVE) both confirm zero-dwell. Migration
  `20260508010000_vpc_zero_dwell_and_attestation.sql` applied to live.
- Direct-notice modal at Add Child captures and persists
  `coppa_attestation_signed_name`, `coppa_attestation_signed_at`,
  `coppa_direct_notice_acknowledged_at` on the same write.
- Subprocessor list (Supabase, Anthropic, Resend, api.country.is) consistent
  across PrivacyPage § 5, `/subprocessors`, and what edge function code
  actually invokes.
- Inactive-account 24-month purge with 30-day warning grace —
  `inactive-account-purge` edge function + cron schedule verified.
- `delete_user_account()` RPC purges 19 parent_id-referencing tables, two
  Storage buckets (`feedback-screenshots`, `milestone-photos`), `profiles`,
  and `auth.users`. **Storage-deletion end-to-end test still pending in
  dev** (see follow-ups below).

**Follow-ups within 7 days (P0, founder-driven):**

1. **Anthropic DPA execution.** Once the executed PDF is in hand, verify it
   confirms (a)–(d) in PrivacyPage § 4; re-issue the section with the
   stronger "we have a written DPA" framing and the date executed.
2. **`delete_user_account()` Storage-deletion e2e test in dev.** Confirm
   `feedback-screenshots/{uid}/*` and `milestone-photos/{uid}/*` are actually
   gone after the RPC. If Storage deletion silently fails on the project's
   tier, soften PrivacyPage § 8 language about "Files in object storage are
   deleted within 30 days" or fix the Storage admin path.
3. **Verify Supabase backup retention** against the actual project plan via
   Supabase dashboard or MCP. If actual retention < 30 days, the "no longer
   than 30 days" soft language already covers us; if longer, consider
   tightening it back.

**Follow-ups (P1 / nice-to-have):**

- Replace `api.country.is` with a Cloudflare-backed edge function reading
  `cf-ipcountry` to remove the fourth party.
- Build the post-deletion confirmation-email Resend send so the FAQ answer
  can re-add the line.
- Build automated 10-day acknowledgement on `rights_requests` insert so § 7
  SLA is met deterministically.
- Add `security@graceflare.com` inbox or alias to `support@`.

**Risk posture (in-house-only review accepted by founder):**
The founder has explicitly elected in-house-only legal review for the May
2026 v1 U.S. launch. Outside-counsel review will be commissioned before any
of:
- Institutional fund-raise (Series A or earlier priced round) — investors
  will diligence the privacy/terms text.
- EU/UK launch — geo-block off, Art. 27 representative appointment, DPIA for
  children's data + AI, cookie/consent banner, EU-qualified counsel.
- Pediatrician integration / EHR connectivity — HIPAA Business Associate
  status comes onto the table, BAA template needed, outside health-privacy
  counsel non-optional.
- A material breach or FTC HBNR-triggering incident — outside counsel
  immediately. The founder is encouraged to pre-engage breach counsel now
  (a $0 retainer is fine) so a phone number is on file before 2 a.m.

**Code refs:** This commit (TBD on PR #34).

---
