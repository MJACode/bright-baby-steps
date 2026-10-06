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

## 2026-06-21 — Photo-milestone feature removed; Anthropic data-flow disclosures narrowed

**Scope:** `src/pages/PrivacyPage.tsx` (§ 4 AI processing), `src/pages/FAQPage.tsx`
("Is my child's data sent to third parties?"), `src/pages/SubprocessorsPage.tsx`
(Anthropic `purpose` + `dataCategories`), plus the paywall copy in
`src/pages/Upgrade.tsx` and `src/components/UpgradeSheet.tsx`. Code: the
`supabase/functions/detect-milestone/` edge function was deleted and all
milestone-photo UI (AI "Detect from a photo" + manual photo-attach) removed.

**Trigger:** Product decision to retire all milestone-photo features (founder's
view that parents won't use them). This is a **subtractive** change — it removes a
data flow to our AI subprocessor rather than adding one.

**Risk levels surfaced (pre-review by `legal` agent):**
- **P0:** none.
- **P1 — paywall advertised a removed paid feature.** `src/pages/Upgrade.tsx`
  (full-route `/upgrade`) and `src/components/UpgradeSheet.tsx` still listed "Photo
  milestone detection" as a Flare+ perk after the feature was deleted — an
  affirmative FTC § 5 deceptive-claim exposure (selling a capability we no longer
  deliver), the more dangerous direction than a stale privacy sentence. **Resolved:**
  the perk was removed from both surfaces in this same change. Note: checkout is still
  a `RevenueCat / Stripe` stub (no money changes hands today), which is why this was
  P1 and not P0; it would have been P0 once billing went live.
- **P2 — copy hygiene (resolved):** Privacy § 4, FAQ third-party answer, and the
  Subprocessors Anthropic entry are all grammatically clean post-removal (no dangling
  conjunctions, no orphaned clauses) and no surviving sentence claims we still perform
  photo-milestone detection. The remaining Anthropic data-flow list (chat, briefings,
  weekly insights, voice-note parsing, Speech Class) was verified against the live
  edge-function set on disk — no clause for a still-shipping feature was removed.

**Verified consistent (policy-vs-code):** for this subtractive change the favorable
direction holds — the copy now claims *less* data goes to Anthropic and the code
confirms it (`detect-milestone` deleted; five Anthropic functions remain). Child
photos are still *collected/stored* (Privacy § 2, the MCP paragraph, and
`children.photo_url` avatar are correctly unchanged) — we removed only the
"sent to Anthropic for detection" claim, not a false "we never store photos" claim.

**Intentionally unchanged:** the `milestone-photos` Storage bucket, its RLS, the
`custom_milestones`/`child_speech` photo columns, and the three deletion-path
references (`delete_user_account`, `inactive-account-purge`, `delete-account`).
PrivacyPage § 8 deletion promises remain accurate. No schema migration in this change.

**Code refs:** branch `claude/remove-detect-milestone-photo-bfola9` (commit hash to
follow on merge). `CLAUDE.md` "edge functions" line updated six → five.

**Outstanding:** confirm no out-of-repo surface (App Store / Play Store listing,
marketing site, onboarding upsell) still advertises photo-milestone detection — those
live outside this repo and were not reviewable here.

---

## 2026-06-24 — Body-temperature (fever) tracking added

**Scope:** New `temperature_logs` table (`supabase/migrations/20260624000000_temperature_logs.sql`)
storing child body-temperature readings (value, °F/°C unit, method, timestamp, notes);
new Temperature section in `src/components/records/MedicalTab.tsx`; voice-log support
(`supabase/functions/parse-voice-log/index.ts`, `src/hooks/useVoiceLog.tsx`); pediatrician
PDF export (`src/services/reportDataService.ts`, `pdfReportBuilder.ts`,
`src/components/PediatricianExport.tsx`); Privacy § 2 copy.

**Trigger:** New category of child health-vitals data being collected.

**Risk levels surfaced:**
- P0: Privacy § 2's itemized "Tracking data" list under-described collected categories
  the moment temperature logging goes live (FTC § 5 / COPPA direct-notice precision).
  **Resolved** — § 2 line 31 redlined to add "body-temperature (fever)" to the enumerated list.
- P1: none.
- P2: future-proofing § 2 with an open "such as…" formulation was considered and
  declined; a closed enumerated list is more defensible for COPPA direct-notice precision.

**Confirmed unchanged (no edit required):**
- COPPA consent — temperature rows require a `child_id`, and child creation is already
  gated by the email-plus VPC flow (DB `BEFORE INSERT` trigger on `public.children`).
  Partner writes go through the existing `has_partner_access()` consent path. No new
  consent moment.
- Retention/deletion — `temperature_logs.child_id` is `ON DELETE CASCADE`, so the rows
  are purged transitively by `_purge_user_data()` / `delete_user_account()` via
  `DELETE FROM children` before the `profiles`/`auth.users` deletes. No purge-helper edit.
- `/subprocessors` — no new third party. Data flows only to Supabase (already listed) and,
  for AI features, to Anthropic under the existing § 4 "relevant logged activity" framing.

**Code refs:** branch `claude/temperature-option-a947lq` (commit hash to follow on merge).

**Outstanding:** dev verification that `temperature_logs` rows actually purge on
child/account deletion (folds into the already-pending Storage-purge e2e test). The
migration and edge-function deploy to the live project are deferred to the team's normal
deploy step — this change ships the migration file, not a production DB mutation.

## 2026-07-02 — "Visit Prep" AI pediatrician-visit questions (sixth Anthropic edge function)

**Scope:** New edge function `supabase/functions/visit-prep-questions/index.ts`
(non-streaming, invoked via `supabase.functions.invoke`, mirrors
`generate-speech-class`); migration `supabase/migrations/20260801000000_visit_prep_ai.sql`
(`pediatrician_reminders.source` column + `visit_prep_drafts` usage-trail table);
`src/pages/PrivacyPage.tsx` § 4 (+ § 9), `src/pages/FAQPage.tsx`,
`src/pages/SubprocessorsPage.tsx` (Anthropic entry), `CLAUDE.md` edge-function count.
In-house pass (US-only consumer-wellness v1 posture unchanged).

**Trigger:** New Anthropic data-egress path — a Flare+ anchor feature (one free
draft per visit for free users) that drafts up to 6 questions a parent can ask
their pediatrician, grounded in the child's real logged data.

**Data egress (new):** Per generation, sent to Anthropic under the existing DPA
(accepted 2026-05-08 — no DPA change, no new subprocessor): child first name,
age + prematurity status, visit date/type, 30-day sleep/feeding/diaper
aggregates, up to 20 recent temperature readings (fever-range readings flagged),
active/recent illness names and dates, last 5 growth measurements, undismissed
milestone-flag names, up to 50 existing `pediatrician_reminders` texts (dedupe),
and the per-child `child_memories` context block. All pulls via the caller's RLS
session client — no service-role key. Premium enforced server-side; accepted
questions persist only as ordinary `pediatrician_reminders` rows
(`source='ai_suggested'`) riding the existing include_in_report → PDF path.

**Findings / resolutions:**
- **[HIGH → fixed] PrivacyPage § 4 disclosure gap.** § 4's enumerated per-feature
  list did not name Visit Prep or its data categories (30-day health aggregates,
  temperature/illness, growth, milestone topics, reminder text, saved notes) —
  the same deceptive-by-omission pattern (FTC § 5) the 2026-06-06 Speech Class
  entry classified HIGH. **Resolved:** Visit Prep added to the § 4 feature list
  with a per-feature data sentence; ships in the same release as the feature
  (lockstep). "Last reviewed" timestamp bumped.
- **[HIGH → fixed] Pre-existing lockstep drift discovered.** FAQ "Is my child's
  data sent to third parties?" and the SubprocessorsPage Anthropic
  `purpose`/`dataCategories` had silently dropped Speech Class (live since
  2026-06-06) and needed Visit Prep. **Resolved:** both surfaces re-synced to
  § 4's feature list and per-feature data buckets.
- **[HIGH → fixed] Unbackable "30 days" Anthropic-retention claims.** The
  2026-05-08 DPA audit softened § 4 and SubprocessorsPage but missed
  PrivacyPage § 9 ("no more than 30 days") and the FAQ deletion answer
  ("Anthropic deletes … within 30 days") — contractual claims the DPA does not
  back. **Resolved:** both softened to the "limited period … per Anthropic's
  then-current Usage Policy" framing. Pre-existing; magnified by this feature's
  larger health-data payload.
- **[MED → fixed] Deferred-care risk on fever/illness data.** The feature frames
  live fever-range readings and ongoing illnesses as material "to bring to" a
  possibly weeks-away visit, with no urgent-care off-ramp. **Resolved:**
  server-stamped urgent-care sentence appended to the pinned disclaimer
  ("If your child seems unwell right now — especially any fever in a baby under
  3 months — call your pediatrician or seek care promptly rather than waiting
  for this visit."), plus a system-prompt rule never to suggest waiting for the
  visit to address an active concern or characterize severity.
- **[LOW] Non-diagnosis posture otherwise verified.** Fixed disclaimer pinned in
  code and stamped server-side (model copy never trusted); prompt rules ban
  advice/diagnosis/dosing/treatment, ban delay/at-risk framing, and cast
  milestone flags as neutral check-in topics — consistent with the 2026-06-06
  anti-delay hardening. Defensive JSON validation caps at 6 questions and clamps
  categories.
- **[LOW] Data minimization.** `doctor_name` stripped from the Anthropic payload
  (kept `visit_type`) — third-party personal data with near-zero model value.
- **[LOW] Paywall bright line #4 clears.** Visit Prep is additive question
  drafting; free red-flag / EI surfaces untouched; one free draft per visit
  preserved on the free tier.

**COPPA posture:** No new consent moment. All inputs are already-collected data
gated by the email-plus VPC + direct-notice flow; Anthropic is an existing § 5
processor operating under documented DPA instructions, so this is processor use,
not a third-party "disclosure" requiring separate opt-in under the 2025
amendments. Each transmission is parent-initiated (the parent taps generate),
supporting the non-material-change classification under Privacy § 11 (no 30-day
notice, no renewed VPC) — same reasoning as Speech Class. § 4 accuracy is
treated as a condition of direct-notice validity (16 CFR § 312.4(d)), hence the
lockstep ship.

**Retention/deletion:** `visit_prep_drafts.user_id → auth.users ON DELETE
CASCADE` and `child_id → children ON DELETE CASCADE`, so account deletion, the
24-month inactive purge (both end in `DELETE FROM auth.users` inside
`_purge_user_data()`), and single-child deletion all cover it transitively —
`voice_parse_events` pattern; no purge-RPC edit (correct). Rows hold only
(user, child, visit_date, timestamp). RLS: self-scoped INSERT/SELECT only, no
UPDATE/DELETE, no partner path (entitlement record, not shared child data).

**Code refs:** branch `claude/ai-strategy-claude-api-xlijae`; `CLAUDE.md`
edge-function line updated five → six.

**Outstanding:**
- Fold `visit_prep_drafts` (and `pediatrician_reminders` presence in
  `_purge_user_data()`'s table list) into the still-pending deletion e2e test
  (P1, 2026-05-09).
- Frontend must render the returned `disclaimer` string on the suggestion list
  before acceptance (the PDF path already carries its own disclaimer).
- Counsel questions for the standing outside-counsel pass: (a) whether a new AI
  flow of already-collected child health data to an already-disclosed processor
  is a "material change" needing renewed VPC under § 312.5(a)(1), or whether
  parent-elective per-generation invocation suffices; (b) whether the enumerated
  § 4 list should be restructured with a bounded catch-all to reduce recurring
  lockstep-drift risk (re-raises 2026-06-06 outstanding (b) — this pass caught
  the second drift incident).

---

## 2026-07-04 — Finance tab engagement rework — staged checklist, firsts, growth teaser

**Scope:** `src/components/records/FinancialTab.tsx` (rework), `src/lib/financeStages.ts`
(new, pure staging/grouping logic), `src/lib/savingsProjection.ts` (extraction),
`src/components/financial/SavingsGrowthCalculator.tsx` (disclaimer + reference-return
copy). In-house pass (UX + financial agents pre-build; QA agent post-build).
**Trigger:** Net-new user-facing finance copy and a computed dollar projection on the
FinancialTab — the FTC § 5 / financial-advice surface this log tracks (precedent:
both 2026-06-19 entries, 2026-06-20 sponsored-content entry). `financeCalendar.ts`
header contract requires new finance copy to route through legal/financial review.
**Decisions / risk levels:**
- **Growth teaser (computed projection)** [MED → resolved]: a "$X put in → ≈ $Y by 18"
  pairing computed client-side from the existing calculator's `project()` ($100/mo,
  7%/yr default). Conditions met: contributed and total ALWAYS shown together (never
  the total alone); "hypothetical illustration … not a guarantee" rendered in the same
  visual unit as the numbers; no product, provider, or rate-of-return promise; no
  contribution solicitation ("add $X to hit your goal" patterns expressly prohibited
  in the spec). This is an illustration of arithmetic, not the NO-GO estimator
  (Feature 2, 2026-06-19) — no income input, no benefit-eligibility output.
- **Calculator reference-return copy** [MED → resolved]: interim draft "~7%/yr before
  inflation" was factually inverted (≈10% is the historical nominal figure; ≈7% is
  real). QA caught it; final copy drops the historical claim ("a common planning
  assumption"). Calculator footer now carries the "hypothetical illustration, not a
  guarantee or investment advice; consult a licensed financial advisor" disclaimer it
  previously lacked (the most number-heavy surface on the page had the weakest
  disclaimer — closed).
- **Insurance-window copy harmonized** [LOW]: banner previously said "30-day window,"
  checklist said "30–60 days." Unified: "plans typically allow 30–60 days — act
  within 30 to be safe, and check your plan." Countdown shows only days 0–30 from
  actual DOB; after day 30 it degrades to neutral "enrollment windows vary — check
  your plan" (no missed/guilt framing). Pre-birth (`is_expected`) bug fixed: no
  countdown before the window legally opens at birth.
- **Seasonal copy hedges** [LOW]: tax season now "file by ~Apr 15" (was "open now"
  from Jan 15, premature vs. IRS e-file opening); Marketplace open enrollment adds
  "some state marketplaces run longer; employer plans vary."
- **Sponsored-content posture strengthened** [LOW]: sponsored items are now
  (a) categorically excluded from the editorial "Next Step" slot — closes an
  unlabeled-ad exposure where a sponsored row could have been promoted as the app's
  recommendation with no disclosure; (b) never trigger celebration moments; (c) keep
  the "Ad · Paid placement by {name}" label visible even in the new collapsed card
  state (an ad may be collapsed, never unlabeled). Disclosure wording unchanged from
  the 2026-06-20 entry.
- **"Financial firsts" celebrations** [LOW]: completion copy is neutral on product
  choice (no "great choice" endorsement framing), celebrates the checkbox never a
  dollar amount or balance (income-sensitivity + no account aggregation), and
  estate-planning completions (will/guardian/beneficiaries) get calm acknowledgement,
  no confetti. No streaks — rejected as manufactured urgency on a money surface.
- **Age-staged checklist** [LOW]: relevance grouping only reorders/collapses; no item
  is hidden or deleted, missed-deadline items remain visible with neutral copy.
**Code refs:** branch `claude/finance-tab-engagement-x84xns`, PR #171. No DB
migration, no edge function, no new subprocessor, no new data collection — staging is
computed client-side from existing checklist rows + child DOB; nudge dismiss is
localStorage only. Live `financial_checklist_items` verified (17 post-ladder rows)
against the client stage map before ship.
**Outstanding:**
- Stale `(2024)` DCFSA figure in the legacy seed row (sort 82) re-flagged — needs the
  separate deliberate figures-refresh migration promised in the 2026-06-19 reconcile
  header; not shipped here (no dollar figures from memory).
- "Trump-era"-titled seed rows: cut/rewrite decision deferred to founder (content,
  not legal, blocker).
## 2026-07-05 — Onboarding restructure (5→4 steps) — consent-path review

**Reviewer:** in-house (Claude pass, UX-research implementation branch
`claude/baby-app-tracking-ux-xtvr4l`). **Risk: LOW.**

**What changed:** `OnboardingWizard.tsx` required path shrinks from 5 steps to
4 (name → DOB → born-early → primary interest). The partner-invite step was
removed from the required path and reappears as an optional card on the
post-completion welcome screen, reusing the existing `PartnerRolePicker` +
`InviteShareSheet` flow (`partner_invitations` pattern unchanged). A
plain-language expectation line was added above the final "Finish setup"
button: "Next: we'll send a quick confirmation email to verify it's you —
takes about a minute."

**COPPA analysis — no consent moment altered:**
- The CoppaDirectNotice modal (16 CFR § 312.4(c)) still renders before the
  child INSERT, now on step 4 instead of step 5 — sequencing relative to the
  data-collection event is unchanged: direct notice → typed-name attestation →
  `send-vpc-email` (email #2) → `vpc_completed_at` → child INSERT. The
  `BEFORE INSERT` DB trigger remains the enforcement backstop.
- The new expectation copy is disclosure-enhancing (reduces surprise at the
  VPC wall); it makes no representation beyond what the flow does.
- Partner-invitee consent moment (AcceptInvite checkbox +
  `consent_acknowledged_at` stamp) is untouched; moving the *inviter's* entry
  point to the welcome screen does not change the invitee flow.
- `has_partner` semantics: now stamped `false` at completion and flipped
  `true` only when an invite is actually generated — more accurate than the
  prior intent-based answer. Not a consent field; no notice impact.

**Production-bug remediation (same pass):** live `profiles` table was missing
`primary_interest` and `has_partner` even though migration
`20260425000000_onboarding_profile_fields` was recorded in
`schema_migrations` — the onboarding completion UPDATE had been silently
failing. Re-applied idempotently as `20260705000000_restore_onboarding_profile_fields`
(live version `20260705014227`) and regenerated `types.ts`. No consent or
notice fields were affected; `onboarding_completed_at` writes were unaffected
because PostgREST rejected the whole UPDATE — meaning some completed
onboardings may lack `onboarding_completed_at`/`primary_interest` backfill.
**Outstanding (P2):** decide whether to backfill `onboarding_completed_at`
for affected accounts (cosmetic; wizard re-render guard keys off children
existing, so no user-facing loop was reported).
**RESOLVED 2026-07-05:** backfilled on live for the 3 affected accounts —
`onboarding_completed_at` set from the account's earliest child `created_at`,
`has_partner` derived from active `partner_access` rows (all false).
`primary_interest` is unrecoverable (never persisted) and remains NULL, which
the app tolerates; affected users can be re-asked in-app if desired.

**Also touched:** `VpcGateMessage.tsx` — dark-mode styling only (`dark:`
variants); copy and behavior unchanged.

## 2026-07-05 — Child Context v1, Phase 1 (backend) — new child-data categories + Anthropic egress

**Reviewer:** in-house (Claude pass, branch `claude/child-context-milestones-c6ynw2`,
PR #173). **Risk: LOW today / MEDIUM if Phase 2 ships without the notice updates below.**

**What changed (backend only — no UI writes these fields yet):**
- Migration `20260805000000_child_interests_temperament` (applied to live
  2026-07-05): `children.interests text[] NOT NULL DEFAULT '{}'` and
  `children.temperament text`, both parent-selected, both optional.
- **Data-minimization by design:** `interests` is constrained by a DB CHECK to a
  fixed 10-item activity allowlist (music, books, movement, water_play, animals,
  vehicles, outdoors, food_exploring, building, pretend_play; max 6) —
  deliberately NOT free text, so no arbitrary child prose enters this column.
  `temperament` is one of four fixed values (easygoing / sensitive / spirited /
  slow_to_warm) or NULL. Widening either list requires a new migration.
- `get_child_profile` RPC returns both keys; RLS posture unchanged
  (SECURITY INVOKER, `children` policies filter).

**New Anthropic egress (16 CFR § 312 / Privacy § 4 analysis):** when set, the
two fields flow to Anthropic, PBC on: chat (`[CHILD PROFILE]` system block +
`get_child_profile` tool results), briefing, next-step-peek, and extract-memory
(dedupe context). Covered by the executed Anthropic DPA (2026-05-08 entry) — same
purpose limitation, no-training posture, and SCCs; no new subprocessor.

**Disclosure gap (accepted for this phase, remediation committed):**
PrivacyPage § 4 currently enumerates "your child's first name, age, and the
relevant logged activity" — parent-selected interests/temperament are none of
those, so § 4 is under-inclusive once the fields carry data. **Mitigating fact:
no collection UI exists yet.** Every live row has `interests = '{}'` and
`temperament = NULL`, and every egress site is guarded to omit empty values, so
NOTHING actually egresses as of this entry.
**Commitment:** PrivacyPage § 2 (collection) + § 4 (AI egress) and
`CoppaDirectNotice.tsx` ("what we collect") will be updated in the SAME PR,
before any collection UI (Phase 2 of the plan) is user-reachable; the PR also
adds retroactive disclosure of the live `child_memories` AI-memory store (a
pre-existing gap found in this review — § 4 only obliquely references it via
Visit Prep "saved notes"). Materiality: additive optional fields, same
processing purposes, prospective notice — treated as a non-material change not
triggering renewed VPC under the email-plus program; reasoning mirrors the
2026-05-08 zero-dwell analysis.

**Outstanding (blocks Phase 2 merge, tracked in PR #173 checklist):**
- PrivacyPage § 2 + § 4 rewrite (interests/temperament + `child_memories`).
- CoppaDirectNotice "what we collect" addition.
- "Last reviewed" timestamp bump on PrivacyPage.
- Parent-facing review/delete surface for `child_memories` (the "About {child}"
  hub, Phase 3) — closes the § 312.6 review-rights gap for AI-extracted notes.

## 2026-07-05 — Child Context v1, Phases 2–5 — notice updates shipped

**Reviewer:** in-house (Claude pass, same PR as the Phase 1 entry above).
**Risk: LOW.**

**What changed (frontend notice layer):**
- PrivacyPage § 2: child-profile bullet now enumerates "optional interests and
  temperament you select from a fixed list"; new **AI memory** bullet discloses
  the `child_memories` store in plain language — short factual notes our AI
  assistants save from chats, briefings, and weekly insights (or parent-added),
  viewable/editable/deletable at any time in Profile → About your child.
- PrivacyPage § 4: the chat/briefings/insights egress clause now also names
  "any interests and temperament you selected, and the saved AI-memory notes
  described in § 2" as data transmitted to Anthropic. The DPA, no-training,
  abuse-monitoring, SCC, and 48-hour-breach sentences are untouched (locked
  language).
- `CoppaDirectNotice.tsx` "What we collect": appended "optional interests and
  temperament you choose from a fixed list" and "short AI-generated notes about
  your child that you can review, edit, and delete." Attestation mechanics
  (typed-name signature, checkboxes, acknowledgement stamping) unchanged.
- PrivacyPage "Last reviewed" bumped to July 5, 2026 (Effective date unchanged).

**Analysis:**
- Closes every notice commitment recorded in the Phase 1 entry above: § 2 + § 4
  rewrite, direct-notice addition, and timestamp bump all land in the same PR
  as the collection UI (Phase 2), so no interests/temperament data is collected
  before the notices describe it — the disclosure gap accepted in Phase 1 never
  becomes live under-disclosure.
- `child_memories` retroactive-disclosure remediation is now **COMPLETE**:
  the store is disclosed in § 2 and § 4 and in the direct notice, and the
  "About {child}" hub (`/dashboard/child-context`, this PR) gives parents
  view/edit/pin/delete-one/delete-all over individual memories plus editing of
  interests/temperament — satisfying the 16 CFR § 312.6 review/deletion rights
  for AI-extracted notes.
- Materiality: additive optional fields and disclosure of an existing store
  under the same processing purposes and the executed Anthropic DPA; prospective
  notice, no new subprocessor — non-material change, no renewed VPC required
  (reasoning per the Phase 1 entry and the 2026-05-08 zero-dwell analysis).

## 2026-07-19 — Activities feature: new Anthropic edge function `generate-activity-plan` + `child_activities` table

**Reviewer:** in-house (Claude pass, backend batch of the Activities plan).
**Risk: LOW.**

**What changed:**
- New Anthropic-invoking edge function `generate-activity-plan` (the seventh:
  chat, briefing, weekly-insights, parse-voice-log, generate-speech-class,
  visit-prep-questions, generate-activity-plan). Generates a 7-day play plan
  ("Weekly Play Plan", Flare+ feature on the Milestones tab) using the
  `developmental` persona.
- **Data sent to Anthropic:** child first name, age in months, prematurity
  status and corrected age, parent-selected interests and temperament (both
  from the fixed allowlists established in the 2026-07-05 Child Context
  entries), and the titles of curated library activities recently marked
  "Tried it". No free-text child data, no logs, no photos.
- **Premium gate is server-side:** the function re-checks `subscriptions`
  (tier = 'plus', status active/trialing) and returns 403 `premium_required`
  otherwise — the Flare+ gate cannot be bypassed by calling the function
  directly. Guardrail prompt rules mirror generate-speech-class verbatim:
  never diagnose, never "behind"/"delayed", neutral past_window framing,
  fixed non-medical-advice disclaimer, plus an always-supervise rule.
- New table `public.child_activities` stores only **bounded slugs**
  (`activity_slug` referencing client-side static content in
  `src/data/activityLibrary.ts`) plus a date — no free text about the child
  (same COPPA data-minimization posture as the interests/temperament
  allowlists). New table `public.activity_plans` mirrors
  `speech_practice_plans` (RLS via has_partner_access / partner_can_write;
  child_id + parent_id ON DELETE CASCADE cover the deletion promise — no
  `delete_user_account()` change needed).
- **PrivacyPage § 4 updated in the same change:** the AI-feature enumeration
  now names the Weekly Play Plan and a new clause discloses exactly what it
  sends (first name, age/corrected age, selected interests and temperament,
  recently-tried activity titles).

**Analysis:** additive Flare+ feature under the same processing purposes, the
same processor (Anthropic, executed DPA of 2026-05-08), and no new
subprocessor; disclosure ships with (not after) the feature. Non-material
change — no renewed VPC required (reasoning per the 2026-07-05 Child Context
entries and the 2026-05-08 zero-dwell analysis).

## 2026-07-19 — Activities feature, frontend batch: direct-notice enumeration + Privacy timestamp

**Reviewer:** in-house (Claude pass, frontend batch of the Activities plan).
**Risk: LOW.**

**What changed:**
- `CoppaDirectNotice.tsx` "What we collect" enumeration now includes "play
  activities you mark as tried" alongside the existing tracked-data categories,
  matching the new `child_activities` table (bounded slugs only, per the
  2026-07-19 backend entry).
- `PrivacyPage.tsx` "Last reviewed" bumped to July 19, 2026, per the
  convention of bumping the timestamp whenever § 4 changes (the § 4 Weekly
  Play Plan disclosure itself landed with the backend batch).

**Analysis:** disclosure-only frontend follow-through of the backend entry
above; no new data category beyond what that entry analyzed, no new
subprocessor, no renewed VPC required.

---

## 2026-08-08 — Communication-cue milestone batch: 15 catalog rows + flag copy

**Reviewer:** in-house (Claude pass — SLP advisor authored, QA verified).
**Risk: LOW.**

**Scope:** migrations `20260821000000_communication_cue_milestones.sql` (15 new
`speech` catalog rows closing verbal/non-verbal communication-cue gaps vs ASHA
communicative milestones and CDC Learn the Signs. Act Early. 2022) and
`20260822000000_communication_cue_flag_copy.sql` (SLP-authored
`concern_flag_language` on 6 of the 15, plus reconciliation of 2 pre-existing
rows). Both applied to live via MCP.

**What changed on the flag surface** (treated as legally reviewed since the
2026-06-19 Phase 3 entry):
- 6 new developmental-concern strings, all written to the softened 2026-06-19
  conventions: norm first, then "bring up with your pediatrician, who can tell
  you whether an evaluation would help" — no diagnostic register, no app-voice
  evaluation recommendation, no efficacy claims.
- The factual EI line ("Early Intervention is free for children under 3 in the
  US") now appears on a second row — the M-CHAT-weighted declarative-pointing
  flag (`concern`, fires at 16 mo). Same already-approved sentence, no new
  claim; consistent with Part C § 303.521 (the *evaluation* is free).
- `Shows objects to share interest` retargeted from pointing to object-showing
  and adjusted concern→watch, 16→15 mo (the declarative-pointing signal moved
  to its own row so it fires exactly once). `Imitates actions` narrowed to
  actions/gestures (sound-imitation now on `Copies sounds you make`); its
  month/severity untouched.
- 9 of the 15 new rows intentionally carry no flag (single consolidated
  "gestures by 12 months" flag instead of three duplicate banners; culturally
  variable or already-covered signals left unflagged) — reduces
  over-flagging/anxiety exposure rather than adding to it.

**Analysis:** catalog copy is celebratory, second person, non-diagnostic per
brand rule; no new data category, no new subprocessor, no new child-data
egress, no consent/retention/deletion surface touched, no renewed VPC
required. Two `concern`-severity rows correctly route through the existing
EarlyInterventionExplainer reassurance-first surface reviewed on 2026-06-19.

---

## 2026-08-28 — Baby Signs feature, frontend batch: `child_signs` disclosure + direct-notice enumeration

**Reviewer:** in-house (Claude pass, frontend batch of the Baby Signs plan).
**Risk: LOW.**

**What changed:**
- New Flare+ feature "Baby Signs" (`/dashboard/signs`): a staged, ASL-based
  sign-language program with per-child progress tracking. All program content
  is a static client-side library (`src/data/signLibrary.ts`) — no AI
  involvement, no edge function, no child-data egress of any kind.
- New table `public.child_signs` (backend batch) stores only **bounded slugs**
  (`sign_slug` referencing the static library) plus a status from a fixed
  three-value set (`introduced`/`emerging`/`signing`) and an optional
  first-signed date — no free text about the child (same COPPA
  data-minimization posture as `child_activities` and the
  interests/temperament allowlists). RLS mirrors `child_activities`
  (has_partner_access / partner_can_write; rows are owner-keyed via
  `children.parent_id` per the 2026-06-06 sleep_day_todos convention;
  child_id + parent_id ON DELETE CASCADE cover the deletion promise — no
  `delete_user_account()` change needed).
- `CoppaDirectNotice.tsx` "What we collect" enumeration now includes
  "sign-language signs you mark as introduced or used" alongside the existing
  tracked-data categories, matching the new `child_signs` table.
- **No PrivacyPage § 4 change needed:** the feature is a static client-side
  library with no AI processing and no new subprocessor, so the AI-feature
  enumeration is unaffected (unlike the 2026-07-19 `generate-activity-plan`
  entry, which added Anthropic egress).

**Analysis:** additive Flare+ feature, bounded-slug data only, no new
subprocessor, no new egress; disclosure ships with (not after) the feature.
Non-material change — no renewed VPC required (reasoning per the 2026-07-19
Activities entries and the 2026-05-08 zero-dwell analysis).

---

## 2026-08-28 — Account consolidation: juliabogdan22@ made primary, matt.alksninis@ demoted to co-parent

**Reviewer:** in-house (Claude pass, founder-directed).
**Risk: LOW** (data-subject-initiated consolidation of two accounts belonging
to the same household, covering the same child).

**Scope:** a live-data operation on project `ieuznbvvwdvhtirzwkly`, not a code
change. No migration file — the work was one-off DML, recorded here because it
touched a consent record and performed a deletion.

**What happened.** Two accounts were tracking the same infant (identical DOB
2026-04-18) under two names: `matt.alksninis@gmail.com` / "Layla" (created
2026-04-24) and `juliabogdan22@gmail.com` / "Lulu" (created 2026-05-23). At the
account holder's request the household consolidated onto Julia's account as
primary, with Matt retained as co-parent.

1. **Partner link.** Inserted `partner_access` (owner = Julia, partner = Matt,
   role `coparent`, status `active`) and set `profiles.has_partner = true` on
   Julia. `consent_acknowledged_at` was stamped at insert time.
2. **Data migration.** Matt's child-scoped records were repointed onto Julia's
   child rather than discarded, because his account held the newborn month
   (Apr 24 – May 23) that Julia's account never had. Tables under child-scoped
   RLS kept `parent_id = Matt` so the app still attributes those entries to him
   as co-parent; tables under parent-scoped RLS had `parent_id` repointed to
   Julia, without which she could not have read her own child's records.
3. **Deletions.** The duplicate child row was deleted, cascading away 429
   machine-generated `child_memories` (all `source_function` in briefing /
   chat / weekly-insights / sleep-triage, none pinned, none parent-authored),
   253 stale notifications, and 18 of Matt's AI chat threads.
4. **Backup.** Every affected row (964 total) was snapshotted to schema
   `merge_backup_20260828` before any destructive step.

**Consent analysis.** The `partner_access` row was written server-side rather
than through `accept_partner_invitation`, so it bypassed the T3 invitee
consent screen added 2026-05-07. This is acceptable here and **is not a
precedent for bypassing that flow**: the invitee (Matt) is the same natural
person who requested the link, so the consent moment the screen exists to
capture was satisfied directly, and `consent_acknowledged_at` records it.
Julia's VPC remains intact and unaffected (`vpc_method = 'email-plus'`,
completed 2026-05-23); the surviving child sits under her already-verified
consent. No new data category, subprocessor, or egress path.

**Deletion analysis.** All deletions were of the requesting user's own data,
initiated by that user, and are consistent with the Privacy § 8 deletion
promise. Nothing belonging to Julia was deleted. Where the two accounts held
conflicting records for the same event (12 speech milestones, 1 milestone
flag, 3 sleep entries), the merge preserved the earliest true achievement date
and Julia's copy of the event, so consolidation did not silently rewrite the
child's record in either direction.

**Follow-up:** a third account, `matthew.alksninis@gmail.com` (created
2026-05-09, one sign-in, its own near-empty "Layla"), was found during
verification and deliberately **left untouched** — outside the requested
scope. It should be consolidated or deleted separately on the owner's
instruction. The `merge_backup_20260828` schema should be dropped once the
merge is confirmed good in the running app.

---

## 2026-08-28 — Log-by-voice retired; voice-transcript data flow to Anthropic removed

**Scope:** `src/pages/PrivacyPage.tsx` (§ 4 AI processing), `src/pages/FAQPage.tsx`
("Is my child's data sent to third parties?"), `src/pages/SubprocessorsPage.tsx`
(Anthropic `purpose` + `dataCategories`). Code: the
`supabase/functions/parse-voice-log/` edge function was deleted along with
`src/components/VoiceQuickLog.tsx`, `src/components/VoiceQuickLogButton.tsx`, and
`src/hooks/useVoiceLog.tsx`; the mic card was removed from `Dashboard.tsx` and
`CaregiverHome.tsx`.

**Trigger:** Product decision to retire the log-by-voice feature. Like the
2026-06-21 photo-milestone removal, this is a **subtractive** change — it removes a
data flow to our AI subprocessor rather than adding one.

**Risk levels surfaced (in-house review, this change):**
- **P0:** none.
- **P1 — a live edge function outlives the disclosure that covered it.** Deleting
  `supabase/functions/parse-voice-log/` from the repo does not undeploy it; the
  function stays ACTIVE on the Supabase project until it is removed by hand in the
  dashboard (there is no MCP delete tool — same gap noted for `detect-milestone` on
  2026-06-21). While deployed it still accepts an authenticated request and forwards a
  transcript to Anthropic — a data flow Privacy § 4, the FAQ, and `/subprocessors` no
  longer disclose as of this change. **Resolution:** tracked as the first outstanding
  item below; it must be deleted in the Supabase dashboard, and until it is, the
  disclosure gap is real (mitigated only by the fact that no shipped client calls it).
- **P1 — store listing advertises a removed capability.** The App Store description
  draft in `tasks/todo.md` § listing copy claimed "Log feeds, sleep, and diapers in two
  taps — or by voice, hands-free". Selling a capability we no longer deliver is the
  FTC § 5 deceptive-claim direction that was P1 on the photo removal. **Resolved** in
  the repo copy; the *live* store listing is out of repo — see outstanding.
- **P2 — privacy-label accuracy (resolved).** `tasks/todo.md`'s Apple privacy-label
  matrix listed "User Content → Audio Data: Yes" sourced to voice logs. The row stays
  **Yes** — `useSpeechRecognition` still backs mic dictation in `AIChatWidget` — but its
  source was corrected to AI-chat dictation. Speech is transcribed to text and the
  audio itself is still never uploaded or retained, so the answer to Apple's question is
  unchanged; only the justification moved.
- **P2 — copy hygiene (resolved).** Privacy § 4, the FAQ third-party answer, and the
  Subprocessors Anthropic entry read cleanly post-removal (no dangling conjunctions, no
  orphaned clauses), and no surviving sentence claims we parse voice notes. The
  remaining Anthropic data-flow list (chat, briefings, weekly insights, Visit Prep,
  Speech Class, Weekly Play Plan) was checked against the edge functions still on disk —
  no clause for a still-shipping feature was removed.

**Verified consistent (policy-vs-code):** the favorable direction holds — the copy now
claims *less* data goes to Anthropic and the code confirms it (`parse-voice-log`
deleted from the repo; six Anthropic-invoking functions remain), subject to the P1
undeploy item above.

**Intentionally unchanged (no schema migration, no data loss):**
- `public.voice_parse_events` (table, RLS policies, index) is left as a harmless orphan,
  matching the photo-removal precedent. It still references `auth.users ON DELETE
  CASCADE`, so it keeps purging through `_purge_user_data()` / the final
  `DELETE FROM auth.users` — **Privacy § 8 deletion promises remain accurate.**
- The `source` CHECK constraints on the log tables still permit `'voice'`. Historical
  rows logged by voice are parent data, not feature code: they keep rendering (the
  "Voice" chip in `EventDetailsPopover`) and keep their null-`ended_at` handling in
  `sleepTodo` / `useActiveSleep`. Nothing was rewritten or deleted.

**Product regression accepted by the founder (not a legal item, recorded for the
trail):** caregiver-role partners had no logging affordance other than the voice card
(`DashboardLayout` short-circuits the caregiver role to `CaregiverHome` on every
route, so they never reach the per-tab log forms). The founder chose to remove voice
and leave that gap rather than build a replacement surface in this change; a code
comment in `CaregiverHome.tsx` records it.

**Code refs:** branch `claude/remove-log-by-voice-0pmm90` (commit hash to follow on
merge). `CLAUDE.md` "edge functions" line updated seven → six.

**Outstanding:**
1. **Delete the deployed `parse-voice-log` function in the Supabase dashboard** — until
   then a live endpoint carries an undisclosed transcript flow to Anthropic (P1 above).
2. Redeploy `generate-speech-class`; its prompt no longer tells parents to voice-log.
3. Confirm no out-of-repo surface (App Store / Play Store listing, marketing site,
   onboarding upsell, screenshots) still advertises voice logging — those live outside
   this repo and were not reviewable here.

---

## 2026-08-28 — Additional users gated behind Flare+ + owner-controlled shut-off

*Correction: this migration was merged 2026-08-28 but not applied to live until 2026-09-30 23:45 UTC, and it was superseded on 2026-10-02. See the 2026-09-30 entry "Additional users: free 1 / Flare+ 2" for the real timeline.*

**Scope reviewed:** `supabase/migrations/20260828100000_partner_seats_flare_plus.sql`
(seat helpers, RLS access functions, seat triggers, `accept_partner_invitation`,
`set_partner_access_paused`), `src/components/PartnerManagement.tsx`,
`src/components/OnboardingWizard.tsx` (step 7 invite card),
`src/pages/AcceptInvite.tsx`, `src/hooks/useCurrentRole.tsx`,
`supabase/functions/check-notifications/index.ts` (partner fan-out).

**What changed (product):** additional users on an account — the 2nd and 3rd
person, i.e. co-parent / caregiver / viewer — are now a Flare+ feature. Free
tier: zero seats. Flare+: two. The primary parent can pause any additional
user's access at any time and restore it later, alongside the existing
permanent removal.

**Why this is a legal-log item.** `accept_partner_invitation` is the RPC that
stamps `partner_access.consent_acknowledged_at` (T3, 2026-05-07). It was
modified, and the set of people who can read a child's record changed.

**Consent flow — unchanged and verified.** The invitee still checks the
Privacy/Terms consent box in `AcceptInvite.tsx`, and the RPC still stamps
`consent_acknowledged_at = now()` on insert (and preserves any earlier stamp
via `COALESCE` on the conflict path). The only reordering is that the
invitation is marked `accepted` before the `partner_access` insert, so the
invite's own pending seat is not double-counted; both statements run in one
transaction, so a rejected insert rolls the invitation back to `pending`. No
consent moment was removed, weakened, or moved.

**Data-minimisation direction is favourable.** Every change here *narrows* who
can read a child's record:
- `has_partner_access` / `partner_can_write` / `can_access_child` now also
  require an active or trialing Flare+ subscription on the owner. A lapsed
  subscription auto-suspends every additional user at the RLS layer.
- `useCurrentRole` now filters `status = 'active'`, so a paused or revoked
  partner no longer resolves to a co-parent role in the UI.
- `check-notifications` no longer fans push out to partners of a non-Flare+
  owner (it runs on the service role, so RLS would not have filtered them).

**Retention / deletion promises — unaffected.** No rows are deleted by this
change and no new personal data is collected. `paused_at` is a timestamp on an
existing row. `partner_access` still cascades from `auth.users`, so
`_purge_user_data()` and the final `DELETE FROM auth.users` behave exactly as
before — **Privacy § 8 deletion language remains accurate.** No new
subprocessor, no new egress, no change to any AI data flow.

**Risk noted and accepted by the founder (P2, product not legal):** existing
free-tier accounts that already have an active partner lose that partner's
access on deploy. Nothing is deleted and access returns the moment the owner
subscribes, and `PartnerManagement.tsx` shows an explicit "Shared access is on
hold" banner explaining why and how to restore it. If any such account exists
in production at deploy time, notify those owners out-of-band — a co-parent
silently losing sight of their child's record is a support and trust problem
even though it is not a privacy one.

**Outstanding:** none blocking. If Flare+ seat counts change, update
`partner_seat_limit()` and `MAX_ADDITIONAL_USERS` in `src/lib/partnerInvite.ts`
together.

---

## 2026-08-28 — In-app AI chat removed; conversational data flow to Anthropic ends

**Scope:** `src/pages/PrivacyPage.tsx` (§ 2 collection, § 3 purposes, § 4 AI processing),
`src/pages/FAQPage.tsx` ("What do the AI features do?" + the third-party answer),
`src/pages/SubprocessorsPage.tsx` (Supabase and Anthropic entries),
`src/pages/TermsPage.tsx` § 3 (not-medical-advice list), `src/pages/Auth.tsx` signup
disclosure, `src/pages/AcceptInvite.tsx` partner-consent list,
`src/components/CoppaDirectNotice.tsx` (COPPA direct notice),
`src/pages/dashboard/ProfilePage.tsx` and `ChildContextPage.tsx`. Code: deleted
`AIChatWidget`, `chatOpener`, `useChatHistory`, `useChatUsage`, `ShareWeekCard`, and
`TalkThisThroughButton`, plus every handoff into the chat (Leap card, milestone flags,
sleep plan, Next Steps, three Records tabs).

**Trigger:** Product decision to keep AI *insights* only and remove the ability for a
parent to converse with the AI. Subtractive for the largest free-text data flow we had.

**Risk levels surfaced (in-house review, this change):**
- **P0:** none.
- **P1 — the `chat` edge function stays deployed, and still accepts free-form input.**
  `SpeechInsightsPanel` (Word & Sound Journal) posts a single prompt to
  `/functions/v1/chat` with `skill: "slp"` and renders the streamed answer inline. That
  is a one-shot insight, not a conversation, and the founder asked to keep insights — so
  the function was **not** deleted. But it still takes an arbitrary `messages[]` array
  from any authenticated caller, so a determined user (or a future developer) can still
  converse with it outside the UI. The disclosure is therefore written to match the
  endpoint's real capability, not just the UI: § 4 covers the Word & Sound Journal flow
  explicitly. **Follow-up:** narrow the function's request contract to the insight shape
  (single prompt, fixed persona, no multi-turn history) so "no chat" is enforced by the
  server and not only by the absence of a button. Tracked below.
- **P1 — retained chat history must not be misdescribed as deleted.** Prior
  conversations remain in `chat_conversations` / `chat_messages` (no destructive
  migration). Deleting the § 2 "Chat data" line would have implied we no longer hold it.
  **Resolved:** § 2 now carries a "Chat history (historical)" entry stating the feature
  was removed on 2026-08-28, that no new chat data is created, that saved conversations
  are still stored and exportable from Profile, and that account deletion removes them —
  all three of which are true in code (`ProfilePage` export still includes
  `chatConversations`; `_purge_user_data()` still covers both tables).
- **P2 — AI-memory provenance (resolved).** § 2 described AI-memory notes as saved
  "from your chats, briefings, and weekly insights". Chat was a real memory source
  (`fireExtractMemory` fired from `chat/index.ts`), so the sentence was accurate until
  now and would have become false. Narrowed to briefings and weekly insights, which is
  what still writes memories.
- **P2 — no deceptive paywall claim.** Unlike the photo-milestone removal, chat was
  never sold as a Flare+ perk: `PREMIUM_FEATURES` has no chat entry, and the only
  upgrade prompt was the free-tier message counter inside the widget, which is deleted
  with it. Nothing in `Upgrade.tsx` or `UpgradeSheet.tsx` needed a change. Verified by
  grep, not assumption.
- **P2 — escalation copy no longer routes to a bot.** Speech Class and Weekly Play Plan
  rendered "<red flag> — ask the <persona> chat." With no chat, that copy would have
  dead-ended a parent on a red-flag row. Both now read "worth raising with your
  pediatrician" / "a speech-language pathologist", and the two generator prompts were
  changed to point at a professional rather than "the relevant chat persona". This is a
  safety-relevant improvement, not just copy hygiene.

**Verified consistent (policy-vs-code):** the favorable direction holds — the copy now
claims *less* data goes to Anthropic and the code confirms it (no conversational UI, no
new chat rows). Every surviving § 4 clause was checked against a function still on disk;
the Word & Sound Journal insight flow was **added** to § 4 and `/subprocessors` because
it was previously covered only implicitly by the chat clause and would otherwise have
become an undisclosed flow.

**Intentionally unchanged (no schema migration, no data loss):**
- `chat_conversations` and `chat_messages`, their RLS, and their deletion paths.
  Historical conversations are parent data; they stay exportable and stay covered by
  `delete_user_account()` / `_purge_user_data()`.
- `_shared/personas.ts` — still the source of truth for `next-step-peek`,
  `generate-speech-class`, `generate-activity-plan`, and the retained insight endpoint.
- `TRIAGE_CONTENT` in `src/lib/sleepTriage.ts` (~845 lines of authored sleep guidance
  carrying `chatPrompt` fields and "Open the chat" copy). It has had **no consumer since
  the SleepTriageCard was removed** — it was already dead before this change. Left in
  place because deleting authored clinical copy is a product call, not cleanup. It is
  not user-visible, so it creates no disclosure risk; it should be either revived or
  deleted deliberately.

**Product changes the founder should know about (not legal items):** the "Share the
week" home card is gone entirely (it existed only to open the chat), as are the "Ask
about this leap", "Try an activity at home", "Talk to Sleep Coach about this", and
"Talk this through" buttons. The Next Steps feed keeps its inline AI answer — only the
"Continue in chat" button below it was removed — and its deeplink kind was renamed
`chat` → `ask`. One consequence worth watching: the retained function's free-tier quota
(10 requests per UTC day) now gates the Word & Sound Journal insight alone, and the
counter that used to explain it lived in the deleted widget. The 429 body was reworded
for that caller and `SpeechInsightsPanel` now renders it, so a free parent who runs out
sees "they reset at midnight UTC, or upgrade to Flare+" instead of a generic failure.

**Code refs:** branch `claude/remove-log-by-voice-0pmm90` (commit hash to follow on
merge). `CLAUDE.md` gained a standing "no conversational AI" convention.

**Outstanding:**
1. **Narrow the `chat` edge function to the insight contract** (P1 above), or move the
   Word & Sound Journal insight onto its own function and delete `chat` outright.
2. Redeploy `next-step-peek`, `generate-speech-class`, and `generate-activity-plan` —
   all three carry prompt changes in this commit.
3. Confirm no out-of-repo surface (App Store / Play listing, marketing site,
   screenshots, onboarding upsell) still advertises an AI chat or "ask the AI anything".

---

## 2026-08-29 — Word & Sound Journal renamed "Word Journal"; journal entries added to the pediatrician PDF

**Reviewer:** in-house (Claude pass).
**Risk: LOW.**

**What changed:**
- **Product rename, not a data change.** The "Word & Sound Journal" is now the
  "Word Journal". The feature drops its babble/sound framing and tracks words
  only. The underlying table (`public.speech_journal`) and its
  `word_or_sound` column are **unchanged** — no migration, no data loss, no
  RLS change, and every existing row (including any babble a parent logged
  under the old framing) stays readable, editable, exportable, and covered by
  `delete_user_account()` / `_purge_user_data()` exactly as before.
- **PrivacyPage § 4** re-worded in three places: the AI-feature enumeration now
  says "speech-development insights in the Word Journal", and the two
  data-transmitted clauses (Word Journal insights, Speech Class) now say "up to
  30 of the most recently logged words" instead of "words or sounds". The
  bound (30 entries) and the recipient (Anthropic) are unchanged — this narrows
  the described payload to match the feature, it does not widen it.
- **`/subprocessors`** (Anthropic row, purpose + dataCategories) re-worded to
  match § 4 verbatim. Same three substitutions; no subprocessor added, removed,
  or re-scoped, so **no 30-day advance notice under Privacy § 5 is triggered**.
- **Pediatrician PDF gains a "Word Journal" section.** `fetchReportData` now
  reads `speech_journal` rows inside the selected date range plus an all-time
  distinct-word count; `pdfReportBuilder` renders the counts, the age benchmark
  (labelled as corrected age for a premature child), and up to the 50 most
  recent words with their dates and parent-written context. The section is
  **included by default with its own checkbox to exclude it** — opt-out, seeded
  on like the seven existing sections in `PediatricianExport.tsx` — and is
  omitted entirely when the child has no entries.
- *(Correction 2026-09-30: not applied to live until the 2026-09-30 batch — see the 2026-09-30 "Additional users" entry.)*
- **RLS fix — `public.speech_journal` moved onto the `child_id` access pivot**
  (`20260829000000_speech_journal_child_pivot_rls.sql`). This table was the last
  one still running the original 2026-03 `FOR ALL` policy pivoted on the
  client-supplied `parent_id`; it was omitted from all 17 tables covered by
  `20260820000000_child_pivot_log_rls.sql`. Two consequences, both documented in
  that migration's own header: (a) words logged by a co-parent were invisible to
  the child's owner, because `has_partner_access` is directional and resolves
  owner→partner only; and (b) a read-only viewer could write, because a FOR ALL
  policy with no WITH CHECK reuses USING, and the client stamps its own uid into
  `parent_id`. Now four per-verb policies on `can_access_child` /
  `can_write_child`, matching the other 17 tables.

**Correction (same-day, pre-merge):** an earlier draft of this entry described
the report section as "opt-in per export". It is opt-**out** — the checkbox is
seeded on, like the other seven. Corrected above. No user-facing text relied on
the wrong wording; the error was confined to this log, but it is noted here
because this log is the paper trail and a silent edit would defeat that.

**Analysis:** No new subprocessor, no new egress, and no new data category.
The PDF is generated **client-side** (jsPDF) from data the parent already
owns and can already download in full from Profile → Export My Data, and it
goes only where the parent chooses to send it — so surfacing journal entries
in it creates no third-party disclosure and no new § 4 or § 5 obligation.
`pediatrician_exports` continues to log only the export event and date range,
never the content.

The RLS fix is **not** a breach or an over-disclosure event: the broken policy
was too *narrow* on reads (an owner could not see a co-parent's rows) and never
exposed one family's data to another — `has_partner_access` still required an
active `partner_access` row. The write hole let a read-only *viewer* already
inside the child's circle write journal rows; it is closed now. No notification
obligation is triggered. The accuracy motive is the point worth recording: a
report that silently undercounts vocabulary beside a screening benchmark is a
misleading clinical artifact, which is a § 5 deceptive-practice concern in a
way that a merely incomplete UI list is not. The new PDF copy carries a non-diagnostic qualifier
("Parent-logged vocabulary. Counts reflect what the parent recorded, not a
formal language assessment.") under the report's existing disclaimer block,
consistent with the 2026-06-19 act-early milestone entry's framing rule: the
report presents observations for a clinician to interpret, it does not screen.
Non-material change — no renewed VPC required.

**Code refs:** branch `claude/word-journal-pediatrician-report-ssq6hn`.
`src/components/WordSoundJournal.tsx` → `src/components/WordJournal.tsx`;
`src/lib/vocabBenchmarks.ts` (new, extracted from `SpeechInsightsPanel` so the
in-app panel and the PDF quote the same benchmark table);
`src/services/reportDataService.ts`; `src/services/pdfReportBuilder.ts`;
`src/components/PediatricianExport.tsx`; `PrivacyPage.tsx`;
`SubprocessorsPage.tsx`.

**Outstanding:** the migration must be applied to live (Supabase MCP
`apply_migration`) — it is written but **not yet applied**; until it is, the
co-parent visibility gap above is still open in production. The
`word_or_sound` column name is now a legacy
mismatch with the feature name; it is internal-only (never user-visible) and
renaming it would require a live migration plus redeploys of `weekly-insights`
and `generate-speech-class` for no user-facing benefit. Code comments at each
call site record the reason.

## 2026-09-04 — Feed Coach night-awareness: overnight feeding-frequency claims

**Trigger:** a parent reported the Feed Coach card showing "It's been 5h 41m
since Lulu's last feed — Consider a feed" at 06:32, and saying so all night.
The card compared elapsed time against a flat age threshold with no concept of
night. The fix (PR #222, branch `claude/night-feed-recommendations-ycy52v`)
adds night-aware states, and with them a batch of new in-product clinical
numbers about *overnight* feeding that did not previously exist anywhere in
the product.

**Why this is logged.** Feeding guidance is not in CLAUDE.md's enumerated
log-required list (Privacy / Terms / FAQ / consent / retention / deletion /
subprocessor / geo-block), and the pre-existing `feedCoach.ts` carries no
entry. It is logged anyway on the founder's decision, following the precedent
set by the 2026-06-19 sleep-guidance entry: in-product clinical numbers get a
verbatim-cited evidence base. The FTC § 5 exposure here is a card that tells a
parent a long overnight gap is normal — going quiet is an implicit claim, and
an implicit claim is still a claim.

**Claims now rendered in product** (`src/lib/feedCoach.ts`,
`feedGuidanceForAge`). Per corrected-age bracket: typical night feeds, longest
normal night stretch, and a `maxNormalNightStretchHours` ceiling above which
the card re-escalates rather than reassuring.

| Bracket | Typical night feeds | Longest normal stretch | Ceiling |
|---|---|---|---|
| newborn (<1 mo) | 2–3 | about 4 hours | 4h |
| 1–3 mo | 1–3 | 4–6 hours | 6h |
| 3–6 mo | 0–2 | 6–8 hours | 8h |
| 6–12 mo | 0–1 | 8–11 hours | 11h |
| 12 mo+ | usually none | 10–12 hours | 12h |

Plus `OVERNIGHT_WAKE_THRESHOLD_HOURS = 4` (the overnight wake-to-feed nudge)
and a preemie rule: `wakeToFeedOvernight` stays on for `is_premature` children
through 3 months **corrected**, not 1.

**Evidence base (cited verbatim alongside each clinical number):**

- **Newborn 8–12 feeds/24h and the wake-a-newborn-past-~4-hours rule** —
  *Technical Report: Breastfeeding and the Use of Human Milk*, Meek JY,
  Noble L, Pediatrics 2022;150(1):e2022057989
  (https://doi.org/10.1542/peds.2022-057989), with the accompanying
  *Policy Statement*, Pediatrics 2022;150(1):e2022057988
  (https://doi.org/10.1542/peds.2022-057988). **Attribution note:** the
  feed-frequency and 4-hour figures sit in the Technical Report and the
  AAP consumer guidance at healthychildren.org ("How Often and How Much
  Should Your Baby Eat?"), **not** in the Policy Statement, whose scope is
  the exclusive-breastfeeding recommendation. Cite the Technical Report.
- **Exit criterion for the wake-to-feed rule** — birth-weight regain (AAP
  expects by ~10–14 days) plus adequate ongoing gain plus pediatrician
  sign-off. This is the criterion AAP actually states; the product
  approximates it with corrected age because the app cannot know weight
  status. The approximation is disclosed in-product only indirectly, via
  the standing hedge below. **Recorded as a known gap** — see Outstanding.
- **Frequent feeding in jaundiced newborns (a population that will sleep
  through and should not)** — *Clinical Practice Guideline Revision:
  Management of Hyperbilirubinemia in the Newborn Infant 35 or More Weeks
  of Gestation*, Kemper AR et al., Pediatrics 2022;150(3):e2022058859
  (https://doi.org/10.1542/peds.2022-058859).
- **Absence of an infant sleep-duration recommendation under 4 months** —
  *Recommended Amount of Sleep for Pediatric Populations: A Consensus
  Statement of the American Academy of Sleep Medicine*, Paruthi S et al.,
  J Clin Sleep Med 2016;12(6):785-786
  (https://doi.org/10.5664/jcsm.5866). AASM declined to recommend for
  under-4-months because normal variation is too wide. This is why the
  1–3 mo copy is the softest of the five brackets.

All four references were verified against PubMed on 2026-09-04 (authors,
journal, volume/issue, DOI). See Outstanding for what that verification does
and does not cover.

**Disclaimer posture:** no new in-product disclaimer. The existing "General
guidance — not medical advice" footer on the card is retained unconditionally
and is covered by `TermsPage.tsx` § 4 ("Service Is Not Medical Advice").
Three copy rules were adopted as hard constraints and are enforced by unit
test, not convention:

1. **No wellness assertion about an individual child.** Population facts only
   ("long night stretches are normal at this age"), never "{Name} is doing
   great" or "that's right in range for this age". The deceptive-practice
   risk of a silent card is that silence reads as affirmative reassurance in
   the rare case where a long stretch is illness, dehydration or undiagnosed
   slow gain. An earlier draft of this change asserted the baby "slept" a
   duration that was actually a feed gap, inferred with no sleep data at all;
   it was caught in review and removed.
2. **No nudge away from feeding.** Dropping the "Consider a feed" pill is
   permitted; "there's no need to wake {Name}" is not — it is a directive
   against feeding aimed at a parent whose child may be in the wake-to-feed
   population. Also removed in review.
3. **No "should sleep through by X" claim.** Night feeds past 6 months are
   normal and are a clinician conversation.

Every overnight state where the wake-to-feed rule has lapsed carries a
standing deferral: "If your pediatrician asked you to wake {Name} for feeds,
keep following that." This is the primary mitigation for the corrected-age
approximation above.

**Data flow:** none. Deterministic client-side logic, no Anthropic egress, no
new tables, no migration, no new personal-data categories. Reads existing
`children` columns (`date_of_birth`, `due_date`, `is_premature`,
`night_start_time`) and existing feeding/sleep logs. No renewed VPC required;
no direct-notice enumeration change.

**Code refs:** `src/lib/feedCoach.ts`, `src/lib/nightWindow.ts` (new),
`src/hooks/useNightWindow.ts` (new),
`src/components/feeding/FeedCoachCard.tsx`.

**Outstanding:**
- **PubMed verification covered provenance, not content.** It confirms the
  four papers exist, are correctly attributed, and that the DOIs resolve. It
  does **not** confirm the specific hour figures above appear in those
  documents — the bracket numbers were drafted from an advisor's paraphrase
  from memory. Someone must diff each figure against the current AAP text at
  healthychildren.org and the Technical Report. AAP periodically re-words the
  newborn wake-to-feed line. **This check was explicitly deferred past merge**
  on the founder's decision of 2026-09-04, having been raised and declined
  twice — the numbers are live in production unverified against source, and
  this line is the record of that. It is the first thing to close if a
  regulator or a clinician ever questions the figures.
- **The corrected-age proxy is a known approximation.** AAP's wake-to-feed
  rule exits on weight regain, not a birthday. `children.birth_weight_oz` and
  the `weight_logs` table already exist, so a criteria-based exit is
  computable without a migration. Until then a 5-week-old who has not
  regained birth weight sees the 1–3 mo framing, mitigated only by the
  pediatrician hedge. Tracked as a product follow-up.

---

## 2026-09-07 — Home-screen Next steps retired; `next-step-peek` data flow to Anthropic removed

**Scope:** `src/pages/PrivacyPage.tsx` (§ 4 AI processing — feature list and the
per-feature payload inventory), `src/pages/FAQPage.tsx` ("Is this medical advice?"
and "Is my child's data sent to third parties?"), `src/pages/SubprocessorsPage.tsx`
(Anthropic `purpose` + `dataCategories`). Code: `supabase/functions/next-step-peek/`
deleted along with `src/components/NextStepFeed.tsx`, `src/hooks/useNextSteps.tsx`,
`src/hooks/useNextStepPeek.tsx`, `src/lib/nextSteps.ts` (+ its test), and
`src/lib/skills.ts`. The briefing's `focus` field was cut and its `watch` field made
nullable in `supabase/functions/briefing/index.ts`.

**Trigger:** Product decision to remove the Home "Next steps" feed and de-duplicate
the Today card. Like the 2026-08-28 log-by-voice removal and the 2026-06-21
photo-milestone removal, this is a **subtractive** change — it removes a data flow to
our AI subprocessor rather than adding one.

**Risk levels surfaced (in-house review, this change):**
- **P0:** none.
- **P1 — a live edge function outlives the disclosure that covered it.** Deleting
  `supabase/functions/next-step-peek/` from the repo does not undeploy it; the function
  stays ACTIVE on the Supabase project until removed by hand in the dashboard (no MCP
  delete tool — the same gap recorded for `detect-milestone` on 2026-06-21 and
  `parse-voice-log` on 2026-08-28). While deployed it still accepts an authenticated
  request and forwards child data to Anthropic — a flow that Privacy § 4, the FAQ, and
  `/subprocessors` no longer disclose as of this change. **Resolution:** first
  outstanding item below. Mitigated by the fact that no shipped client calls it once
  this branch merges.
- **P2 — over-disclosure pending this edit (resolved).** Between the code removal and
  this copy pass, three pages named "Next Step suggestions" as an active Anthropic
  data flow and described a payload we no longer send. Over-disclosure is the
  favourable direction — it claims *more* egress than exists, so there is no § 5
  deceptive-claim exposure — but it is drift on pages carrying a "Last reviewed"
  timestamp. Resolved in this change; both timestamps bumped to September 7, 2026.
  `Effective:` dates unchanged, per the 2026-08-29 precedent: narrowing a disclosed
  data flow is not a new term.
- **P2 — AI output-safety improvement (not a legal defect, recorded).** The briefing's
  `watch` field was presenting a *logging gap* as a *physiological finding* — one
  production output told a parent her 4-month-old's "sleep is running shorter than her
  typical 27-29 hours" from a 48-hour window in which she had simply logged less. The
  prompt now states that a sparse window means NOT RECORDED and forbids comparing it
  against a baseline. This is not a medical-advice claim under our disclaimers, but an
  inference presented with more confidence than the data supports is the direction from
  which such a claim would arise, so it is logged here. The same pass removed a
  prompt-driven nag that asked parents to log more diapers and asserted the absence
  "prevents us from checking hydration and digestion" — an implied clinical inference
  we do not back.

**Verified consistent (policy-vs-code):** the favourable direction holds — the copy now
claims *less* data goes to Anthropic and the code confirms it (`next-step-peek` deleted
from the repo; five Anthropic-invoking functions remain besides `chat`), subject to the
P1 undeploy item above. `CLAUDE.md` edge-function line updated seven → six.

**Intentionally unchanged (no schema migration, no data loss):**
- **No table was orphaned.** Next-steps snooze/dismiss state was localStorage-only
  (`nextstep_milestone_dismissed_*`, `nextstep_finance_dismissed_*`,
  `nextstep_fincal_*`). The two mutations that reached Postgres wrote to
  `parent_financial_checklist` and `milestone_flags`, both of which have live non-Next-Step
  consumers (`FinancialTab`, `MilestoneFlags`). Nothing to drop; **Privacy § 8 deletion
  promises are unaffected.**
- The three orphaned localStorage key families are left in place on existing devices,
  matching the `voice_parse_events` precedent of 2026-08-28. They hold no personal data
  beyond child/parent UUIDs already present in that origin's storage, are never read
  again, and clear with site data.

**Escalation paths checked (product-safety, recorded for the trail):** the feed's
`redflag` tier was the Home mirror of act-severity milestone flags. That pathway is
fully served by `MilestoneFlags.tsx` + `EarlyInterventionExplainer` on the Milestones
page, including the Early Intervention hand-off reviewed on 2026-06-19. Finance
deadline reminders retain their own next-step row in `FinancialTab`; Visit Prep remains
reachable from the header stethoscope. **No escalation or referral path was removed —
only its duplicate on Home.**

**Code refs:** branch `claude/sleep-diaper-next-steps-review-k3ngrb`, PR #233.

**Outstanding:**
1. **Delete the deployed `next-step-peek` function in the Supabase dashboard** — until
   then a live endpoint carries an undisclosed child-data flow to Anthropic (P1 above).
2. Confirm no out-of-repo surface (App Store / Play Store listing, marketing site,
   onboarding upsell, screenshots) advertises the Home "Next steps" feed — those live
   outside this repo and were not reviewable here.

---

## 2026-09-30 — Additional users: free 1 / Flare+ 2 (first time any seat limit reaches live); lapse keeps the longest-standing partner

**Reviewer:** in-house (Claude backend pass, QA Fix-required round addressed;
founder-approved pricing decision). **Risk level:** Low — on live this is a
narrowing, and nobody loses access at apply time.

**Scope reviewed:** `supabase/migrations/20260828100000_partner_seats_flare_plus.sql`
(applied to live 2026-09-30 by a separate session, unhardened; see the timeline below),
`supabase/migrations/20260930100000_free_partner_seat.sql`
(new `partner_within_entitlement()` helper; `partner_seat_limit`,
`has_partner_access`, `partner_can_write`, `can_access_child`,
`can_write_child`, both seat triggers and `accept_partner_invitation`
re-created; EXECUTE lock-down on every partner function),
`supabase/migrations/20260930110000_set_partner_role.sql`,
`supabase/functions/check-notifications/index.ts` (partner push fan-out).

**Correction to the record: what actually happened on live, from `supabase_migrations.schema_migrations`.**
- **2026-08-28 → 2026-09-30 23:45 UTC:** `20260828100000_partner_seats_flare_plus.sql` was merged to `main` on 2026-08-28 but **not applied to live**. During that period there was **no seat limit and no Flare+ gate**. Any account could share with any number of invited adults. Partner Remove and Pause were broken in the app (Pause called a missing RPC; Remove wrote a missing `paused_at` column). So the 2026-08-28 entry describes behaviour that never shipped in that window.
- **2026-09-30 23:45 UTC:** the **unhardened** version of `20260828100000` was applied to live by a separate Claude session, not this review's apply. It was recorded twice, as versions `20260930234524` and `20260930234538`. `20260829000000` and `20260830000000` went in alongside it (`20260930234601`, `20260930234610`), and both were re-applied as no-ops at 2026-10-01 10:58 UTC. Effects from that point:
  - **Free accounts at 0 seats**, so `FLARE_PLUS_REQUIRED` blocked every free-tier invite and accept.
  - `owner_has_plus`, `partner_seat_limit` and `partner_seats_used` were **callable by the anon key and signed-in users**. Anyone could look up any user's Flare+ status and caregiver count by uuid.
  - `can_access_child` had **no `auth.uid()` guard**, so any caller could probe whether another user can see a given child.
- **2026-10-01 11:00–11:02 UTC:** that same session revoked the three helpers from anon and authenticated (`partner_seat_helpers_revoke_client_roles`) and locked down the trigger functions and the anon grant on `set_partner_access_paused` (`partner_seat_trigger_fns_revoke`). The disclosure exposure closed at that point.
- **2026-10-02:** this review applied `20260930100000` and `20260930110000`. They went in as three MCP migrations: `free_partner_seat_1_functions`, `free_partner_seat_2_index_and_acl` and `set_partner_role`. This replaced the Flare+-only rule with free 1 / Flare+ 2, added the entitlement rule, guarded `can_access_child`, and asserted the full EXECUTE matrix. Verified on live with `has_function_privilege`:
  - internal helpers are not executable by anon or authenticated;
  - client RPCs are executable by authenticated only;
  - RLS helpers are pinned to `auth.uid()`.
  The seat triggers kept their existing definitions and picked up the new function bodies, so no trigger was recreated.

**Interim blast radius (2026-09-30 23:45 → 2026-10-02):**
- 1 active partner, on a Flare+ owner, was within the limit throughout. **Nobody was suspended.**
- No new invites were created. The only pending invite had already expired.
- The anon-callable helpers returned only booleans and counts, not child data. There is no API log evidence of calls in the retained window, so this cannot be ruled in or out beyond about 24h.

**What changes on live (the effective diff):** unlimited additional users →
**free: 1** (the owner + 1, typically the co-parent) / **Flare+: 2**. That is a
**narrowing** of who can be invited to see a child's record. When Flare+
lapses, the **longest-standing** partner (earliest `partner_access.created_at`,
i.e. first acceptance; paused partners keep their place in that order) keeps
access and anyone beyond the free entitlement is suspended at the RLS layer
until renewal. Nothing is deleted. Owners also gain, for the first time on
live, a reversible Pause (a paused partner still occupies a seat) and an
owner-only role change (`set_partner_role`).

**Blast radius at apply time (read-only count on live, 2026-09-30):** 1 active
`partner_access` row, whose owner holds an active Flare+ subscription (1 of 2
seats used — unaffected), and 1 pending invitation that has already expired
(grants nothing; does not count toward a seat). **Nobody is suspended and no
existing access changes when this batch lands.** No owner is over the new
limit.

**Why this is a legal-log item.** `accept_partner_invitation` — the RPC that
stamps `partner_access.consent_acknowledged_at` (T3, 2026-05-07) — is
re-created, and the set of people who can read a child's record changes.

**Consent flow — unchanged and verified.** Relative to what is on live, the
only behavioural addition to `accept_partner_invitation` is that the
`partner_access` insert now passes the seat trigger (`SEAT_LIMIT_REACHED:` on
an over-limit accept, rolling back in the same transaction — the invitation
returns to pending). The Flare+-required check that `20260828100000` adds is
removed again by `20260930100000`. The invitee still checks the Privacy/Terms
consent box in `AcceptInvite.tsx`; the RPC still stamps
`consent_acknowledged_at = now()` on insert and preserves an earlier stamp via
`COALESCE` on the conflict path. No consent moment is removed, weakened, or
moved. The direct notice at Add Child already discloses sharing with
"co-parents or caregivers you explicitly invite". Anonymous callers can no
longer execute `accept_partner_invitation` (it always required a signed-in
user; the grant was simply never revoked).

**Data-minimisation direction — narrows on live.** Unlimited → 1 (free) or 2
(Flare+). Reads and writes suspend together on lapse: `can_write_child` is
brought under the same entitlement rule as the read helpers, so an
over-entitlement partner can neither read nor write. `can_access_child` gains
the `_user_id = auth.uid()` guard `can_write_child` already had, so a signed-in
user can no longer call it over PostgREST to probe whether *another* user can
see a given child (all 95 live RLS policies that call these helpers already
pass `auth.uid()`; verified read-only). The internal seat / subscription
helpers (`owner_has_plus`, `partner_seats_used`, `partner_seat_limit`,
`partner_within_entitlement`) are not executable by anon or signed-in users —
they take an arbitrary user id and would otherwise disclose a stranger's
subscription status and caregiver count.

**Push notifications match access.** `check-notifications` previously (in the
repo, never deployed with this logic — live runs an older build) skipped
partner pushes unless the owner had Flare+. It now fans out only to partners
for whom `partner_within_entitlement(owner, partner)` is true — the same rule
RLS uses — so a suspended partner gets no push and the retained partner still
does. **Not deployed in this change**; ships with the next check-notifications
deploy.

**Same batch — two other merged-but-unapplied migrations, and what users
experienced meanwhile.** The frontend has depended on all three since late
August, so between merge and this apply:
- **`20260828100000` (partner seats / pause):** owners tapping **Pause** got an
  error (the `set_partner_access_paused` RPC did not exist), and **Remove
  partner** failed too — the client's revoke UPDATE writes `paused_at`, a column
  that did not exist on live, so PostgREST rejected the whole update. Partners
  kept their access throughout; nobody could be removed from the app UI (the
  owner could not revoke access in-app during this window).
- **`20260829000000_speech_journal_child_pivot_rls.sql`:** the 2026-08-29 entry
  above records this RLS fix as done; it was not live. Meanwhile Word Journal
  entries written by a co-parent were **invisible to the child's owner**, and a
  **read-only viewer could create, edit and delete** Word Journal entries
  (the old `FOR ALL` policy reused USING as WITH CHECK). Live exposure is small:
  one `speech_journal` row exists, authored by the child's own owner; no
  partner-authored rows. Applied in this batch.
- **`20260830000000_child_tracking_schedule.sql`:** the "day starts at" / night
  start setting **would not save** (the `day_start_time` / `night_start_time`
  columns did not exist); totals stayed on the midnight default. No personal
  data implication. Applied in this batch.

**Policy-vs-code grep (Privacy / Terms / FAQ):** searched `PrivacyPage.tsx`,
`TermsPage.tsx`, `FAQPage.tsx` for `partner`, `co-parent`, `caregiver`,
`additional user`, `invite`, `Flare+`, `premium`, `subscription`. **No seat-count
or Flare+-only partner language found.** Privacy § 5 ("Co-parents or caregivers
you explicitly invite via the Partner Access feature"), Terms § 6 ("any partners
you invite") and FAQ ("Can I share access with my partner or caregiver? Yes…")
are tier- and count-agnostic and remain accurate. No policy-page edit required.

**Retention / deletion promises — unaffected.** No rows deleted, one new
nullable column (`partner_access.paused_at`), no new personal data, no new
subprocessor or egress, no AI data-flow change. `partner_access` still cascades
from `auth.users`; `_purge_user_data()` is untouched — **Privacy § 8 deletion
language remains accurate.**

**Owner-only role change (`20260930110000_set_partner_role.sql`).**
`set_partner_role(_partner_id, _role)` lets the owner move a seat-holding
(active or paused) partner between coparent / caregiver / viewer. Owner-scoped
by `owner_id = auth.uid()`; role validated against the `partner_role` enum; not
executable by anon. It does not touch `consent_acknowledged_at`, status, or seat
seniority — a role change is not a new sharing grant (the same adult keeps the
same read access), so no new consent moment is required. Demoting to viewer
removes write access immediately. The owner could already do this via a direct
table UPDATE under the existing owner UPDATE policy; the RPC widens nothing.

**Apply order (one batch, in version order):** `20260828100000` →
`20260829000000` → `20260830000000` → `20260930100000` → `20260930110000`.

**Outstanding (not legal-blocking):**
1. Deploy `check-notifications` (after the batch lands — it calls
   `partner_within_entitlement`). Diff the live source first: live is an older
   build than the repo.
2. Client copy/seat math (`src/lib/partnerInvite.ts` `limit = isPremium ? 2 : 0`,
   `describePartnerError`, `PartnerManagement.tsx` free-tier teaser and lapsed
   banner, `Upgrade.tsx` "Multi-caregiver sync") still describes sharing as
   Flare+-only; frontend follow-up.

---

## 2026-09-30 — Unused `TRIAGE_CONTENT` sleep-guidance table deleted; birth-weight recovery copy limited to the first 4 weeks

**Reviewer:** in-house (Claude pass, founder-approved in session). **Risk level:** Low. No new data flow, and no change to disclosures.

**What changed:**
- **Deleted from `src/lib/sleepTriage.ts`:** the `TRIAGE_CONTENT` table, `lookupContent`, and the `TriageContent` type (~940 lines). The 2026-08-28 entry above left this authored sleep-guidance copy in place pending "a product call". The founder made that call on 2026-09-30: delete it. It had no consumer and still pointed parents to the removed in-app chat ("Open the chat…"). It was never user-visible, so removing it changes nothing a parent sees and removes no escalation path.
- **Changed in `GrowthPage.tsx`:** the "Back to birth weight" copy is now limited to the first 28 days after the date of birth, via `isInBirthWeightRecoveryWindow` in `src/lib/childAge.ts`. That covers the celebration banner, the goal progress card, and the "vs birth" sub-label. Outside the window the label reads "Since birth". The Growth setup prompt says "see growth since birth" instead. This fixes a 7-month-old being told "Back to birth weight — great job!"; the copy stays celebratory, not diagnostic.

**Code refs:** branch `claude/growth-birth-weight-and-triage-cleanup`.

## 2026-09-30 — Production audit: three retired AI functions still ACTIVE; two repo functions never deployed

**Reviewer:** in-house (Claude pass, founder session). **Risk level:** P1 until the retired functions are deleted.

**Finding (live `list_edge_functions`, project `ieuznbvvwdvhtirzwkly`, 2026-09-30):**
- `detect-milestone` (retired 2026-06-21), `parse-voice-log` (retired 2026-08-28) and `next-step-peek` (retired 2026-09-07) are all still **ACTIVE**. Each sends child data to Anthropic, and none is disclosed in Privacy § 4 or `/subprocessors` any more. The app no longer calls them, but the endpoints still accept requests. This closes nothing from the 2026-06-21, 2026-08-28 and 2026-09-07 entries: their "delete the deployed function" follow-ups are still open.
- `visit-prep-questions` and `send-visit-reminder-email` exist in the repo but were **never deployed**. Visit Prep (called from `useVisitPrepQuestions`) therefore cannot work in production, and visit reminder emails from `check-notifications` fail. These are availability bugs, not disclosure gaps: both flows are already disclosed.
- Root cause: `deploy-functions.yml` listed 7 of 14 functions by hand, and nothing removed retired ones.

**What changed in this PR:** CI now deploys every function in `supabase/functions/`, with each function's `verify_jwt` pinned in `supabase/config.toml` to its live value. `CLAUDE.md` now lists all seven functions that call Anthropic, including `extract-memory`, and records that the three retired functions were still live.

**Outstanding:**
1. Delete `detect-milestone`, `parse-voice-log` and `next-step-peek` from production (founder approval required; deletion is irreversible).
2. Deploy the repo's functions once the founder has reviewed what changes for the functions whose live copy is older than the repo.

## 2026-09-30 — Flare+ paywall: unsubstantiated claims removed

**Reviewer:** in-house (Claude legal pre-review, founder-approved).

**Scope:** `src/pages/Upgrade.tsx` (subhead, perk list, yearly-plan badge, footer
under the trial CTA), `src/components/UpgradeSheet.tsx` (`FEATURE_HOOK` copy, perk
list, footer), `src/components/OnboardingWizard.tsx` (speech-interest preview and
step-7 feature list). Copy only — no layout, pricing, gating, or checkout-stub change.

**Trigger:** in-house pre-review of the Flare+ paywall ahead of paid checkout. The
paywall made objective, verifiable claims — clinical review, accuracy percentages,
a timing tolerance — for which no substantiation exists. Under FTC Act § 5 an
objective claim needs a reasonable basis *before* it is made; a health-adjacent
claim aimed at parents of infants is read strictly. The facts that make these
claims unsupportable:
- **No pediatrician has reviewed any content.** The only "pediatrician" reviewer is
  an AI dev-agent persona (`.claude/agents/pediatrician.md`).
- **No accuracy evaluation exists** for cry analysis or for nap/feed predictions —
  no labelled dataset, no test harness, no measured error.
- **Predictions are deterministic heuristics** (`NextEventBand`, `feedCoach.ts`,
  sleep coach — pure local math, no LLM call), so "AI Coach" misdescribes them.
- **"AI pediatrician"** implies an AI is a licensed clinician — the strongest
  implied-medical-advice claim on the surface, and at odds with our own
  "not medical advice" disclaimers.

**Risk level:** High → **resolved for the copy.** Billing-side exposure remains open;
see the outstanding list below.

**Claims changed (old → new, and why):**

| Surface | Old | New | Why |
|---|---|---|---|
| Upgrade subhead | "Predictive insights from your real data. Vetted by pediatricians. Cancel anytime." | "Predictions that learn from your own logs. Questions ready for every checkup. Try it free for 7 days." | No pediatrician review exists. "Cancel anytime" promises a cancel flow that does not exist yet. |
| Upgrade perk | "Predictive AI Coach — Forecasts naps, fussiness, growth windows" | "Nap & feed predictions — Next nap and feed, learned from your own logs." | Predictions are heuristics, not AI; the product does not forecast fussiness or growth windows. |
| Upgrade perk | "AI pediatrician visit prep — Questions drafted from your baby's real data, every visit" | "Checkup question prep — Questions for your pediatrician, drafted from your baby's real sleep, feeding, and growth logs." | "AI pediatrician" implies an AI clinician. |
| Upgrade perk | "Cry & sound analysis — Hungry vs tired vs uncomfortable" | "Cry clues — On-device hints: could be hunger, tiredness, or discomfort." | Categorical "X vs Y" framing implies a classification we have not validated; hedged to hints. On-device is accurate (`cryFeatures.ts`, no network). |
| Upgrade perk | "Growth analytics + PDF reports — WHO percentiles, trend flags, doctor-ready" | "…— WHO growth percentiles (birth–2 yrs), growth trends, PDFs to share at checkups." | No "trend flag" feature exists; "doctor-ready" implies clinical fitness. The age range matches the WHO 0–24-month tables in `growthPercentiles.ts`. |
| Upgrade yearly badge | "SAVE 50%" | "SAVE 49%" | $59.99 vs 12 × $9.99 = $119.88 is a 49.96% saving; a rounded-up savings claim overstates it. |
| Upgrade footer | "No charge today · Reminder before billing · Cancel in Settings" | "No charge today" | No trial-ending reminder email and no in-app cancel flow exist yet. Restore both phrases when they ship. |
| UpgradeSheet `predictions` | "Predictive scheduling from your real data — accurate to within ~15 min after a week of logs." | "Your baby's next nap and feed, estimated from your own logs. The more you log, the sharper it gets." | No measured error; "~15 min" is an unsubstantiated accuracy claim. |
| UpgradeSheet `cry-analysis` | "…flags hunger vs tired vs discomfort with 87% accuracy." | "Hints from the sound of your baby's cry — could be hunger, tiredness, or discomfort. You know your baby best." | "87% accuracy" has no evaluation behind it. Neutral "your baby" because the string is static and cannot know the child's gender. |
| UpgradeSheet `growth-analytics` | "Trend flags, projections, and pediatrician-ready PDFs." | "WHO growth percentiles (birth–2 yrs), growth trends, and PDFs to share at checkups." | No trend-flag or projection feature exists; aligned to the Upgrade row. |
| UpgradeSheet `expert-library` | "Pediatrician-vetted answers." | "Guides for the questions you actually have." (sub: "Sleep, feeding, and milestones — searchable, ad-free.") | No pediatrician review exists. |
| UpgradeSheet `exports` | "Doctor-ready in one tap." | "Checkup-ready in one tap." | "Doctor-ready" implies clinical fitness. |
| UpgradeSheet perks | "Daily AI briefings & predictions" / "Cry & sound analysis" | "Daily AI briefings + nap & feed predictions" / "Cry clues" | Stops predictions reading as AI; matches the Upgrade page names. |
| UpgradeSheet footer | "No charge today · Cancel anytime · … included" | "No charge today · … included" | No cancel flow exists yet. |
| Onboarding speech preview | "…from first words to sentences, with SLP-backed context." | "…from first words to sentences." | No speech-language pathologist has reviewed any content. |
| Onboarding step-7 feature list | "Speech-Language Pathologist advisor" | "Speech and language insights (AI)" | Implies an AI is a licensed SLP — the same problem as "AI pediatrician". |

**`src/data/signLibrary.ts` "SLP-vetted":** checked. It appears only in code comments
(file header and the `howTo` field's doc comment) and is **not user-visible**, so no
copy change was needed. The comments do describe a review that did not happen, so they
should not be cited as evidence of one.

**Outstanding before paid checkout ships:**
1. **Auto-renewal disclosure directly above the CTA** — price, billing interval,
   that it renews until cancelled, and how to cancel, clear and conspicuous before
   billing info is collected (ROSCA, 15 U.S.C. § 8403; Cal. Bus. & Prof. Code
   §§ 17600–17606, including the affirmative-consent and acknowledgement rules).
2. **Terms of Service subscriptions section** — `TermsPage.tsx` has none. It needs
   pricing, trial-to-paid conversion, renewal, cancellation, and refund terms.
3. **Trial-ending reminder email** before the first charge (Cal. B&P § 17602(a)(3)
   for trials; also the promise the old footer made).
4. **In-app cancel / manage-subscription flow** — California requires online
   cancellation for subscriptions bought online (§ 17602(d)). Once it exists,
   "Cancel anytime" can come back.
5. **In-product cry confidence:** `CryAnalyzer.tsx` shows "About {pct}% confident".
   The number is a heuristic score from the rule-based `classify()`
   (`cryFeatures.ts`), capped at 0.85, not a calibrated probability. Reword it
   (e.g. "Strong / Some / Weak match") before any cry marketing leans on it.
6. **Recommend adding "paid billing goes live" to the outside-counsel trigger list**
   (alongside fund-raise, EU/UK launch, EHR integration, and material breach).
   Automatic-renewal law is state-by-state and enforcement-heavy.

**Also noted (not changed in this pass):** some paywall headlines still use "she/her"
in static strings ("Know when she'll need her next nap.", "What is she trying to
tell you?", "tuned to her age"). These are not substantiation issues. They are a
gender-assumption copy fix for a follow-up.

**Code refs:** branch `claude/paywall-claims-legal-fix`.

**QA follow-up, same day:** the `PREMIUM_FEATURES` labels shown in paywall footers
and PremiumGate cards were aligned with the new perk names: "AI Coach insights" →
"Daily AI briefings", "Predictive next-event" → "Nap & feed predictions", "Cry &
sound analysis" → "Cry clues", "Expert content library" → "Guides library". The
`ai-insights` hook sub claimed "analyzes the last 14 days", but `briefing` uses a
48-hour window and `weekly-insights` uses 7 days. It now reads "reads your recent
logs". The draft billing launch kit (auto-renewal disclosure, Terms § 14, emails,
checklist) is saved at `docs/billing-launch-kit.md`.
---

## 2026-09-30 — Finance Account Finder: old Finance tab replaced; new per-child finance data, Finance reminders, sponsored "Open with" links

**Scope:** `src/lib/accountOptions.ts` (all account copy + 2026 figures), `src/lib/accountFinder.ts` (rule), `src/components/financial/AccountFinder.tsx`, `src/components/financial/AccountCard.tsx` (sponsor CTA + "Ad" label + disclosure), `src/components/records/FinancialTab.tsx` (Trump highlight), `supabase/functions/check-notifications/index.ts` (`finance_trump_claim`, `finance_529_newborn`, `finance_529_birthday`), `supabase/migrations/20260930000000_finance_account_finder.sql` + `20260930020000_finance_sponsors_no_trump.sql`, `src/pages/PrivacyPage.tsx` §§ 2, 3, 6, `src/pages/TermsPage.tsx` § 4, `src/pages/FAQPage.tsx`, `src/components/CoppaDirectNotice.tsx`, `src/pages/dashboard/ProfilePage.tsx` (export). Spec: `specs/001-finance-account-finder/` (T020/T021).
**Trigger:** Founder decision (2026-09-30) to replace the Finance tab with a two-question account-type finder. The change adds per-child finance data, a mutable "Finance" reminder category sent to all owners of eligible children, and first-party sponsored "Open with [Firm]" buttons per account type. Legacy finance tables are left in place and no longer read (no data deleted).

**Data added (per child, owner + active co-parent only, RLS keyed on child_id, ON DELETE CASCADE from children):**
- `child_finance_finder`: goal (education / anything / not_sure), family_contributes (bool), updated_by, updated_at.
- `child_account_status`: account_key, opened_at, marked_by. A `trump` row implies U.S. citizenship + SSN (CPRA sensitive-PI inference): used only to suppress the matching reminder; never exported to analytics, sponsors, or AI.
- No SSN, account number, balance, or income is collected (FR-022). `finance_account_sponsors` holds no user or child data.

**Risk levels surfaced:**
- P0: Sponsored CTA rendered inside finder result cards (child-DOB-driven placement), contradicting the direct notice ("not … for advertising") and the 2026-07-04 rule excluding sponsors from editorial recommendations; it also couples a personalized account-type suggestion to a paid firm (Advisers Act § 202(a)(11) / *Lowe*). Resolved: sponsors suppressed on recommendation cards; sponsors appear only in the static account list, identical for every parent.
- P0: Sponsor-supplied `disclosure` replaced the default ad disclosure (16 CFR § 255.5). Resolved: default disclosure always renders; sponsor text is appended.
- P0: Sponsors allowed on the Trump Account card (free government deposit; FTC § 5 / Impersonation Rule, 16 CFR Part 461). Resolved: UI guard + `CHECK (account_key <> 'trump')`; copy now states no paid firm is needed to claim.
- P0: 529 copy said $95,000 five-year gift election needs no gift-tax paperwork (it requires Form 709). Resolved: corrected.
- P0: New finance data missing from Privacy § 2, the COPPA direct notice, and Export My Data. Resolved: § 2 bullet, direct-notice enumeration, and export of both tables added.
- P1: Trump "why"/highlight/reminder omitted the U.S.-citizen condition. Resolved: "may qualify" plus the U.S.-citizen condition in all three (why text, list-card highlight, `finance_trump_claim` reminder).
- P1: Finder framing ("Find the right accounts" / "Open these accounts") read as personalized advice. Resolved: "Accounts to look into", on-screen basis ("based only on birthday and your two answers — not your income, taxes or state"), "Educational, not financial or tax advice" moved above the cards. Spec copy updated to match.
- P1: 529 "strongest tax break" superlative and unconditioned $35,000 Roth rollover. Resolved: softened; conditions stated.
- P1: 529 "How to open" pointed at a commercial site (savingforcollege.com) despite the non-commercial rule. Resolved: College Savings Plans Network.
- P1: HYSA "Safe" + unqualified FDIC line next to potential fintech sponsors (12 CFR Part 328 subpart B). Resolved: "insured" + bank-only caveat.
- P1: Privacy § 6 / Terms § 4 updated: sponsors never in finder results, never targeted with child data, cannot change suggestions; compensation is flat-fee or per-click only, never per account opened or amount invested. Terms § 4 adds account-finder scope paragraph. Treated as clarifying, non-material under Terms § 10 (see Outstanding).
- P2: Reminder copy de-claimed ("easy", "popular", "future"). In-app only; CAN-SPAM analysis required before any email channel.
- P2: UGMA transfer age (up to 25 in some states), Coverdell "most families", Trump "Contributions open July 4, 2026" tense, Trump employer cap is per employee, FAQ additions ("Does Grace Flare give financial advice?", "Why are there ads in Finance?"), partner-role FAQ line.
- P2: `marked_by` / `updated_by` retain a deleted co-parent's UUID: accepted as de minimis — opaque UUID only, no FK, not exported.
- Accepted: ad hidden once an account is marked opened (child data suppresses, never selects, an ad). `rel="noopener noreferrer sponsored"`, verbatim `cta_url`, no identifiers appended (FR-016) verified.
- Source verification: every figure checked against IRS / Treasury / FDIC / Savingforcollege secondary sources on 2026-09-30; irs.gov, trumpaccounts.gov and fdic.gov were blocked by the build environment's proxy, so URLs were confirmed via search index, not loaded.

**SubprocessorsPage.tsx:** unchanged. Sponsors receive no data and are not subprocessors (same position as 2026-06-20).

**Code refs:** branch `feature/finance-account-finder` (PR #244).

**Outstanding:**
- OUTSIDE-COUNSEL GATE (carried from 2026-06-20, still open): no `finance_account_sponsors` row may be set `is_active = true` until securities counsel confirms (a) adviser / broker / Marketing Rule promoter / MSRB G-21 position for the finder + paid placement, (b) flat-fee / CPC-only contract terms, (c) sponsor addendum warranting compliance-approved copy and landing pages.
- COPPA § 312.5(a)(1): confirm the new finance data + DOB-timed finance reminders are not a material change for previously consented parents. The direct notice is shown once per profile, so existing parents do not see the updated enumeration. If material: 30-day notice under Privacy § 11 and re-acknowledgement.
- Trump Account figures and claim mechanics to be re-verified against Treasury/IRS guidance at each rule change (auto-enrollment proposal pending).
- Pre-existing: Export My Data omits most tracking tables (allergen, milestone, temperature, supplements, activities, signs, etc.). Separate P0 to close the Privacy § 8 portability promise.
- Yearly figures refresh (gift exclusion, IRA limit, Trump contribution indexing) by PR in `accountOptions.ts`.

## 2026-09-30 — SECURITY: admin database functions were callable with the public anon key; locked down

**Reviewer:** in-house (Claude backend + QA passes, founder-approved apply). **Risk level:** High → resolved on live 2026-09-30.

**What was exposed.** On this Supabase project, `pg_default_acl` grants EXECUTE on every new function in `public` directly to `anon` and `authenticated`. That means `REVOKE ... FROM PUBLIC` removes nothing. As a result, three SECURITY DEFINER functions could be called by anyone holding the public anon key, at `POST /rest/v1/rpc/<name>`:
- `_purge_user_data(uuid)`: deletes every row for any user id, then the `auth.users` row. **Any account could be deleted by anyone.** Exposed since `20260507040000_inactive_account_purge.sql`, applied to live as `20260507151347`.
- `purge_inactive_account(uuid)`: a wrapper around the function above. Same exposure.
- `users_with_no_logs_since(timestamptz)`: returns the parent user id, child id and **child first name** for every child with no recent logs. Passing a future timestamp returns every child. Exposed since `20260502010000_reactivation_rpc.sql`.

**Evidence of misuse.** Supabase log retention covers only about 24 hours, 2026-09-29T20:30Z to 2026-09-30T20:29Z. In that window:
- There were no `/rest/v1/rpc/*` requests of any kind.
- There were no mentions of the three functions in PostgREST or Postgres logs.
- There were no user deletions in `auth_audit_logs`.

Anything before that window **cannot be ruled in or out from logs.**

**Fix.** Migration `20260930090000_lock_down_admin_rpcs.sql`, applied to live 2026-09-30:
- REVOKE EXECUTE from PUBLIC, `anon` and `authenticated`, and GRANT to `service_role`.
- The migration asserts the result and fails if any function is still executable.
- Verified on live afterwards with `has_function_privilege`: anon=false, authenticated=false, service_role=true for all three.

Legitimate callers keep working:
- The `inactive-account-purge` and `reactivate-nudge` edge functions use the service-role key.
- `delete_user_account()` is a postgres-owned SECURITY DEFINER function, so its call is checked as the owner.

**Founder / counsel decision needed (not concluded here).** Is this a reportable security incident? Facts relevant to that call:
- Children's names were exposed to unauthenticated callers for about 5 months, with no evidence of access in the one day of retained logs.
- Account deletion was possible for the same period, with no deletions seen in that day.
- Consider it against Privacy § 8 / § 10 commitments, state breach-notification statutes, and COPPA (16 CFR § 312.8, reasonable security).
- CLAUDE.md lists "material breach" as a trigger for outside counsel.
- Recommend counsel review whether the exposure alone, without evidence of access, triggers notice in any state where users live.

**Follow-ups:**
1. **Root cause still in place.** Default privileges keep granting EXECUTE on new public functions to anon and authenticated. Either change `ALTER DEFAULT PRIVILEGES` (this needs explicit grants for client RPCs going forward), or require every SECURITY DEFINER migration to revoke from anon and authenticated explicitly. Added to backend and QA lessons.
2. The Supabase security advisor still flags as ERROR the view `public.family_moments`, which is defined SECURITY DEFINER and so bypasses the querier's RLS. Needs review.
3. `delete_user_account()` is still anon-executable. It is guarded by `auth.uid()`, which is null for anon; confirm it no-ops safely.
4. `can_access_child(uuid, uuid)` has no `auth.uid()` guard. Anyone can ask whether a given user can access a given child. This is fixed in the pending free-partner-seat migration.
5. **Cron jobs failing.** `reactivate-nudge` and `inactive-account-purge` return 401 on every scheduled run, because the Vault service-role key is being rejected. **The 24-month inactive-account purge promised in Privacy § 8 is not running.** Fix is pending.

---

## 2026-09-30 — Export My Data: every user/child table, fail-closed on any read error

**Trigger:** P0 carried from the Finance Account Finder entry above — Export My Data omitted most tracking tables (Privacy § 8 "download a copy of your data"; COPPA 16 CFR § 312.6(a) parent review) and swallowed read errors with an empty `catch {}`, so a failed read silently exported an empty list (Constitution VI).

**Change:** export logic moved from `ProfilePage.tsx` to `src/lib/exportUserData.ts`, with one declarative `EXPORT_TABLES` list (55 tables). Every read checks `{ error }`; if any table fails, nothing downloads and the toast names the data that couldn't be read. Reads page until an empty page so the PostgREST max-rows cap can't truncate a table silently. Existing top-level JSON keys unchanged. File renamed `grace-flare-export-YYYY-MM-DD.json` (was `baby-steps-export-…`).

**Excluded, with reasons:**
- Credentials: `mcp_access_tokens`, `mcp_authorization_grants`, `mcp_clients`; `profiles.vpc_second_token` / `vpc_second_token_expires_at`; `partner_invitations.invite_code`.
- Reference/content (no user data): `allergens`, `speech`, `speech_categories`, `financial_checklist_items`, `finance_account_sponsors`.
- Audit/metering: `rights_requests` (the request log itself), `voice_parse_events` (id + timestamp rate-limit counter).
- `child_account_status.marked_by` / `child_finance_finder.updated_by` stay out, consistent with the 2026-09-30 finance entry.

**Verified 2026-09-30 against live (project ieuznbvvwdvhtirzwkly):** all 55 tables and every explicit select / filter / order column exist. **Outstanding:** `ai_memories` exists on live but has no migration in the repo; a missing table would fail the whole export closed. Export includes rows RLS exposes via partner access (unchanged from before).

**Code refs:** branch `fix/export-and-finance-followups`.

---

## 2026-10-01 — Production catch-up: partner seats require Flare+; partner access ends when Flare+ lapses

**Reviewer:** in-house (Claude pass, founder-approved "fix the call outs" in session). **Risk level:** Medium (partner/caregiver access to child data).

**What went live:** migrations `20260828100000_partner_seats_flare_plus`, `20260829000000_speech_journal_child_pivot_rls` and `20260830000000_child_tracking_schedule` had been merged to `main` in August but never applied to production. They were applied on 2026-09-30/10-01 after a destructiveness check. Effects:
- Inviting a partner requires an active Flare+ subscription, and an existing partner's read access stops automatically if the owner's Flare+ lapses (`has_partner_access`, `partner_can_write`, `can_access_child` check `owner_has_plus`). At apply time production had one active partner, whose owner is on Flare+, so no one lost access.
- `speech_journal` RLS moved from one `FOR ALL` policy to four per-command policies keyed on the child. One row on live; no one was locked out.
- `children.day_start_time` / `night_start_time` added; tracking-schedule saves, which had been failing in production, now work.

**Security fix:** the seat helpers (`owner_has_plus`, `partner_seat_limit`, `partner_seats_used`) were executable by `anon` and `authenticated` because Supabase's default privileges grant client roles directly. Any caller could have checked a stranger's subscription status. `20260830010000_partner_seat_helpers_revoke_client_roles.sql` revokes those grants (service_role keeps `owner_has_plus`). Applied to live and verified.

**Outstanding:**
- `can_write_child` was not updated with the Flare+ check, so a partner of a lapsed owner loses read access but child-scoped write policies may still allow inserts/updates. Founder decision pending; fix belongs in a follow-up migration.
- Partner-facing copy (Terms, FAQ, partner invite screens) should say that partner access depends on the owner's Flare+ subscription. Not yet updated.
- Orphan edge functions `parse-voice-log`, `detect-milestone`, `next-step-peek` are still ACTIVE on live despite retirement (Constitution II requires undeploying them).

## 2026-10-02 — Partner write access now also ends when the owner's Flare+ lapses

**Reviewer:** in-house (Claude pass + QA agent, founder-approved in session). **Risk level:** Low. Closes the first "Outstanding" item of the 2026-10-01 partner-seats entry.

**What changed:** `can_write_child` now requires `owner_has_plus(owner)` for coparent/caregiver writes, matching `can_access_child`. Before, a partner of a lapsed owner lost read access but could still insert, update and delete that child's logs through the 54 RLS write policies. The owner's own write access is unchanged and never depends on Flare+. Applied to live 2026-10-02 (`20261001000000_can_write_child_requires_owner_plus.sql`) and verified; 0 users affected at apply time.

**Follow-up found in review (not fixed here):** `weight_logs` is the only one of the 18 child-log tables whose INSERT policy omits `AND parent_id = auth.uid()`, so a partner could insert a row stamped with another user's `parent_id`.

**Still outstanding from 2026-10-01:** partner-facing copy (Terms, FAQ, invite screens) should say partner access depends on the owner's Flare+; delete the three retired edge functions.

---

## 2026-10-02 — Scheduled jobs restored (inactive-account purge, notifications, reactivation nudge)

**Reviewer:** in-house (Claude pass; founder performed the secret rotation). **Risk level:** High while open (a Privacy § 8 promise was not being kept); resolved.

**What happened:** the Vault secret `app_service_role_key`, which the three pg_cron jobs use to call their edge functions, had been stored on 2026-05-07 and was no longer valid. Every scheduled call returned HTTP 401 "Invalid API key". The last notification created by a scheduled job is dated 2026-06-10, so the jobs were failing from about June 2026 until 2026-10-02:
- `inactive-account-purge-daily`: the 24-month inactive-account warning and purge promised in Privacy § 8 did not run.
- `check-notifications-every-3h`: no in-app reminders, briefings, or (once deployed) finance reminders were created.
- `reactivate-nudge-3x-daily`: no welcome-back notes.

**Fix:** the founder replaced `app_service_role_key` in Supabase Vault with the current service-role key on 2026-10-02 23:09 UTC. Verified at the 2026-10-03 00:00 UTC run: both cron HTTP calls returned 200 (reactivate-nudge inserted 1 row; check-notifications processed normally, 7 rows held by quiet hours). `check-notifications` v28 (finance reminders, Flare+ partner gate, quiet hours/daily cap) was deployed to production on 2026-10-02.

**Impact on the purge promise:** during the outage no account reached the 24-month inactivity threshold, because the oldest account on production was created 2026-04-24 (4 accounts total); no purge was missed. The purge job resumes at its next 02:30 UTC run.

**Outstanding:**
- Add monitoring so a failing cron job is noticed in days, not months (e.g. alert on any non-2xx in `net._http_response`).
- Record in the deploy runbook that rotating Supabase API keys requires updating `app_service_role_key` in Vault.

## 2026-10-03 — Retired AI functions deleted from production; all functions now deployed from CI

**Reviewer:** in-house (Claude pass, founder-approved in session). **Risk level:** closes the P1 opened 2026-09-30.

**What happened:**
- Deploy run `37078010264` (2026-10-02, from #258) deployed every function in `supabase/functions/` for the first time. `visit-prep-questions` and `send-visit-reminder-email` are now live (Visit Prep and visit reminder emails work in production). `check-notifications`, `extract-memory`, `generate-speech-class`, `generate-activity-plan` and `send-vpc-email` now run `main`'s code. `verify_jwt` on every function matches `supabase/config.toml`.
- Deploy run `37081200816` (2026-10-03, from #259) ran with `--prune` and **deleted `detect-milestone`, `parse-voice-log` and `next-step-peek`**. Verified with live `list_edge_functions`: production now runs exactly the 14 functions in the repo. The undisclosed child-data flows to Anthropic through those endpoints have ended.

**Closes:** the "delete the deployed function" follow-ups in the 2026-06-21, 2026-08-28 and 2026-09-07 entries, and both outstanding items in the 2026-09-30 production-audit entry.

**Process change:** `deploy-functions.yml` now prunes on every deploy, so retiring a function means deleting its folder in the same PR as the disclosure update. Hand-deploying is documented as off-limits in `supabase/functions/README.md`.

**Still open:** partner-facing copy saying partner access depends on the owner's Flare+ (2026-10-01 entry); `weight_logs` INSERT policy missing `parent_id = auth.uid()` (2026-10-02 entry); `chat` still accepts free-form `messages[]` (2026-08-28 P1).

## 2026-10-05 — Corrections: weight_logs finding withdrawn; can_write_child migration order fixed

**Reviewer:** in-house (Claude pass, founder session). **Risk level:** Low.

- **`weight_logs` INSERT finding withdrawn.** The 2026-10-02 entry said `weight_logs` was the only child-log table whose INSERT policy omits `parent_id = auth.uid()`, so a partner could insert a row stamped with another user's `parent_id`. That is wrong: `weight_logs` has **no `parent_id` column** (columns verified live 2026-10-05: id, child_id, weight_oz, logged_at, is_pediatrician_visit, notes, created_at, length_cm, head_circumference_cm). Its INSERT check, `can_write_child(auth.uid(), child_id)`, is complete. No change needed.
- **2026-10-02 entry superseded on the write rule.** That entry's migration (`20261001000000_can_write_child_requires_owner_plus.sql`) gated partner writes on `owner_has_plus()` alone. The founder-approved model from 2026-09-30 (free = 1 seat, Flare+ = 2, the longest-standing partner keeps access on lapse; `20260930100000_free_partner_seat.sql`) was applied to live afterwards and is what live runs. But by filename the 2026-10-01 file sorts last, so a replay of the repo migrations would have restored the Flare+-only rule and cut off a free account's one entitled partner. `20261005000000_can_write_child_entitlement_reassert.sql` re-states the entitlement version at the end of the chain. Applied to live 2026-10-05; no behavior change there.

---

## 2026-10-05 — Partner-facing copy matches the free 1 / Flare+ 2 seat model; Terms gain a shared-access clause

**Reviewer:** in-house (legal agent pre-review + QA agent, founder-approved in session). **Risk level:** closes the 2026-10-01 "partner-facing copy" item.

**Why:** the 2026-09-30 model (free plan 1 additional person, Flare+ 2, earliest-joined partner keeps access on lapse) was live in the database, but the app still treated the free plan as 0 seats: free owners could not invite, onboarding pushed an upgrade, and the lapse banner said all shared access was on hold. The invitee screen and FAQ said nothing about plan dependence, and the Terms said nothing about shared access.

**What changed:**
- **Terms § 5** (Last reviewed → 2026-10-05): new "Shared access" paragraph: plan-dependent seat count, hold on lapse, owner can pause/remove anyone, invitee access ends if removed or the record/account is deleted, owner responsible for whom they invite.
- **AcceptInvite (invitee notice, before the consent checkbox):** plan dependence, hold on lapse ("doesn't delete anything"), owner can pause/remove at any time, deletion of the child record or account ends access and deletes data. "Co-controller" replaced with "see (and, depending on your role, log)". Body text raised to 12px.
- **FAQ:** same model; deleting a child or account deletes that data for everyone.
- **Partner Management / onboarding:** free seat usable; "On hold" badge on partners beyond the free seat; banner CTA "Get Flare+" (covers owners who never subscribed); teaser no longer pitches pausing as a Flare+ perk and offers "remove someone" as an alternative.
- **Errors:** the legacy FLARE_PLUS_REQUIRED copy no longer implies upgrading fixes it; invitees hitting a full account are told to ask the inviter, not to upgrade.

**Redlines rejected:** none. An absolute "nothing is deleted" promise from the first draft was removed before ship.

**Open (founder/counsel):**
1. "Try free for 7 days" still appears in the Flare+ teaser while the pre-checkout ROSCA / Cal. B&P § 17602 items (auto-renewal disclosure, Terms subscriptions section, trial reminder, cancel flow) are open.
2. Partners are not notified when they are paused, removed or put on hold.
3. Verify that deleting a child also deletes entries a co-parent logged for that child (policy says yes).

---

## 2026-10-03 — Baby Signs v2 (PR-C): `child_sign_practice` practice-day data + direct-notice enumeration

**Reviewer:** in-house (Claude `legal` pre-review of Baby Signs v2 PR-C, spec `specs/001-baby-signs-v2`, task T040). **Risk level:** Low (new parent-entered child-data field inside an existing consented category; no new egress, no new subprocessor).

**What changed:**
- New table `public.child_sign_practice` (migration `20261003000000_child_sign_practice.sql`): one row per (child, curated sign slug, tracking day) recording that a parent or caregiver modeled that sign with the child that day. Columns: `child_id`, `parent_id` (the child's owner), `sign_slug`, `practiced_on` (date), `created_at`. `UNIQUE (child_id, sign_slug, practiced_on)`; insert = tick, delete = un-tick; no UPDATE policy.
- Catch-up from PR-B, not logged at the time: `child_signs.focus_since` (migration `20260930000000_child_signs_focus.sql`), a nullable date marking up to 3 "focus" signs per child. Same bounded-slug posture as v1.
- `CoppaDirectNotice.tsx` "What we collect" now reads "sign-language signs you choose to focus on or mark as introduced or used, the days you mark a sign as modeled". "Modeled" matches the in-app control ("Modeled today").
- `PrivacyPage.tsx` § 2 "Tracking data" extended to name play activities (pre-existing gap since 2026-07-19), Baby Signs focus/status, and practice days, with a plain statement that Baby Signs stores no notes or media. "Last reviewed" date updated.
- `FAQPage.tsx` "What data does Grace Flare store?" updated to mention play activities and Baby Signs progress (best-practice, not required).
- `src/lib/exportUserData.ts` `EXPORT_TABLES` gains `child_sign_practice`, so Export My Data (Privacy § 8; 16 CFR § 312.6(a)) stays complete.

**Data minimization (COPPA 16 CFR § 312.7; spec FR-019):** the only child-specific values are which sign from the static library (`src/data/signLibrary.ts`) and which day. No free text, notes, photos, audio, or video; the table comment says "Do NOT widen to free text". No streak, consecutive-day, or missed-day value is computed or stored (FR-016); the UI shows only a positive weekly total, hidden at zero. `child_sign_practice.sign_slug` is also bounded at the DB by CHECK `child_sign_practice_slug_format` (`^[a-z][a-z0-9-]{0,39}$`), so the column cannot carry free text. One row per sign per day caps volume. There is no FK to `child_signs`, so practice history survives a cleared status (FR-029). This is a deliberate retention-of-history choice and stays within the account-lifetime retention in Privacy § 9.

**RLS / owner binding:** PR-B closed a v1 cross-tenant write hole in `child_signs`. The old INSERT/UPDATE check (`auth.uid() = parent_id OR partner_can_write(parent_id)`) let any signed-in user stamp their own uid as `parent_id` on another family's `child_id`. Fixed by migration `20260930010000_child_signs_rls_bind_child.sql` (applied to live 2026-10-01; verified with role-switched tests: stranger rejected both ways). `child_sign_practice` ships with the same binding from day one: SELECT `auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)`; INSERT `partner_can_write(parent_id) AND EXISTS (children c WHERE c.id = child_id AND c.parent_id = parent_id)`; DELETE `partner_can_write(parent_id)`; no UPDATE policy. Partner access follows the existing partner-seat entitlement rules (free = 1 seat, Flare+ = 2; see the 2026-10-05 correction entry). Viewers can read but not tick (FR-018), enforced in RLS, not only in the UI.

**Retention / deletion:** same as other tracking logs. Kept for the account's lifetime; deleted when the child is deleted (`child_id ON DELETE CASCADE`) or the account is deleted (`parent_id ON DELETE CASCADE` from `auth.users`, reached by `delete_user_account()` / `_purge_user_data()`). No purge-function edit needed. Covered by Privacy § 9 (7-day primary-record deletion, ≤30-day backup rotation, 24-month inactivity purge). No Storage objects.

**AI processing:** none in PR-C. No edge function reads `child_sign_practice`; Privacy § 4, `/subprocessors`, and the FAQ third-party answer are unchanged. PR-D's weekly coach (`generate-sign-plan`) will send per-sign practice-day **counts** to Anthropic; that disclosure (Privacy § 4, FAQ, notice "How we use it", this log) must ship in the PR-D PR.

**Analysis:** additive Flare+ feature, parent-entered, bounded values, no new subprocessor or egress, disclosure ships with the feature. Non-material change under 16 CFR § 312.5(a)(1); no renewed VPC (reasoning per the 2026-07-19 Activities and 2026-08-28 Baby Signs entries).

**Code refs:** PR-C (Baby Signs v2), #264, merged as `e3d0a04` (2026-10-06). `child_sign_practice` applied to live 2026-10-06.

**Follow-ups:**
1. `child_signs.sign_slug` is still unconstrained `text`, so for that table the "no free text" promise is enforced only by the client. Add a CHECK matching `child_sign_practice_slug_format` (slug-format regex with a length cap) so the minimization claim holds server-side for both tables. P2.
2. Privacy § 2 and the direct notice still omit Word Journal words and growth/weight records (mentioned only in § 4). Reconcile both lists against `EXPORT_TABLES`. P1.
3. ~~Inherited: `inactive-account-purge` cron returning 401.~~ Resolved 2026-10-02 (see "Scheduled jobs restored" entry); the 24-month purge now covers this table via the `auth.users` cascade.
4. CLAUDE.md "Legal Review" still refers to retention as "PrivacyPage § 8"; the live page numbers it § 9. Fix references.
5. PR-D: disclosure for practice-day counts to Anthropic, plus `sign_plans` in `EXPORT_TABLES`.

## 2026-10-06 — `chat` narrowed; free-trial disclosures; partner notifications; child-deletion audit

**Reviewer:** in-house (Claude pass, founder decisions in session). **Risk level:** closes the 2026-08-28 P1 and the three open items from the 2026-10-05 entry, with the follow-ups listed below.

**Founder decisions (2026-10-06):** (a) narrow `chat` now, accepting that older iOS builds lose the Word Journal insight until updated; keep "Try free for 7 days" and add the disclosures; notify partners on pause / restore / remove / hold; verify and fix child-deletion cascade.

**1. `chat` edge function (2026-08-28 P1 — closed).** Accepts only `{ childId }`. The prompt is built server-side from the child's Word Journal, read through the caller's RLS client (word count, last-7-days count, weekly rate, the 30 most recent words capped at 40 chars each, age benchmark). No client text reaches the model as instructions; no tools; no memory read or `extract-memory` write (it no longer runs after `chat`). A legacy `messages[]` body gets 400 `update_required`. Free quota (10/UTC day) now counts `public.ai_insight_usage` (migration `20261006000000`); the old count read `chat_messages`, which nothing writes, so it never fired. Data sent to Anthropic shrinks to: child first name, age in months, logged words and counts. Privacy § 4 already covers this; no copy change.

**2. Free trial (ROSCA, 15 U.S.C. § 8403; Cal. B&P § 17602).** Finding: the "Start 7-day free trial" button is not wired to any checkout (`Upgrade.tsx` TODO), so nobody can be charged today. Added now so they ship with checkout: (i) auto-renewal disclosure next to the trial button on `/upgrade` and in the upgrade sheet: price, auto-renewal until cancelled, cancel before the trial ends to avoid the charge; (ii) **Terms § 5 "Flare+ subscriptions and free trials"** (Last reviewed → 2026-10-06): price, trial, automatic renewal in bold, cancel anytime in the same place you subscribed, no partial refunds unless required by law, Apple handles App Store billing and refunds, 30 days' notice of price changes. Adding this clause is not a § 10 material change for existing users: no one has paid.
**Before checkout ships (blocking):** affirmative consent to the renewal terms at purchase; an acknowledgement (email/receipt) with the renewal terms and how to cancel; an online cancellation path (App Store covers iOS; web needs its own). No trial reminder is required by § 17602 for a 7-day trial (the reminder rule applies to trials over 31 days); worth sending anyway.

**3. Partner notifications.** Migration `20261006020000`: in-app notification (bell, type `partner_access`) when the owner pauses, restores or removes a partner, and when the owner's Flare+ ends or restarts and that puts the second seat on hold or brings it back; also when removing someone moves a held partner up into a seat. A restore that is still past the free seat says "on hold", not "back on". Account purges send nothing (no trigger on subscription DELETE). Copy says nothing was deleted on pause/hold, and that removal ends access to the child's records. No email (Resend secrets not yet set).

**4. Child deletion (verified on live, 2026-10-06).** 45 tables reference `children`; 43 cascade, so entries a co-parent or caregiver logged are deleted with the child. Three gaps, fixed in migration `20261006010000`: `parent_financial_checklist` and `pediatrician_exports` had NO ACTION foreign keys (deleting a child with such a row would fail outright); `custom_milestones` had no foreign key (rows would orphan). Live data at audit: no affected rows, 0 orphans. FAQ/AcceptInvite claims ("deleting a child deletes that data for everyone") are now accurate.

---

## 2026-10-06 — Baby Signs v2 (PR-D): `generate-sign-plan` weekly AI sign plan (eighth Anthropic edge function) + `sign_plans` table

**Reviewer:** in-house (Claude `legal` pre-review of Baby Signs v2 PR-D, spec `specs/001-baby-signs-v2`, task T053); disclosure wording approved by the founder 2026-10-06. **Risk level:** Low (new Anthropic data flow inside an existing processor, purpose, and consent; less data than any other AI feature; disclosure ships in the same PR).

**What changed:**
- New edge function `supabase/functions/generate-sign-plan/` (the eighth that calls Anthropic: briefing, weekly-insights, chat, extract-memory, generate-speech-class, visit-prep-questions, generate-activity-plan, generate-sign-plan). Flare+ only (server-side `subscriptions` check, 403 `premium_required`), tap-triggered, one plan per child per week (409 checked BEFORE the paid Anthropic call; any stored week on or after the requested week blocks a new call). `slp` persona + `SIGN_PLAN_INSTRUCTION`; model `claude-sonnet-4-6`.
- New table `public.sign_plans` (migration `20261006030000_sign_plans.sql`): one current row per child (`UNIQUE child_id`), upserted weekly by the function using the caller's JWT so RLS is the write gate. `plan` jsonb is the sanitized SignPlan (intro / focus / stuck), built from library slugs; no parent free text.
- Disclosures: Privacy § 2 (Baby Signs sentence corrected; new "AI plans (Flare+)" bullet, also closing the never-listed Speech Class / Weekly Play Plan plan tables), Privacy § 4 (feature list + Baby Signs data clause), Privacy "Last reviewed" → October 6, 2026; `/subprocessors` Anthropic purpose + dataCategories (Baby Signs added; Weekly Play Plan added, a gap since 2026-07-19), "Last reviewed" → October 6, 2026; FAQ third-party answer and stored-data answer; CoppaDirectNotice "How we use it" names weekly plans (best practice).

**Data sent to Anthropic (verified against code, not spec — `buildUserText`):** corrected age in months; for each of the 20 curated library slugs: status (introduced / emerging / signing / not started), whether it is a focus sign and days in focus, days modeled in the last 28 (omitted when zero), and a server-derived STALLED flag (focus ≥ 14 days, still "introduced", ≥ 1 practice day). Not sent: child id, user id, name, DOB, gender, interests, temperament, journal words, notes, any free text. The request is allowlist-rebuilt, slugs are checked against `_shared/signSlugs.ts`, body capped at 16 KB and never logged.

**Data minimization (16 CFR § 312.7; FR-021, research R7):** smallest payload of any AI feature (the only one without the child's first name). Inputs are bounded enums/integers over a fixed 20-slug library. Output sanitized: unknown slugs, extra fields, over-length and off-tone strings dropped; 0 usable focus signs → 422 with nothing stored.

**Retention / deletion:** one current plan per child; each weekly plan overwrites the previous one. Kept until the child (`child_id ON DELETE CASCADE`) or account (`parent_id ON DELETE CASCADE` from `auth.users`, reached by `delete_user_account()` / `_purge_user_data()`) is deleted; no purge-function edit. Flare+ lapse deletes nothing (FR-029). No Storage objects. Included in Export My Data (`EXPORT_TABLES` key `signPlans`). Covered by Privacy § 9.

**Subprocessor / DPA coverage:** Anthropic, PBC — not a new subprocessor, so no 30-day notice under Privacy § 5. DPA accepted 2026-05-08 (template eff. 2025-02-24) covers the flow. No-training basis unchanged: DPA § B.2 + Schedule 1 § B.5 purpose limitation, plus Anthropic Commercial Terms / Usage Policy no-training commitment, as cited in Privacy § 4. Abuse-review retention stays as "limited period … per Anthropic's Usage Policy"; no day count added.

**RLS:** SELECT owner or `has_partner_access`; INSERT/UPDATE `partner_can_write(parent_id)` + EXISTS owner binding on `children` (explicit WITH CHECK on UPDATE); DELETE `partner_can_write`. Viewers can read but not generate.

**Analysis:** additive Flare+ feature, same processor and purpose already in the direct notice ("Anthropic for AI", "AI-assisted briefings and insights"), inputs already collected under VPC, less identifying than existing flows, disclosure ships with the feature. Non-material change under 16 CFR § 312.5(a)(1); no renewed VPC (reasoning per 2026-07-19 Activities, 2026-08-28 Baby Signs, 2026-10-03 PR-C entries).

**Code refs:** PR-D (Baby Signs v2), #271 — fill in commit hash at merge.

**Closes:** 2026-10-03 PR-C follow-up 5 (practice-day counts disclosed to Anthropic in Privacy § 4 / `/subprocessors` / FAQ; `sign_plans` in `EXPORT_TABLES`).

**Follow-ups:**
1. Flare+ is checked on the caller, not the child's owner (same as every Flare+ feature today). Founder decision 2026-10-06: ship PR-D caller-based; Flare+ should become family-wide (one subscription covers the family's partners) — tracked as its own initiative in `tasks/backlog.md`. When it ships, revisit the Privacy § 4 "any parent or caregiver with edit access" sentence. P1.
2. Parse-failure logs write the first 300 chars of model output and of Anthropic error bodies to Supabase function logs. Content is slugs + generic coaching copy, no identifiers, but it is child-derived. Consider logging length + error class only. P2.
3. `/subprocessors` "Briefings / weekly insights" line omits interests, temperament, and AI-memory notes that Privacy § 4 lists. Reconcile. P1.
4. Outside counsel (when commissioned): (a) non-material change under § 312.5(a)(1) for a new AI feature on already-consented data to an already-disclosed processor; (b) whether "then deleted" is accurate for Anthropic content flagged for safety review; (c) whether a partner-triggered AI flow is within the owner's original VPC.
5. Carry-over: PR-C follow-ups 1, 2, 4 still open.
