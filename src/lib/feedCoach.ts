import { differenceInMinutes } from "date-fns";

// Age-based feeding guidance grounded in AAP / healthychildren.org demand-feeding
// advice. Infant feeding is on-demand — these intervals are the *typical upper
// bound* between feeds, used only to gently nudge ("it's been a while, watch for
// cues"), never to prescribe a rigid schedule. Copy stays celebratory and calm
// per the brand voice; the card always carries a "not medical advice" line.

export interface FeedGuidance {
  /** Human label for the age bracket, e.g. "newborn". */
  ageLabel: string;
  /** Typical feeding cadence copy, e.g. "every 2–3 hours". */
  typicalCadence: string;
  /** Hours since the last feed after which we suggest considering a feed. */
  thresholdHours: number;
  /** Optional extra note for this bracket (e.g. newborn overnight wake advice). */
  note?: string;
}

// Hunger cues, ordered early → late. Feeding before the late cues (crying) is
// the goal, so we surface the early ones first.
export const HUNGER_CUES: string[] = [
  "Rooting or turning toward your hand",
  "Bringing hands to the mouth",
  "Lip-smacking or sucking motions",
  "Stirring, stretching, and getting restless",
  "Fussing or crying — a late cue, so try to offer before this",
];

// Corrected age in months → guidance. Brackets follow AAP feeding-frequency
// ranges. Breastfed babies tend to feed on the shorter end, formula-fed on the
// longer end; we pick a single gentle threshold near the upper bound so the
// nudge doesn't fire too eagerly.
export function feedGuidanceForAge(ageMonths: number): FeedGuidance {
  if (ageMonths < 1) {
    return {
      ageLabel: "newborn",
      typicalCadence: "every 2–3 hours (8–12 feeds a day)",
      thresholdHours: 3,
      note: "Newborns usually shouldn't go longer than about 4 hours between feeds, even overnight.",
    };
  }
  if (ageMonths < 6) {
    return {
      ageLabel: "baby",
      typicalCadence: "every 3–4 hours (about 5–7 feeds a day)",
      thresholdHours: 4,
    };
  }
  return {
    ageLabel: "older baby",
    typicalCadence: "every 4–5 hours, alongside solids (about 4–5 milk feeds a day)",
    thresholdHours: 5,
    note: "Around this age, breast milk or formula stays the main source of nutrition while solids are introduced.",
  };
}

export type FeedCoachState =
  // No feeds logged yet — pure cue coaching.
  | { kind: "no-data"; guidance: FeedGuidance }
  // Recent feed, comfortably within the window — watch for cues.
  | { kind: "watch"; guidance: FeedGuidance; hoursSince: number }
  // Past the typical interval — gently suggest considering a feed.
  | { kind: "due"; guidance: FeedGuidance; hoursSince: number };

export function deriveFeedCoachState(opts: {
  ageMonths: number;
  lastFeedAt: Date | null;
  now?: Date;
}): FeedCoachState {
  const now = opts.now ?? new Date();
  const guidance = feedGuidanceForAge(Math.max(0, opts.ageMonths));

  if (!opts.lastFeedAt) {
    return { kind: "no-data", guidance };
  }

  const hoursSince = Math.max(0, differenceInMinutes(now, opts.lastFeedAt) / 60);

  if (hoursSince >= guidance.thresholdHours) {
    return { kind: "due", guidance, hoursSince };
  }
  return { kind: "watch", guidance, hoursSince };
}

// "2h 15m" / "45m" — compact elapsed label for the card.
export function formatHoursSince(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
