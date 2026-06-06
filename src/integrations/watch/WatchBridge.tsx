// src/integrations/watch/WatchBridge.tsx
//
// Headless component (renders nothing) that keeps the paired Apple Watch in
// sync with the web app's auth state. Mount once near the app root, inside
// AuthProvider + QueryClientProvider (alongside DeepLinkHandler).
//
// It re-pushes the Supabase session to native whenever:
//   - the session changes (login, token refresh, refresh-token rotation), and
//   - the active child changes.
// Re-pushing on every onAuthStateChange is what lets the watch survive
// refresh-token rotation (see plan: token-refresh edge cases).
//
// No-op on web — pushWatchContext() guards on Capacitor.isNativePlatform().

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { pushWatchContext } from "@/integrations/watch/watchBridgeClient";

export function WatchBridge() {
  const { session } = useAuth();
  const { activeChild } = useChildren();

  const childId = activeChild?.id ?? null;
  // session.access_token is the field that actually changes on refresh; keying
  // the effect on it (rather than the session object identity) avoids redundant
  // pushes while still firing on every rotation.
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    void pushWatchContext(session, childId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, childId]);

  return null;
}
