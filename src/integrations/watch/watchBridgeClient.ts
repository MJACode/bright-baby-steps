// src/integrations/watch/watchBridgeClient.ts
//
// (Named *Client to avoid a case-insensitive filesystem collision with the
//  WatchBridge.tsx component — macOS/HFS+ treats watchBridge.ts and
//  WatchBridge.tsx as the same path, which broke the Codemagic web build.)
//
// Thin bridge between the web app's Supabase session and the native iOS
// WatchConnectivity layer (`ios-watch-glue/WatchSessionBridgePlugin.swift`).
//
// The Apple Watch companion app is a native SwiftUI target — it has no access
// to this WebView's localStorage session. So whenever the session or the
// active child changes, we hand the current Supabase tokens + active child id
// to the native side, which relays them to the watch via
// WCSession.updateApplicationContext. The watch then writes logs directly to
// Supabase PostgREST under the parent's own JWT (same RLS as the web app).
//
// No-op on web: the plugin only exists in the native build.

import { registerPlugin, Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";

export interface WatchContext {
  /** Supabase user access token (JWT, ~1h TTL). */
  accessToken: string;
  /** Supabase refresh token — the watch uses this to refresh on its own. */
  refreshToken: string;
  /** Unix seconds at which accessToken expires (Supabase `session.expires_at`). */
  expiresAt: number;
  /** Currently-active child id, or null if none selected yet. */
  childId: string | null;
}

export interface WatchSessionBridgePlugin {
  /** Push the latest auth context to the paired Apple Watch. */
  pushWatchContext(ctx: WatchContext): Promise<void>;
  /** Clear the watch context on sign-out so the watch stops writing. */
  clearWatchContext(): Promise<void>;
}

// registerPlugin returns a proxy even when the native implementation is absent;
// calls simply reject on web. We guard every call with isNativePlatform() so
// the proxy is never exercised off-device.
export const WatchSessionBridge =
  registerPlugin<WatchSessionBridgePlugin>("WatchSessionBridge");

/**
 * Hand the current Supabase session + active child to the watch.
 * Safe to call on web — it's a no-op unless running in the native shell.
 */
export async function pushWatchContext(
  session: Session | null,
  childId: string | null,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!session?.access_token || !session.refresh_token) {
      await WatchSessionBridge.clearWatchContext();
      return;
    }
    await WatchSessionBridge.pushWatchContext({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      // expires_at is Unix seconds in supabase-js; fall back to ~1h out.
      expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      childId,
    });
  } catch (err) {
    // Bridge failures must never break the web app — log and move on.
    console.error("pushWatchContext failed:", err);
  }
}
