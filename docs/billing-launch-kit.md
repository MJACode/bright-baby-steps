# Flare+ Billing Launch Kit (draft)

> **Status:** DRAFT, prepared 2026-09-30 by the in-house `legal` agent at the founder's request. Ship it **with** paid checkout, not before.
> This is a pre-review by an AI assistant trained on publicly available materials. It is not legal advice. Before paid Flare+ launches, a licensed attorney must review and sign off: in Delaware (governing law), and in California and New York, where auto-renewal exposure is highest. Recommendation: add "paid billing goes live" to CLAUDE.md's outside-counsel triggers.

## 0. Legal framework

| Requirement | Source | Where it's handled |
|---|---|---|
| Material terms shown clearly and conspicuously **before billing info is collected** | ROSCA, 15 U.S.C. § 8403(1) | § 1 disclosure block, on `/upgrade`, before the Stripe or Apple hand-off |
| Express informed consent **before charging** | ROSCA § 8403(2); Cal. B&P § 17602(a)(2) | § 1 consent checkbox plus CTA |
| A simple way to stop recurring charges | ROSCA § 8403(3); Cal. B&P § 17602(d) (online cancellation, AB 2863) | § 2 clause 14.5; § 4 Manage-plan build |
| Offer terms shown close to the consent request | Cal. B&P § 17602(a)(1); § 17601(c) "clear and conspicuous" | § 1: block sits directly above the CTA, at least `text-xs`, full contrast |
| Acknowledgment the customer can keep: offer terms, cancellation policy, how to cancel (and, for a trial, how to cancel before being charged) | Cal. B&P § 17602(a)(3) | § 3B confirmation email |
| Notice of material changes, including price | Cal. B&P § 17602(c); Terms § 10 | Clause 14.7; § 4 |
| Annual renewal reminder | CA (AB 2863) and CO, VA, MN, DC, among others; windows vary, **counsel to verify** | § 3C |
| NY auto-renewal | NY GBL §§ 527–527-a (GOL § 5-903 likely does not cover digital subscriptions); counsel to verify | Same controls as CA |
| App Store rules (iOS via Capacitor) | Apple App Review Guidelines 3.1.1, 3.1.2, 5.1.1(v) | § 1B, clause 14.5, § 4 |

> The FTC's Click-to-Cancel amendments (16 CFR 425) are believed to have been vacated by the 8th Circuit in July 2025. ROSCA and state auto-renewal laws still apply. Counsel to verify.

---

## 1. Paywall disclosure block and consent mechanism

**Recommended:** a dedicated, **unticked** checkbox covering auto-renewal only, plus clear button text. ROSCA accepts consent through the button text alone when the terms sit next to the button. California (AB 2863) requires affirmative consent to the automatic-renewal terms specifically, and a checkbox is the strongest evidence of that for the cost of one tap.

Build rules:
- The checkbox starts unticked. The CTA stays disabled until it is ticked.
- The whole block sits **above** the CTA, at least `text-xs`, with no `opacity-50`. On the dark paywall use `text-background/90` or stronger.
- Prices and dates are data-driven: Stripe Price on web, StoreKit `displayPrice` on iOS. Never hardcode them. The trial end date is today + 7, in the user's locale.
- The block updates when the user switches plans.
- Record the consent (§ 4, item 3).

### 1A. Stripe web checkout

**Yearly:**

> **Free for 7 days, then $59.99 a year.**
> Your Flare+ plan renews automatically every year at $59.99, plus any applicable tax, until you cancel. No charge today. We'll email you 3 days before your trial ends. Cancel before **{Wed, Oct 7}** and you won't be charged a thing.
> Cancel anytime in **Profile › Flare+ › Manage plan**. It takes a couple of taps.
>
> [ ] I understand Flare+ renews automatically at **$59.99/year** after my free trial unless I cancel.
>
> **[ Start 7-day free trial ]**
>
> By starting your trial you agree to the [Flare+ subscription terms](/terms#flare-plus) and our [Privacy Policy](/privacy).

**Monthly:** the same block with "$9.99 a month", "every month" and "$9.99/month".

**On Stripe Checkout** (`custom_text.submit.message`): "Free until {Oct 7}, then {$59.99/year} until you cancel. Cancel anytime in Profile › Flare+."

**Trial already used:** the first line becomes "**$59.99 a year, starting today.**" and the trial sentences are dropped. The checkbox reads "I understand Flare+ renews automatically at $59.99/year unless I cancel." The CTA reads **[ Subscribe for $59.99/year ]**.

### 1B. Apple in-app purchase (iOS)

> **Free for 7 days, then {$59.99} a year.**
> Payment is charged to your Apple ID when your trial ends. Your plan renews automatically every year at {$59.99} unless you turn off auto-renew at least 24 hours before the end of your trial or current year. We'll email you 3 days before your trial ends.
> Manage or cancel anytime in your iPhone's **Settings › [your name] › Subscriptions**, or tap **Manage plan** in Profile › Flare+ and we'll take you there.
>
> [ ] I understand Flare+ renews automatically at **{$59.99}/year** after my free trial unless I cancel.
>
> **[ Start 7-day free trial ]**
>
> [Flare+ subscription terms](/terms#flare-plus) · [Privacy Policy](/privacy) · [Restore purchases]

**Monthly:** swap in "{$9.99} a month", "every month" and "current month". `{$59.99}` must be StoreKit's localized `displayPrice`. Keep the checkbox (for California) even though Apple's sheet authorizes the payment. The Terms and Privacy links on the purchase screen are required under Guideline 3.1.2.

---

## 2. Terms of Service: new § 14 "Flare+ subscriptions"

**Placement:** insert as **§ 14** (anchor `id="flare-plus"`) and renumber Contact from § 14 to **§ 15**. This keeps the §§ 9, 11 and 12 references stable.

**Related updates:**
1. **§ 1 Acceptance:** add "If you start a Flare+ trial or subscription, § 14 also applies to you."
2. **§ 10 Changes:** leave as is. It already requires 30 days' notice and renewed affirmative acceptance for fee changes, and 14.7 matches it.
3. **CLAUDE.md "Locked decisions":** change "`TermsPage.tsx` § 14" (Contact) to § 15.
4. **Bump** the Effective and Last reviewed dates.
5. **Privacy § 2:** add "**Subscription and payment data:** your plan, trial and renewal dates, subscription status, and a record of your consent to automatic renewal. Card details are collected and stored by Stripe (web) or Apple (App Store); we never see or store your full card number."
6. **Privacy §§ 4/5 and `/subprocessors`:** add **Stripe, Inc.** and describe Apple as an independent party. Privacy § 5 promises **30 days' notice** before a new subprocessor, so the notice email must go out at least 30 days before live processing. **Longest lead time in this kit.**
7. **Paywall copy:** `UpgradeSheet.tsx` "Free tier keeps 30 days. Flare+ keeps everything." should become "**Free shows your last 30 days. Flare+ shows everything.**" This assumes the history limit is display-only; verify.
8. **Log** the change in `docs/legal-review-log.md` when it ships.

### Clause text

**14. Flare+ subscriptions**

**14.1 What Flare+ is.** Flare+ is an optional paid plan that adds the features shown on the Flare+ page in the app. The free plan stays free. We may improve, change, or retire individual Flare+ features over time. If we remove a Flare+ feature we advertised as a main part of the plan, we'll tell you by email first, and you can cancel and ask for a pro-rated refund of the unused part of your current billing period.

**14.2 Price and billing cycle.** Flare+ is available as a monthly plan (**$9.99 per month**) or a yearly plan (**$59.99 per year**), plus any applicable taxes. The price and billing period shown when you subscribe are the ones that apply to you. If you subscribe on the web, Stripe, Inc. processes your payment on our behalf. If you subscribe through the Apple App Store, Apple charges your Apple ID, and Apple's terms also apply to payment, billing, and refunds for that purchase.

**14.3 Automatic renewal.** **Your Flare+ subscription renews automatically** at the end of each billing period for another period of the same length (one month or one year). We charge your payment method at the start of each new period until you cancel. There's no minimum commitment. For yearly plans, we'll also email you before each yearly renewal with the renewal date, the price, and how to cancel.

**14.4 Free trial.** New Flare+ subscribers get one 7-day free trial per account. You won't be charged during the trial. **Unless you cancel before your trial ends, it automatically converts to the paid plan you chose, and we charge the price shown when you started the trial.** We'll email you at least 3 days before your trial ends. If you cancel during your trial, you keep Flare+ until the trial ends and you won't be charged.

**14.5 How to cancel.** You can cancel anytime; it only takes a couple of taps.
- **If you subscribed on the web:** go to **Profile › Flare+ › Manage plan › Cancel plan**, or email support@graceflare.com from your account email. We'll confirm your cancellation by email.
- **If you subscribed through Apple:** open your iPhone's **Settings › [your name] › Subscriptions › Grace Flare** and turn off auto-renew at least 24 hours before your next renewal. Apple manages these subscriptions, so we can't cancel them for you. **Manage plan** in the app takes you straight there.

Cancellation takes effect at the end of your current billing period. You keep Flare+ until then and won't be charged again. **Deleting your Grace Flare account cancels a web subscription automatically. It does not cancel an Apple subscription**, so please cancel that in iPhone Settings too.

**14.6 Refunds.** Except as described in this section or required by law, payments are non-refundable and we don't give credit for partially used billing periods. **[OPTIONAL, recommended:]** *If you're charged for a yearly renewal and contact us at support@graceflare.com within 14 days of the charge, we'll refund it in full.* We'll also refund as described in § 14.1. Refunds for Apple purchases are handled by Apple at reportaproblem.apple.com.

**14.7 Price changes.** If we change the price of Flare+, we'll email you **at least 30 days before** the new price would apply to you and ask you to agree to it. If you don't agree before your next renewal, your subscription won't renew at the new price. It ends at the close of your current billing period, and you won't be charged. Apple may also ask you to confirm a price change for App Store subscriptions.

**14.8 Failed payments.** If a renewal payment fails, we (or Apple) may retry it for a limited period. Flare+ features may pause until the payment goes through or you update your payment method.

**14.9 When Flare+ ends.** When your trial or subscription ends for any reason, your account moves to the free plan.
- **Your data stays put.** We don't delete anything you've logged or saved because your plan ended. Flare+ features stop until you subscribe again. *[Only if the history limit is display-only:]* The free plan shows your last 30 days of entries; older entries stay saved and reappear if you subscribe again. Your data is deleted only as described in § 8 of our Privacy Policy.
- **Shared access.** The free plan includes 1 additional person, and Flare+ includes 2. When Flare+ ends, **the person who has had access to your account the longest keeps it, and anyone else is paused until you subscribe again.** Nothing is deleted. Paused people get their access, role, and settings back as they were when you resubscribe. You can remove anyone at any time from Your team.

**14.10 Changes to these subscription terms.** Changes to this § 14 follow § 10: at least 30 days' notice by email of any material change, and material changes apply to you only after you affirmatively accept them.

> **Ship gate for 14.9:** the shared-access bullet is only true once the free-partner-seat migration (`20260930100000_free_partner_seat.sql`) is live.

---

## 3. Emails (transactional; sent through Resend, even to marketing opt-outs)

### 3A. Trial ending, 3 days before `trial_ends_at`

**Subject:** Your Flare+ trial ends {Wednesday, October 7}
**Preheader:** Keep going and it's {$59.99/year} from {Oct 7}. Cancel anytime before then.

> Hi {first name},
>
> Your free Flare+ trial ends on **{Wednesday, October 7}**.
>
> **If you keep Flare+:** you don't need to do anything. We'll charge **{$59.99}** to your {card ending 4242 | Apple ID} on {October 7}, and your plan will renew automatically every {year | month} at {$59.99} until you cancel.
>
> **If you'd rather not:** cancel any time before {October 7} and you won't be charged a thing. You'll keep Flare+ until your trial ends.
>
> **[ Manage or cancel my plan ]** → {web: Profile › Flare+ › Manage plan | Apple: https://apps.apple.com/account/subscriptions}
> {Apple only: "You can also cancel in your iPhone's Settings › [your name] › Subscriptions. Apple needs at least 24 hours before the trial ends."}
>
> Either way, everything you've logged stays right where it is.
>
> Questions? Just reply, or write to support@graceflare.com.
>
> The Grace Flare team
>
> *Grace Flare LLC · 8 The Green, Suite A, Dover, DE 19901 · [Flare+ subscription terms](https://graceflare.com/terms#flare-plus)*

### 3B. Confirmation / acknowledgment (Cal. B&P § 17602(a)(3)), sent immediately

This must include the automatic renewal offer terms (§ 17601(b): continues until cancelled, the cancellation policy, the recurring charge amount and that it may change, the renewal period, and any minimum purchase), the cancellation policy, and how to cancel, including before a trial converts. Keep the labelled block intact.

**Subject:** You're in: your Flare+ trial has started *(no trial: "You're in: welcome to Flare+")*

> Hi {first name},
>
> Welcome to Flare+. Your free trial is on, and everything's unlocked.
>
> **Your plan at a glance**
> - **Plan:** Flare+ {Yearly | Monthly}
> - **Free trial:** {Sept 30} to {Oct 7}. No charge during your trial.
> - **First charge:** **{$59.99}** plus any applicable tax on **{Oct 7}**, unless you cancel before then.
> - **Automatic renewal:** your plan **renews automatically every {year | month} at {$59.99}**, charged to your {card ending 4242 | Apple ID}, **until you cancel.**
> - **Minimum commitment:** none. Cancel anytime.
> - **Price changes:** we'll email you at least 30 days ahead and ask you to agree before any new price applies.
>
> **How to cancel**
> - {web} Go to **Profile › Flare+ › Manage plan › Cancel plan**, or tap **[ Manage my plan ]**. You can also email support@graceflare.com.
> - {Apple} Open your iPhone's **Settings › [your name] › Subscriptions › Grace Flare** and turn off auto-renew at least 24 hours before your next renewal date.
> - **To avoid being charged at all**, cancel before **{Oct 7}**. You'll keep Flare+ until the trial ends.
> - **Cancellation policy:** cancelling stops future charges, and you keep Flare+ through the period you've already paid for. Payments aren't refunded for partial periods except as described in our subscription terms {optional: "and we'll refund a yearly renewal in full if you ask within 14 days"}.
>
> We'll send you a reminder 3 days before your trial ends.
>
> Full details: [Flare+ subscription terms](https://graceflare.com/terms#flare-plus).
>
> The Grace Flare team
>
> *Grace Flare LLC · 8 The Green, Suite A, Dover, DE 19901 · support@graceflare.com*

### 3C. Yearly renewal reminder, 30 days before each yearly renewal

**Subject:** Your Flare+ plan renews on {Oct 7, 2027}
> Hi {first name}, a heads-up: your Flare+ Yearly plan renews automatically on **{Oct 7, 2027}** for **{$59.99}** plus any applicable tax, charged to your {card ending 4242 | Apple ID}. Nothing to do if you'd like to keep it. To cancel, go to **Profile › Flare+ › Manage plan** {Apple: or iPhone Settings › [your name] › Subscriptions} before then. **[ Manage my plan ]**

30 days is a suggestion; counsel should confirm the state windows.

### 3D. Cancellation confirmation

**Subject:** Your Flare+ plan is cancelled
> Hi {first name}, you're all set. Flare+ won't renew, and you won't be charged again. You'll keep Flare+ until **{end date}**; after that your account moves to the free plan. Everything you've logged stays saved. If more than one person shares your account, the one who's been with you longest keeps access; anyone else is paused until you resubscribe. Changed your mind? **[ Keep Flare+ ]**

---

## 4. Pre-launch billing checklist (priority order)

**P0: blocks the first live charge**
1. **Seat policy is live and consistent.** The free-partner-seat migration is applied, and the Your team UI, the Upgrade copy and Terms 14.9 all say: free 1, Flare+ 2, longest-standing keeps access.
2. **Stripe subprocessor notice.** Update `/subprocessors` and Privacy §§ 2/4/5, and **email users at least 30 days before live processing**. Start this first.
3. **Consent record table** (e.g. `subscription_consents`): user_id, plan, price, currency, trial_end, disclosure text version or hash, checkbox state, timestamp, platform, user-agent. Retain for at least 3 years or 1 year after the subscription ends, whichever is longer (believed to be the AB 2863 rule; counsel to verify). Disclose it in Privacy § 2.
4. **Online cancellation.** Web: deploy the planned `stripe-portal` function and add Profile › Flare+ › Manage plan, with Cancel no more than two taps away (a retention offer may sit beside Cancel, never in place of it). iOS: StoreKit `showManageSubscriptions`, or a link to apps.apple.com/account/subscriptions.
5. **Status sync.** Stripe webhooks and App Store Server Notifications v2 (or RevenueCat) write `subscriptions.status` and `trial_ends_at`.
6. **Emails 3A–3D.** Idempotent senders: a cron for 3A and 3C with `*_sent_at` columns, and webhook-driven 3B and 3D. The trial reminder is promised on the paywall.
7. **Paywall disclosure and checkbox** (§ 1). Dynamic prices and dates, placed above the CTA, at least `text-xs`, full contrast.
8. **Terms § 14, cross-references and effective date** (§ 2). Existing users are notified by email; subscribers accept § 14 through the checkbox.
9. **Account deletion cancels billing.** `delete_user_account()` / `_purge_user_data()` must cancel the Stripe subscription before the purge. For Apple, warn in the delete flow (Guideline 5.1.1(v)).
10. **One trial per account**, enforced server-side.
11. **Test matrix (dev plus Stripe test mode):** cancel during trial → no charge; trial converts → charges the disclosed amount; failed renewal; lapse → partner suspension exactly as Terms 14.9 says; resubscribe → access restored, no data lost; account deletion → Stripe subscription cancelled.

**P1: before or at launch**

12. **iOS channel decision.** IAP (Guideline 3.1.1) or a US external-purchase link (post-*Epic v. Apple*, 2025; counsel to verify).
13. **Sales tax:** enable Stripe Tax and register where required.
14. **Refund policy choice:** the optional 14-day yearly-renewal refund in 14.6 is recommended.
15. **Legal-review-log entry and QA pass** covering the paywall, Terms, Privacy, subprocessors, and the new tables and functions.

**Questions for counsel**
- **Q1.** Is an unticked auto-renewal checkbox plus the adjacent disclosure enough for "affirmative consent" under Cal. B&P § 17602(a)(2) (AB 2863) and NY GBL § 527-a, for both the Stripe and IAP flows?
- **Q2.** Can § 10's renewed-acceptance rule for fee changes be narrowed to notice-plus-cancel for Flare+ price changes without re-consenting existing users?
- **Q3.** Does adding § 14 require renewed acceptance from existing free users, or is checkout consent enough because § 14 binds only subscribers?

---
*This is a pre-review by an AI assistant, not legal advice. A licensed attorney in Delaware, California and New York must review and sign off before paid Flare+ launches.*
