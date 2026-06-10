// Developmental-leap reference data + pure timing logic.
//
// Leaps are mental-development spurts in roughly the first 20 months. Each has a
// "stormy" fussy stretch (clinginess, broken sleep) that often precedes a
// "sunny" burst of new skills. Timing is keyed off the DUE DATE when available,
// so the consumer must pass an already-adjusted age in weeks.
//
// IP note: all names, summaries, skills, and signs below are original Grace
// Flare wording. Only the week-timing numbers are factual. Voice is celebratory
// and non-diagnostic ("may", "often", "many babies").

export interface Leap {
  leapNumber: number;
  name: string;
  sunnySummary: string;
  newSkills: string[];
  stormySigns: string[];
  fussyStartWeek: number;
  fussyEndWeek: number;
  leapWeek: number;
}

export const LEAPS: Leap[] = [
  {
    leapNumber: 1,
    name: "The World of Sensations",
    sunnySummary:
      "Your baby may begin taking in sights, sounds, and touch with brand-new alertness.",
    newSkills: [
      "may start tracking faces and bright objects",
      "may be more alert and awake between feeds",
      "may turn toward familiar voices",
      "may show the very first hints of a smile",
    ],
    stormySigns: [
      "may want extra cuddles and closeness",
      "may feed more often than usual",
      "sleep may be briefly unsettled",
    ],
    fussyStartWeek: 4,
    fussyEndWeek: 5,
    leapWeek: 5,
  },
  {
    leapNumber: 2,
    name: "Patterns",
    sunnySummary:
      "Your baby may start noticing how the world repeats — shapes, sounds, and the rhythm of their own hands.",
    newSkills: [
      "may discover and study their own hands",
      "may coo and make new vowel sounds",
      "may hold a gaze on simple patterns",
      "may smile more deliberately at you",
    ],
    stormySigns: [
      "may be fussier in the late afternoon",
      "may want to be held more often",
      "sleep and feeding rhythms may wobble",
    ],
    fussyStartWeek: 7,
    fussyEndWeek: 8,
    leapWeek: 8,
  },
  {
    leapNumber: 3,
    name: "Smooth Transitions",
    sunnySummary:
      "Your baby may begin noticing gradual change — a voice rising, a light dimming, movement flowing.",
    newSkills: [
      "may follow moving objects more smoothly with their eyes",
      "may squeal, gurgle, and experiment with volume",
      "may push up during tummy time",
      "may reach toward things that catch their eye",
    ],
    stormySigns: [
      "may be clingier than usual",
      "appetite may shift day to day",
      "naps may shorten for a stretch",
    ],
    fussyStartWeek: 11,
    fussyEndWeek: 12,
    leapWeek: 12,
  },
  {
    leapNumber: 4,
    name: "Events",
    sunnySummary:
      "Your baby may start linking small moments together — a sound leading to a sight, a reach leading to a grasp.",
    newSkills: [
      "may grab and bring objects to their mouth",
      "may laugh out loud",
      "may roll in one or both directions",
      "may babble with growing range",
      "may anticipate familiar routines",
    ],
    stormySigns: [
      "may seek constant closeness",
      "may resist being put down",
      "nighttime sleep may be briefly disrupted",
    ],
    fussyStartWeek: 17,
    fussyEndWeek: 19,
    leapWeek: 19,
  },
  {
    leapNumber: 5,
    name: "Relationships",
    sunnySummary:
      "Your baby may begin understanding how things relate — near and far, in and out, you and them.",
    newSkills: [
      "may sit with support or briefly on their own",
      "may pass objects between hands",
      "may show clear preferences for people and toys",
      "may explore distance by reaching and leaning",
    ],
    stormySigns: [
      "may show early stranger shyness",
      "may want extra reassurance",
      "appetite may dip for a few days",
    ],
    fussyStartWeek: 24,
    fussyEndWeek: 26,
    leapWeek: 26,
  },
  {
    leapNumber: 6,
    name: "Categories",
    sunnySummary:
      "Your baby may start sorting the world into groups — recognizing that a dog is a dog and food is food.",
    newSkills: [
      "may point at and study specific objects",
      "may imitate simple gestures",
      "may begin to crawl or scoot",
      "may respond to their own name",
    ],
    stormySigns: [
      "may have more pronounced separation moments",
      "sleep may regress briefly",
      "may be more easily frustrated",
    ],
    fussyStartWeek: 34,
    fussyEndWeek: 37,
    leapWeek: 37,
  },
  {
    leapNumber: 7,
    name: "Sequences",
    sunnySummary:
      "Your baby may begin to grasp that actions happen in order — stack, then knock; open, then peek.",
    newSkills: [
      "may stack or nest objects",
      "may pull to stand and cruise furniture",
      "may wave or clap on cue",
      "may use one or two first words",
    ],
    stormySigns: [
      "may be moodier as new skills click into place",
      "may cling during transitions",
      "naps may temporarily shorten",
    ],
    fussyStartWeek: 43,
    fussyEndWeek: 46,
    leapWeek: 46,
  },
  {
    leapNumber: 8,
    name: "Programs",
    sunnySummary:
      "Your baby may start understanding multi-step routines — that getting dressed or eating follows a flow.",
    newSkills: [
      "may help with dressing by lifting an arm or leg",
      "may take first independent steps",
      "may mimic household activities in play",
      "may follow a simple one-step request",
    ],
    stormySigns: [
      "may test limits more often",
      "may want closeness at bedtime",
      "appetite may swing",
    ],
    fussyStartWeek: 52,
    fussyEndWeek: 55,
    leapWeek: 55,
  },
  {
    leapNumber: 9,
    name: "Principles",
    sunnySummary:
      "Your baby may begin experimenting with how the world works — adjusting and negotiating to get a result.",
    newSkills: [
      "may combine two words or gestures",
      "may show early pretend play",
      "may navigate stairs with help",
      "may express clear likes and dislikes",
    ],
    stormySigns: [
      "may have bigger emotional swings",
      "may be more demanding of attention",
      "sleep may be briefly unsettled",
    ],
    fussyStartWeek: 61,
    fussyEndWeek: 64,
    leapWeek: 64,
  },
  {
    leapNumber: 10,
    name: "Systems",
    sunnySummary:
      "Your toddler may start understanding that they belong to a bigger world — family, routines, and their own preferences within it.",
    newSkills: [
      "may use short phrases to share ideas",
      "may show empathy and comfort others",
      "may follow two-step instructions",
      "may take pride in doing things themselves",
    ],
    stormySigns: [
      "may swing between independence and clinginess",
      "may resist transitions more strongly",
      "routines may need extra patience",
    ],
    fussyStartWeek: 71,
    fussyEndWeek: 75,
    leapWeek: 75,
  },
];

export function leapByNumber(n: number): Leap | undefined {
  return LEAPS.find((l) => l.leapNumber === n);
}

/** The next leap whose stormy window hasn't started yet, or null past leap 10. */
export function getNextLeap(ageWeeks: number): Leap | null {
  return LEAPS.find((l) => l.fussyStartWeek > ageWeeks) ?? null;
}

export type LeapStatus =
  | { phase: "stormy"; leap: Leap }
  | { phase: "sunny"; leap: Leap }
  | { phase: "calm"; nextLeap: Leap | null };

/**
 * Resolve where a baby sits relative to the leaps, given an age already adjusted
 * to the due date.
 *
 * - stormy: ageWeeks is inside a leap's [fussyStartWeek, fussyEndWeek].
 * - sunny: ageWeeks is past a leap's center (leapWeek) but before the next
 *   leap's fussy window begins — the just-passed leap's new skills are emerging.
 * - calm: neither — between the end of a sunny window and the next fussy start,
 *   or before leap 1, or once the final leap's sunny window has closed. nextLeap
 *   points at the next upcoming leap (or null once leap 10 is fully behind us).
 */

// How long a leap's "sunny" new-skills window stays open when no further leap
// follows it (i.e. after the final leap). Keeps "leaps complete" reachable
// instead of leaving the last leap perpetually sunny.
const FINAL_SUNNY_SPAN_WEEKS = 12;

export function getCurrentLeapStatus(ageWeeks: number): LeapStatus {
  const stormy = LEAPS.find(
    (l) => ageWeeks >= l.fussyStartWeek && ageWeeks <= l.fussyEndWeek,
  );
  if (stormy) return { phase: "stormy", leap: stormy };

  // A leap's sunny window runs from its center (leapWeek) to the next leap's
  // fussy start. The final leap has no successor, so its window is capped at
  // FINAL_SUNNY_SPAN_WEEKS. We pick the most recent leap whose center the baby
  // has reached.
  for (let i = LEAPS.length - 1; i >= 0; i--) {
    const leap = LEAPS[i];
    if (ageWeeks < leap.leapWeek) continue;
    const next = LEAPS[i + 1];
    const sunnyEnd = next ? next.fussyStartWeek : leap.leapWeek + FINAL_SUNNY_SPAN_WEEKS;
    if (ageWeeks < sunnyEnd) return { phase: "sunny", leap };
    break;
  }

  return { phase: "calm", nextLeap: getNextLeap(ageWeeks) };
}
