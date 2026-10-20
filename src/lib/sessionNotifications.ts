import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { startTimerLiveActivity, endTimerLiveActivity } from "@/integrations/liveActivity/liveActivityClient";

// Re-exported so timer hooks pull every lock-screen concern from this one lib.
export { updateTimerLiveActivity } from "@/integrations/liveActivity/liveActivityClient";

export type SessionKind = "sleep" | "nursing" | "bottle" | "pump";

const PERMISSION_FLAG = "session_notifications_permission";
const STARTED_FALLBACK = "started";

// Stable 32-bit positive integer hash so we can call cancel() with the same id
// later. The id space must be a number on iOS.
function hashId(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (h * 31 + sessionId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

function titleFor(kind: SessionKind): string {
  switch (kind) {
    case "sleep":
      return "Sleep in progress";
    case "nursing":
      return "Nursing in progress";
    case "bottle":
      return "Bottle in progress";
    case "pump":
      return "Pumping in progress";
  }
}

// Lazy permission ask. We persist the answer so we don't re-prompt on every
// session start. Returns true if granted.
export async function ensureSessionNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const stored = localStorage.getItem(PERMISSION_FLAG);
  if (stored === "granted") return true;
  if (stored === "denied") return false;
  try {
    const res = await LocalNotifications.requestPermissions();
    const granted = res.display === "granted";
    localStorage.setItem(PERMISSION_FLAG, granted ? "granted" : "denied");
    return granted;
  } catch {
    return false;
  }
}

interface ScheduleArgs {
  kind: SessionKind;
  startedAt: string | Date;
  sessionId: string;
  /** Secondary lock-screen line, e.g. "Left side" / "Nap". */
  label?: string;
  /**
   * false = the session exists but isn't ticking (e.g. a pump row created by
   * manual entry with no active side) — the lock-screen timer starts frozen.
   * Defaults to true.
   */
  running?: boolean;
}

export async function scheduleSessionNotification({
  kind,
  startedAt,
  sessionId,
  label,
  running = true,
}: ScheduleArgs): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const startTime = typeof startedAt === "string" ? new Date(startedAt) : startedAt;

  // Preferred surface on iOS 16.1+: a Live Activity — a self-ticking timer on
  // the Lock Screen / Dynamic Island. When it starts, skip the local
  // notification entirely (it would be a redundant static card).
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startTime.getTime()) / 1000));
  const liveActivityStarted = await startTimerLiveActivity({
    sessionId,
    kind,
    running,
    elapsedSeconds: running ? elapsedSeconds : 0,
    label: label ?? "",
  });
  if (liveActivityStarted) return;

  // Fallback: local notification. `ongoing: true` pins it on Android; on iOS
  // (< 16.1, or Live Activities disabled) it's a static reminder card.
  const granted = await ensureSessionNotificationPermission();
  if (!granted) {
    // Both lock-screen surfaces are now unavailable — this is the "I see
    // nothing at all" case. Make it visible instead of returning silently.
    console.warn(
      "[LiveActivity] No lock-screen surface: Live Activity did not start AND " +
        "notification permission is not granted. Nothing will show on the Lock Screen.",
    );
    return;
  }
  const id = hashId(sessionId);
  const body = `Started at ${startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · tap to ${STARTED_FALLBACK === "started" ? "open" : "stop"}`;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: titleFor(kind),
          body,
          ongoing: true,
          autoCancel: false,
          extra: { sessionId, kind },
        },
      ],
    });
  } catch {
    // Non-fatal — the in-app banner is the primary surface.
  }
}

export async function cancelSessionNotification(sessionId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // End both surfaces — whichever one the start call landed on.
  await endTimerLiveActivity(sessionId);
  const id = hashId(sessionId);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // ignore
  }
}
