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
  onTrack: string;
}

// Proactive guidance: what to *do* tonight and what to expect. Kept separate
// from the reactive `copy` strings so the plan dialog and dashboard can teach
// the method up front, before anything goes off-plan.
export interface SleepMethodGuide {
  howItWorks: string;
  tonightSteps: string[];
  firstNights: string;
}

export interface SleepMethodMeta {
  id: SleepMethod;
  name: string;
  oneLineDescription: string;
  minAgeWeeks: number;
  allowsCrying: boolean;
  copy: SleepMethodCopy;
  guide: SleepMethodGuide;
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
        "A long stretch awake — try a contact nap or a calm wind-down to bridge the gap.",
      falseStart:
        "A short first stretch is normal. Resettle gently and try the same routine again.",
      shortNapStreak:
        "Short naps happen. Try a slightly longer wake window before the next sleep, or lean into a contact nap to recharge.",
      bedtimeDrift:
        "Bedtime's been trending later — starting the wind-down 15 min earlier tomorrow usually brings it back.",
      onTrack:
        "Your steady routines are doing the work — your baby is settling well.",
    },
    guide: {
      howItWorks:
        "You build sleep on predictable rhythms and plenty of comfort. There's no crying to wait out — you stay close and respond, and consistency does the teaching.",
      tonightSteps: [
        "Watch for sleepy cues and start the wind-down a little before your baby is overtired.",
        "Dim the lights and run the same short routine in the same order every time.",
        "Lay your baby down drowsy but awake, and offer your hand, a shush, or a pat.",
        "If your baby fusses, comfort them however they need — pick up, rock, or feed — then try settling again.",
      ],
      firstNights:
        "This is the gentlest path, so expect gradual change over a couple of weeks rather than overnight. Each consistent night makes the next one easier.",
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
        "A long stretch awake — pick up, calm them, and try a fresh attempt at sleep.",
      falseStart:
        "False start is common with this method. Calm, brief pick-up, then put-down — same as bedtime.",
      shortNapStreak:
        "Short naps happen. Try one or two pick-up / put-down cycles instead of ending the nap.",
      bedtimeDrift:
        "Bedtime's been trending later — starting the routine 15 min earlier tomorrow usually brings it back.",
      onTrack:
        "Your calm pick-up / put-down rhythm is paying off — fewer cycles each night.",
    },
    guide: {
      howItWorks:
        "When your baby cries, you pick them up and soothe to calm-but-awake, then lay them back down. You repeat as needed — your baby is never left to cry alone.",
      tonightSteps: [
        "Run your usual wind-down and lay your baby down calm but still awake.",
        "If they cry, pick them up and soothe just until they're calm — not all the way to sleep.",
        "Lay them back down awake as soon as they settle.",
        "Repeat the cycle as many times as it takes, staying patient and quiet.",
      ],
      firstNights:
        "The first night or two can take many cycles — that's normal and expected. Within a week most babies need far fewer pick-ups to settle.",
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
        "A long stretch awake — take a short break from the chair plan tonight and let the body sleep.",
      falseStart:
        "Return to your chair stage and stay quiet. Resist re-engaging — the presence is the cue.",
      shortNapStreak:
        "Short naps don't undo chair progress. Hold at your current stage tonight.",
      bedtimeDrift:
        "Bedtime's been trending later — hold at the current chair stage another few nights before advancing.",
      onTrack:
        "Your baby is settling with you nearby — you're ready to ease the chair back a stage soon.",
    },
    guide: {
      howItWorks:
        "You sit in a chair beside the crib while your baby falls asleep, then move the chair a little farther away every few nights until you're out of the room. Your presence is the comfort that fades, not your baby.",
      tonightSteps: [
        "Finish your wind-down and put your baby down awake.",
        "Sit in the chair at your current stage's position next to the crib.",
        "Soothe with quiet voice and light touch as needed — less interaction as you move through the stages.",
        "Stay in the chair until your baby is asleep, then leave the room.",
        "Hold this stage for a few nights before moving the chair farther away.",
      ],
      firstNights:
        "Expect some protest the first few nights at each new chair position — that settles as your baby gets used to the distance. Most families move a stage every three to five nights.",
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
        "A long stretch awake — skip Ferber check-ins tonight and let them sleep whenever they fall asleep.",
      falseStart:
        "Restart the interval timer for this wake. Keep check-ins brief and the room calm.",
      shortNapStreak:
        "Short naps happen. Use the same interval schedule for naps — the method is still working.",
      bedtimeDrift:
        "Bedtime's been trending later — the schedule may need a 15-min shift before the next adjustment.",
      onTrack:
        "Your check-ins are getting shorter and calmer — your baby is learning to settle.",
    },
    guide: {
      howItWorks:
        "After the bedtime routine you check in at set, progressively longer intervals. Each check is brief and reassuring — you let the gaps grow night over night so your baby learns to fall asleep on their own.",
      tonightSteps: [
        "Run your wind-down, put your baby down awake, and leave the room.",
        "If they protest, wait your first interval — about 3 minutes on night one — before the first check-in.",
        "Keep each check-in short: a calm word and reassurance, no picking up, then step out.",
        "Lengthen the wait before each check (around 3, then 5, then 10 minutes) and repeat until your baby is asleep.",
      ],
      firstNights:
        "The intervals start short and stretch as you go, and they grow a little longer each night. Most families see noticeably calmer bedtimes within three to seven nights.",
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
        "A long stretch awake — step out of the method tonight; extinction works best with a baseline routine.",
      falseStart:
        "Brief comfort if needed for safety, otherwise the method holds. Most false starts resolve quickly.",
      shortNapStreak:
        "Short naps happen during extinction. Stay the course — most plans show progress within a week.",
      bedtimeDrift:
        "Check that the routine and lights-out time haven't shifted. Consistency is what makes this work.",
      onTrack:
        "You held steady and it's working — your baby is falling asleep on their own.",
    },
    guide: {
      howItWorks:
        "After your bedtime routine, you say goodnight and don't return until morning (apart from safety or feeds you've planned). It's the most direct approach — your baby learns to self-settle quickly because the routine stays completely consistent.",
      tonightSteps: [
        "Run a calm, full bedtime routine so your baby is relaxed and fed.",
        "Say your goodnight phrase, put your baby down awake, and leave the room.",
        "Hold steady through any protest — consistency is what makes this work.",
        "Check only for genuine safety needs, then return in the morning at your usual wake time.",
      ],
      firstNights:
        "The first one to three nights are the hardest and often the loudest — but this method also brings the fastest results. Most babies settle dramatically by night three or four.",
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
        "A long stretch awake — skip tonight's fade target and aim for natural sleep onset.",
      falseStart:
        "A false start usually means bedtime needs to be later for a few nights. Reset the fade.",
      shortNapStreak:
        "Short naps can mean the day's a touch off. Hold your bedtime fade target and try again tomorrow.",
      bedtimeDrift:
        "Drift is part of fading. Push bedtime 15 min later for 3 nights, then resume fading earlier.",
      onTrack:
        "Sleep onset is getting quick — you're ready to nudge bedtime a touch earlier.",
    },
    guide: {
      howItWorks:
        "You start bedtime at the time your baby naturally falls asleep, so put-down and sleep happen close together. Once that's reliable, you move bedtime 15 minutes earlier every few nights until you reach the time you want.",
      tonightSteps: [
        "Put your baby down at their current natural sleep-onset time, not an aspirational early bedtime.",
        "Run your wind-down so they're drowsy right as you lay them down.",
        "If they fall asleep quickly for a few nights, move bedtime 15 minutes earlier.",
        "If lights-out starts running long, slide bedtime later again for a few nights, then resume fading.",
      ],
      firstNights:
        "Early on, bedtime may feel later than you'd like — that's the point, and it makes settling fast. Over a couple of weeks you'll fade it earlier 15 minutes at a time.",
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
