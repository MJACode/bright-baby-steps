import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

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
}

export async function scheduleSessionNotification({ kind, startedAt, sessionId }: ScheduleArgs): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const granted = await ensureSessionNotificationPermission();
  if (!granted) return;
  const id = hashId(sessionId);
  const startTime = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
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
  const id = hashId(sessionId);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // ignore
  }
}
