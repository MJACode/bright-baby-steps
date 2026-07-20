// src/integrations/liveActivity/liveActivityClient.ts
//
// Thin bridge to the native iOS Live Activity plugin
// (`ios-live-activity-glue/LiveActivityTimerPlugin.swift`). A Live Activity
// puts the running sleep / nursing / bottle / pump timer on the Lock Screen
// and in the Dynamic Island with a self-ticking elapsed display — no
// notifications, no polling.
//
// iOS-only: the plugin exists only in the native iOS build (injected at CI
// time by widgets/project/inject_widgets_target.rb). Every wrapper below
// no-ops on web and Android, and swallows bridge errors — the in-app banner
// stays the primary surface.

import { registerPlugin, Capacitor } from "@capacitor/core";
import type { SessionKind } from "@/lib/sessionNotifications";

export interface TimerActivityUpdate {
  /** Supabase row id of the running session (feeding_logs / sleep_logs). */
  sessionId: string;
  /** false = paused — the lock-screen timer freezes at elapsedSeconds. */
  running: boolean;
  /** Active (pause-adjusted) elapsed seconds at the moment of the call. */
  elapsedSeconds: number;
  /** Secondary line, e.g. "Left side" / "Nap". Omit to keep the current one. */
  label?: string;
}

export interface TimerActivityStart extends TimerActivityUpdate {
  kind: SessionKind;
}

interface LiveActivityTimerPlugin {
  startTimerActivity(args: TimerActivityStart): Promise<{ started: boolean }>;
  updateTimerActivity(args: TimerActivityUpdate): Promise<void>;
  endTimerActivity(args: { sessionId: string }): Promise<void>;
}

const LiveActivityTimer = registerPlugin<LiveActivityTimerPlugin>("LiveActivityTimer");

const isIos = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

/**
 * Start a lock-screen Live Activity for a timer session.
 * Returns true only if the activity actually started (iOS 16.1+ and Live
 * Activities enabled) so the caller can fall back to a local notification.
 */
export async function startTimerLiveActivity(args: TimerActivityStart): Promise<boolean> {
  if (!isIos()) return false;
  try {
    const { started } = await LiveActivityTimer.startTimerActivity(args);
    return started;
  } catch {
    return false;
  }
}

/** Sync pause / resume / side switches to the lock-screen timer. */
export async function updateTimerLiveActivity(args: TimerActivityUpdate): Promise<void> {
  if (!isIos()) return;
  try {
    await LiveActivityTimer.updateTimerActivity(args);
  } catch {
    // Non-fatal — the in-app timer is the source of truth.
  }
}

/** End + dismiss the lock-screen timer for a session. */
export async function endTimerLiveActivity(sessionId: string): Promise<void> {
  if (!isIos()) return;
  try {
    await LiveActivityTimer.endTimerActivity({ sessionId });
  } catch {
    // ignore
  }
}
