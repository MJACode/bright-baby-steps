# Grace Flare Mobile (Expo)

React Native + Expo proof-of-concept that ports Grace Flare to iOS **from Windows**, no Mac required. Same vertical slice as the SwiftUI spike in `ios-spike/`: Supabase auth (PKCE + email confirmation) + AI chat SSE streaming against the existing `chat` edge function.

The decision to pivot here from native SwiftUI is documented in `/root/.claude/plans/can-you-do-an-toasty-grove.md` and PR #68. Backend is unchanged — same Supabase project, same edge functions, same RLS, same COPPA VPC trigger.

## Bootstrap on Windows (~15 minutes)

```powershell
# 1. Install Node 20 LTS (https://nodejs.org)
# 2. From the repo root:
cd mobile
npm install

# 3. Set env vars (same values as src/integrations/supabase/client.ts)
copy .env.example .env
# Edit .env and fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# 4. Run on a physical iPhone (NO Mac needed)
#    - Install "Expo Go" from the App Store on your iPhone
#    - iPhone + Windows PC must be on the same Wi-Fi
npm run start
#    - Scan the QR code with the iPhone camera; it opens Expo Go and loads the app.
```

That's it for dev. You can iterate on the React Native code from Windows; saves hot-reload to your iPhone in seconds.

## Building for TestFlight (still no Mac)

EAS Build runs the iOS build on Expo's cloud Mac instances. You upload from Windows, EAS signs + submits.

```powershell
# One-time setup
npm install -g eas-cli
eas login                                # use your Expo account
eas build:configure                       # generates/updates eas.json

# Build for TestFlight (requires Apple Developer account, $99/yr)
eas build --platform ios --profile preview
eas submit --platform ios --latest        # uploads .ipa to App Store Connect
```

Apple Developer enrollment can be done from Windows at https://developer.apple.com.

## Test plan (mirrors the SwiftUI spike's success criteria)

- [ ] Sign up new email → confirmation email arrives → click link (goes to web `/auth`) → manually sign in on iOS → land on Chat
- [ ] Send "What should I do about a 4-month sleep regression?" → first token < 1.5s, smooth stream
- [ ] Background the Expo Go app mid-stream and return → clean resume or visible retry (no silent hang)
- [ ] Auth token auto-refresh during stream does not 401
- [ ] List rows, keyboard avoidance, swipe-back all feel native (RN with `expo-router` + native-stack gets ~85% of the way)

If 4/5 pass on a real iPhone via Expo Go, run `eas build --profile preview` and confirm TestFlight install behaves the same.

## What's in here

```
mobile/
├── README.md                       This file
├── package.json
├── tsconfig.json
├── app.json                        Expo config (name, slug, ios bundle)
├── eas.json                        EAS Build profiles (preview, production)
├── babel.config.js
├── .env.example                    Template for Supabase URL + anon key
├── .gitignore
├── app/                            expo-router file-based routing
│   ├── _layout.tsx                 Root layout, font loading, auth state
│   ├── index.tsx                   Redirect to /auth or /chat based on session
│   ├── auth.tsx                    Sign in / sign up screen
│   └── chat.tsx                    Chat screen with streaming
└── src/
    ├── lib/
    │   ├── supabase.ts             supabase-js client + AsyncStorage adapter
    │   └── chatStream.ts           SSE streaming via expo/fetch (mirrors web AIChatWidget)
    ├── hooks/
    │   └── useAuth.ts              Session state + sign-in/up/out helpers
    └── theme/
        ├── colors.ts               Brand HSL → hex (copied from src/index.css)
        └── fonts.ts                Quicksand + Nunito font keys
```

## What's out of scope (same as the SwiftUI spike)

Push notifications, on-device cry analysis, background sleep timer, voice quick log, COPPA VPC typed-signature UX, biometric unlock, Universal Links / deep linking for password reset + accept-invite + VPC email confirmations, App Store metadata.

If you want any of those next, the natural follow-up is wiring `expo-notifications`, `expo-local-authentication`, and `expo-linking` against the same Supabase backend.

## Why not Capacitor

You picked native feel as the priority back in the analysis. RN with `expo-router` + native-stack gets you real iOS sheets, native swipe-back, native scroll physics, and `Pressable` haptics. Capacitor would ship the existing web app inside a `WKWebView` — every gesture and animation would feel "web". The RN delta in code-reuse (you do rewrite the React components, since RN doesn't render HTML) is the price of admission for native chrome.
