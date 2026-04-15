import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Update appId to match your Apple Developer bundle ID before submitting
  appId: 'com.graceflare.app',
  appName: 'Grace Flare',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic', // respects safe area / notch automatically
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    Keyboard: {
      // Resize the body (not the viewport) when the soft keyboard appears.
      // This keeps the bottom input bar visible instead of pushing it off-screen.
      resize: 'body' as any,
      resizeOnFullScreen: true,
    },
  },
  server: {
    // Sets the WKWebView base URL scheme to graceflare://.
    // window.location.origin will be "graceflare://localhost" in the native app,
    // which is registered as a valid redirect URL in Supabase Auth settings.
    iosScheme: 'graceflare',
    // Allow the WebView to reach Supabase endpoints
    allowNavigation: ['*.supabase.co'],
  },
};

export default config;
