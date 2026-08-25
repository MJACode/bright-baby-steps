import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, addMinutes, isSameDay } from "date-fns";
import { defaultStartAt, deriveEnd } from "@/lib/sessionAnchor";

const AUTO_ADVANCE_MAX_MIN = 14 * 60;

type AnchorMode = "none" | "start" | "end";

type UseSessionAnchorArgs = {
  open: boolean;
  defaultDurationMin: number;
};

/**
 * `startAt` + `durationMin` are canonical; `endAt` is derived every render so
 * the two can never drift. Which of the two ends a duration change moves
 * depends on what the parent has authored:
 *
 * - `none` — both times are still the app's guess, so a duration change
 *   re-derives the start and keeps the end pinned at ≈now.
 * - `end` — they told us when it ended, so a duration change extends the
 *   session backwards from that end. Every preset stays saveable because the
 *   end never moves into the future.
 * - `start` — they told us when it began, so the start is frozen and the end
 *   moves. A resulting future end is a real mistake and validation says so.
 */
export function useSessionAnchor({ open, defaultDurationMin }: UseSessionAnchorArgs) {
  const [startAt, setStartAtState] = useState(() => defaultStartAt(defaultDurationMin));
  const [durationMin, setDurationMinState] = useState(defaultDurationMin);
  const [anchor, setAnchor] = useState<AnchorMode>("none");

  // Re-seed on the closed→open transition only, so a snapshot from the last
  // time the sheet was open never prefills a fresh entry.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStartAtState(defaultStartAt(defaultDurationMin));
      setDurationMinState(defaultDurationMin);
      setAnchor("none");
    }
    wasOpen.current = open;
  }, [open, defaultDurationMin]);

  const endAt = deriveEnd(startAt, durationMin);

  const setStartAt = useCallback((next: Date) => {
    setAnchor("start");
    setStartAtState(next);
  }, []);

  const setDurationMin = useCallback(
    (next: number) => {
      setDurationMinState(next);
      if (anchor === "start") return;
      setStartAtState(anchor === "end" ? addMinutes(endAt, -next) : defaultStartAt(next));
    },
    [anchor, endAt],
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
      // A past session can never end in the future, so a future end is a
      // mistake, not an assertion — taking the anchor from it would make every
      // duration chip derive an equally-future start and leave the parent with
      // no way out. The duration still moves so validation can point at the end
      // they actually scrolled to; an already-authored start keeps its anchor.
      const endsInFuture = candidate.getTime() > Date.now();
      setAnchor((current) => {
        if (!endsInFuture) return "end";
        return current === "start" ? "start" : "none";
      });
      setDurationMinState(Math.round((candidate.getTime() - startAt.getTime()) / 60_000));
    },
    [startAt, endAt],
  );

  return { startAt, durationMin, endAt, setStartAt, setDurationMin, setEndAt };
}
