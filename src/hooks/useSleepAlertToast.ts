import { useEffect, useRef } from "react";
import { format } from "date-fns";

import { toast } from "@/hooks/use-toast";

export type SleepAlertKind =
  | "window-15min"
  | "window-exceeded"
  | "off-plan"
  | "off-plan-window-blown"
  | "off-plan-false-start"
  | "off-plan-short-nap-streak"
  | "off-plan-bedtime-drift";

interface UseSleepAlertToastArgs {
  childId: string | null | undefined;
  // Kind of the current banner state, or null if there's nothing to toast.
  kind: SleepAlertKind | null;
  title: string | null;
  body: string | null;
}

// Fires a toast once per (kind, childId, day) entry into an alert state. The
// dedupe set lives in a ref so re-renders, page revisits, and react-query
// refetches all coalesce to a single toast per crossing.
export function useSleepAlertToast({
  childId,
  kind,
  title,
  body,
}: UseSleepAlertToastArgs) {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!kind || !title || !childId) return;
    const dayKey = format(new Date(), "yyyy-MM-dd");
    const dedupeKey = `${kind}:${childId}:${dayKey}`;
    if (firedRef.current.has(dedupeKey)) return;
    firedRef.current.add(dedupeKey);
    toast({ title, description: body ?? undefined });
  }, [kind, title, body, childId]);
}
