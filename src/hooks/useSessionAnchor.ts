import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, isSameDay } from "date-fns";
import { defaultStartAt, deriveEnd } from "@/lib/sessionAnchor";

const AUTO_ADVANCE_MAX_MIN = 14 * 60;

type UseSessionAnchorArgs = {
  open: boolean;
  defaultDurationMin: number;
};

/**
 * Start is the anchor. Only a direct edit to start ever moves it — editing the
 * duration or the (secondary) end wheel leaves start alone. `endAt` is derived
 * on every render and never stored, so the two can't drift apart.
 */
export function useSessionAnchor({ open, defaultDurationMin }: UseSessionAnchorArgs) {
  const [startAt, setStartAt] = useState(() => defaultStartAt(defaultDurationMin));
  const [durationMin, setDurationMin] = useState(defaultDurationMin);

  // Re-seed on the closed→open transition only, so a snapshot from the last
  // time the sheet was open never prefills a fresh entry.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStartAt(defaultStartAt(defaultDurationMin));
      setDurationMin(defaultDurationMin);
    }
    wasOpen.current = open;
  }, [open, defaultDurationMin]);

  const endAt = deriveEnd(startAt, durationMin);

  const setEndAt = useCallback(
    (next: Date) => {
      let candidate = next;
      // Time-wheel-only edits keep the existing end date. If that lands at or
      // before the start, the parent almost certainly means "the next morning" —
      // but only auto-advance when the result is a plausible single session.
      if (isSameDay(next, endAt) && candidate.getTime() <= startAt.getTime()) {
        const bumped = addDays(candidate, 1);
        const bumpedMin = Math.round((bumped.getTime() - startAt.getTime()) / 60_000);
        if (bumpedMin > 0 && bumpedMin <= AUTO_ADVANCE_MAX_MIN) candidate = bumped;
      }
      setDurationMin(Math.round((candidate.getTime() - startAt.getTime()) / 60_000));
    },
    [startAt, endAt],
  );

  return { startAt, durationMin, endAt, setStartAt, setDurationMin, setEndAt };
}
