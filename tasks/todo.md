# Beta-on-App-Store launch checklist

Living checklist for getting Grace Flare from "merged to main" → first
TestFlight build → external beta. Update as items complete; keep it as
the single source of truth for what's left.

**Status legend**
- `[ ]` not started
- `[~]` in progress
- `[x]` done

**Owner legend**
- `(claude)` — I'll do it in the repo and open a PR
- `(you)` — needs to happen in Apple Developer / App Store Connect / Codemagic UI / on a Mac
- `(both)` — I prep, you upload / paste / verify

---

## Already done

- [x] Apple Developer Program enrollment (you)
- [x] Bundle ID `com.graceflare.app` registered in Apple Developer Portal (you)
- [x] iOS Distribution certificate + App Store Connect API key issued (you)
- [x] Capacitor 8 + iOS plugin set wired into the repo
- [x] Codemagic workflow that builds, signs, and auto-uploads to TestFlight on push to `main`
- [x] Permission usage strings (camera / Face ID / speech / mic) injected via Codemagic Plist step
- [x] Deep-link scheme `graceflare://` registered via Codemagic Plist step
- [x] Privacy Policy / Terms / Subprocessors pages live + COPPA email-plus VPC gate

---

## Critical path to first TestFlight build

### 1. Codemagic env vars (you)
Set these in Codemagic UI → App settings → Environment variables (encrypted).
The five secret values are listed verbatim in `codemagic.yaml` comments.

- [ ] `APP_STORE_CONNECT_ISSUER_ID`
- [ ] `APP_STORE_CONNECT_KEY_IDENTIFIER`
- [ ] `APP_STORE_CONNECT_PRIVATE_KEY` (full contents of the `.p8` file, including the BEGIN/END lines)
- [ ] `CERTIFICATE_PRIVATE_KEY` (RSA private key for the iOS Distribution cert)
- [ ] `VITE_APP_URL` — leave **unset** for the very first build (falls back to `graceflare://localhost`); set to `https://graceflare.com` once that domain is live (see §10)

### 2. Patch `codemagic.yaml` for two known iOS gotchas (claude)
- [ ] Inject `WKAppBoundDomains` into `Info.plist` (Supabase project URL + `graceflare.com`) so `limitsNavigationsToAppBoundDomains: true` doesn't block API calls
- [ ] Auto-bump `CFBundleVersion` per build (e.g. `agvtool new-version -all $(date +%s)`) so App Store Connect doesn't reject duplicate uploads
- [ ] (Optional) Verify Capacitor's bundled `PrivacyInfo.xcprivacy` covers UserDefaults / file-timestamp / disk-space reasons

### 3. iOS app icon set (both) — done
Real designed icon (sage-green / cream "C" smile with orange eye) lives in `assets/`, gets copied into the generated `ios/` tree at build time. Preserves the "ios/ is fully transient" invariant while keeping the icon set in version control.
- [x] **Claude**: 1024 × 1024 master committed at `assets/icon.png`.
- [x] **Claude**: 15 iOS sizes (`AppIcon-20.png` → `AppIcon-512@2x.png`) + `Contents.json` committed at `assets/ios/AppIcon.appiconset/`. Generated from the master via `python3 scripts/build-icon-set.py` — re-run if the master changes.
- [x] **Claude**: 10 Android mipmap PNGs committed at `assets/android/mipmap-{m,h,x,xx,xxx}hdpi/` (`ic_launcher.png` + `ic_launcher_round.png` each). Held for the future Android workflow; not wired into Codemagic yet.
- [x] **Claude**: Codemagic step "Copy app icons into iOS project" replaces the default Capacitor blank `AppIcon.appiconset` with our committed one after `cap add ios`.

### 4. Production domain (you, then claude)
- [x] Point `graceflare.com` apex + `www` at the Vercel project (DNS A / CNAME records)
- [x] Confirm Vercel issues the TLS cert and the deployed app loads at `https://graceflare.com`
- [x] Verify Resend sending domain DNS records on `graceflare.com` (SPF / DKIM)
- [ ] Set `VITE_APP_URL = https://graceflare.com` in Codemagic
- [x] Add `graceflare://localhost` and `https://graceflare.com/auth/callback` to Supabase Auth → Redirect URLs

### 5. Trigger the first Codemagic build (you)
- [ ] Push any commit to `main` (or click "Start new build" in Codemagic)
- [ ] Watch the build log: `npx cap add ios` → `cap sync` → Plist injections → `xcode-project build-ipa` → upload to App Store Connect
- [ ] Confirm the build appears in App Store Connect → TestFlight → iOS Builds (~15–30 min after upload, while Apple processes)

---

## App Store Connect setup

### 6. Create the app record (you, one-time)
App Store Connect → My Apps → "+" → New App
- Platform: iOS
- Name: **Grace Flare**
- Primary language: English (U.S.)
- Bundle ID: `com.graceflare.app`
- SKU: anything unique, e.g. `GRACEFLARE001`
- User access: Full Access

### 7. App Information + Pricing (you)
- [ ] Subtitle (≤ 30 chars)
- [ ] Primary Category: **Health & Fitness** (recommended — keeps you out of Kids Category)
- [ ] Secondary Category: **Lifestyle** (optional)
- [ ] Content Rights: confirm you own all content
- [ ] Pricing: Free
- [ ] Availability: U.S. only for v1 (matches your geo-block posture)

### 8. App Privacy nutrition labels (both)
- [ ] **Claude**: draft the answer matrix as a markdown table — every data type collected (email, name, DOB, photos, sleep / feed / diaper / milestones, voice, payment-none, device IDs from Supabase auth) × purpose × linked-to-identity × used-for-tracking. Add it to this file under §13.
- [ ] **You**: paste the answers into App Store Connect → App Privacy

### 9. Age Rating questionnaire (you)
Recommended answers (verify against current questionnaire wording):
- [ ] Cartoon / Realistic Violence: **None**
- [ ] Sexual Content / Nudity: **None**
- [ ] Profanity / Crude Humor: **None**
- [ ] Alcohol / Tobacco / Drug References: **None**
- [ ] Mature / Suggestive Themes: **None**
- [ ] Horror / Fear Themes: **None**
- [ ] Medical / Treatment Information: **Infrequent / Mild** (you have pediatric/SLP advisor copy with "not medical advice" disclaimers)
- [ ] Gambling: **None**
- [ ] **Unrestricted Web Access: NO** — `limitsNavigationsToAppBoundDomains: true` in `capacitor.config.ts` enforces a domain allow-list
- [ ] User-Generated Content: **No** (private to the family + invited partner; not publicly broadcast)
- [ ] Made for Kids? **No** — you're parent-facing, COPPA-compliant via VPC gate
- [ ] Expected rating: **4+**

### 10. App Store listing copy (claude can draft, you finalize)
- [ ] Description (≤ 4000 chars)
- [ ] Promotional text (≤ 170 chars)
- [ ] Keywords (≤ 100 chars, comma-separated, no brand names you don't own)
- [ ] Support URL: `https://graceflare.com/faq`
- [ ] Marketing URL (optional): `https://graceflare.com`
- [ ] Privacy Policy URL: `https://graceflare.com/privacy`
- [ ] Copyright: `© 2026 Grace Flare LLC`

### 11. Screenshots (you)
Minimum: one **6.9" iPhone** set (iPhone 16 Pro Max). Apple uses these to fan out to other sizes. 5–10 shots, in this order:
- [ ] Today's Briefing / dashboard
- [ ] Milestones page (with at least one captured milestone photo)
- [ ] Sleep page with a recent log
- [ ] Feeding tracker
- [ ] AI chat (e.g. pediatrician advisor)
- [ ] Financial checklist
- [ ] (Optional) VPC / consent flow to surface the COPPA story

Capture in the iOS Simulator on a Mac: `Device → iPhone 16 Pro Max` → ⌘S to save.

---

## TestFlight rollout

### 12. Internal testing (you)
- [ ] Add the first build to an Internal Testing group (up to 100 ASC users, no review)
- [ ] Invite yourself + 1–2 trusted users (ASC → Users and Access → add as Developer / Marketing)
- [ ] Install via TestFlight on a real iPhone

### 13. Smoke-test the TestFlight build (you, with claude on standby for fixes)
Run through the critical flows on-device. Each is a separate gate.
- [ ] Sign up → confirm email #1 → land in app
- [ ] Add Child → COPPA direct-notice modal → typed-name attestation → email #2 fires
- [ ] Click email #2 link in Mail → confirms → return to app → child INSERT succeeds
- [ ] Onboarding wizard step 1–5 → "Finish setup" → personalized welcome → dashboard
- [ ] Log a feeding, sleep, diaper — each persists and syncs
- [ ] Capture a milestone photo (camera permission prompt should fire once)
- [ ] Voice log a feeding (mic + speech-recognition prompts should fire once)
- [ ] AI chat: send a message and watch it stream token-by-token (this is the SSE / `fetch` + `ReadableStream` path — confirm WKAppBoundDomains didn't break it)
- [ ] Export My Data
- [ ] Delete Account → confirm → app returns to signed-out state

### 14. External beta (you)
- [ ] Add an External Testing group
- [ ] Submit the build for **Beta App Review** (~24h, looser than full review)
- [ ] Required: beta description, feedback email, marketing URL, sign-in info or "no account needed"
- [ ] Once approved, share the public TestFlight link with up to 10,000 testers

---

## App Privacy answer matrix (drafted by claude, edited by you)

Paste these answers into App Store Connect → App Privacy. Each row is one
data type; columns map to the App Store Connect questionnaire.

**Tracking declaration**: NO data is used for tracking. No third-party
ad SDKs, no cross-app linking, no fingerprinting. ATT prompt is therefore
not required.

| Data type | Collected? | Linked to identity? | Used for tracking? | Purposes | Source |
| --- | --- | --- | --- | --- | --- |
| **Contact Info → Email Address** | Yes | Yes | No | App Functionality, Account Management | Supabase `auth.users.email` (account holder) |
| **Contact Info → Name** | Yes | Yes | No | App Functionality | Optional `full_name` from signup; child name in `children.name` |
| **Health & Fitness → Health** | Yes | Yes | No | App Functionality, Product Personalization | `sleep_logs`, `feeding_logs`, `diaper_logs`, `child_milestones`, `illness_logs`, `medication_logs`, growth percentile |
| **Sensitive Info** | No | — | — | — | We collect child DOB + name; Apple's Sensitive Info is narrowly defined (race, religion, biometrics, etc.) and child data is **not** in that set. Disclose under "Other Data" instead. |
| **User Content → Photos or Videos** | Yes | Yes | No | App Functionality | Milestone photos via `@capacitor/camera`, stored in Supabase Storage `milestone-photos/{uid}/*` |
| **User Content → Audio Data** | Yes | Yes | No | App Functionality | Voice logs via `@capacitor-community/speech-recognition` → `parse-voice-log` edge function. Audio is transcribed server-side and the audio itself is not retained. |
| **User Content → Customer Support** | Yes | Yes | No | App Functionality | `FeedbackDialog` screenshots in Supabase Storage `feedback-screenshots/{uid}/*` |
| **User Content → Other User Content** | Yes | Yes | No | App Functionality, Product Personalization | AI chat history in `chat_conversations` / `chat_messages`. Sent to Anthropic per Privacy § 4 (DPA in place). |
| **Identifiers → User ID** | Yes | Yes | No | App Functionality | Supabase auth `uid` (UUID) |
| **Identifiers → Device ID** | No | — | — | — | We don't collect IDFA / IDFV. |
| **Location → Coarse Location** | Yes | No | No | App Functionality | `geoBlock.ts` calls `api.country.is` once at signup to enforce U.S.-only availability. Country code is not stored — just used in-memory to decide whether to allow signup. **Apple may classify this as not collected since we don't persist it.** If they push back during review, we can recategorize as "not collected." |
| **Financial Info** | No | — | — | — | The Financial Planning checklist surfaces guidance only. We do not collect SSN, account numbers, or income data. |
| **Diagnostics → Crash Data** | No | — | — | — | Vercel captures server-side function logs; client-side crashes are not phoned home for v1. |
| **Diagnostics → Performance Data** | No | — | — | — | Same as above. |
| **Usage Data → Product Interaction** | No | — | — | — | We do not run product analytics in v1. If Posthog / Mixpanel is added later, update this row. |
| **Other Data → Other Data Types** | Yes | Yes | No | App Functionality, Product Personalization | Child date of birth, premature flag + due date, primary parenting interest, partner consent metadata. None fits another category cleanly. |

**Privacy Policy URL**: `https://graceflare.com/privacy`

---

## App Store listing copy (drafts by claude, edited by you)

### App name
**Grace Flare** (30-char max — fits)

### Subtitle (≤ 30 chars)
Pick one (in priority order, you choose):
1. `Grow with confidence, day by day` (32 — too long, drop a word)
2. `Track your baby's first years` (29) ✓
3. `Sleep, feeding, and milestones` (30) ✓ — most descriptive
4. `Parenting, organized` (20) — punchiest

### Promotional text (≤ 170 chars, editable any time without resubmission)
> Grace Flare turns the chaos of new parenthood into a calm, shared system. Track sleep, feeds, and milestones — and ask experts when you need a real answer.

(160 chars)

### Description (≤ 4,000 chars; ~3,000 below leaves room for edits)

```
Grace Flare is the calm, organized parenting app that grows with your baby — from the first feed to first words.

Built for new and second-time parents who want a real system, not a noisy timeline. Log sleep, feeds, diapers, and milestones in seconds. Get pediatrician-, sleep-, and SLP-informed answers when you need them. Share everything with a co-parent or caregiver — no more "wait, did you feed her at 2?"

WHAT YOU CAN DO

• Log feeds, sleep, and diapers in two taps — or by voice, hands-free
• Track milestones with photos and a private family timeline
• Ask the AI advisors anything — pediatrician, sleep, nutrition, SLP, financial, and developmental — and get answers grounded in AAP, CDC, ASHA, and Ellyn Satter guidance
• Get a personalized Today's Briefing each morning with a wake window, feed plan, and what to watch for
• Capture first words and sounds in the Word & Sound Journal
• Share with a co-parent or caregiver, with role-based access
• Plan ahead with a financial checklist (529, Child Tax Credit, dependent care FSA, childcare cost planning)
• Export your data anytime — JSON, no lock-in
• Delete your account in one tap, with a full data purge

PRIVACY YOU CAN ACTUALLY READ

Grace Flare is built for parents in the U.S. We follow COPPA's email-plus verifiable parental consent standard before any child profile is created. We don't sell your data, we don't run third-party ad trackers, and we don't train AI models on your family's data. Read the full policy at graceflare.com/privacy.

NOT MEDICAL ADVICE

Grace Flare provides educational information from peer-reviewed sources. It is not a substitute for medical, developmental, or financial advice from a licensed professional. If you have a health concern about your child, contact your pediatrician.

WHAT WE'RE NOT (YET)

This is our first beta. We are U.S.-only, iPhone-only, and parent-controlled (no kid-facing surface). EU, UK, Android, and pediatrician integrations are on the roadmap.

Made with care by Grace Flare LLC, Delaware. Questions? hello@graceflare.com.
```

(~1,930 chars — leaves headroom)

### Keywords (≤ 100 chars total, comma-separated, no spaces after commas)

```
baby tracker,newborn,sleep,feeding,milestones,parenting,nursing,pumping,diaper,coparent,toddler
```

(95 chars — verify count after any edit. Apple counts the commas. Avoid: "Apple," "iPhone," "iOS," competitor brand names, generic words you don't want to rank on.)

### What's New (release notes for v1.0)

```
First beta of Grace Flare. Track sleep, feeds, milestones, and growth — and ask the AI advisors when you need a real answer. Share with a co-parent. Export anytime. We'd love your feedback: hello@graceflare.com.
```

### URLs
- Support URL: `https://graceflare.com/faq`
- Marketing URL: `https://graceflare.com`
- Privacy Policy URL: `https://graceflare.com/privacy`

### Copyright
`© 2026 Grace Flare LLC`

---

## Notes / decisions log

- **Kids Category: explicitly NOT.** Grace Flare is parent-facing, with a COPPA email-plus VPC gate that handles compliance via `vpcGate.ts` + `CoppaDirectNotice.tsx`. Kids Category would impose stricter Apple review without giving us anything we don't already have.
- **U.S.-only at launch.** The geo-block in `geoBlock.ts` prevents EEA/UK signups; App Store availability should match (not worldwide).
- **VPC email link UX.** When email #2 arrives in iOS Mail, tapping the link opens Safari, not the app. Acceptable for beta. Long-term polish: register a Universal Link via `apple-app-site-association` on `graceflare.com` so the link opens the app directly.
- **Outside counsel.** Per `CLAUDE.md`, in-house legal review is accepted for v1 U.S. launch. Outside counsel is gated on EU/UK launch, fundraise, EHR integration, or material breach — none triggered by going to TestFlight.
