# Milestone Monetization — Strategy + First-Ship Spec

## Context

Grace Flare's milestone-development surface is the deepest feature in the app (5 categories, SLP-authored flags, custom_milestones with caption+confidence, the speech_journal). The photo-milestone feature (AI photo-detection + manual photo attach) was retired from the frontend; on the milestone surface, `speech-class` is now the paywalled feature. The rest of the value parents get from this area is free, and Flare+ is positioned as a feature grab-bag ("The Coach that knows your baby", `src/pages/Upgrade.tsx:43-46`) — not as the answer to a specific parent job.

Five inputs converge on the same thesis:

- **Parents don't pay to track milestones.** CDC Milestone Tracker (free, 1.5M+ DLs) and Pathways.org Baby Milestones (free, OT/PT/SLP-reviewed) are the price floor. Nara Baby is fully free. Paywalling a checklist looks predatory.
- **Parents do pay for "what do I do about it."** Huckleberry Plus ($68.88/yr) sells nap *prediction*, BabySparks Premium ($119.99/yr) sells *activity sequencing*, Lovevery ($480+/yr) sells what *toy to put in front of the kid* this week, Expressable charges $175 for an SLP eval. The willing-to-pay zone is *prescription*, not data.
- **The "watch-tier" milestone flag is the highest-intent moment, but the worst monetization moment** — UX flagged screenshot/1-star-review risk if upsells sit next to a safety signal.
- **The pediatrician-visit prep moment is task-oriented and recurring** (AAP 2/4/6/9/12/15/18/24mo schedule), with the cleanest free→paid conversion economics.
- **The celebratory/share moment** is the cleanest fit for a one-time keepsake add-on (no anxiety vector, drives word-of-mouth).

The goal: reposition Flare+ around the parent job ("what do I do about it"), ship three milestone-domain features tied to three distinct user moments, and wire Stripe billing so the trial CTA on `Upgrade.tsx:90` stops being a TODO.

---

## Strategy — the three monetization shapes

### Shape A — Subscription anchor (Flare+ remains $59.99/yr, gets a milestone story)
Add three milestone features to `PREMIUM_FEATURES` and lead the `Upgrade.tsx` editorial with the milestone job. Keep the existing photo-detection, cry-analysis, growth-analytics perks. Annual stays at $59.99/yr — within the Huckleberry/BabySparks band and below the Lovevery threshold.

### Shape B — One-time add-on SKU ($14.99 "Year One Milestone Book")
Artifactual à la carte that doesn't require a sub. Sells to free users too. Backed by the `carousel` skill (`babybook` mode). Lenny's bundle-vs-add-on rule (<70% usage → add-on) applies here.

### Shape C — Specialist screener add-on ($19 one-time or 1/yr included in Flare+)
SLP screener report or OT activity plan generated from `speech_journal` + `milestone_flags` data. Anchored against Expressable's $175 SLP eval — Grace Flare is the 10× cheaper triage. Future option: rev-share referral funnel to a partnered tele-SLP (no clinical liability on Grace Flare).

---

## Bright lines — do not cross

These came up in both the developmental advisor and UX reviews and are non-negotiable:

1. **The EI referral itself stays free.** Paywall the *formatted packet* if we want to monetize the artifact, but never the safety signal or the state phone number.
2. **No upsells on the `act` severity tier of `MilestoneFlags`.** Restrict to `watch` tier with heavy dismiss affordances. Moderated test (n=6) before shipping flag-adjacent placements.
3. **Never imply Flare+ would have caught a delay sooner.** Anti-pattern microcopy banned.
4. **Never paywall the milestone checklist, the per-child progress UI, or red-flag surfacing.** CDC sets price = $0 on the first; safety on the others.
5. **No countdown timers on milestone windows.** Persona prompt is explicit: "Milestone copy is celebratory, not diagnostic."

---

## First-ship spec — three features, three moments

All three ship together because the strategy needs all three legs (anchor sub + add-on + screener) to test the full thesis. Verification (Section 7) is unified.

### Feature 1 — Pediatrician Visit Prep Pack (Flare+ subscription value)
**Moment:** Parent is 10–14 days from the next AAP well-visit. Task-oriented, no fear vector.
**Surface:** Card in `src/components/TodaysBriefing.tsx`, plus a one-tap export on `src/pages/dashboard/MilestonesPage.tsx`.
**Output:** PDF with (a) milestone progress + flag summary since the last visit, (b) 3 pediatrician questions auto-generated from the child's flagged + unachieved milestones in age window, (c) 90-day log roll-up (sleep avg, feeds, diaper baseline, illness flags). Reuses `PediatricianExport.tsx` rendering primitives.
**New edge function:** `supabase/functions/generate-prep-pack/index.ts` — takes `child_id`, returns 3 questions via Claude (system prompt anchored to the `pediatrician` persona in `_shared/personas.ts`). Caches the result for 24h.
**Trigger logic:** `useNextWellVisit(childId)` hook returns the next AAP visit date based on `children.date_of_birth`. `TodaysBriefing` shows the card when `daysUntilVisit <= 14 && daysUntilVisit > 0`. Dismissible per-visit (write to `localStorage` via `usePreferences`, key `prep-pack-dismissed-{childId}-{visit}`).
**Microcopy on the card (UX-approved direction):** "Maya's 9-month visit is in 12 days. Want a 1-page handout?" → button: "Build the prep pack" → opens `UpgradeSheet` with feature label "Pediatrician Visit Prep Pack" if free user, else navigates to the pack.

### Feature 2 — Year One Milestone Book (one-time add-on, $14.99)
**Moment:** Achievement-confetti on `MilestonesPage` after a milestone is logged. Also a quiet entry in MorePage.
**Surface:** New `src/components/milestones/MilestoneBookCard.tsx` rendered on `MilestonesPage` when the child has >5 milestones logged OR is past 12mo. Achievement confetti gets an "Add to your year-one book" CTA in the success toast (not a hard upsell).
**Output:** Multi-page PDF + shareable image carousel using the `carousel` skill in `babybook` mode. Includes cover, age-bucket dividers (newborn / 0-3mo / 3-6mo / 6-9mo / 9-12mo / 1y+), one page per milestone with photo + caption + age at achievement. Premature-baby corrected-age handled per `carousel` SKILL.md line 89.
**New edge function:** `supabase/functions/generate-milestone-book/index.ts` — takes `child_id`, returns rendered PDF + image URLs. Stored in a new Storage bucket `milestone-books/{user_id}/{child_id}-{order_id}.pdf`.
**Entitlement model:** Free users see a watermarked preview (first 3 pages); paid users get the full export. Flare+ subscribers also get full export at no extra charge (bundle benefit), so the SKU sells primarily to non-subscribers who don't want a sub.

### Feature 3 — Variation-vs-Concern Decision Tree + 7-Day Practice Plan (Flare+ subscription value)
**Moment:** Parent expands a `watch`-tier flag card in `MilestoneFlags.tsx` (NOT `act` tier). Also surfaceable via `AIChatWidget` developmental/slp persona.
**Surface:** New `src/components/milestones/FlagFollowUp.tsx` rendered inline below a `watch` flag, below the existing dismiss affordances. Free users see the decision tree (reuses persona age-window data). Flare+ users get the 7-day practice plan generated by the `drill` skill.
**Output:** (a) Decision-tree component reading age windows from `personas.ts:102-105`; resolves "still in window — variation likely" or "past window — bring up at next visit." (b) 7-day practice plan via `drill` skill output format (Goal / Age check / One rep / Daily plan / Week progression / When to escalate / How to log).
**New edge function:** `supabase/functions/generate-drill-plan/index.ts` — wraps the `drill` skill prompt; takes `child_id` + `milestone_id`, returns the structured drill. Logs back to `custom_milestones` with `source: 'drill'` per the skill spec.
**Microcopy (UX-approved):** "When you're ready, see a 7-day at-home practice plan for [skill]." Dismissible. Below the fold of the flag card. Never inside an `act` tier card.

---

## Billing architecture — Stripe Checkout + Customer Portal

**Decision: Stripe, not RevenueCat.** Grace Flare is a web-deployed React app at graceflare.com (per `CLAUDE.md`). The `subscriptions` table already lists `stripe` as a valid `provider` (`supabase/migrations/20260429010000_subscriptions.sql:17`). RevenueCat's value is iOS/Android IAP abstraction — not needed until mobile-app wrapping. Defer RevenueCat to a future migration.

### Schema additions (new migration)
`supabase/migrations/20260524000000_billing_stripe.sql`:
- Extend `subscriptions` table: add `stripe_customer_id text`, `stripe_price_id text`, `cancel_at_period_end boolean default false`.
- New `addon_purchases` table for one-time SKUs (Year One Book, SLP Screener):
  ```
  id, user_id, child_id, sku ('milestone-book' | 'slp-screener' | 'ot-plan'),
  stripe_payment_intent_id, status ('pending' | 'paid' | 'refunded'),
  amount_cents, currency, artifact_url, created_at
  ```
  RLS: user can SELECT own rows; INSERT/UPDATE only via service role (webhook).
- New `entitlements` view (or function) that returns the effective set of unlocked features per user — union of Flare+ tier + paid add-ons. `usePremium.tsx` extends to expose `hasEntitlement(feature | sku)`.

### Stripe products to create (Stripe dashboard, not code)
- `flare-plus-monthly` — $9.99/mo recurring, 7-day trial
- `flare-plus-yearly` — $59.99/yr recurring, 7-day trial
- `milestone-book` — $14.99 one-time
- `slp-screener` — $19 one-time
- `ot-plan` — $19 one-time

### New edge functions
- `supabase/functions/stripe-checkout/index.ts` — POST `{ sku, mode: 'subscription' | 'payment' }` → returns Checkout Session URL. Uses the user's JWT to identify them; creates `stripe_customer_id` if missing.
- `supabase/functions/stripe-portal/index.ts` — POST → returns Customer Portal URL for manage-subscription / cancel / update-payment.
- `supabase/functions/stripe-webhook/index.ts` — handles `customer.subscription.{created,updated,deleted}`, `invoice.payment_{succeeded,failed}`, `checkout.session.completed` for one-time purchases. Writes to `subscriptions` or `addon_purchases` table via service role. Signature verification via `STRIPE_WEBHOOK_SECRET`.

### Secrets (Supabase dashboard → Edge Functions → Secrets)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_PRICE_MILESTONE_BOOK`, `STRIPE_PRICE_SLP_SCREENER`, `STRIPE_PRICE_OT_PLAN`

### Frontend wiring
- `src/pages/Upgrade.tsx:90` — replace TODO with `await stripeCheckout({ sku: plan === 'yearly' ? 'flare-plus-yearly' : 'flare-plus-monthly', mode: 'subscription' })` → `window.location = url`.
- New `src/components/AddOnCheckoutButton.tsx` — reusable button for one-time SKUs. Used by `MilestoneBookCard` and the future screener card.
- New `src/hooks/useStripeCheckout.ts` — wraps the edge function call.
- `usePremium.tsx` — add `hasAddOn(sku)` helper that checks `addon_purchases.status === 'paid'`.

---

## Files to create / modify

**New (frontend):**
- `src/components/milestones/PrepPackCard.tsx` (TodaysBriefing surface)
- `src/components/milestones/MilestoneBookCard.tsx` (MilestonesPage surface)
- `src/components/milestones/FlagFollowUp.tsx` (MilestoneFlags inline surface, watch-tier only)
- `src/components/AddOnCheckoutButton.tsx`
- `src/hooks/useNextWellVisit.ts`
- `src/hooks/useStripeCheckout.ts`

**Modify (frontend):**
- `src/components/TodaysBriefing.tsx` — render `PrepPackCard` when `daysUntilVisit ≤ 14`
- `src/pages/dashboard/MilestonesPage.tsx` — render `MilestoneBookCard`; add prep-pack export button
- `src/components/milestones/MilestoneFlags.tsx` — render `FlagFollowUp` only on `watch` severity
- `src/pages/Upgrade.tsx` — replace TODO at line 90 with real Stripe Checkout call; rewrite PERKS array to lead with the milestone job (keep the existing 5 but reorder: Prep Pack first, then photo-detect, then drill, then sync, then growth)
- `src/hooks/usePremium.tsx` — add `prep-pack`, `practice-drills` to `PREMIUM_FEATURES`; add `hasAddOn(sku)` helper and `addon_purchases` query

**New (backend):**
- `supabase/migrations/20260524000000_billing_stripe.sql` (schema described above)
- `supabase/functions/generate-prep-pack/index.ts`
- `supabase/functions/generate-milestone-book/index.ts`
- `supabase/functions/generate-drill-plan/index.ts`
- `supabase/functions/stripe-checkout/index.ts`
- `supabase/functions/stripe-portal/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

**Reused (do not rewrite):**
- `drill` skill at `.claude/skills/drill/SKILL.md` — drives `generate-drill-plan`
- `carousel` skill at `.claude/skills/carousel/SKILL.md` (`babybook` mode) — drives `generate-milestone-book`
- `pediatrician` + `developmental` + `slp` personas in `supabase/functions/_shared/personas.ts:121-123` — system prompts for the new edge functions
- `PediatricianExport.tsx` PDF rendering primitives
- `PremiumGate.tsx` + `UpgradeSheet.tsx` — paywall affordances
- `subscriptions` table + `usePremium` query (extend, don't replace)
- `custom_milestones`, `milestone_flags`, `speech_journal` tables — read-only sources for all three features

---

## Sequencing — what ships in what order

1. **Billing primitives first** — migration + 3 Stripe edge functions + `useStripeCheckout` + replace `Upgrade.tsx:90` TODO. Verifies the trial CTA actually charges and that webhook updates `subscriptions`.
2. **Pediatrician Visit Prep Pack** — single biggest UX-confidence bet, ships next. Establishes the "Flare+ = answer to a parent job" repositioning.
3. **Year One Milestone Book** — proves the add-on SKU model end-to-end (Stripe payment intent → webhook → `addon_purchases` → artifact URL → download).
4. **Variation-vs-Concern + Practice Plan** — ships last because it requires the moderated UX test (n=6) per the UX advisor's risk note. Test before flag-adjacent placement goes live.

QA agent runs after each of steps 1–4 before commit. Legal review (in-house) of any new user-facing copy.

---

## Verification

**End-to-end test in dev for each shipped feature:**

1. **Billing wiring** — Use Stripe test mode keys. Test cases: (a) `4242 4242 4242 4242` happy path → webhook fires → `subscriptions.status = 'trialing'`, `tier = 'plus'`; (b) trial expires after 7 days → `status = 'active'`; (c) `4000 0000 0000 0341` (attaches successfully, charge fails) → `status = 'past_due'`; (d) customer-portal cancel → `cancel_at_period_end = true`, `status = 'active'` until period end then `canceled`; (e) one-time `milestone-book` purchase → `addon_purchases.status = 'paid'`, artifact URL populated.
2. **Prep Pack** — Add a test child with DOB exactly 9mo − 12d ago. Reload `TodaysBriefing` → prep-pack card visible. Click as free user → `UpgradeSheet` opens. Click as Flare+ user → PDF renders with 3 contextual questions referencing the child's actual flagged milestones.
3. **Milestone Book** — Add a test child with 6 logged milestones across 3 age buckets. Open `MilestonesPage` → book card visible. Free user clicks → 3-page watermarked preview. After purchase via Stripe test card → full PDF downloads, image carousel renders, file persisted in Storage bucket.
4. **Flag follow-up** — Trigger a `watch`-tier flag (insert a `milestone_flags` row with `severity = 'watch'`). Expand the flag card → decision tree renders for free user. Flare+ user sees the 7-day drill plan with correct age-window check from `personas.ts`. Confirm NOTHING renders on `act` severity.
5. **Microcopy review** — Read every new string against the bright-lines list above and the brand voice section of `CLAUDE.md`. Specifically search for: any countdown phrasing, any "would have caught", any "delay risk", any EI-referral upsell.
6. **Legal log update** — Append an entry to `docs/legal-review-log.md` for the new billing flow, Stripe as a new subprocessor, and update `src/pages/SubprocessorsPage.tsx` with Stripe. PrivacyPage § 4 / § 5 review for whether AI-generated reports (prep pack, drill plan, book) need additional disclosure beyond existing Anthropic disclosure.
7. **Advisor recheck** — Re-invoke the `developmental` and `ux` agents on the final shipped copy before launch to confirm bright lines held.

**Out of scope for this plan (parking lot):**
- Tele-SLP rev-share referral funnel (Feature 3, Phase 2)
- iOS/Android wrapping + RevenueCat
- Van Westendorp WTP survey to validate the $59.99/yr and $14.99 add-on price points (recommended pre-launch but not blocking)
- Employer/health-plan B2B2C wedge (researcher: park until 2027)
