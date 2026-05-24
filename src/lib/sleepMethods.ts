// Sleep methods: the catalog of approaches a parent can choose for their
// child. The `copy` field is the single source of truth for in-app coaching
// language so the banner, off-plan detector, and edge function all read the
// same phrases.

export type SleepMethod =
  | "gentle_foundations"
  | "pick_up_put_down"
  | "chair"
  | "ferber"
  | "extinction"
  | "fading";

export interface SleepMethodCopy {
  windDownNap: string;
  windDownBed: string;
  windowExceeded: string;
  falseStart: string;
  shortNapStreak: string;
  bedtimeDrift: string;
}

export interface SleepMethodMeta {
  id: SleepMethod;
  name: string;
  oneLineDescription: string;
  minAgeWeeks: number;
  allowsCrying: boolean;
  copy: SleepMethodCopy;
}

// Cry-tolerating methods are gated to 16 weeks adjusted age per AAP guidance.
// The DB trigger enforces this server-side; the UI mirrors it so the picker
// can explain *why* a tile is locked.
export const SLEEP_METHODS: SleepMethodMeta[] = [
  {
    id: "gentle_foundations",
    name: "Gentle Foundations",
    oneLineDescription:
      "Steady routines, age-appropriate wake windows, plenty of contact comfort. No crying involved.",
    minAgeWeeks: 0,
    allowsCrying: false,
    copy: {
      windDownNap:
        "Dim the lights, lower the volume, and ease into your usual pre-nap rhythm.",
      windDownBed:
        "Slow the pace, dim everything, and start the bedtime steps in the same order you always use.",
      windowExceeded:
        "Wake window stretched a bit — try a contact nap or a calm wind-down to bridge the gap.",
      falseStart:
        "A short first stretch is normal. Resettle gently and try the same routine again.",
      shortNapStreak:
        "Two short naps in a row. Try a slightly longer wake window before the next sleep, or lean into a contact nap to recharge.",
      bedtimeDrift:
        "Bedtime has been creeping later. Aim to start the wind-down 15 min earlier tomorrow.",
    },
  },
  {
    id: "pick_up_put_down",
    name: "Pick-Up / Put-Down",
    oneLineDescription:
      "Pick baby up when they cry, soothe to calm-but-awake, put them back down. Repeat as needed.",
    minAgeWeeks: 0,
    allowsCrying: false,
    copy: {
      windDownNap:
        "Start the routine now — if they fuss after lights-out, pick up, soothe, put back down.",
      windDownBed:
        "Begin the bedtime steps. Be ready for a few pick-up / put-down cycles tonight if needed.",
      windowExceeded:
        "Wake window's stretched. Pick up, calm them, and try a fresh attempt at sleep.",
      falseStart:
        "False start is common with this method. Calm, brief pick-up, then put-down — same as bedtime.",
      shortNapStreak:
        "Short naps add up. Try one or two pick-up / put-down cycles instead of ending the nap.",
      bedtimeDrift:
        "Bedtime drift can mean wake windows are off. Start the routine 15 min earlier tomorrow.",
    },
  },
  {
    id: "chair",
    name: "Chair Method",
    oneLineDescription:
      "Sit nearby at bedtime, move the chair a little farther from the crib every few nights.",
    minAgeWeeks: 16,
    allowsCrying: true,
    copy: {
      windDownNap:
        "Start the pre-nap routine. Sit in your stage's chair position and stay calm and present.",
      windDownBed:
        "Begin the bedtime steps. Sit at your current stage, soothe with voice only, no eye contact if you're past stage 1.",
      windowExceeded:
        "Window's stretched — take a short break from the chair plan tonight and let the body sleep.",
      falseStart:
        "Return to your chair stage and stay quiet. Resist re-engaging — the presence is the cue.",
      shortNapStreak:
        "Short naps don't undo chair progress. Hold at your current stage tonight.",
      bedtimeDrift:
        "If bedtime keeps drifting, hold at the current chair stage another few nights before advancing.",
    },
  },
  {
    id: "ferber",
    name: "Ferber (graduated extinction)",
    oneLineDescription:
      "Brief, timed check-ins with progressively longer intervals. Best after 4 months.",
    minAgeWeeks: 16,
    allowsCrying: true,
    copy: {
      windDownNap:
        "Start the routine. Follow your Ferber interval schedule if there's protest after put-down.",
      windDownBed:
        "Begin the bedtime steps. Your check-in timer will run once they're in the crib.",
      windowExceeded:
        "Window's stretched — skip Ferber check-ins tonight and let them sleep whenever they fall asleep.",
      falseStart:
        "Restart the interval timer for this wake. Keep check-ins brief and the room calm.",
      shortNapStreak:
        "Use the same interval schedule for naps. Two short naps doesn't mean the method isn't working.",
      bedtimeDrift:
        "If bedtime's drifting, the schedule may need a 15-min shift before the next adjustment.",
    },
  },
  {
    id: "extinction",
    name: "Full Extinction",
    oneLineDescription:
      "After bedtime routine, no check-ins until morning. Fastest results, hardest first few nights.",
    minAgeWeeks: 16,
    allowsCrying: true,
    copy: {
      windDownNap:
        "Naps with extinction are usually a shorter version of bedtime. Routine, lights-out, leave.",
      windDownBed:
        "Run the bedtime routine, say your goodnight phrase, and leave the room. Hold steady tonight.",
      windowExceeded:
        "Step out of the method tonight if the window's been blown — extinction works best with a baseline routine.",
      falseStart:
        "Brief comfort if needed for safety, otherwise the method holds. Most false starts resolve quickly.",
      shortNapStreak:
        "Short naps happen during extinction. Stay the course — most plans show progress within a week.",
      bedtimeDrift:
        "Check that the routine and lights-out time haven't shifted. Consistency is what makes this work.",
    },
  },
  {
    id: "fading",
    name: "Bedtime Fading",
    oneLineDescription:
      "Start bedtime at the time baby naturally falls asleep, then move it earlier 15 min every few days.",
    minAgeWeeks: 16,
    allowsCrying: true,
    copy: {
      windDownNap:
        "Hold the routine and watch for sleepy cues — the goal is fast sleep onset, not a clock time.",
      windDownBed:
        "Start at your faded bedtime. If lights-out runs long, move bedtime later again and re-fade.",
      windowExceeded:
        "Window's stretched. Skip tonight's fade target and aim for natural sleep onset.",
      falseStart:
        "A false start usually means bedtime needs to be later for a few nights. Reset the fade.",
      shortNapStreak:
        "Short naps can mean the day's a touch off. Hold your bedtime fade target and try again tomorrow.",
      bedtimeDrift:
        "Drift is part of fading. Push bedtime 15 min later for 3 nights, then resume fading earlier.",
    },
  },
];

export function getSleepMethodMeta(method: SleepMethod): SleepMethodMeta {
  const found = SLEEP_METHODS.find((m) => m.id === method);
  if (found) return found;
  return SLEEP_METHODS[0];
}

export function isMethodEligible(
  method: SleepMethod,
  ageDays: number | null | undefined,
): boolean {
  const meta = getSleepMethodMeta(method);
  if (meta.minAgeWeeks === 0) return true;
  if (ageDays === null || ageDays === undefined) return false;
  return ageDays >= meta.minAgeWeeks * 7;
}

export const DEFAULT_FERBER_INTERVALS: number[][] = [
  [3, 5, 10],
  [5, 10, 12],
  [10, 12, 15],
];
