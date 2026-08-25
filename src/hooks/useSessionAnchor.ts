import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, isSameDay } from "date-fns";
import { defaultStartAt, deriveEnd } from "@/lib/sessionAnchor";

const AUTO_ADVANCE_MAX_MIN = 14 * 60;

type UseSessionAnchorArgs = {
  open: boolean;
  defaultDurationMin: number;
};

/**
 * Start is the anchor once the parent has authored one — after that only a
 * direct edit to start ever moves it. Until then the seeded start is a
 * placeholder, so a duration change re-derives it and keeps the end at ≈now.
 * `endAt` is derived on every render and never stored, so the two can't drift.
 */
export function useSessionAnchor({ open, defaultDurationMin }: UseSessionAnchorArgs) {
  const [startAt, setStartAtState] = useState(() => defaultStartAt(defaultDurationMin));
  const [durationMin, setDurationMinState] = useState(defaultDurationMin);
  const [startTouched, setStartTouched] = useState(false);

  // Re-seed on the closed→open transition only, so a snapshot from the last
  // time the sheet was open never prefills a fresh entry.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStartAtState(defaultStartAt(defaultDurationMin));
      setDurationMinState(defaultDurationMin);
      setStartTouched(false);
    }
    wasOpen.current = open;
  }, [open, defaultDurationMin]);

  const endAt = deriveEnd(startAt, durationMin);

  const setStartAt = useCallback((next: Date) => {
    setStartTouched(true);
    setStartAtState(next);
  }, []);

  const setDurationMin = useCallback(
    (next: number) => {
      setDurationMinState(next);
      // The seeded start is the app's guess, not the parent's assertion, so it
      // tracks the duration until they take it over. Freezing it would derive a
      // future end — and a disabled Save — from every preset longer than the
      // default, killing the primary input path.
      if (!startTouched) setStartAtState(defaultStartAt(next));
    },
    [startTouched],
  );

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
      // A concrete end is an assertion about this session, and it's anchored on
      // the current start. Pin the start too, so a later duration change can't
      // slide it out from under that end.
      setStartTouched(true);
      setDurationMinState(Math.round((candidate.getTime() - startAt.getTime()) / 60_000));
    },
    [startAt, endAt],
  );

  return { startAt, durationMin, endAt, setStartAt, setDurationMin, setEndAt };
}
