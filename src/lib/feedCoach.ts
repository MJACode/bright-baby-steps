import { differenceInMinutes } from "date-fns";

// Age-based feeding guidance grounded in AAP / healthychildren.org demand-feeding
// advice. Infant feeding is on-demand — these intervals are the *typical upper
// bound* between feeds, used only to gently nudge ("it's been a while, watch for
// cues"), never to prescribe a rigid schedule. Copy stays celebratory and calm
// per the brand voice; the card always carries a "not medical advice" line.
//
// Overnight is a different regime from daytime: past the newborn weeks a long
// night stretch is the goal, not a deficit, so the night states describe what
// is typical for the age and never push a parent toward waking a sleeping baby.

/** Machine key for the age bracket. `ageLabel` is the human-facing string. */
export type FeedBracket = "newborn" | "1-3mo" | "3-6mo" | "6-12mo" | "12mo+";

export interface FeedGuidance {
  /** Bracket key for copy lookups. */
  bracket: FeedBracket;
  /** Human label for the age bracket, e.g. "newborn". */
  ageLabel: string;
  /** Typical feeding cadence copy, e.g. "every 2–3 hours". */
  typicalCadence: string;
  /** Hours since the last feed after which we suggest considering a feed. */
  thresholdHours: number;
  /** Optional extra note for this bracket (e.g. newborn overnight wake advice). */
  note?: string;
  /**
   * True while the AAP wake-to-feed advice still applies — the only case where
   * an overnight imperative is correct. The rule exits on birth-weight regain,
   * good gain, and a pediatrician's sign-off rather than on a calendar date, so
   * a baby born early stays inside it longer.
   */
  wakeToFeedOvernight: boolean;
  /** Population fact: how many feeds a night is typical at this age. */
  typicalNightFeeds: string;
  /** Population fact: how long a normal night stretch runs at this age. */
  longestNormalNightStretch: string;
  /**
   * What `longestNormalNightStretch` actually measures, which flips with the
   * bracket. While overnight feeds are still expected it is the longest gap
   * BETWEEN FEEDS — for newborns that number is the AAP 4-hour ceiling itself,
   * so it must never be printed as a sleep band a feed gap may exceed. Past
   * that it is a SLEEP band, which a feed gap legitimately runs beyond.
   */
  nightStretchUnit: "feed-gap" | "sleep";
  /**
   * Upper end of `longestNormalNightStretch`, in hours. A machine-readable
   * mirror of the band the card prints, so copy and data can't drift apart.
   * It describes SLEEP — never compare it to a feed gap; use
   * `longNightGapHours` for that.
   */
  maxNormalNightStretchHours: number;
  /**
   * How many hours may pass between the evening feed and the next one before
   * the overnight states stand down, in hours. Deliberately larger than
   * `maxNormalNightStretchHours`: a feed gap brackets the night sleep at both
   * ends — the bedtime feed lands before sleep onset and the morning feed comes
   * after waking — so a normal night always measures longer in feeds than in
   * sleep. Brackets where overnight feeds are still expected take their sleep
   * band plus that ~2 hours of bracketing; brackets where going the night
   * without a feed is typical take the widest plausible span from an early
   * evening feed (around 18:00) to a late morning one (around 08:00).
   */
  longNightGapHours: number;
  /** Optional caveat shown only in the overnight states. */
  nightNote?: string;
}

// Overnight, the wake-to-feed brackets use the AAP "not much longer than about
// 4 hours" line rather than the tighter daytime threshold — a newborn 3 hours
// into a night stretch doesn't need waking yet.
export const OVERNIGHT_WAKE_THRESHOLD_HOURS = 4;

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
export function feedGuidanceForAge(
  ageMonths: number,
  opts?: { isPremature?: boolean | null },
): FeedGuidance {
  const wakeToFeedOvernight =
    ageMonths < 1 || (!!opts?.isPremature && ageMonths < 3);

  if (ageMonths < 1) {
    return {
      bracket: "newborn",
      ageLabel: "newborn",
      typicalCadence: "every 2–3 hours (8–12 feeds a day)",
      thresholdHours: 3,
      note: "Newborns usually shouldn't go longer than about 4 hours between feeds, even overnight.",
      wakeToFeedOvernight,
      typicalNightFeeds: "2–3 feeds overnight",
      longestNormalNightStretch: "about 4 hours",
      nightStretchUnit: "feed-gap",
      maxNormalNightStretchHours: 4,
      longNightGapHours: 6,
      nightNote:
        "Newborns usually shouldn't go longer than about 4 hours between feeds, even overnight.",
    };
  }
  if (ageMonths < 3) {
    return {
      bracket: "1-3mo",
      ageLabel: "baby",
      typicalCadence: "every 3–4 hours (about 5–7 feeds a day)",
      thresholdHours: 4,
      note: "Most babies this age still feed every 3–4 hours, including overnight. Longer stretches are fine once your pediatrician is happy with weight gain.",
      wakeToFeedOvernight,
      typicalNightFeeds: "1–3 feeds overnight",
      longestNormalNightStretch: "4–6 hours",
      nightStretchUnit: "feed-gap",
      maxNormalNightStretchHours: 6,
      longNightGapHours: 8,
      nightNote:
        "Many babies this age still take a feed or two overnight, and many don't — both are normal.",
    };
  }
  if (ageMonths < 6) {
    return {
      bracket: "3-6mo",
      ageLabel: "baby",
      typicalCadence: "every 3–4 hours (about 5–7 feeds a day)",
      thresholdHours: 4,
      wakeToFeedOvernight,
      typicalNightFeeds: "0–2 feeds overnight",
      longestNormalNightStretch: "6–8 hours",
      nightStretchUnit: "sleep",
      maxNormalNightStretchHours: 8,
      longNightGapHours: 14,
    };
  }
  if (ageMonths < 12) {
    return {
      bracket: "6-12mo",
      ageLabel: "older baby",
      typicalCadence: "every 4–5 hours, alongside solids (about 4–5 milk feeds a day)",
      thresholdHours: 5,
      note: "Around this age, breast milk or formula stays the main source of nutrition while solids are introduced.",
      wakeToFeedOvernight,
      typicalNightFeeds: "0–1 feeds overnight",
      longestNormalNightStretch: "8–11 hours",
      nightStretchUnit: "sleep",
      maxNormalNightStretchHours: 11,
      longNightGapHours: 14,
    };
  }
  return {
    bracket: "12mo+",
    ageLabel: "toddler",
    typicalCadence: "3 meals and 2 snacks a day, alongside about 2–3 milk feeds",
    thresholdHours: 5,
    note: "Around this age, milk sits alongside meals and snacks rather than leading them.",
    wakeToFeedOvernight,
    typicalNightFeeds: "usually no feeds overnight",
    longestNormalNightStretch: "10–12 hours",
    nightStretchUnit: "sleep",
    maxNormalNightStretchHours: 12,
    longNightGapHours: 15,
  };
}

/** The night boundary the card is derived against. Resolved by useNightWindow
 *  so the clock is never read inside the state machine. */
export interface FeedNightWindow {
  isNightNow: boolean;
  nightSleepInProgress: boolean;
  /** Start of the current — or most recently finished — night. */
  nightStartsAt: Date;
  /**
   * The instant the night actually opened for the clock: `nightStartsAt` plus
   * the lead-in the sleep side holds off for. Attribution is measured from
   * here, so a gap that had already earned a daytime nudge during the lead-in
   * can't be muted by the boundary arriving a few minutes later. Surfaces with
   * no lead-in of their own fall back to `nightStartsAt`.
   */
  nightOpensAt?: Date;
  /** End of that night. */
  morningEndsAt: Date;
}

export type FeedCoachState =
  // No feeds logged yet — pure cue coaching.
  | { kind: "no-data"; guidance: FeedGuidance }
  // Recent feed, comfortably within the window — watch for cues.
  | { kind: "watch"; guidance: FeedGuidance; hoursSince: number; overnight: boolean }
  // Past the typical interval — gently suggest considering a feed.
  | { kind: "due"; guidance: FeedGuidance; hoursSince: number; overnight: boolean }
  // Night, past the wake-to-feed weeks — a long gap is the goal, not a deficit.
  | { kind: "night-stretch"; guidance: FeedGuidance; hoursSince: number }
  // Night, but the reassurance doesn't hold — stated plainly rather than
  // celebrated, without any wake-the-baby imperative. Either the gap has run
  // past the longest feed-to-feed span that's typical for the age, or it began
  // too far before the night to be the night's gap at all.
  | {
      kind: "night-long-gap";
      guidance: FeedGuidance;
      hoursSince: number;
      reason: "past-typical-span" | "started-before-the-night";
    }
  // Morning, nothing logged since the night ended.
  | {
      kind: "first-feed-of-day";
      guidance: FeedGuidance;
      hoursSince: number;
      /** Last feed → end of the night, so it stops growing once the day starts. */
      stretchHours: number;
    };

// A feed logged this far ahead of the night boundary still counts as the one
// that led into the night — bedtime feeds land before the clock says "night".
export const EVENING_LEAD_IN_HOURS = 4;

const HOUR_MS = 60 * 60 * 1000;

/**
 * True while the day's first feed is still ahead: the night has ended, nothing
 * has been logged since it did, and the gap really is the overnight one.
 *
 * The gap is bounded at both ends: it has to clear the age threshold (a 06:50
 * feed before a 07:00 wake is not an overnight gap) and stay inside
 * `longNightGapHours`, so a gap that started before yesterday's bedtime doesn't
 * get greeted as the morning after a normal night. The morning state
 * also stands down once the baby has been up for longer than that same
 * threshold — by then a feed genuinely is due and saying so is the safe
 * direction to be wrong in. Every stand-down falls through to the daytime
 * `due` state, which is the escalation the parent needs once the day is under
 * way and the baby is awake.
 */
function isFirstFeedOfDay(
  now: Date,
  lastFeedAt: Date,
  night: FeedNightWindow,
  guidance: FeedGuidance,
): boolean {
  const morningEnd = night.morningEndsAt.getTime();
  if (morningEnd > now.getTime()) return false;
  if (lastFeedAt.getTime() >= morningEnd) return false;
  if (lastFeedAt.getTime() < night.nightStartsAt.getTime() - EVENING_LEAD_IN_HOURS * HOUR_MS) {
    return false;
  }
  const stretchHours = (morningEnd - lastFeedAt.getTime()) / HOUR_MS;
  if (stretchHours < guidance.thresholdHours) return false;
  if (stretchHours > guidance.longNightGapHours) return false;
  return (now.getTime() - morningEnd) / HOUR_MS < guidance.thresholdHours;
}

export function deriveFeedCoachState(opts: {
  ageMonths: number;
  lastFeedAt: Date | null;
  now?: Date;
  isPremature?: boolean | null;
  /** Omitted on surfaces with no night context — daytime behaviour only. */
  night?: FeedNightWindow | null;
}): FeedCoachState {
  const now = opts.now ?? new Date();
  const guidance = feedGuidanceForAge(Math.max(0, opts.ageMonths), {
    isPremature: opts.isPremature,
  });

  if (!opts.lastFeedAt) {
    return { kind: "no-data", guidance };
  }

  const hoursSince = Math.max(0, differenceInMinutes(now, opts.lastFeedAt) / 60);
  const night = opts.night ?? null;

  // A running night timer counts as night even before the clock boundary — the
  // baby is down, so the daytime imperative doesn't apply.
  if (night && (night.isNightNow || night.nightSleepInProgress)) {
    if (guidance.wakeToFeedOvernight) {
      return hoursSince >= OVERNIGHT_WAKE_THRESHOLD_HOURS
        ? { kind: "due", guidance, hoursSince, overnight: true }
        : { kind: "watch", guidance, hoursSince, overnight: true };
    }
    // The night states only describe the night's own gap. A feed logged well
    // before the evening isn't the one that led into it, so a gap that started
    // at lunchtime can't be framed as an overnight stretch — that would mute
    // the card and hide the cue list on the longest gap of the day. Measured
    // from the moment the night opened rather than from the nominal night
    // start, so a nudge that has already fired during the lead-in is never
    // retracted by the boundary arriving.
    const ledIntoTheNight =
      opts.lastFeedAt.getTime() >=
      (night.nightOpensAt ?? night.nightStartsAt).getTime() -
        EVENING_LEAD_IN_HOURS * HOUR_MS;
    if (!ledIntoTheNight) {
      return {
        kind: "night-long-gap",
        guidance,
        hoursSince,
        reason: "started-before-the-night",
      };
    }
    return hoursSince > guidance.longNightGapHours
      ? { kind: "night-long-gap", guidance, hoursSince, reason: "past-typical-span" }
      : { kind: "night-stretch", guidance, hoursSince };
  }

  // Keyed on nothing having been logged since the night ended, not on the
  // clock, so it holds until the first feed of the day is actually logged.
  if (night && isFirstFeedOfDay(now, opts.lastFeedAt, night, guidance)) {
    const stretchHours = Math.max(
      0,
      differenceInMinutes(night.morningEndsAt, opts.lastFeedAt) / 60,
    );
    return { kind: "first-feed-of-day", guidance, hoursSince, stretchHours };
  }

  if (hoursSince >= guidance.thresholdHours) {
    return { kind: "due", guidance, hoursSince, overnight: false };
  }
  return { kind: "watch", guidance, hoursSince, overnight: false };
}

// Population facts only — nothing here may tell a parent what to do with this
// particular baby overnight. The wake-to-feed rule exits on weight regain and
// good gain, not on a birthday, so even a "no need to wake" aside can land on a
// family whose pediatrician has asked for the opposite.
const NIGHT_STRETCH_BODY: Record<FeedBracket, (name: string) => string> = {
  newborn: (n) =>
    `Newborns wake to feed around the clock. When ${n} stirs, roots, or brings hands to mouth, that's your cue.`,
  "1-3mo": () =>
    `Longer stretches start showing up around now. Most babies this age wake on their own when they're ready to feed.`,
  "3-6mo": () =>
    `By around three months, many babies sleep six to eight hours at a stretch, and most wake on their own when they're ready to feed.`,
  "6-12mo": () =>
    `Most babies this age go the night without a feed. Breast milk or formula usually stays the main source of nutrition at this age, with solids alongside.`,
  "12mo+": () =>
    `Most children this age go the night without a feed. Milk and meals during the day usually cover the day's nutrition.`,
};

// `stretch` is the gap between the last logged feed and the end of the night —
// a feed gap, not a sleep duration. We have no evidence the baby slept through
// it (there may be no sleep logs at all, and a bedtime feed lands hours before
// sleep onset), so no title here may claim sleep.
const MORNING_COPY: Record<
  FeedBracket,
  (name: string, stretch: string) => { title: string; body: string }
> = {
  newborn: (n, s) => ({
    title: `${s} between ${n}'s last feed and this morning`,
    body: `A good moment for the first feed of the day. Newborns usually land 8–12 feeds across 24 hours, so there's room to catch up. If long stretches become the pattern this month, it's worth a mention at your next visit.`,
  }),
  "1-3mo": (n, s) => ({
    title: `${s} between ${n}'s last feed and this morning`,
    body: `Babies this age often take a bigger feed after the overnight gap. Offer the first one whenever ${n} stirs.`,
  }),
  "3-6mo": (n, s) => ({
    title: `${s} between ${n}'s last feed and this morning`,
    body: `Offer the first feed whenever they stir. The overnight gap usually evens out across the day.`,
  }),
  "6-12mo": (n, s) => ({
    title: `${s} between ${n}'s last feed and this morning`,
    body: `Good morning. Milk or formula first; solids come alongside. After the overnight gap, the morning feed is usually the biggest one.`,
  }),
  "12mo+": (n, s) => ({
    title: `${s} between ${n}'s last feed and this morning`,
    body: `Good morning. Milk or breakfast whenever they're ready. After the overnight gap, the first feed is usually the biggest one.`,
  }),
};

// Population facts, labelled in the unit the bracket's own number is stated
// in. In the brackets that still feed overnight that number is a feed interval
// — for a newborn it IS the 4-hour ceiling — so calling it a sleep band would
// invert the one clinical limit this card carries.
function nightFactsLine(g: FeedGuidance): string {
  const label =
    g.nightStretchUnit === "feed-gap" ? "gap between feeds" : "sleep stretch";
  return `Typical at this age: ${g.typicalNightFeeds}. Longest normal ${label}: ${g.longestNormalNightStretch}.`;
}

// The reassurance states print a feed-to-feed number above a sleep band, and a
// normal night always measures longer in feeds than in sleep — the bedtime feed
// lands before sleep onset, the morning feed after waking. Naming that
// bracketing keeps a routine night from reading as if it had blown past the
// band, and bounding it at an hour or two keeps it from excusing any excess at
// all. Never used where the number is itself a feed interval, and never on
// `night-long-gap`, where the whole point is that the gap has outrun the band.
function nightStretchFactsLine(g: FeedGuidance): string {
  if (g.nightStretchUnit === "feed-gap") return nightFactsLine(g);
  return `${nightFactsLine(g)} Measured feed to feed, a night usually runs an hour or two past that.`;
}

// Required on every overnight state where the wake-to-feed rule has lapsed —
// a pediatrician's instruction outranks anything this card says.
function pediatricianHedge(name: string): string {
  return `If your pediatrician asked you to wake ${name} for feeds, keep following that.`;
}

export interface FeedCoachCopy {
  pill: { label: string; tone: "solid" | "soft" | "muted" };
  title: string;
  body: string;
  /** Muted supporting lines, rendered in order under the body. */
  notes: string[];
  /** Cue checklists are hidden overnight — nobody should be watching a
   *  sleeping baby for rooting. */
  showCues: boolean;
}

export function feedCoachCopy(state: FeedCoachState, firstName: string): FeedCoachCopy {
  const g = state.guidance;

  switch (state.kind) {
    case "night-stretch": {
      const stretch = formatHoursSince(state.hoursSince);
      return {
        pill: { label: "Overnight", tone: "muted" },
        title: `Overnight: ${stretch} since the last feed`,
        body: NIGHT_STRETCH_BODY[g.bracket](firstName),
        notes: [g.nightNote ?? nightStretchFactsLine(g), pediatricianHedge(firstName)],
        showCues: false,
      };
    }

    case "night-long-gap": {
      const elapsed = formatHoursSince(state.hoursSince);
      return {
        pill: { label: "Consider a feed", tone: "solid" },
        title: `It's been ${elapsed} since ${firstName}'s last feed`,
        body:
          state.reason === "started-before-the-night"
            ? `The last feed on record is from before the evening, so this gap covers more than the night. Feeds are on demand — offering one whenever ${firstName} stirs is always fine.`
            : `That's a longer gap between feeds than most babies this age go overnight. Feeds are on demand — offering one whenever ${firstName} stirs is always fine.`,
        notes: [nightFactsLine(g), pediatricianHedge(firstName)],
        showCues: false,
      };
    }

    case "first-feed-of-day": {
      const stretch = formatHoursSince(state.stretchHours);
      const { title, body } = MORNING_COPY[g.bracket](firstName, stretch);
      return {
        pill: { label: "First feed of the day", tone: "muted" },
        title,
        body,
        notes: [nightStretchFactsLine(g)],
        showCues: true,
      };
    }

    case "due": {
      const elapsed = formatHoursSince(state.hoursSince);
      if (state.overnight) {
        const isNewborn = g.bracket === "newborn";
        return {
          pill: { label: "Time for a feed", tone: "solid" },
          title: isNewborn
            ? `It's been ${elapsed} — newborns feed overnight too`
            : `It's been ${elapsed} — time for a feed`,
          body: isNewborn
            ? `At this age, feeds every 2–3 hours around the clock are how ${firstName} grows. It's fine to wake them gently for this one — unswaddling, skin-to-skin, or a diaper change usually does it.`
            : `Babies born early often stay on around-the-clock feeds for longer. It's fine to wake ${firstName} gently for this one — unswaddling, skin-to-skin, or a diaper change usually does it.`,
          notes: [
            `Once ${firstName} is back to birth weight and gaining well, your pediatrician may say longer stretches are fine.`,
          ],
          showCues: false,
        };
      }
      return {
        pill: { label: "Consider a feed", tone: "solid" },
        title: `It's been ${elapsed} since ${firstName}'s last feed`,
        body: `Babies this age usually feed ${g.typicalCadence}. If you spot hunger cues, it's a good time to offer a feed.`,
        notes: g.note ? [g.note] : [],
        showCues: true,
      };
    }

    case "watch": {
      const elapsed = formatHoursSince(state.hoursSince);
      if (state.overnight) {
        return {
          // The cue list is hidden overnight, so the pill can't name it.
          pill: { label: "Feeds continue overnight", tone: "soft" },
          title: `Last feed was ${elapsed} ago`,
          body:
            g.bracket === "newborn"
              ? `Newborns wake to feed around the clock. When ${firstName} stirs, roots, or brings hands to mouth, that's your cue.`
              : `Babies born early often feed around the clock for longer. When ${firstName} stirs, roots, or brings hands to mouth, that's your cue.`,
          // Only the wake-to-feed brackets reach this branch. A preemie here
          // reads their corrected-age bracket's note ("many do, and many
          // don't"), which argues with the body above it. The newborn
          // bracket's own note IS the wake-to-feed rule, so it reinforces the
          // body and must survive — dropping it would take the 4-hour line off
          // the one state that most needs it.
          notes: g.nightNote && g.bracket === "newborn" ? [g.nightNote] : [],
          showCues: false,
        };
      }
      return {
        pill: { label: "Watch for cues", tone: "soft" },
        title: `Last feed was ${elapsed} ago`,
        body: `Watch for ${firstName}'s hunger cues — feeds are on demand, so offer whenever the cues show up.`,
        notes: g.note ? [g.note] : [],
        showCues: true,
      };
    }

    case "no-data":
      return {
        pill: { label: "Watch for cues", tone: "soft" },
        title: `Watch for ${firstName}'s hunger cues`,
        body: `Babies this age usually feed ${g.typicalCadence}. Log a feed to start tracking the rhythm.`,
        notes: g.note ? [g.note] : [],
        showCues: true,
      };
  }
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
