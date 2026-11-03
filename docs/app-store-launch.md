# App Store v1 launch kit

Prepared 2026-11-03. Everything you enter in App Store Connect for the first submission, plus the steps only you can do.

**v1 decisions:** Flare+ is free during early access (no in-app purchase in v1; StoreKit comes in v1.1). U.S. only. App Review signs in with a seeded demo account.

---

## 1. Founder checklist (in order)

**Supabase (do these before you submit)**
- [ ] Merge the `claude/app-store-v1` PR. It adds a migration, and merging it applies the migration to production (it gives every account Flare+ early access).
- [ ] Auth → Users → **Add user**: `appreview@graceflare.com`, with a strong password and **Auto-confirm** on.
- [ ] SQL editor: run `supabase/seed/app-review-demo.sql` (it seeds a sample baby and a week of logs).
- [ ] Sign in to TestFlight as that user. Check that Home, logging, Milestones and a briefing all work.
- [ ] Confirm the three VPC email steps in CLAUDE.md are done (Resend secrets, verified domain, "Confirm email" on). Real parents can't add a child without them.

**Apple Developer / App Store Connect**
- [ ] Bump the marketing version to `1.0.0` if it isn't already. Codemagic sets the build number automatically.
- [ ] Optional for v1: enable Push Notifications on `com.graceflare.app` and regenerate the profile. Without it the build still ships, just without server push.
- [ ] Create the 1.0 version with the listing in § 2, the privacy label in § 4, the age rating in § 5 and the review notes in § 3.
- [ ] **Pricing and Availability:** Free, **United States only**. This matches the EU/UK signup geo-block and avoids the EU DSA trader-status requirement.
- [ ] **App Privacy → Privacy Policy URL:** `https://graceflare.com/privacy`
- [ ] Screenshots: 6.9" iPhone (1320×2868) is required; 6.5" is optional. Use the demo account. Suggested five: Home "Today", Sleep coach, Milestones, Weekly insights, Visit Prep.
- [ ] Pick a TestFlight build, then **Add for Review → Submit**.
- [ ] Choose **Manual release** so you decide when it goes live after approval.

---

## 2. Listing copy

**Name (30):** Grace Flare: Baby Tracker
**Subtitle (30):** Sleep, feeds & milestones
**Category:** Primary **Lifestyle**, secondary **Health & Fitness**. Do **not** pick the Kids category: the app is for parents.
**Keywords (100):** `newborn,sleep,feeding,breastfeeding,diaper,nap,milestones,log,parenting,growth,schedule,infant`
**Support URL:** `https://graceflare.com/faq`  **Marketing URL:** `https://graceflare.com`
**Copyright:** `2026 Grace Flare LLC`

**Promotional text (170):**
Flare+ is free during early access. Log sleep, feeds and diapers in a tap, see when the next nap is likely, and get a calm daily briefing about your baby.

**Description:**
> Grace Flare helps you keep track of your baby's day, so you don't have to remember it all.
>
> LOG IN A TAP
> Sleep, feeds, diapers, pumping and growth. Start a timer and it keeps running on your Lock Screen. Logging works offline too, and syncs when you're back online.
>
> KNOW WHAT'S NEXT
> Grace Flare learns your baby's rhythm and shows when the next nap and feed are likely.
>
> A DAILY BRIEFING
> A short morning summary of yesterday and a few ideas for today, written for your baby's age.
>
> CELEBRATE MILESTONES
> Age-based milestones, a Word Journal for first words, Baby Signs and weekly play ideas.
>
> READY FOR THE PEDIATRICIAN
> Visit Prep turns your logs into a short summary and a list of questions to bring to the appointment.
>
> SHARE THE LOAD
> Invite a partner or caregiver. Everyone logs, and everyone sees who logged what.
>
> FLARE+ FREE DURING EARLY ACCESS
> Speech Class, Weekly Play Plan, Baby Signs plans, Cry insights and extra seats for family are all included while we're in early access.
>
> PRIVATE BY DESIGN
> No ad tracking, and we never sell your data. Export or delete everything at any time from Profile.
>
> Grace Flare offers general information, not medical advice. If you're worried about your baby, call your pediatrician.

---

## 3. App Review information

- **Sign-in required:** yes. Username `appreview@graceflare.com`, with the password from the Supabase step. Enter it here only, never in git.
- **Contact:** your name, phone, and `support@graceflare.com` (or whichever inbox you'll answer within 24h).
- **Notes:**

> Grace Flare is a baby-tracking app for parents. The demo account already has a sample baby and a week of logs.
>
> Parental consent: because the app stores information about children under 13, new accounts go through COPPA "email-plus" verifiable parental consent before a child can be added. That step involves a confirmation email, so it's already completed on the demo account.
>
> Purchases: there are no in-app purchases in this version. All Flare+ features are free during early access. We'll add subscriptions through Apple in-app purchase in a later update.
>
> Account deletion: Profile → Delete account.
>
> Microphone: used only by Cry insights (More → Cry insights) to record a short clip, analyzed on the device. Nothing is uploaded.
>
> AI: briefings, weekly insights, Visit Prep and the weekly plans use Anthropic's Claude. These are one-shot summaries; there is no chat. The app gives general information and says it isn't medical advice.
>
> Sign up is limited to the U.S. (EU/UK signups are blocked for v1).

---

## 4. App Privacy ("nutrition label")

**Data used to track you:** none. There's no ATT prompt, no third-party ads and no cross-app tracking. Sponsored content is first-party (Privacy § 6).

**Data linked to the user** (all for **App Functionality**; add **Product Personalization** where noted):

| Apple category | What | Purpose |
|---|---|---|
| Contact Info → Name, Email Address | account, partner invites | App Functionality |
| Health & Fitness → Health | feeds, sleep, diapers, growth, temperature, illness, milestones | App Functionality, Product Personalization |
| User Content → Photos or Videos | photos you attach (child photo, feedback screenshots); check against Privacy § 2 | App Functionality |
| User Content → Audio Data | **not collected**: cry clips stay on the device | — |
| User Content → Other User Content | notes, Word Journal words, AI-memory notes | App Functionality, Product Personalization |
| Identifiers → User ID | Supabase account ID | App Functionality |
| Identifiers → Device ID | push token (only once push is on) | App Functionality |
| Diagnostics → Crash Data | only if a crash reporter is shipped; otherwise skip | App Performance |

**Not collected:** Location (the IP-country check isn't stored), Financial Info (no payments in v1), Browsing History, Contacts, Purchases.

Check this table against Privacy § 2 before you submit. The label and the policy must match.

---

## 5. Age rating

Answer the questionnaire honestly. Notes:
- **Medical/Treatment Information:** "Infrequent." Visit Prep, milestone guidance and allergen tips are general information.
- **Made for Kids:** **No.**
- **User-generated content / messaging between users:** caregiver notes are private between invited family members. Answer "No" to public UGC.
- **AI / chatbot:** no conversational AI.

Expect a low rating (4+ or 9+). If Apple suggests something higher, that's fine; parents are the audience.

---

## 6. Known rejection risks and how we've covered them

| Guideline | Risk | Status |
|---|---|---|
| 2.1 Completeness | "Start free trial" button did nothing | Fixed: early-access screen, no purchase button |
| 3.1.1 IAP | Selling Flare+ outside Apple IAP | Nothing is sold in v1 |
| 5.1.1 Purpose strings | Strings for removed voice logging / Face ID | Fixed: unused plugins removed, strings rewritten |
| 1.4.1 Medical | "Decode a cry" sounded diagnostic | Fixed: softer copy plus a "not medical advice" line |
| 5.1.1(v) Deletion | In-app account deletion | Already in Profile |
| 4.8 Sign in with Apple | Only needed with third-party social login | Email/password only, so not required |
| 4.2 Minimum functionality | "Just a website" | Native Lock Screen timers, widgets, Watch app, offline logging |
| 2.1 Reviewer access | VPC email gate | Seeded demo account |

## 7. v1.1 follow-ups
- StoreKit / RevenueCat for Flare+ (see `docs/billing-launch-kit.md`, which needs outside-counsel review before paid launch). Move early-access rows with `where provider = 'early_access'`, giving users notice first, as Terms § 5 promises.
- Turn on server push once the Push capability profile is in place.
