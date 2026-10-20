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

/** Native diagnostics — see LiveActivityTimerPlugin.getDiagnostics. */
export interface LiveActivityDiagnostics {
  /** false = not iOS, or the plugin call threw (extension/plugin not loaded). */
  pluginReachable: boolean;
  /** iOS 16.1+ (ActivityKit present). */
  available: boolean;
  /** areActivitiesEnabled — false means Live Activities are off in Settings. */
  enabled: boolean;
  /** How many timer activities the system currently holds for this app. */
  activityCount: number;
}

interface LiveActivityTimerPlugin {
  getDiagnostics(): Promise<{ available: boolean; enabled: boolean; activityCount: number }>;
  startTimerActivity(args: TimerActivityStart): Promise<{ started: boolean }>;
  updateTimerActivity(args: TimerActivityUpdate): Promise<void>;
  endTimerActivity(args: { sessionId: string }): Promise<void>;
}

const LiveActivityTimer = registerPlugin<LiveActivityTimerPlugin>("LiveActivityTimer");

const isIos = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

// Tag every diagnostic line so it's greppable in Safari Web Inspector / the
// Xcode console when a tethered device build "isn't showing the timer".
const LOG = "[LiveActivity]";

/**
 * Probe why the Live Activity may not be appearing. Never throws — on non-iOS
 * or when the native plugin can't be reached it returns pluginReachable:false
 * so the caller can distinguish "wrong platform / extension not embedded" from
 * "iOS too old" (available:false) from "disabled in Settings" (enabled:false).
 */
export async function getLiveActivityDiagnostics(): Promise<LiveActivityDiagnostics> {
  if (!isIos()) {
    return { pluginReachable: false, available: false, enabled: false, activityCount: 0 };
  }
  try {
    const d = await LiveActivityTimer.getDiagnostics();
    return { pluginReachable: true, ...d };
  } catch (err) {
    // A throw here means the plugin isn't registered / the ActivityKit glue
    // didn't compile into the app — not a Settings problem.
    console.warn(`${LOG} getDiagnostics failed — plugin unreachable`, err);
    return { pluginReachable: false, available: false, enabled: false, activityCount: 0 };
  }
}

/**
 * Start a lock-screen Live Activity for a timer session.
 * Returns true only if the activity actually started (iOS 16.1+ and Live
 * Activities enabled) so the caller can fall back to a local notification.
 */
export async function startTimerLiveActivity(args: TimerActivityStart): Promise<boolean> {
  if (!isIos()) return false;
  try {
    const { started } = await LiveActivityTimer.startTimerActivity(args);
    if (!started) {
      // started:false is a clean signal from the plugin — iOS < 16.1 or Live
      // Activities disabled in Settings. Probe so the log says which.
      const d = await getLiveActivityDiagnostics();
      console.warn(
        `${LOG} start returned started:false — falling back to local notification.`,
        d,
      );
    }
    return started;
  } catch (err) {
    console.warn(`${LOG} startTimerActivity threw — plugin unreachable?`, err);
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
