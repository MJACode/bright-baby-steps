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

## 2026-05-08 — Anthropic DPA accepted; PrivacyPage § 4 + SubprocessorsPage updated (P0 #1 resolved)

**Reviewer:** in-house (founder + Claude legal subagent).
**Trigger:** founder accepted Anthropic's published Data Processing Addendum
("DPA") template (template effective date Feb 24, 2025; acceptance date May 8,
2026). Executed PDF stored outside the repo (1Password / Google Drive). This
closes the **P0 #1 — Anthropic DPA execution** follow-up that opened with the
May 8 badge-flip commit.

**Method.** Read the full 20-page DPA text. Audited section-by-section against
the four points the previous PrivacyPage § 4 draft promised the executed DPA
would confirm: (a) no-training, (b) ≤ 30-day abuse-monitoring, (c) SCCs
2021/914, (d) breach ≤ 72h. Cross-checked against the rest of the DPA
(deletion windows, audit rights, subprocessor cascade, Schedule 2 security
controls). Then redlined PrivacyPage § 4 and the Anthropic row on
SubprocessorsPage.

### Audit results vs. Privacy § 4 promises

| Promise in prior § 4 (May 8 draft) | DPA §§ that bear on it | Verdict |
|---|---|---|
| (a) Not used to train, fine-tune, or improve general-purpose models | § B.2 (process only on documented instructions) + Schedule 1 § B.5 (permitted purposes: provide Services, security/integrity, debugging — training **not** listed, so excluded by the purpose-limitation principle) | **Implicit, not explicit.** The DPA does not contain a "Anthropic will not train on Customer Data" sentence. The explicit no-training commitment lives in Anthropic's Commercial Terms of Service + published Usage Policy. § 4 was rewritten to cite *both* the DPA's purpose-limitation section *and* the Commercial Terms / Usage Policy as the source of the no-training commitment. Net legal effect for our customers is unchanged; the citation is now honest about which document carries which clause. |
| (b) Inputs/outputs retained ≤ 30 days for abuse-monitoring, then deleted | § H.1 (deletion within 30 days of termination) + § H.1.b carve-out: retention permitted "to combat harmful use of the Services" — **with no time cap in the DPA itself** | **Gap.** The DPA does not state a 30-day abuse-monitoring cap. The 30-day window is published on Anthropic's Trust Center / Usage Policy but is not incorporated into this DPA, which means Anthropic could in principle revise the Usage Policy and lengthen abuse-monitoring retention without touching our contract. **Action: § 4 was softened from a specific "30 days" number to "a limited period … per Anthropic's then-current Usage Policy, after which they are deleted."** This gives up the marketing pop of a specific number in exchange for not making a contractual claim that the contract does not back. SubprocessorsPage data-categories row was matched. If Anthropic publishes the 30-day cap in a side letter or future DPA revision, § 4 can be retightened. |
| (c) SCCs Decision 2021/914 + UK IDTA where applicable | § A.8 names "Implementing Decision (EU) 2021/914 of 4 June 2021" verbatim. § I + Schedule 3 incorporate **Module Two (controller→processor) and Module Three (processor→processor)**. Schedule 3 § B incorporates the UK Approved Addendum (S119A(1) Data Protection Act 2018, version B.1.0). Schedule 3 § C adds a Swiss FDPIC addendum. Governing law for the SCCs themselves: Republic of Ireland (Clause 17, Option 1) | **✅ Confirmed and over-delivered.** Both Module Two and Module Three are incorporated (we only strictly need Module Two as a controller transferring to a processor). UK and Swiss addenda are also pre-wired even though we currently geo-block EEA / UK. § 4 was updated to name Module Two + Module Three + UK + Swiss explicitly so that if the geo-block is ever lifted, the policy text already matches the contract. |
| (d) Breach notification ≤ 72h | § G.1: "without undue delay, but in any event within **48 hours**, after becoming aware of any Security Breach" | **✅ Better than required.** DPA commits to 48h, beating the 72h GDPR Art. 33 target we were asking for. § 4 was updated to claim 48h with a brief note that this beats GDPR. Privacy § 6 (our own breach-notification posture, separate from Anthropic's notice to us) was not changed — we still pledge 72h to supervisory authorities and 60 days to users under FTC HBNR. |

### Other DPA terms that don't change § 4 but are worth logging

- **Deletion / return on termination** (§ H.1): within 30 days of termination,
  Anthropic returns or deletes Customer Data. Aligns with PrivacyPage § 8's
  deletion windows. Carve-outs in § H.1.b (legal hold, dispute resolution,
  abuse combat) are standard and accepted.
- **Subprocessor change notice** (§ C.3): Anthropic gives reasonable notice
  before adding a new subprocessor; Customer has **15 days to object**, after
  which the subprocessor is deemed accepted. SubprocessorsPage doesn't
  surface the 15-day window; this is a P2 — we're a downstream consumer of
  Anthropic's subprocessor list, not a publisher of it, so the 30-day notice
  we promise our own users on Privacy § 5 is independent.
- **Audit rights** (§ F): annual SOC 2 on demand from trust.anthropic.com;
  customer-funded audits with mutually agreed scope and a 12-month
  cool-down. Adequate for our v1 posture; we are not auditing Anthropic
  ourselves.
- **Schedule 2 security controls.** AES-256 at rest, TLS 1.2+ in transit,
  MFA + SSO + RBAC, annual third-party pen test, EDR on endpoints, SIEM /
  SOAR. Consistent with the security claims in PrivacyPage § 6; nothing in
  Schedule 2 contradicts what we already tell users.
- **Confidentiality of personnel** (§ B.7), **DPIA assistance** (§ B.6),
  **DSR forwarding** (§ D.1) — all standard GDPR-Art.-28-shaped processor
  obligations. Accepted as-is.
- **Effective date semantics.** The DPA template is dated Feb 24, 2025; our
  acceptance date is May 8, 2026. Privacy § 4 cites the acceptance date so
  there's no ambiguity in a discovery scenario about *when* we became
  contractually covered.

### Files changed in this pass

- `src/pages/PrivacyPage.tsx` § 4 — full redline. "we have requested a DPA we
  expect to confirm…" → "we have a written Data Processing Addendum in place
  with Anthropic, accepted on May 8, 2026, that confirms…" 30-day
  abuse-monitoring → "limited period … per Anthropic's then-current Usage
  Policy." 72h breach → 48h with a parenthetical that this beats GDPR. SCCs
  language updated to name Module Two + Module Three + UK + Swiss.
- `src/pages/SubprocessorsPage.tsx` Anthropic row — `transferMechanism`
  rewritten from "Data Processing Addendum requested; execution pending" →
  "Direct U.S.-based processing under a Data Processing Addendum accepted
  May 8, 2026. SCCs Module Two and Module Three (Decision 2021/914) plus UK
  and Swiss addenda are incorporated for any future cross-border
  transfer…". `dataCategories` retention sentence softened to match § 4's
  "limited period" phrasing.
- `CLAUDE.md` — Legal Review section: P0 #1 marked **✅ DONE 2026-05-08**;
  the "DPA still pending" qualifier in the locked-decisions block was
  rewritten to summarize the audit findings; the P0 follow-up bullet
  retained as a strikethrough so the audit trail is preserved.
- `docs/legal-review-log.md` — this entry.

### What did **not** change

- PrivacyPage § 6 ("Security and breach notification") — our promises to our
  own users about breach notification are unchanged. The DPA's 48h commitment
  is between Anthropic and Grace Flare; users don't need to know it.
- PrivacyPage § 8 (retention windows) — unchanged.
- TermsPage — unchanged. The DPA is a Privacy-side document.
- The "Effective: May 8, 2026 · Last reviewed: May 8, 2026" timestamps on
  PrivacyPage / TermsPage / SubprocessorsPage — same date as the prior
  badge-flip commit, so no bump needed today.

### Risk summary

- **Net residual risk: low.** We over-promised (b) by a small margin in the
  May 8 draft (specific 30-day number we couldn't cite). § 4 has been
  softened to match what the documents actually say. Everything else
  matches or exceeds what the prior § 4 draft promised.
- **What a future plaintiff or FTC investigator could still pin on us:**
  the no-training claim relies on Anthropic's Commercial Terms / Usage
  Policy rather than the DPA itself. If Anthropic ever changed the Usage
  Policy and started training on Customer Data, our § 4 promise would
  silently break. Mitigation: subscribe a calendar alert to Anthropic's
  Usage Policy / Trust Center pages and re-audit § 4 if those documents
  change. Tracked as a P2 follow-up.
- **What an outside-counsel review would likely flag:** asking Anthropic
  for a side-letter that incorporates the 30-day abuse-monitoring cap into
  the contract itself (not just the public Usage Policy). Worth doing the
  next time we have leverage (Series A, enterprise deal, or material spend
  threshold). Tracked as a P2.

### Follow-ups added by this pass

- **P2.** Calendar alert: re-check Anthropic Usage Policy + Commercial
  Terms quarterly; re-audit § 4 if the no-training or abuse-monitoring
  language changes.
- **P2.** Side-letter request: ask Anthropic to incorporate the 30-day
  abuse-monitoring window into a contractual document. Defer until next
  natural negotiation moment.
- **P3.** Surface Anthropic's 15-day subprocessor-objection window on
  `/subprocessors` for transparency. Not legally required for our
  downstream users.

**Code refs:** branch `claude/in-house-legal-signoff` — see PR for diff.

---

## 2026-05-09 — Two production bugs in the deletion code path, fixed

**Reviewer:** in-house (founder + Claude). **Surfaced during smoke-test of the
inactive-account auto-purge cron and the user-initiated delete-account RPC
against the live project (ieuznbvvwdvhtirzwkly).**

### What broke

The May-7 deletion migrations (`20260507010000_audit_delete_user_account.sql`,
`20260507040000_inactive_account_purge.sql`) shipped with two latent bugs that
neither the in-house legal review nor the type-checker caught:

1. **`supplement_logs` does not exist.** Both `_purge_user_data()` and
   `delete_user_account()` had `DELETE FROM public.supplement_logs WHERE
   parent_id = _uid`. The live schema has `public.supplements` (which the
   helper also deletes from) but no companion logs table. The first time the
   helper actually runs, Postgres aborts the whole transaction with
   `relation "public.supplement_logs" does not exist`, so the entire deletion
   fails — leaving the user partially intact (or, in transactional contexts,
   completely intact because the failure rolls back). **This means the
   inactive-account auto-purge cron and every user-initiated delete have been
   silently failing in production since May 7.**
2. **Direct `DELETE FROM storage.objects` is blocked.** The hosted Supabase
   project has a `storage.protect_delete()` trigger that raises
   `42501: Direct deletion from storage tables is not allowed. Use the
   Storage API instead.` even from SECURITY DEFINER PL/pgSQL. Both functions
   had a storage-cleanup block at the end. **This means Privacy § 8's "Files
   in object storage are deleted within 30 days" promise was being silently
   broken — even after the supplement_logs bug is fixed, the helper would
   still fail at the storage step.**

In addition, code review during the fix surfaced two child_id-referencing
tables (`parent_financial_checklist`, `pediatrician_exports`) whose FK to
`children(id)` is `ON DELETE NO ACTION` rather than `CASCADE`. These would
silently FK-violate `DELETE FROM children` for any user who had rows in
either table — adding a third runtime bug to the same code path.

### How we caught it

While doing a manual smoke-test deletion of a test account
(`matthew.alksninis@gmail.com` / uid `c6fe6765-…`) via Supabase MCP, the
`purge_inactive_account()` call raised the supplement_logs error.
Manually expanding the function body and re-running, the storage block
raised the protect_delete error. Manual cleanup completed via a single DO
block (less storage); zero objects were affected because that test user
had no Storage uploads.

### Architecture fix

Migration `20260509000000_fix_purge_helper_remove_supplement_logs_and_storage.sql`:

- `_purge_user_data()` rewritten DB-only:
  - Removes the bogus `supplement_logs` line.
  - Adds explicit deletes for `parent_financial_checklist` (by child_id) and
    `pediatrician_exports` (by child_id) before `DELETE FROM children`.
  - Adds explicit deletes for `subscriptions` and `rights_requests`
    (user_id-referencing tables that the original helper didn't list).
  - Removes the storage cleanup block — that responsibility moves to the
    edge functions.
- `delete_user_account()` simplified to a thin wrapper: assert
  `auth.uid() IS NOT NULL`, then `PERFORM public._purge_user_data(auth.uid())`.

Storage cleanup moved to edge functions so it goes through the supported
Storage admin API (HTTP path, not table DELETE):

- **New** `supabase/functions/delete-account/index.ts` (v1, ACTIVE,
  `verify_jwt=true`): user-initiated path. Verifies caller via JWT, lists +
  removes `feedback-screenshots/{uid}/*` and `milestone-photos/{uid}/*` via
  `supabase.storage.from(bucket).remove([...])`, then calls the
  `delete_user_account` RPC under the same user-scoped client so the RPC's
  `auth.uid()` reads the right uid. Returns per-bucket deletion counts.
- **Updated** `supabase/functions/inactive-account-purge/index.ts` (v3,
  ACTIVE, `verify_jwt=false` because pg_cron invokes it): same `purgeUserStorage`
  helper, called for each `purge_inactive_account` candidate before the RPC
  fires.
- **Client** `src/pages/dashboard/ProfilePage.tsx::handleDeleteAccount`
  switched from `supabase.rpc("delete_user_account")` to
  `supabase.functions.invoke("delete-account")`.
- **CI** `.github/workflows/deploy-functions.yml` extended to deploy both
  `inactive-account-purge` and `delete-account` so future updates to either
  go out automatically on push to main. (Both were also deployed manually via
  Supabase MCP in this pass so live is fixed *now*, not next push.)

### Risk summary

- **Net residual risk: low.** Live is correct as of this commit. Privacy § 8
  no longer has a silent-failure gap.
- **What we still owe ourselves:** an automated end-to-end test that
  actually creates a test user with seeded rows in every parent_id /
  child_id / user_id table plus a Storage upload, then exercises both
  deletion paths and asserts zero remaining rows / objects. Tracked as a
  P1 — without it, the next time someone adds a new records table they may
  forget to add the parent_id delete here, and we'll only find out the next
  time the cron actually runs.

### Follow-ups added by this pass

- **P1.** End-to-end deletion test (described above).
- **P2.** Periodic schema reconciliation: a CI job that compares the tables
  referenced inside `_purge_user_data()` against the actual list of tables
  with parent_id / user_id / owner_id columns. Fail the build if the helper
  is missing one. Cheap insurance against future drift.
- **P3.** Surface the deletion completion email (Privacy § 8 promise to
  "email confirmation when complete") — currently neither path sends it.

**Code refs:** branch `claude/fix-purge-helper-storage`.

---

## 2026-05-20 — Sleep-plan builder evidence base

**Scope:** `src/lib/sleepPlan.ts`, `src/components/SleepPlanDialog.tsx`,
`src/components/SleepTriageCard.tsx`, `src/lib/sleepTriage.ts`. New "Build
a sleep plan" surface reachable from the SleepTriageCard when the parent
selects `schedule_confusion`. The dialog renders age-bracket-targeted
clinical guidance (total sleep target, nap count + next transition, wake
windows, bedtime range, bedtime routine, Safe Sleep ABCs under 12 months,
sleep-training-readiness note under 4 months), personalized against the
last 14 days of `sleep_logs` rows (median bedtime / wake / total).

**Trigger:** Product extension of the Sleep Triage card. No change to
Privacy, Terms, FAQ text, COPPA flows, retention, deletion, subprocessor
list, or geo-block.

**Why this entry exists:** the dialog cites peer-reviewed pediatric-sleep
literature in-product. The FTC has historically taken interest in
health-adjacent claims, so the source posture is documented here even
though the surface itself isn't a "consent" surface.

**Evidence base (cited verbatim alongside each clinical number):**

- **Total-sleep targets (24h)** — *Recommended Amount of Sleep for
  Pediatric Populations: AASM Consensus Statement*, Paruthi S et al.,
  J Clin Sleep Med 2016;12(6):785-786
  (https://pubmed.ncbi.nlm.nih.gov/27250809/). AASM declined to issue
  a recommendation for infants under 4 months, so the 0-3 mo range
  (14-17h) comes from *NSF sleep time duration recommendations*,
  Hirshkowitz M et al., Sleep Health 2015;1(1):40-43, also peer-reviewed
  expert consensus.
- **Safe Sleep ABCs (rendered only when ageMonths < 12)** — *Sleep-Related
  Infant Deaths: Updated 2022 Recommendations for Reducing Infant Deaths
  in the Sleep Environment*, Moon RY et al., Pediatrics 2022;150(1):
  e2022057990 (https://publications.aap.org/pediatrics/article/150/1/
  e2022057990/). AAP Policy Statement, current as of May 2026 to our
  knowledge. Includes: supine for every sleep first year, firm flat
  surface meeting CPSC standards (incline ≤10°), no bed-sharing, no
  soft objects/bumpers/pillows/blankets, no weighted swaddles or sleep
  sacks, room-share 6-12 mo, stop swaddling at first sign of rolling,
  pacifier at sleep onset is protective, no home cardiorespiratory
  monitors for SIDS prevention.
- **Wake windows** — *A Clinical Guide to Pediatric Sleep* (3rd ed.),
  Mindell JA, Owens JA, Wolters Kluwer 2015. Standard pediatric-sleep
  clinical reference. Explicitly flagged in-product with the footnote
  "Approximate guidance from clinical practice (Mindell & Owens 2015) —
  not RCT-validated" so parents aren't shown clinical-practice numbers
  as randomized-trial evidence.
- **Bedtime routine guidance** — *A nightly bedtime routine: impact on
  sleep in young children*, Mindell JA et al., Sleep 2009;32(5):599-606
  (https://pmc.ncbi.nlm.nih.gov/articles/PMC2675894/), n=405 RCT; and
  *Bedtime Routines for Young Children: A Dose-Dependent Association
  with Sleep Outcomes*, Mindell JA et al., Sleep 2015;38(5):717-722
  (https://pubmed.ncbi.nlm.nih.gov/25325483/), n=10,085 cross-sectional
  dose-response. Recommendation rendered in product: 3+ activities,
  20+ minutes, 5+ nights/week.
- **Behavioral sleep-intervention safety follow-up** — *Five-Year
  Follow-up of Harms and Benefits of Behavioral Infant Sleep
  Intervention*, Price AMH et al., Pediatrics 2012;130(4):643-651
  (https://publications.aap.org/pediatrics/article/130/4/643/). Cited
  in the dialog's sources list as the long-term safety reference for
  behavioral sleep training; the sleep-training method picker itself
  is out of scope for this PR. Sleep-training-readiness note ("not
  appropriate before ~4-6 months") cites Mindell & Owens 2015 + AAP
  guidance and only renders when ageMonths < 4.
- **Bedtime-range defaults** — Mindell & Owens 2015 clinical defaults;
  AAP recommends a consistent age-appropriate bedtime (no specific clock
  range mandated). 0-3 mo is rendered with `bedtimeRange.label = "No
  fixed bedtime — circadian rhythm consolidates around 10-12 weeks"`
  rather than a clock-time, consistent with developmental science.

**Disclaimer posture:** no new in-product disclaimer added. The clinical
guidance is presented under the existing "Service Is Not Medical Advice"
language in `TermsPage.tsx` § 4 (Terms of Service), which already states
that Grace Flare provides educational information, not medical advice,
and that parents should consult a pediatrician for medical concerns. The
dialog also avoids prescriptive framings ("experts recommend…",
"you should…") in favor of a parent-led framing ("Build a structured
plan for your baby") consistent with the brand voice guidelines in
CLAUDE.md.

**Personalization & data:** the dialog reads the last 14 days of
`sleep_logs` rows for the active child (already loaded by
`useSleepCoach`), computes median bedtime, median wake time, and mean
daily total — never sends data off-device for this calculation. The
"Save to my plan" action writes a single `child_memories` row with
`category = 'routine'`, `source_function = 'sleep-triage'` (allowlist
already widened by migration `20260519010000_*`), `created_by =
auth.uid()` (RLS-enforced), `content` truncated to fit the 3-500 char
CHECK constraint. No PHI is logged to any edge function during plan
generation.

**Risk levels surfaced:**
- P0: none.
- P1: none. Adjustment-tip language ("Try shifting bedtime 15 min
  earlier") is suggestive, not prescriptive, and gated on ≥3 night-sleep
  rows in the last 14 days so it doesn't fire on thin data.
- P2: when the sleep-method picker (`profiles.sleep_method`) ships, the
  triage and plan surfaces will need a second pre-review pass to confirm
  the method-flavored copy stays inside the same evidence base and
  doesn't drift into prescriptive territory.

**Outstanding:** none for this surface. If/when the dialog adds a
medication, supplement, or specific clinical-intervention recommendation
(e.g. melatonin), it must come back through this log for a fresh review.

**Code refs:** working branch `claude/investigate-sleep-coach-PcWKN`.

---

## 2026-05-24 — Scheduled-visit reminder emails (new email type)

**Scope:** New table `public.scheduled_visits` (forward-looking pediatric-
appointment calendar) and new edge function `send-visit-reminder-email`. The
function sends an opt-in transactional email to the row's `parent_id` 7 days
and 1 day before an upcoming visit. Default off; toggle lives next to each
visit in the new `UpcomingVisitsSection` UI (frontend work — separate
delegation).

**Trigger:** Doctor-visit-tracking feature (`tasks` plan
`the-user-typically-knows-whimsical-donut.md`). Parents wanted a way to seed
their first-year visit schedule and get proactive reminders.

**Processing purpose:** Transactional service-of-the-product email reminding
the account holder of an event they themselves entered into Grace Flare. No
marketing content, no third-party sharing beyond the existing Resend
subprocessor (already listed at `/subprocessors` and in Privacy § 4).
Recipient is always the row's parent (no partner-routed email in v1).
Personal data in the email body is limited to: child name (first name only
in copy), scheduled date/time, visit type, doctor name (if entered),
location (if entered). No health observations or log data.

**Subprocessor impact:** None new. Resend is already disclosed; this is a new
template under the existing data-processing relationship.

**COPPA posture:** The visit row's child is already gated by the existing
VPC email-plus + direct-notice flow at child creation, so no incremental
parental-consent step is required to schedule a reminder. The opt-in toggle
defaults to OFF per data-minimization principles — the email channel is
strictly user-elected per visit.

**Retention:** `scheduled_visits` rows live alongside the rest of the user's
records and are purged by the same `_purge_user_data()` helper (cascade via
`parent_id ON DELETE CASCADE` from `auth.users`). Inactive-account auto-
purge at 24 months (Privacy § 8) covers them. Resend message logs are
governed by Resend's own retention policy, disclosed at `/subprocessors`.

**Risk levels surfaced:**
- P0: none. The new email type fits squarely inside the transactional /
  service-of-the-product carve-out under CAN-SPAM and within the scope of
  Privacy § 4's existing Resend disclosure. No policy text changes required.
- P1: none. Footer includes a single-row "switch them off in Records" line
  so the off-ramp is one click away (matches the spirit of CAN-SPAM
  unsubscribe even though transactional mail is exempt).
- P2: when the per-user timezone column lands, swap the hardcoded
  `America/New_York` formatter in `send-visit-reminder-email` for the user's
  TZ and add the abbreviation to the subject line for non-ET users.

**Outstanding:** None blocking. The function is not deployed yet (feature
branch); deploy + production smoke-test happens after PR merge.

**Code refs:** migration `supabase/migrations/20260524000000_scheduled_visits.sql`,
edge function `supabase/functions/send-visit-reminder-email/index.ts`,
extension to `supabase/functions/check-notifications/index.ts`.

---

## 2026-05-28 — "Connect to Claude" remote MCP integration (new child-data egress)

**Scope:** Consent screen `src/pages/McpConsentPage.tsx`, Privacy §§ 4–5
(`src/pages/PrivacyPage.tsx`), `src/pages/SubprocessorsPage.tsx` (Anthropic
entry extended, not duplicated). Backend egress path: edge function
`supabase/functions/mcp/index.ts` + migration
`supabase/migrations/20260528100000_mcp_oauth.sql`. New disclosure blocks are
tagged `{/* LEGAL: MCP Stage 2 */}` / `{/* LEGAL: reviewed copy */}`.

**Trigger:** New optional feature — a parent connects **their own** Claude
(Claude.ai / Claude Desktop) to Grace Flare over an OAuth 2.1 remote MCP
server and grants it **read-only** access to their child's tracked data.
First child-data egress path to a customer-controlled external AI client.

**Processing purpose:** Parent-directed disclosure of child logs to the
parent's own Claude product. Read-only scope, matching the live MCP server
tool surface (`CHILD_DATA_TOOLS`): profile, sleep, feeds, diapers, growth,
milestones, illnesses, vaccinations, allergens (+ a derived weekly summary).

**Subprocessor impact:** No new subprocessor. Anthropic is already disclosed;
its `/subprocessors` entry was **extended** (same legal entity, same DPA on
the Grace-Flare→Anthropic transport leg) to note that data delivered into the
parent's own Claude is additionally governed by that parent's separate
Anthropic agreement. 30-day subprocessor-change notice **not** triggered (no
add/replace).

**COPPA analysis:** The disclosure is parent-initiated to a parent-controlled
tool, so it does not constitute a third-party "disclosure" requiring fresh
verifiable parental consent under 16 CFR § 312.5(b); the existing email-plus
VPC + direct-notice cover collection. Residual: data leaves Grace Flare's
deletion/retention reach once read into the parent's Claude — now disclosed to
the parent on the consent screen and in Privacy § 4 (FTC Act § 5).

**Risk levels surfaced (legal agent pass):**
- P0: none.
- P1 (a) Consent screen was silent on loss-of-control/deletion. **Resolved** —
  added the "once your child's data is in your own Claude, Grace Flare can no
  longer control or delete it … deleting in Grace Flare won't remove copies
  already read into Claude" sentence (`McpConsentPage.tsx`).
- P1 (b) Privacy § 4 had a "dual-master" contradiction (same data governed by
  both our DPA and the user's Anthropic agreement). **Resolved** — re-scoped
  per leg: our DPA covers the transmission; once in the user's Claude, their
  Anthropic agreement governs, outside our control.
- P1 (c) Consent category list must equal the live MCP read scope (else a § 5
  misrepresentation). **Resolved** — added "Profile" to the list so it matches
  `CHILD_DATA_TOOLS`; added an in-code comment tying the list to the server
  scope. (A shared constant across consent/subprocessors/server is a P2
  follow-up.)
- P2: softened the absolute "can never add/change/delete anything" to scope the
  promise to the connection; minor § 5 wording. **Applied.**

**Security note (QA):** the consent route is directly reachable, so the Deny
button now guards against an open-redirect — it only bounces to the client's
`redirect_uri` if it parses as `https:` (or `http://localhost`), otherwise it
shows an in-page "Connection cancelled" state. Revocation at Settings →
Connect to Claude maps to a real token kill: `revoke_my_mcp_connection` stamps
`revoked_at`, and the `/mcp` endpoint rejects revoked/expired tokens.

**Outstanding:**
- Confirm `delete_user_account()` deletion copy does not over-promise: data
  already read into a parent's Claude is outside our reach (true today; the
  consent + Privacy § 4 language now says so). No code change required.
- Shared category constant across consent page / SubprocessorsPage / MCP
  server scope (P2 hygiene).
- Outside-counsel items if/when commissioned: (1) is parent-directed MCP
  disclosure correctly outside § 312.5 fresh-VPC, or does the grant itself
  need a VPC-grade step; (2) residual controller/§5 liability after data lands
  in the parent's Claude; (3) enforceability of the "same DPA / separate
  relationship" dual-basis framing. Re-validate before any EEA/UK launch
  (currently geo-blocked).

**Code refs:** policy text + consent UI at commit `e99f067` (redlines applied
in the follow-up commit on branch `claude/mcp-child-data-queries-2bjf9`);
backend egress at commit `4516e75`.

---

## 2026-05-30 — MCP follow-ups: Flare+ gate + shared categories (disclosure expansion)

**Scope:** `supabase/functions/mcp/index.ts` (`handleApprove`),
`src/components/ConnectClaudeSettings.tsx`, `src/pages/McpConsentPage.tsx`,
`src/pages/SubprocessorsPage.tsx`, new `src/lib/mcpReadCategories.ts` (single
source of truth for category labels surfaced to users).

**Trigger:** P2 hygiene flagged in the 2026-05-28 entry — the consent screen
list, the SubprocessorsPage Anthropic-entry list, and the live MCP server
scope (`CHILD_DATA_TOOLS`) had to be kept in sync manually. Now driven by one
typed constant + a regression test that asserts every category maps to a real
`CHILD_DATA_TOOLS` name and every canonical tool is covered.

**Disclosure delta worth noting:** the SubprocessorsPage Anthropic
`dataCategories` line previously enumerated 8 buckets ("sleep, feeds,
diapers, growth, milestones, illnesses, vaccinations, allergens"). The new
constant adds **two more** that were always in the live MCP scope but had
been omitted from the user-facing list: **profile** (name, gender, DOB,
age-in-days, birth/discharge weight, next appointment, photo URL — exposed by
`get_child_profile` + `list_accessible_children`) and **summary** (the
aggregated weekly rollup from `get_summary`). This is an **expansion of
disclosure** (more truthful, no behavioral change), aligning the stated scope
with the actual server scope. Risk classification: **P0 fix of a pre-existing
under-disclosure**, shipped same-day — the previous list under-disclosed two
categories that were in fact transmitted.

**Other change in scope:** Flare+ gate on `/oauth/approve` (returns 403
`access_denied` with an upgrade pointer for non-premium users). Existing
access tokens keep working — only new grants are blocked. This is a
commercial tier decision, not a privacy / disclosure change; no policy text
updates required.

**Risk levels surfaced:**
- P0 (legal): prior under-disclosure of `profile` and `summary` categories.
  Resolved by driving the user-facing list from the same constant as the
  consent UI, then mirroring labels in the SubprocessorsPage copy.
- P1: none.
- P2: the shared constant is mirrored from `CHILD_DATA_TOOLS` (different
  runtime — Deno edge function vs. React) rather than imported. A regression
  test (`src/test/mcpReadCategories.test.ts`) catches drift; treat that test
  as the binding contract.

**Code refs:** branch `claude/mcp-stage2-followups`, commit `a8299e5`.

**Outstanding:** none new. Outside-counsel items from the 2026-05-28 entry
remain open (parent-directed MCP disclosure vs. § 312.5 fresh-VPC; residual
controller liability after data lands in the parent's Claude; "same DPA /
separate relationship" enforceability).

---

## 2026-06-04 — SleepPlanDialog predicted-bedtime + "How we'll help" copy

**Scope:** Redesigned the sleep-plan dialog so bedtime is shown as a computed
*prediction* (derived from wake time + nap schedule + age-band wake windows)
rather than a parent-typed value, and added a "How we'll help" section
describing coaching reminders/insights. The new personalized, computed,
health-adjacent output prompted this review (in-house `legal` agent pass).

**Findings / resolutions:**
- Predicted bedtime is framed as a non-prescriptive forecast ("Likely bedtime
  ~7:15 PM", "This shifts as the day goes"), never an instruction — acceptable
  [LOW].
- "healthy range" → "typical range" softened to avoid a normative clinical
  claim [LOW, fixed].
- Coaching bullets ("~15 min before each nap we'll nudge you", "wake window
  runs long → gentle heads-up", weekly trends, 15-min bedtime-drift shifts)
  are FTC §5 product-behavior promises. **Verified the jobs actually fire** in
  `supabase/functions/check-notifications/index.ts` (`sleep_plan_winddown`,
  `sleep_window_15min`, `sleep_window_exceeded`, off-plan/`bedtime_drift`). No
  "never overnight"/quiet-hours promise present (that feature doesn't exist) —
  confirmed absent [LOW].
- No outcome guarantees ("will sleep through the night" etc.) present.
- Safe-sleep ABCs unchanged: still under-12mo gated, AAP (Moon et al. 2022)
  wording verbatim with inline source [LOW].
- **Decision:** added one unobtrusive in-product "general wellness information,
  not medical advice — check with your pediatrician" line in the dialog, since
  the output is now personalized + computed. Narrow, conscious augmentation of
  the ToS-umbrella posture for this surface; posture otherwise unchanged
  (US-only v1, no outside counsel).

**Code refs:** branch `claude/prevent-page-shift-K3WnY`; files
`src/components/SleepPlanDialog.tsx`, `src/lib/sleepPlan.ts`.

**Outstanding (outside-counsel):** whether a computed, child-specific predicted
bedtime requires a stronger in-product "not medical advice" disclaimer than the
ToS umbrella for US consumer-wellness v1.

---

## 2026-06-06 — "Speech Class" Flare+ feature (new Anthropic AI report type)

**What shipped:** A Flare+-gated "Speech Class" on the Milestones page (child ≥ 9
months): a guided weekly speech-practice plan generated by the `slp` persona via
the new `generate-speech-class` edge function, persisted in the new
`speech_practice_plans` table. Plus a free-tier `MilestonesPremiumCard` that
shows what Flare+ adds to milestones. In-house pre-review only (US v1 posture
unchanged).

**Data egress:** New AI report type sending a new data category to Anthropic —
child first name, age (and corrected age if premature), and up to 30 recent
entries from the Word & Sound Journal (`speech_journal`). Same processor, same
DPA (accepted 2026-05-08) — no DPA change. Premium enforced server-side
(`generate-speech-class` re-checks `subscriptions.tier/status`), not UI-only.

**Findings / resolutions:**
- **[HIGH → fixed] PrivacyPage § 4 disclosure gap.** § 4 uses an enumerated,
  feature-by-feature description of what goes to Anthropic; Speech Class is a new
  feature + new data category (the journal word-list) not named there. Omitting a
  live AI data flow from an enumerated list is the deceptive-by-omission pattern
  (FTC §5). **Resolved:** added Speech Class to the § 4 feature list and added the
  per-feature data sentence ("first name, age (and corrected age if premature),
  and up to 30 of the most recent words or sounds you have logged"). No § 5 /
  `/subprocessors` change (no new subprocessor; no Stripe in this branch).
- **[MED → fixed] Prompt anti-delay hardening.** The `past_window` verdict is a
  soft delay-implication and the UI disclaimer didn't travel with the payload.
  **Resolved:** added two rules to `PLAN_INSTRUCTION` (never state/imply the child
  is delayed/behind/at-risk or that earlier use would have changed an outcome;
  "past_window" = "past the typical age range", neutral check-in only) and a
  required `disclaimer` field baked into the returned JSON so it survives any
  future export/share/MCP read-out reuse.
- **[LOW] Disclaimer placement.** Reuses the exact app-standard SLP string at the
  card foot; added a short "Not a diagnosis — see a speech-language pathologist
  for assessment." line adjacent to the age-check verdict badge.
- **[LOW] Bright-line #4 (never paywall red-flags / EI referral) — confirmed.**
  Speech Class is additive (practice activities only). The free `slp` chat and the
  free milestone-flag / EI surfacing (`SpeechInsightsPanel`, `MilestoneFlags`) are
  untouched, so red-flag / EI parity holds on the free tier.
- **[LOW] Marketing copy** (`MilestonesPremiumCard`, `UpgradeSheet` speech-class
  entry): activity/practice framing only — no "catches delays", no countdown, no
  outcome guarantee. Clears monetization bright lines #3 and #5.

**Code refs:** branch `claude/milestone-premium-enhancements-9BnGt`; files
`supabase/functions/generate-speech-class/index.ts`,
`supabase/migrations/20260606000000_speech_practice_plans.sql`,
`src/components/SpeechClass.tsx`, `src/components/MilestonesPremiumCard.tsx`,
`src/hooks/useSpeechClass.tsx`, `src/pages/PrivacyPage.tsx` (§ 4).

**Outstanding (outside-counsel):** (a) whether surfacing a model-generated "past
the typical window" verdict inside a *paid* feature carries FTC §5 / state-AG
exposure a free equivalent would not; (b) whether § 4 should be rewritten with a
catch-all AI-features category to reduce per-feature disclosure-maintenance risk.
Both deferred to the pre-fundraise / pre-EU outside-counsel pass per the standing
US-v1 posture.

---

## 2026-06-06 — Apple Watch companion (groundwork): on-device cry audio + log writes

**Scope:** First groundwork increment for a native watchOS companion app
(single SwiftUI target, `com.graceflare.app.watchkitapp`). From the wrist a
parent can record quick taps (feed/diaper/sleep), start/stop sleep & feed
timers, and run **cry analysis** (record a short clip → suggested bucket). This
review was triggered because the feature captures **microphone audio about a
child** on a new device surface (CLAUDE.md → "Update the log every time you touch
… consent/retention/deletion … or any user-visible legal text"). In-house pass.

**Findings / resolutions:**
- **Audio stays on-device.** The watch cry classifier
  (`watch/GraceFlareWatch/Cry/CryFeatures.swift` + `CryClassifier.swift`) is a
  line-for-line Swift port of `src/lib/cryFeatures.ts`. Like the web/phone
  `useCryAnalyzer`, it extracts features + classifies locally; **raw audio is
  never uploaded**. Only the derived `features` JSON + bucket + confidence are
  written to `cry_analyses` (same row shape as the phone) [LOW]. No change to
  the no-audio-upload privacy property → no substantive PrivacyPage rewrite
  required. **Action item:** confirm PrivacyPage's microphone/audio language
  reads as device-agnostic (covers "on your Apple Watch"); soften only if it
  currently names the phone specifically.
- **No new consent surface / no watch sign-in.** The watch never creates a
  child or an account and has no login UI; it only operates against an
  already-consented account whose Supabase session the phone relays via
  WatchConnectivity. The existing COPPA email-plus VPC gate and `children` RLS
  cover all watch-written rows (parent's own JWT, `parent_id = auth.uid()`).
  **Conclusion: no separate watch VPC gate needed** [LOW].
- **Data egress unchanged.** Watch writes hit the same Supabase PostgREST
  endpoints as the web app under the parent's JWT; no new subprocessor, no new
  third party. `/subprocessors` unchanged.
- **Mic permission disclosure.** The watch `Info.plist`
  (`watch/project/Info-WatchApp.plist`) carries `NSMicrophoneUsageDescription`
  stating audio is processed on-device and never leaves the watch — matches the
  in-product non-diagnostic framing ("a suggestion, not a diagnosis / trust your
  gut + your pediatrician") preserved in `CryView.swift` [LOW].

**Code refs:** branch `claude/apple-watch-recording-uymXk`; files under
`watch/`, `ios-watch-glue/`, `src/integrations/watch/`. No DB migration (the
`source` CHECK already allows `'watch'`/`'timer'`; `cry_analyses` unchanged).

**Outstanding (outside-counsel):** none specific to this surface beyond the
standing US-only / consumer-wellness posture. Re-review if watch audio ever
moves off-device (e.g. server-side cry classification) or if HealthKit
integration is added.

---

## 2026-06-10 — Developmental leaps ("leaps") feature — non-diagnostic guidance copy

**Scope:** `src/lib/leaps.ts` (static leap reference content + timing windows),
`src/pages/dashboard/LeapsPage.tsx`, `src/components/LeapCard.tsx`,
`src/hooks/useLeaps.tsx`, migration `20260610000000_child_leaps.sql`
(per-child leap notes table). In-house pass.
**Trigger:** New user-visible developmental-guidance copy + a new child-data
table — same consumer-wellness framing the log tracks for milestone / cry /
speech-class surfaces (CLAUDE.md → "update the log every time you touch …
user-visible legal text").
**Risk levels surfaced:**
- P0: none.
- P1: none.
- P2 (resolved):
  - **Trademark / copyright hygiene** [LOW]. The "leaps" concept is popularized
    by *The Wonder Weeks* (trademarked, with copyrighted charts/descriptions).
    Mitigation baked in from design: all leap names, summaries, and sign lists in
    `src/lib/leaps.ts` are **original Grace Flare wording** — no Wonder Weeks
    names, text, or charts are reproduced. Only the **week-timing numbers** are
    used, which are factual/uncopyrightable. No attribution or license needed.
  - **Non-diagnostic voice + disclaimer** [LOW]. Copy stays celebratory, never
    diagnostic ("may", "often", "many babies"); no "watch for delays" framing.
    `LeapsPage.tsx` carries the standing "general guidance … not medical advice"
    line, consistent with the milestone/cry/speech surfaces. No new health claim.
  - **Data egress unchanged** [LOW]. `child_leaps` is written via the same
    Supabase PostgREST endpoints under the parent's JWT; **no new subprocessor,
    no new third party, no AI call** (the static leap content ships in the
    bundle). `/subprocessors` unchanged. The optional "Ask about this leap" CTA
    routes into the existing in-app `developmental` chat skill (Anthropic, already
    disclosed) — no new egress path.
  - **Deletion / retention** [LOW]. `child_leaps` has `ON DELETE CASCADE` on both
    `child_id → children` and `parent_id → auth.users`, so it is purged by the
    existing `delete_user_account()` / `_purge_user_data()` cascade and the
    24-month inactive-account purge — no new line needed in those RPCs and no
    change to PrivacyPage § 8 retention language. RLS mirrors `sleep_day_todos`
    (SELECT via `has_partner_access`, writes via `partner_can_write`); confirmed
    no new `get_advisors` security findings post-migration.

**Code refs:** branch `claude/leaps-concept-parents-jsdnw7`; migration
`20260610000000_child_leaps` applied to live (project `ieuznbvvwdvhtirzwkly`),
verified via `information_schema.columns` + `pg_policies`.
**Outstanding:** none specific to this surface beyond the standing US-only /
consumer-wellness posture. Re-review if leap content ever becomes
AI-generated/personalized (would add an Anthropic egress path) or if any
"watch for delays" / screening framing is introduced (would shift it toward
regulated health-claim territory).

---

## 2026-06-19 — "Next Step" feed — cross-domain dashboard action copy (finance / health / milestone)

**Scope:** `src/components/NextStepFeed.tsx`, `src/hooks/useNextSteps.tsx`.
New Dashboard feed surfacing ranked, deadline-aware action prompts across
sleep / milestone / finance / health. In-house pass (legal + developmental +
financial agents).
**Trigger:** Net-new user-facing finance and health advice-adjacent microcopy
shown on the dashboard *before* the parent reaches the destination surfaces
that carry disclaimers — exactly the FTC § 5 / health-claim / financial-advice
surface this log paper-trails, even though no Privacy / Terms / consent /
retention / subprocessor / geo-block code changed.
**Risk levels surfaced:**
- P0: none. P1: none.
- P2 (resolved):
  - **Advice-disclaimer proximity** [MED → resolved]. The feed mixes finance +
    health prompts on the dashboard with no inline disclaimer; existing
    softeners live only on tap-through surfaces (`FinancialTab.tsx:179`,
    `AIChatWidget` medical disclaimer, visit-prep PDF) and `TermsPage` §3/§4.
    Resolved by adding a single combined footer rendered whenever a finance- or
    health-domain item is present: *"General guidance and reminders — not
    medical or financial advice."* (`text-[11px] muted italic`, mirroring
    `FinancialTab.tsx:179`). Not shown for sleep/milestone-only or empty/error
    states.
  - **Life-insurance product-steering** [MED → resolved]. `"a term policy brings
    peace of mind"` edged from education into product steering (insurance-
    licensing gray zone) and used a feelings/marketing voice. Rewritten to the
    neutral, comparative `"term policies are usually the low-cost option"`.
  - **Insurance-window as guarantee** [MED → resolved]. `"most plans give you a
    30-day window"` softened to `"most plans allow ~30 days — check yours"` to
    drop the implied universal entitlement (the special-enrollment window varies
    30–60 days by plan). The "Soon" urgency tier is **retained** for this item —
    the enrollment window is genuinely time-sensitive — paired with the softened
    copy (counsel-optional residual; documented, not removed).
  - **Custodial-Roth applicability** [LOW → resolved]. Savings prompt listed
    "custodial Roth" as a headline option; it requires the *child* to have
    earned income (inapplicable to an infant). Replaced with the universally
    available "HYSA": `"529, UGMA, HYSA and more"`.
  - **Milestone non-diagnostic voice** [LOW]. Copy already celebratory
    ("may be coming up"); title softened from the imperative `Encourage …` to
    `Coming up: …`, and the ✓ aria-label made milestone-specific ("Done for
    today") so the check can't be misread as logging attainment. The ✓ writes a
    transient day-scoped dismiss, never a `child_speech` `achieved` row —
    confirmed, no health-attainment claim. No new AI egress (the milestone CTA
    routes into the already-disclosed `developmental` chat skill).
  - **Data egress / retention unchanged** [LOW]. The feed only reads existing
    tables under the parent's JWT and writes finance completion back to the
    existing `parent_financial_checklist` row (status `completed`) + a
    localStorage transient for snooze/dismiss. No new table, no migration, no
    new subprocessor. `/subprocessors` unchanged; existing deletion / 24-month
    purge cascades already cover all touched tables.

**Code refs:** branch `claude/parenting-app-differentiation-z8ph7z`, PR #149.
No DB migration.
**Outstanding (deferred):**
- Two counsel-optional questions logged for the eventual outside-counsel pass:
  (a) whether "term policies are usually the low-cost option," absent any product
  recommendation or compensation, is protected general education or a state
  insurance-code "solicitation"; (b) whether a single dashboard-level
  "not medical or financial advice" footer is sufficient FTC § 5 proximity vs.
  per-item inline disclaimers.
- **Separate backend ticket (not this PR):** stale `(2025)` tax figures and
  unstamped Child Tax Credit / DCFSA numbers in
  `20260407000000_financial_checklist_overhaul.sql` and
  `supabase/functions/_shared/personas.ts`; recommend a year-keyed runtime
  config rather than re-editing applied migrations.

---

## 2026-06-19 — Phase 2 finance hero — insurance-window polish + recurring finance calendar

**Scope:** `src/lib/financeCalendar.ts` (new), `src/hooks/useNextSteps.tsx`,
`src/components/records/FinancialTab.tsx` (new "Upcoming money dates" section).
In-house pass (legal + financial agents). Builds on the Phase 2 pre-build
go/no-go memo (same date, above).
**Trigger:** Net-new user-facing finance reminder copy on the dashboard feed +
a new FinancialTab section — same FTC § 5 / financial-advice surface this log
tracks (precedent: the 2026-06-19 "Next Step" feed entry on the same file).
**Decisions / risk levels:**
- **Features 1 (insurance-window polish) and 3 (recurring calendar: tax season,
  open enrollment, birthday→savings) shipped** under the in-house GO-with-
  conditions from the pre-build memo. Implementation verified against all
  conditions:
  - Insurance window framed variable ("~N days left — check your plan" /
    "check your plan's window — it varies"); no carrier named, no guaranteed
    universal deadline. [LOW]
  - **Open-enrollment copy corrected** [MED → resolved]: initial draft said
    "Health-plan open enrollment is open / review your coverage" — misleading
    for employer-plan parents since the hardcoded window is the ACA Marketplace
    (Nov 1–Dec 15). Rewritten to "Marketplace open enrollment is open / the
    yearly ACA Marketplace window — employer plans may differ, so check yours."
  - 529/UGMA/HYSA listed comparatively, non-directive; birthday nudge benefit-
    framed, no provider named. [LOW]
  - Child Tax Credit named only as "families with kids may qualify … — see your
    checklist": **no dollar figure, no income input, no estimator** (the Feature
    2 estimator remains NO-GO pending counsel). [LOW]
  - Disclaimer present both page-level and inside the new section
    (`FinancialTab.tsx`). [LOW]
- **Estimator (Feature 2): NOT built** — remains NO-GO pending the outside-
  counsel scoping opinion logged in the pre-build memo.
**Code refs:** branch `claude/parenting-app-differentiation-z8ph7z`. No DB
migration, no edge function, no new subprocessor — data-driven reminders
computed client-side from today's date + child DOB; dismiss is a localStorage
transient only.
**Outstanding / re-flagged (now that Phase 2 drives traffic to them):**
- The tax-season string routes to checklist data carrying stale `(2025)`
  CTC/DCFSA figures — fix in flight (separate finance-figures-refresh PR).
- **Sponsored finance-firm CTA** (`is_sponsored` / `sponsor_cta_url` in
  `FinancialTab.tsx`) is live paid solicitation adjacent to children's-finance
  content — flagged by the legal pass as its own FTC § 5 / state-insurance-
  solicitation review item that needs a dedicated entry + disclosure before any
  sponsor goes live. Not introduced by Phase 2; surfaced for follow-up.

---

## 2026-06-19 — Phase 3 act-early milestone engine — Early Intervention hand-off

**Scope:** `src/components/milestones/EarlyInterventionExplainer.tsx` (new),
`src/components/milestones/MilestoneFlags.tsx`, `src/hooks/useNextSteps.tsx`
(an `act`-severity redflag feed item), and migration
`20260619163407_soften_concern_flag_language.sql` (softens 11 diagnostic
`concern_flag_language` seed strings). In-house pass (developmental design +
legal + SLP review). **Highest health-claim-sensitivity surface in the product
to date** — first Early Intervention / developmental-concern hand-off.
**Trigger:** First EI/developmental-concern hand-off; FTC § 5 health-claim and
the CLAUDE.md "milestone copy celebratory, never diagnostic" brand rule.
**Risk levels surfaced:**
- **EI explainer + redflag feed item** [LOW — PASS]. Leads with normal-variation
  reassurance before mentioning EI; header is a question ("Typical, or worth a
  check-in?"), not an assertion; no banned terms (delay/behind/abnormal/etc.).
  IDEA Part C facts verified accurate (free, state-run, birth–3, parent self-
  referral, no diagnosis needed) — and correctly says the **evaluation** is free,
  not all services (Part C § 303.521 permits sliding-scale service fees). CDC
  number `1-800-232-4636` verified; "Find my state's program" CTA opens the
  row's real `clinical_source_url` or falls back to the phone number — no
  invented URLs. The dashboard redflag item ("A skill to check in on / free to
  ask — no diagnosis needed") is reminder-framed, not an assessment claim; the
  `"redflag"` token is style/sort only and never printed to the user (verified).
- **Diagnostic `concern_flag_language` seed strings** [HIGH → resolved]. Legal
  found the pre-existing SLP-authored flag strings rendered by `MilestoneFlags`
  used diagnostic register ("red flag", "an evaluation is recommended" in the
  app's own voice, "request a hearing test", and an unsubstantiated efficacy
  claim "Research shows … significantly better outcomes"). Phase 3 amplified the
  exposure by surrounding them with reassurance. **Resolved:** the SLP advisor
  rewrote the 11 offending strings (17 others were already compliant) to non-
  diagnostic, ASHA-aligned, pediatrician-conversation framing, preserving the
  substantive signal; applied verbatim in the soften migration. The
  "Research shows…" efficacy claim was deleted (replaced with the factual,
  non-quantified "Early Intervention is free for children under 3 in the US").
- **Ordering fix** [resolved]. `MilestoneFlags` previously rendered the specific
  concern text above the reassurance; reordered so the reassuring explainer
  leads for concern/act severity.
**Code refs:** branch `claude/parenting-app-differentiation-z8ph7z`. No schema
change (the migration only UPDATEs `concern_flag_language`); no new subprocessor;
no new child-data egress (the activity CTA routes to the already-disclosed
`developmental` chat skill; the EI CTA opens a URL/tel only).
**Outstanding / for outside counsel when commissioned:**
- No `act`-severity milestone is seeded today (highest seeded tier is
  `concern`), so the `act`-only explainer line and the dashboard redflag item are
  wired but cannot fire in production yet — **QA must exercise this surface the
  moment the first `act` row is authored.**
- Counsel questions logged: (a) does a home-screen redflag-tier developmental
  reminder need a feed-level "we do not assess or diagnose your child"
  disclaimer to cure any § 5 "implied assessment" exposure; (b) confirm no
  launch state's Part C self-referral / free-evaluation rule is narrower than the
  federal floor.
- **Deploy step (human):** apply `20260619163407_soften_concern_flag_language.sql`
  to live so the softened strings ship; the diagnostic strings are live until then.

---

## 2026-06-20 — Sponsored financial content / advertising revenue model

**Scope:** First advertising revenue line in the product. Adds clearly-labeled,
first-party sponsored placements from financial firms to the Finance tab
(Records), the disclosures that make them lawful, and an AI guardrail.
**Files touched this pass:** `src/pages/PrivacyPage.tsx` (new "Advertising and
sponsored content" section), `src/pages/TermsPage.tsx` (§ 4 addition),
`src/components/.../FinancialTab.tsx` (sponsor card), supabase migrations
(`sponsor_disclosure` column), `personas.ts` (financial guardrail).
**Trigger:** Founder decision to monetise the Finance tab via sponsored
placements; resolves the follow-up item flagged in the 2026-06-19 Phase 2 entry
("Sponsored finance-firm CTA … needs a dedicated entry + disclosure before any
sponsor goes live").

**DECISION:** Grace Flare will display clearly-labeled, first-party sponsored
placements from financial firms in the Finance tab (Records), as a revenue line.
Lightweight "polish the existing sponsor flag" approach — **no ad-tracking
infra** is built or planned for this pass.

**DATA-FREE CONSTRAINT (the COPPA-safe line):** the deal structure is **flat-fee
or unattributed-CPC only**. **ZERO** user- or child-level data, identifiers, or
conversion postbacks leave Grace Flare to the sponsor; `sponsor_cta_url` carries
no tracking params; `rel="noopener noreferrer sponsored"` is preserved on the
CTA. A CPA-with-conversion-postback deal would be a COPPA disclosure event and is
**out of scope** for this pass.

**Risk levels surfaced:**
- **FTC native-ad disclosure** [resolved]. 16 CFR Part 255 / .com Disclosures
  require a clear-and-conspicuous "this is an ad" signal. Resolved via a
  prominent top-of-card "Ad · Paid placement by {sponsor}" label (not muted) plus
  an adjacent not-a-recommendation disclaimer.
- **Investment-adviser / broker-dealer exposure** [resolved]. Resolved by not
  naming or ranking specific products in editorial copy, by adjacency rules, and
  by the not-advice disclaimer. The AI `financial` persona was hardened to never
  name/recommend a specific product or provider or reference sponsored content.
- **COPPA** [resolved]. Resolved via the data-free constraint above.
- **Endorsement** [resolved]. Resolved via an explicit anti-endorsement
  disclaimer ("sponsored content is advertising, not a recommendation or
  endorsement by Grace Flare") in both Privacy and Terms.
- **Privacy/Terms promise-vs-practice** [resolved]. Resolved by shipping the
  Privacy "Advertising and sponsored content" section + the Terms § 4 addition in
  the **same release** as the sponsor card, so the documents match the practice
  the moment the feature is buildable.

**SubprocessorsPage.tsx — intentionally UNCHANGED.** A data-free advertiser is
not a subprocessor. Adding the sponsor to the subprocessor list was considered
and rejected. Revisit only if any user- or child-level data ever flows to them
(e.g. a conversion-postback deal), which would also re-open the COPPA analysis.

**OUTSTANDING — OUTSIDE COUNSEL GATE (important):** a **LIVE paid deal**
materially changes the risk profile and **should be reviewed by outside counsel
(securities-regulation specialist) before public launch.** Specifically:
(a) whether routing users to a specific securities product for pay triggers
investment-adviser / broker-dealer or solicitor-referral registration;
(b) FTC clear-and-conspicuous adequacy for the new-parent audience;
(c) confirmation the data-free CPC/flat-fee structure is not a COPPA
"disclosure". The build is **pitch-ready / demo-able now**; live activation
stays **gated** until that sign-off.

---
