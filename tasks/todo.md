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

### 3. iOS app icon set (both)
- [ ] **You**: provide a single 1024 × 1024 PNG master (no transparency, no rounded corners — Apple rounds them)
- [ ] **Claude**: generate the full `AppIcon.appiconset` (all required sizes from iPhone notification 20pt up to marketing 1024pt) and add a Codemagic step that drops it into `ios/App/App/Assets.xcassets/` after `npx cap add ios`

### 4. Production domain (you, then claude)
- [ ] Point `graceflare.com` apex + `www` at the Vercel project (DNS A / CNAME records)
- [ ] Confirm Vercel issues the TLS cert and the deployed app loads
- [ ] Verify Resend sending domain DNS records on `graceflare.com` (SPF / DKIM) — needed for VPC email #2 to actually send
- [ ] Set `VITE_APP_URL = https://graceflare.com` in Codemagic
- [ ] Add `graceflare://localhost` and `https://graceflare.com/auth/callback` to Supabase Auth → Redirect URLs

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

> Filled in §8 once claude drafts the table.

---

## Notes / decisions log

- **Kids Category: explicitly NOT.** Grace Flare is parent-facing, with a COPPA email-plus VPC gate that handles compliance via `vpcGate.ts` + `CoppaDirectNotice.tsx`. Kids Category would impose stricter Apple review without giving us anything we don't already have.
- **U.S.-only at launch.** The geo-block in `geoBlock.ts` prevents EEA/UK signups; App Store availability should match (not worldwide).
- **VPC email link UX.** When email #2 arrives in iOS Mail, tapping the link opens Safari, not the app. Acceptable for beta. Long-term polish: register a Universal Link via `apple-app-site-association` on `graceflare.com` so the link opens the app directly.
- **Outside counsel.** Per `CLAUDE.md`, in-house legal review is accepted for v1 U.S. launch. Outside counsel is gated on EU/UK launch, fundraise, EHR integration, or material breach — none triggered by going to TestFlight.
