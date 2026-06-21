import { useRef, useState } from "react";
import { format } from "date-fns";

export type SleepAlertKind =
  | "window-15min"
  | "window-exceeded"
  | "off-plan"
  | "off-plan-window-blown"
  | "off-plan-false-start"
  | "off-plan-short-nap-streak"
  | "off-plan-bedtime-drift";

interface UseSleepAlertPopupArgs {
  childId: string | null | undefined;
  // Kind of the current banner state, or null if there's nothing to surface.
  kind: SleepAlertKind | null;
  title: string | null;
}

interface SleepAlertPopupState {
  visible: boolean;
  dismiss: () => void;
  remindLater: () => void;
}

function storageKey(childId: string): string {
  return `sleep_alert_dismissed_${childId}`;
}

function readDismissed(childId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(childId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function dayKeyOf(triggerKey: string): string {
  return triggerKey.split(":")[2] ?? "";
}

function persistDismissed(childId: string, triggerKey: string, dayKey: string) {
  try {
    const todayOnly = readDismissed(childId).filter(
      (key) => dayKeyOf(key) === dayKey,
    );
    localStorage.setItem(
      storageKey(childId),
      JSON.stringify([...todayOnly, triggerKey]),
    );
  } catch {
    // localStorage unavailable — the in-memory close still hides the popup
    // for this session.
  }
}

// Surfaces an alert popup once per alert key — `${kind}:${childId}:${dayKey}` —
// so a new day, new kind, or different child re-shows it. The key is
// deliberately scoped to the day (not to a specific sleep log): the alerts are
// driven by the latest logs, so keying on a log id meant every new nap minted a
// fresh key and resurrected an already-dismissed alert. "Dismiss" persists the
// key to localStorage (gone for the rest of the day, regardless of new logs);
// "Remind me next time" closes for this mount only, so the next visit to the
// page shows it again while the alert state is still active.
export function useSleepAlertPopup({
  childId,
  kind,
  title,
}: UseSleepAlertPopupArgs): SleepAlertPopupState {
  const closedRef = useRef<Set<string>>(new Set());
  const [, bumpRender] = useState(0);

  const dayKey = format(new Date(), "yyyy-MM-dd");
  const alertKey =
    kind && title && childId ? `${kind}:${childId}:${dayKey}` : null;

  const visible =
    !!alertKey &&
    !!childId &&
    !closedRef.current.has(alertKey) &&
    !readDismissed(childId).includes(alertKey);

  const closeForThisMount = () => {
    if (!alertKey) return;
    closedRef.current.add(alertKey);
    bumpRender((n) => n + 1);
  };

  const dismiss = () => {
    if (alertKey && childId) persistDismissed(childId, alertKey, dayKey);
    closeForThisMount();
  };

  return { visible, dismiss, remindLater: closeForThisMount };
}
