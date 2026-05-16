# Grace Flare iOS Spike

Native SwiftUI proof-of-concept that retires the highest-risk part of the iOS port: Supabase auth (PKCE + email confirmation) + AI chat SSE streaming via `URLSession.bytes(for:)` against the existing `chat` edge function.

See `/root/.claude/plans/can-you-do-an-toasty-grove.md` for the full plan, success criteria, and decision gate.

## Bootstrap (on Mac, ~10 minutes)

1. **Open Xcode 15+** → File → New → Project → iOS → App.
   - Product Name: `GraceFlareSpike`
   - Interface: SwiftUI
   - Language: Swift
   - Storage: None
   - Minimum Deployment: iOS 17.0
   - Save the project in `ios-spike/` (alongside this README).

2. **Add the source files** from `ios-spike/Sources/` to the Xcode project. Drag the folder into the Project Navigator; choose "Create groups", check the app target.

3. **Add the Supabase SPM dependency**:
   - File → Add Package Dependencies… → `https://github.com/supabase/supabase-swift`
   - Add the `Supabase` library to the app target.

4. **Add the fonts**:
   - Download Quicksand (regular + bold) and Nunito (regular + semibold + bold) from Google Fonts.
   - Drag the `.ttf` files into `ios-spike/Sources/Resources/Fonts/` and the Xcode project. Check "Copy items if needed" and the app target.
   - Open `Info.plist` and add a `UIAppFonts` array with each filename, e.g. `Quicksand-Regular.ttf`, `Nunito-Bold.ttf`, etc.

5. **Wire the Supabase config**:
   - Copy `Config.xcconfig.example` to `Config.xcconfig`.
   - Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values as `src/integrations/supabase/client.ts`).
   - In Xcode: Project → Info → Configurations → set the Debug/Release configs to use `Config.xcconfig`.
   - Add two entries to `Info.plist`: `SUPABASE_URL` = `$(SUPABASE_URL)`, `SUPABASE_ANON_KEY` = `$(SUPABASE_ANON_KEY)`.
   - `Config.xcconfig` is gitignored (see `.gitignore`).

6. **Build and run** on a real iPhone (the simulator is fine for code, but the success criteria measure latency and gesture feel on device).

## What to test (success criteria, copied from the plan)

1. **Sign up new email** → confirmation email arrives → tap link (returns to the web app, since Universal Links are out of spike scope) → manually sign in on iOS → land on Chat.
2. **Send a chat message** ("What should I do about a 4-month sleep regression?") → first token < 1.5s → smooth stream with no pauses > 500ms.
3. **Background and return mid-stream** → either resumes cleanly or shows a visible retry. No silent hang.
4. **Auth token auto-refresh during a stream** → does not 401.
5. **Native chrome** → app icon, splash, list rows, keyboard avoidance, swipe-back all feel native with zero custom code.

If 4/5 pass, continue with SwiftUI per the decision gate. If 3 or fewer pass cleanly, re-read the "Pivot to React Native (Expo)" section of the plan.

## Out of scope for the spike

- Universal Links (`apple-app-site-association` on the web server)
- COPPA VPC gate (the typed-signature `CoppaDirectNotice` flow)
- Push notifications, on-device cry analysis, background sleep timer, voice quick log, biometric unlock
- App Store metadata, icon, screenshots
