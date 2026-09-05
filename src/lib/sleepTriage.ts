import {
  BedDouble,
  Clock,
  CloudMoon,
  Coffee,
  Eye,
  Hand,
  Heart,
  Lightbulb,
  ListChecks,
  Moon,
  Repeat,
  Speaker,
  Sun,
  Sunrise,
  Thermometer,
  Timer,
  Wand2,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { format, startOfDay, subDays } from "date-fns";

export type TriageReason =
  | "bedtime_resistance"
  | "night_wakings"
  | "short_naps"
  | "early_waking"
  | "regression"
  | "schedule_confusion"
  | "environment"
  | "other";

export type AgeBucket =
  | "0-3mo"
  | "3-6mo"
  | "6-9mo"
  | "9-12mo"
  | "12-18mo"
  | "18-24mo"
  | "2-3yr"
  | "3yr+";

// `MethodFlavor` selects the *coaching tone* for triage content (cry-it-out,
// gentle, or neutral). It is intentionally separate from `SleepMethod` in
// `@/lib/sleepMethods` — that one is the parent's chosen method on the sleep
// plan. The triage content table below keys per-flavor variants, so swapping
// in the 6-method enum here would mean rewriting every entry.
export type MethodFlavor = "moc" | "tcb" | "neutral";

export interface TriageContent {
  title: string;
  body: string[];
  tips: { icon: LucideIcon; text: string }[];
  chatPrompt?: string;
}

export const TRIAGE_REASON_HUMAN: Record<TriageReason, string> = {
  bedtime_resistance: "Fights bedtime",
  night_wakings: "Wakes at night",
  short_naps: "Short naps",
  early_waking: "Wakes early",
  regression: "Sleep regression",
  schedule_confusion: "Schedule feels off",
  environment: "Sleep environment",
  other: "Something else",
};

export const TRIAGE_REASON_ORDER: TriageReason[] = [
  "bedtime_resistance",
  "night_wakings",
  "short_naps",
  "early_waking",
  "regression",
  "schedule_confusion",
  "environment",
  "other",
];

export function getAgeBucket(ageMonths: number): AgeBucket {
  if (ageMonths < 3) return "0-3mo";
  if (ageMonths < 6) return "3-6mo";
  if (ageMonths < 9) return "6-9mo";
  if (ageMonths < 12) return "9-12mo";
  if (ageMonths < 18) return "12-18mo";
  if (ageMonths < 24) return "18-24mo";
  if (ageMonths < 36) return "2-3yr";
  return "3yr+";
}

const BUCKET_ORDER: AgeBucket[] = [
  "0-3mo",
  "3-6mo",
  "6-9mo",
  "9-12mo",
  "12-18mo",
  "18-24mo",
  "2-3yr",
  "3yr+",
];

interface DetectionLog {
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
}

/** Before a morning exists, an early one can't. */
export const EARLY_WAKING_MIN_AGE_MONTHS = 3;
/** A wake before this hour is the "early" in early waking. */
export const EARLY_WAKING_HOUR = 6;

export function detectTriageReasons(
  logs: DetectionLog[],
  ageMonths: number,
): TriageReason[] {
  const reasons: TriageReason[] = [];
  if (!logs || logs.length === 0) return reasons;

  const sevenAgo = subDays(startOfDay(new Date()), 6);
  const recent = logs.filter((l) => new Date(l.started_at) >= sevenAgo);

  // short_naps — three or more naps under 30 minutes in the last 7 days
  const shortNapCount = recent.filter(
    (l) =>
      l.sleep_type === "nap" &&
      typeof l.duration_minutes === "number" &&
      l.duration_minutes < 30,
  ).length;
  if (shortNapCount >= 3) reasons.push("short_naps");

  // early_waking — at least 2 mornings starting before 6:00 local AND those
  // mornings are >= 50% of the nights with an ended_at.
  //
  // The morning is the LAST segment of a night, not any segment of it: a night
  // broken by a 02:40 feed ends three rows, and counting each one would report
  // fragmentation as early rising. Newborns are excluded — they don't have a
  // morning yet, which is what the 0-3mo content below says in as many words.
  if (ageMonths >= EARLY_WAKING_MIN_AGE_MONTHS) {
    const finalWakePerNight = new Map<string, Date>();
    for (const l of recent) {
      if (l.sleep_type !== "night" || !l.ended_at) continue;
      const start = new Date(l.started_at);
      const end = new Date(l.ended_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      // Group by the evening the night began — same rule as night_wakings below.
      const key = format(start.getHours() < 12 ? subDays(start, 1) : start, "yyyy-MM-dd");
      const current = finalWakePerNight.get(key);
      if (!current || end > current) finalWakePerNight.set(key, end);
    }
    const mornings = Array.from(finalWakePerNight.values());
    if (mornings.length >= 2) {
      const earlyCount = mornings.filter((w) => w.getHours() < EARLY_WAKING_HOUR).length;
      if (earlyCount >= 2 && earlyCount / mornings.length >= 0.5) {
        reasons.push("early_waking");
      }
    }
  }

  // night_wakings — three or more calendar nights with >= 2 distinct
  // sleep_type='night' rows whose started_at falls 22:00-05:00 same night.
  // Group "night session" by date of the evening (>=22:00 belongs to the
  // current calendar day; 00:00-05:00 belongs to the previous calendar day).
  const byNight = new Map<string, number>();
  for (const l of recent) {
    if (l.sleep_type !== "night") continue;
    const d = new Date(l.started_at);
    const hour = d.getHours();
    if (hour >= 22) {
      const key = format(d, "yyyy-MM-dd");
      byNight.set(key, (byNight.get(key) ?? 0) + 1);
    } else if (hour < 5) {
      const key = format(subDays(d, 1), "yyyy-MM-dd");
      byNight.set(key, (byNight.get(key) ?? 0) + 1);
    }
  }
  const fragmentedNights = Array.from(byNight.values()).filter(
    (n) => n >= 2,
  ).length;
  if (fragmentedNights >= 3) reasons.push("night_wakings");

  return reasons;
}

// Neutral content table. Brand-voice rules:
//   - Lead with normalization, then one concrete next step.
//   - No "experts recommend…", no "you should…", no clinical jargon.
//   - Title <= 45 chars (Quicksand bold). Body paragraphs <= 180 chars each.
//   - Tips are 2-3 short, actionable items with a Lucide icon.
const N = (c: TriageContent) => ({ neutral: c });

export const TRIAGE_CONTENT: Record<
  TriageReason,
  Partial<
    Record<
      AgeBucket,
      Partial<Record<MethodFlavor, TriageContent>> & {
        neutral: TriageContent;
      }
    >
  >
> = {
  bedtime_resistance: {
    "0-3mo": N({
      title: "Bedtime is still finding its shape",
      body: [
        "At this age there isn't really a fixed bedtime yet — your baby's sleep is driven by short wake windows, not the clock.",
        "If evenings feel hard, focus on a soothing wind-down and watch for early sleepy cues rather than aiming for a set hour.",
      ],
      tips: [
        { icon: Eye, text: "Catch the first yawn or eye-rub — that's the window" },
        { icon: Wind, text: "Dim lights and lower the volume 20 minutes before sleep" },
        { icon: Heart, text: "Skin-to-skin or a gentle rock can shorten the fight" },
      ],
      chatPrompt: "Bedtime is hard for my newborn — they fight going down at night. What can I try tonight?",
    }),
    "3-6mo": N({
      title: "Bedtime battles in the 3-6 month stretch",
      body: [
        "Around now wake windows stretch and naps consolidate — bedtime resistance is often a sign the last wake window is just a touch too long or too short.",
        "Try shifting bedtime by 15-20 minutes and keep the wind-down the same every night for a week. Patterns show up fast at this age.",
      ],
      tips: [
        { icon: Clock, text: "Aim for a wake window of about 1.5-2 hours before bed" },
        { icon: ListChecks, text: "Keep the same 3-4 steps in the same order each night" },
        { icon: Moon, text: "Start the routine in a dim, quiet room" },
      ],
      chatPrompt: "My 3-6 month old fights bedtime every night. How do I figure out what's going on?",
    }),
    "6-9mo": N({
      title: "Bedtime resistance at 6-9 months",
      body: [
        "Object permanence kicks in around now — your baby suddenly notices when you leave the room and the protest can be loud.",
        "A predictable goodnight ritual gives them an anchor. A short, calm sit nearby for a few minutes can bridge the gap.",
      ],
      tips: [
        { icon: BedDouble, text: "Same ritual, same order, same words every night" },
        { icon: Heart, text: "A lovey or small comfort item can help (when age-safe)" },
        { icon: Timer, text: "Try a calm 2-3 minute sit-back before leaving the room" },
      ],
      chatPrompt: "My 6-9 month old started fighting bedtime out of nowhere. What's going on and what can I do?",
    }),
    "9-12mo": N({
      title: "When bedtime turns into a standoff",
      body: [
        "Big developmental leaps (pulling up, cruising, first words) often spill into bedtime. The brain wants to keep practicing.",
        "Move the most stimulating play earlier in the evening and keep the last 30 minutes calm and predictable.",
      ],
      tips: [
        { icon: Sun, text: "Wind down with low light and quiet activities" },
        { icon: ListChecks, text: "A simple book + song + lights-out cue works well" },
        { icon: Clock, text: "Lock the bedtime within a 15-minute window each night" },
      ],
      chatPrompt: "My 9-12 month old won't settle at bedtime. Tonight please — what should I do differently?",
    }),
    "12-18mo": N({
      title: "Toddler bedtime stalling",
      body: [
        "One more book, one more drink, one more hug — stalling is a normal way toddlers test the bedtime boundary.",
        "Give the routine a clear endpoint they can see, and stick to it warmly every night. Predictability beats negotiation.",
      ],
      tips: [
        { icon: ListChecks, text: "Use a simple 3-step routine they can recite back" },
        { icon: Clock, text: "Set a 'last thing' — last book, last sip, then lights off" },
        { icon: Heart, text: "Acknowledge feelings: 'I know, it's hard to stop playing'" },
      ],
      chatPrompt: "My toddler stalls at bedtime every night. How do I shorten the fight without it becoming a battle?",
    }),
    "18-24mo": N({
      title: "The bedtime standoff at 18-24 months",
      body: [
        "Newfound independence shows up at bedtime. Saying no is part of the developmental work right now.",
        "Offer small, real choices inside the routine (this book or that one, blue pajamas or green) so they get autonomy without skipping bedtime.",
      ],
      tips: [
        { icon: ListChecks, text: "Two-choice menus: pajamas, book, song" },
        { icon: Clock, text: "Use a visual timer so 'in 5 minutes' is concrete" },
        { icon: Heart, text: "Warm tone, firm endpoint — both at once" },
      ],
      chatPrompt: "My 18-24 month old won't go to bed without a fight. What's a calm way to hold the line?",
    }),
    "2-3yr": N({
      title: "When toddlers protest bedtime",
      body: [
        "Two- and three-year-olds are wired to test the limits — bedtime is a high-stakes one. The protest itself isn't a problem to solve, just one to ride.",
        "Keep the routine warm, short, and the same every night. The boring repetition is doing the work.",
      ],
      tips: [
        { icon: ListChecks, text: "Pick the routine together earlier in the day" },
        { icon: Lightbulb, text: "A small nightlight can ease the lights-out moment" },
        { icon: Heart, text: "Empathize, then move to the next step calmly" },
      ],
      chatPrompt: "My 2-3 year old fights bedtime hard. How do I keep things calm and consistent?",
    }),
    "3yr+": N({
      title: "Bedtime stalling at age 3 and up",
      body: [
        "Older toddlers and preschoolers test bedtime as part of working out their independence — completely on track developmentally.",
        "A visual routine chart and a clear lights-out time keep the structure outside of you, so you don't have to be the bad guy each night.",
      ],
      tips: [
        { icon: ListChecks, text: "Sticker chart for nights the routine goes smoothly" },
        { icon: Clock, text: "Same lights-out time within 15 minutes nightly" },
        { icon: Heart, text: "A 5-minute connection moment in bed beats negotiation" },
      ],
      chatPrompt: "My 3+ year old keeps stalling at bedtime. What's a routine that actually sticks?",
    }),
  },
  night_wakings: {
    "0-3mo": N({
      title: "Night wakings are part of the picture",
      body: [
        "Newborns wake to feed, often every 2-4 hours. This is biology working as designed — small stomachs, fast growth.",
        "Keep night wakings calm and dim. Save the bright lights and chat for daytime so day and night start to separate.",
      ],
      tips: [
        { icon: Moon, text: "Use a dim red or amber nightlight for diaper changes" },
        { icon: Heart, text: "Feed, change, settle — minimum stimulation" },
        { icon: Sun, text: "Bright light + activity in the morning anchors the day" },
      ],
      chatPrompt: "My newborn wakes a lot at night. What's normal and what helps us get more sleep?",
    }),
    "3-6mo": N({
      title: "Night wakings at 3-6 months",
      body: [
        "Sleep cycles get more adult-like around now, which can mean more brief wakings as your baby moves between cycles.",
        "Some night wakings are still for feeds — others are pause-and-listen moments. Wait 30-60 seconds before responding to see which one this is.",
      ],
      tips: [
        { icon: Timer, text: "Pause 30-60 seconds before going in" },
        { icon: Moon, text: "Keep night feeds low-light and quiet" },
        { icon: Clock, text: "Watch the last wake window — overtired = more wakings" },
      ],
      chatPrompt: "My 3-6 month old keeps waking at night. How do I tell when to feed vs. wait?",
    }),
    "6-9mo": N({
      title: "Wakings at 6-9 months",
      body: [
        "Many babies this age can go longer stretches between feeds, but new skills (sitting, crawling) and teething can trigger extra wakings.",
        "If the pattern is new and your baby is otherwise well, give it about a week — most spikes settle on their own.",
      ],
      tips: [
        { icon: Hand, text: "Daytime practice of new skills can reduce nighttime ones" },
        { icon: Thermometer, text: "Check for teething or illness signs before adjusting sleep" },
        { icon: Heart, text: "Brief, low-key reassurance — same approach every wake" },
      ],
      chatPrompt: "My 6-9 month old started waking more at night. Could it be a leap, teething, or something else?",
    }),
    "9-12mo": N({
      title: "Night wakings at 9-12 months",
      body: [
        "Separation anxiety peaks around this age and often shows up as middle-of-the-night protest. It feels intense — it's also temporary.",
        "Keep your response brief and consistent. A short reassurance and out — your presence is the signal, not the show.",
      ],
      tips: [
        { icon: Heart, text: "Same words, same length, every visit in" },
        { icon: Eye, text: "Avoid turning on bright lights mid-night" },
        { icon: BedDouble, text: "Loveys (age-safe) help bridge the gap" },
      ],
      chatPrompt: "My 9-12 month old wakes up at night and won't settle without me. What can I do?",
    }),
    "12-18mo": N({
      title: "Toddler night wakings",
      body: [
        "Wakings at this age are often tied to developmental leaps, schedule shifts, or a wake window that's drifted off.",
        "Look at the last 3 days — bedtime, naps, dinner timing. Often one small adjustment fixes the wakings without any sleep training.",
      ],
      tips: [
        { icon: Clock, text: "Check if the nap got too late or too long" },
        { icon: ListChecks, text: "Keep the bedtime routine steady when other things shift" },
        { icon: Heart, text: "Brief reassurance, then back to bed" },
      ],
      chatPrompt: "My 12-18 month old started waking at night again. Walk me through what to check.",
    }),
    "18-24mo": N({
      title: "When wakings come back",
      body: [
        "Around 18-24 months a brief regression is very common — language explosion, big motor leaps, sometimes the start of toddler dreams.",
        "Hold the line on the routine, keep reassurance short and warm. Most regressions at this age settle in 1-2 weeks.",
      ],
      tips: [
        { icon: Lightbulb, text: "A small nightlight can ease nighttime fears" },
        { icon: Heart, text: "'You're safe, it's still sleep time' — same line each time" },
        { icon: Clock, text: "Move bedtime 15 min earlier if overtired" },
      ],
      chatPrompt: "My 18-24 month old wakes up at night and asks for me. How do I respond without starting a new habit?",
    }),
    "2-3yr": N({
      title: "Night wakings at 2-3 years",
      body: [
        "Imagination and dreams ramp up — wakings often come with a story attached ('There's something in the room').",
        "Take their feeling seriously, keep your response calm and short. A simple comfort phrase repeated is more powerful than a long explanation.",
      ],
      tips: [
        { icon: Heart, text: "Validate: 'That sounded scary. You're safe.'" },
        { icon: Lightbulb, text: "A warm nightlight stays on all night" },
        { icon: BedDouble, text: "A 'brave' lovey or pillow can help" },
      ],
      chatPrompt: "My 2-3 year old wakes up at night scared. What's a routine that helps them feel safe?",
    }),
    "3yr+": N({
      title: "Nighttime wakings at age 3 and up",
      body: [
        "At this age night wakings often have a story — a bad dream, a noise, needing the bathroom, or simply wanting connection.",
        "A short script you use every time keeps it predictable for both of you. Less is more after midnight.",
      ],
      tips: [
        { icon: ListChecks, text: "Same response, same words, every wake" },
        { icon: Lightbulb, text: "Nightlight + clear path to the bathroom" },
        { icon: Heart, text: "Short connection now, longer talk in the morning" },
      ],
      chatPrompt: "My 3+ year old wakes me up most nights. What's the calmest way to handle it?",
    }),
  },
  short_naps: {
    "0-3mo": N({
      title: "Short naps in the newborn months",
      body: [
        "Newborn naps are all over the place — 20 minutes here, 90 minutes there. That's developmentally on track, not a problem to fix.",
        "Aim for total daytime sleep, not perfect naps. If the day total is in the right range, the short naps are doing their job.",
      ],
      tips: [
        { icon: Clock, text: "Watch wake windows of 45-60 minutes" },
        { icon: Wind, text: "Try contact naps for the longest stretch of the day" },
        { icon: Moon, text: "Dark, white-noise space for at least one nap" },
      ],
      chatPrompt: "My newborn only takes short naps. Is that normal and should I do anything?",
    }),
    "3-6mo": N({
      title: "30-minute naps at 3-6 months",
      body: [
        "Short naps at this age usually mean the wake window was a bit too long or too short, or your baby is hitting the end of one sleep cycle and waking instead of linking to the next.",
        "Give it 10-15 quiet minutes after they wake before getting them up — they often link cycles if given the chance.",
      ],
      tips: [
        { icon: Clock, text: "Try a wake window of about 1.5-2 hours" },
        { icon: Timer, text: "Wait 10-15 min after the wake before going in" },
        { icon: Moon, text: "Dark room + steady white noise" },
      ],
      chatPrompt: "My 3-6 month old keeps taking 30-minute naps. How do I help them sleep longer?",
    }),
    "6-9mo": N({
      title: "Short naps at 6-9 months",
      body: [
        "Around now most babies move from 3 to 2 naps. During the transition, naps can shorten as the schedule resets.",
        "If the short naps stick for more than a week, the awake time between naps may need to stretch by 15-30 minutes.",
      ],
      tips: [
        { icon: Clock, text: "Try 2.5-3 hour wake windows during the transition" },
        { icon: ListChecks, text: "Same pre-nap routine as bedtime, just shorter" },
        { icon: BedDouble, text: "Pitch-dark room and white noise really matter now" },
      ],
      chatPrompt: "My 6-9 month old's naps shrunk to 30-45 minutes. Is it a transition and what should I do?",
    }),
    "9-12mo": N({
      title: "Nap struggles at 9-12 months",
      body: [
        "Many babies drop to one nap somewhere between 12 and 18 months — the 9-12 month window is where the second nap starts getting protested or skipped.",
        "If only one nap is short, focus on protecting the first nap and let the schedule sort itself out over a few weeks.",
      ],
      tips: [
        { icon: Sun, text: "Protect the morning nap as the priority" },
        { icon: Clock, text: "Stretch the gap between naps gradually" },
        { icon: Moon, text: "Cap a long morning nap at 90 min to save the afternoon" },
      ],
      chatPrompt: "My 9-12 month old's naps got short and unpredictable. Are we going to one nap?",
    }),
    "12-18mo": N({
      title: "One-nap struggles at 12-18 months",
      body: [
        "The 2-to-1 nap transition often shows up as short, fragmented naps for a few weeks. It's bumpy on the way through, not a permanent state.",
        "Move bedtime earlier on the rough days — making up daytime sleep at night softens the transition.",
      ],
      tips: [
        { icon: Clock, text: "Aim for one nap of 1.5-2.5 hours after lunch" },
        { icon: Moon, text: "Earlier bedtime on days the nap was short" },
        { icon: ListChecks, text: "Same wind-down for nap as bedtime" },
      ],
      chatPrompt: "My 12-18 month old's nap is getting short. How do we move to one nap without it falling apart?",
    }),
    "18-24mo": N({
      title: "Short naps at 18-24 months",
      body: [
        "Most toddlers this age need one long nap after lunch. Short naps can mean too-early start, too-long morning, or too-bright room.",
        "An hour of quiet, predictable lead-in to the nap usually fixes the short ones — same as bedtime, just shorter.",
      ],
      tips: [
        { icon: Moon, text: "Make the nap room as dark as the nighttime room" },
        { icon: Clock, text: "Start the nap routine 30 min before target sleep" },
        { icon: ListChecks, text: "Same wind-down steps every nap" },
      ],
      chatPrompt: "My 18-24 month old's nap is too short. What can I change tomorrow?",
    }),
    "2-3yr": N({
      title: "Nap holding on at 2-3 years",
      body: [
        "Some 2- and 3-year-olds still need a full nap; others start to drop it. Short naps can be a sign the wake window is fine and the nap is just shrinking.",
        "Quiet rest time is a great middle ground — they get a recharge, you get a break, and bedtime doesn't push too late.",
      ],
      tips: [
        { icon: BedDouble, text: "Try 'quiet rest' if the nap won't take" },
        { icon: Clock, text: "Watch bedtime — push earlier on no-nap days" },
        { icon: Sun, text: "Bright morning light keeps the rhythm anchored" },
      ],
      chatPrompt: "My 2-3 year old's nap got really short. Should we keep trying or move to quiet time?",
    }),
    "3yr+": N({
      title: "Nap dropping or shrinking at 3+",
      body: [
        "Most kids drop the nap somewhere between 3 and 5. A shrinking nap is the on-ramp to that change — not a problem to fix.",
        "Replace the nap with 30-45 minutes of quiet rest in the same spot. The body gets a break without the bedtime push.",
      ],
      tips: [
        { icon: BedDouble, text: "Quiet books or audio for rest time" },
        { icon: Clock, text: "Move bedtime 30 min earlier on no-nap days" },
        { icon: Sun, text: "Outdoor light in the afternoon prevents the 4pm slump" },
      ],
      chatPrompt: "My 3+ year old's nap is shrinking. How do we transition without bedtime getting wild?",
    }),
  },
  early_waking: {
    "0-3mo": N({
      title: "Early mornings in the newborn months",
      body: [
        "Newborns don't really have a 'morning' yet — they wake when their body says so, and that's often before sunrise.",
        "Day-night confusion sorts itself out over the first 3 months. Bright morning light + dim evenings give it a push.",
      ],
      tips: [
        { icon: Sun, text: "Open curtains within 30 min of the first wake" },
        { icon: Moon, text: "Keep evenings dim and quiet" },
        { icon: Heart, text: "Feed and re-soothe if it's earlier than 5am" },
      ],
      chatPrompt: "My newborn wakes really early. Is there anything I can do to shift it?",
    }),
    "3-6mo": N({
      title: "Early waking at 3-6 months",
      body: [
        "Early mornings at this age are often a too-short last wake window or too-much daytime sleep stacked into the early afternoon.",
        "Try moving bedtime 15 minutes later for 4-5 nights and see if the wake time drifts later too.",
      ],
      tips: [
        { icon: Clock, text: "Shift bedtime 15 min later for 4-5 nights" },
        { icon: Moon, text: "Pitch-dark room and white noise" },
        { icon: Sun, text: "Keep dawn light out until 6am" },
      ],
      chatPrompt: "My 3-6 month old wakes up before 6am every day. How do I shift their schedule later?",
    }),
    "6-9mo": N({
      title: "Pre-dawn wakeups at 6-9 months",
      body: [
        "Light, hunger, or a too-long afternoon nap are the usual culprits at this age. Often it's a mix of all three.",
        "Blackout curtains and capping the last nap by 4pm fix early wakings for a lot of families. Try one change at a time.",
      ],
      tips: [
        { icon: Moon, text: "Blackout curtains — even small light leaks matter" },
        { icon: Clock, text: "End the last nap by 4pm" },
        { icon: Sun, text: "Aim for a 7pm bedtime, not 6pm" },
      ],
      chatPrompt: "My 6-9 month old wakes before 6am. Walk me through what to change first.",
    }),
    "9-12mo": N({
      title: "Early waking at 9-12 months",
      body: [
        "The 2-to-1 nap transition often causes early mornings as the schedule rebalances. It usually settles within 2-3 weeks.",
        "In the meantime, blackout the room completely and don't start the day before 6am — even if they're awake, keep it quiet and low-key.",
      ],
      tips: [
        { icon: Moon, text: "Total blackout in the bedroom" },
        { icon: Clock, text: "Hold off on 'starting the day' before 6am" },
        { icon: Sun, text: "Bright light right at wake time anchors the day" },
      ],
      chatPrompt: "My 9-12 month old wakes at 5am. What can I try to push it to 6 or 6:30?",
    }),
    "12-18mo": N({
      title: "Toddler early wakings",
      body: [
        "Pre-6am wakes at this age often track to the nap timing or the bedtime being a touch too early.",
        "Try capping the nap at 2 hours and moving bedtime 15-30 min later for a week to see if the wake time shifts.",
      ],
      tips: [
        { icon: Clock, text: "Cap the nap at about 2 hours" },
        { icon: Moon, text: "Push bedtime 15-30 min later for a week" },
        { icon: Sun, text: "Use an 'okay-to-wake' light or clock cue" },
      ],
      chatPrompt: "My 12-18 month old wakes super early. Help me figure out what to adjust.",
    }),
    "18-24mo": N({
      title: "Early mornings at 18-24 months",
      body: [
        "Toddlers this age can sleep until 6-7am with the right setup. Pre-6 wakes are usually a sign the schedule needs a tweak.",
        "A toddler clock that turns green at wake time gives them a clear, non-you cue for when it's morning.",
      ],
      tips: [
        { icon: Clock, text: "Try an okay-to-wake clock at 6:30am" },
        { icon: Moon, text: "Full blackout and white noise" },
        { icon: BedDouble, text: "Books or a stuffed friend nearby for early stirs" },
      ],
      chatPrompt: "My 18-24 month old wakes before 6am most days. What's a calm way to shift it?",
    }),
    "2-3yr": N({
      title: "Early waking at 2-3 years",
      body: [
        "Many 2- and 3-year-olds wake early because the body is genuinely done sleeping — not because something is wrong.",
        "An okay-to-wake clock plus a small basket of quiet books by the bed lets them wait without needing you immediately.",
      ],
      tips: [
        { icon: Clock, text: "Toddler clock set 15 min after current wake" },
        { icon: BedDouble, text: "Basket of books or a stuffed animal in bed" },
        { icon: Sun, text: "Bright morning light once they're up — anchors tomorrow" },
      ],
      chatPrompt: "My 2-3 year old wakes really early. What's a routine that gives me a bit more sleep?",
    }),
    "3yr+": N({
      title: "Pre-dawn wakeups at age 3 and up",
      body: [
        "By this age sleep needs are individual — some kids genuinely don't need 11 hours. Look at total sleep first, not the wake time.",
        "If total sleep is in range, the goal is teaching them to stay in their room until the clock says it's morning.",
      ],
      tips: [
        { icon: Clock, text: "Okay-to-wake clock + clear 'green means up' rule" },
        { icon: BedDouble, text: "Quiet activities they can do in bed" },
        { icon: Sun, text: "Daylight exposure right at wake-up reinforces the rhythm" },
      ],
      chatPrompt: "My 3+ year old wakes at 5am and won't go back to sleep. How do we set a 'stay in bed until X' routine?",
    }),
  },
  regression: {
    "0-3mo": N({
      title: "Newborn sleep is fluid",
      body: [
        "Regressions as a concept don't quite apply yet — newborn sleep changes week to week as the brain rewires.",
        "A rough patch usually settles in a few days. Keep the routine simple and feed on demand.",
      ],
      tips: [
        { icon: Heart, text: "Lean on contact naps and skin-to-skin" },
        { icon: Moon, text: "Day = bright, night = dim" },
        { icon: Wind, text: "White noise can ease the noisier hours" },
      ],
      chatPrompt: "My newborn's sleep just got worse out of nowhere. Is something wrong?",
    }),
    "3-6mo": N({
      title: "The 4-month sleep shift",
      body: [
        "Around 3-4 months sleep becomes more adult-like — more cycles, lighter transitions between them, more brief wakings.",
        "It's not a phase that ends, it's a permanent change in how sleep works. Tightening up the bedtime routine and sleep space helps a lot.",
      ],
      tips: [
        { icon: Moon, text: "Dark room + white noise become non-negotiable" },
        { icon: ListChecks, text: "Same pre-sleep routine every nap and bedtime" },
        { icon: Clock, text: "Watch wake windows carefully — overtired = worse" },
      ],
      chatPrompt: "My 3-6 month old is in a sleep regression. What actually helps and what just has to pass?",
    }),
    "6-9mo": N({
      title: "Regression around 8-9 months",
      body: [
        "Big motor leaps (sitting, crawling, pulling up) plus separation anxiety often line up with worse sleep for 1-2 weeks.",
        "Practice the new skill a lot during the day — the brain consolidates it and stops trying to practice at 2am.",
      ],
      tips: [
        { icon: Hand, text: "Lots of floor time and practice during the day" },
        { icon: Heart, text: "Short, calm reassurance — same script each time" },
        { icon: BedDouble, text: "Make sure the crib is set up safely for new skills" },
      ],
      chatPrompt: "My 6-9 month old's sleep fell apart with a new milestone. How do we get through this?",
    }),
    "9-12mo": N({
      title: "Sleep regression at 9-12 months",
      body: [
        "Standing up in the crib, separation anxiety, and the 2-to-1 nap transition can all hit around the same time. It's a lot at once.",
        "Hold the structure steady — most things work themselves out in 1-2 weeks if you don't introduce new habits to soothe.",
      ],
      tips: [
        { icon: ListChecks, text: "Same routine even when things feel chaotic" },
        { icon: Heart, text: "Brief check-ins, then back out of the room" },
        { icon: Clock, text: "Earlier bedtime softens the bumpy days" },
      ],
      chatPrompt: "My 9-12 month old is in a sleep regression. How long does it last and what should I avoid doing?",
    }),
    "12-18mo": N({
      title: "Regression in the toddler year",
      body: [
        "The 12-month and 18-month regressions are real — language leaps, walking, and the nap transition all collide.",
        "Keep the routine boring and the same. Most regressions at this age last about 2 weeks.",
      ],
      tips: [
        { icon: ListChecks, text: "Don't add new sleep crutches during a regression" },
        { icon: Clock, text: "Adjust schedule if naps are shifting" },
        { icon: Heart, text: "Extra connection during the day, not at bedtime" },
      ],
      chatPrompt: "My 12-18 month old hit a regression. Help me figure out if it's the leap or the schedule.",
    }),
    "18-24mo": N({
      title: "Regression at 18-24 months",
      body: [
        "Language is exploding, independence is asserting itself, and bedtime suddenly becomes a battleground. Classic 18-month regression territory.",
        "Hold the line warmly. Offer small choices inside the routine, not on the routine itself.",
      ],
      tips: [
        { icon: ListChecks, text: "Same routine, same endpoint, every night" },
        { icon: Heart, text: "Two-choice menus give them control inside the rules" },
        { icon: Clock, text: "Move bedtime earlier on rough days" },
      ],
      chatPrompt: "My 18-24 month old is in a sleep regression. What actually works at this age?",
    }),
    "2-3yr": N({
      title: "Regression at 2-3 years",
      body: [
        "The 2-year regression often shows up as nighttime fears and bedtime resistance. Imagination is on, and that's where dreams come from.",
        "Take fears seriously without amplifying them. A nightlight, a comfort item, and a steady script go a long way.",
      ],
      tips: [
        { icon: Lightbulb, text: "Warm nightlight stays on all night" },
        { icon: Heart, text: "Validate the fear, then offer a comfort tool" },
        { icon: ListChecks, text: "Same goodnight phrase every night" },
      ],
      chatPrompt: "My 2-3 year old hit a sleep regression with new fears. What's a calm, steady response?",
    }),
    "3yr+": N({
      title: "Sleep regressions at age 3 and up",
      body: [
        "Big life shifts — new sibling, starting preschool, moving to a bed — often trigger a few weeks of harder sleep.",
        "Acknowledge what's changing during the day and keep the bedtime routine identical. Predictability is the comfort.",
      ],
      tips: [
        { icon: ListChecks, text: "Hold the bedtime routine steady through changes" },
        { icon: Heart, text: "Talk about big changes in daylight, not at bedtime" },
        { icon: BedDouble, text: "A familiar comfort item helps in a new room or bed" },
      ],
      chatPrompt: "My 3+ year old's sleep is off after a big change. How do we steady things again?",
    }),
  },
  schedule_confusion: {
    "0-3mo": N({
      title: "Newborn rhythms are still arriving",
      body: [
        "There isn't really a schedule yet — newborns sleep when they're tired and feed when they're hungry. That can feel chaotic and it's also exactly right.",
        "Tracking patterns over a few days often shows a rough rhythm hiding inside the chaos. That's your starting point.",
        "Tap Build a sleep plan for the age-appropriate wake-window targets and safe-sleep ABCs.",
      ],
      tips: [
        { icon: Eye, text: "Watch wake windows: ~45-60 min at this age" },
        { icon: Sun, text: "Bright morning + dim evenings build day/night sense" },
        { icon: ListChecks, text: "Log sleeps for 3 days to see the rough pattern" },
      ],
      chatPrompt: "My newborn's schedule feels random. How do I find a rhythm without forcing one?",
    }),
    "3-6mo": N({
      title: "Finding a 3-6 month rhythm",
      body: [
        "Most babies this age land on 3-4 naps with wake windows of 1.5-2 hours. The exact times move as wake windows stretch.",
        "Anchor the morning (same wake-up, same first feed) and the rest of the day starts to fall into place.",
        "Tap Build a sleep plan for an evidence-based target schedule mapped to your baby's age.",
      ],
      tips: [
        { icon: Sun, text: "Same wake time within a 30-min window daily" },
        { icon: Clock, text: "Wake windows of 1.5-2 hours" },
        { icon: ListChecks, text: "Same pre-sleep routine for naps and bed" },
      ],
      chatPrompt: "My 3-6 month old's schedule feels off. Help me set a routine that works.",
    }),
    "6-9mo": N({
      title: "Schedule shifts at 6-9 months",
      body: [
        "Most babies this age move from 3 to 2 naps. The transition takes 2-4 weeks of slightly off days as the schedule resets.",
        "Lock the wake time and bedtime, and let the nap timing move within that window while the body adjusts.",
        "Tap Build a sleep plan to see the target nap count, wake windows, and bedtime range for this stage.",
      ],
      tips: [
        { icon: Sun, text: "Same wake time and bedtime every day" },
        { icon: Clock, text: "Aim for 2-3 hour wake windows" },
        { icon: ListChecks, text: "Watch the pattern over a week before adjusting" },
      ],
      chatPrompt: "My 6-9 month old's schedule feels confusing. Walk me through what a good day looks like.",
    }),
    "9-12mo": N({
      title: "Schedule at 9-12 months",
      body: [
        "Most babies this age are on 2 naps with wake windows of 3-3.5 hours, but the move to one nap is starting to peek through.",
        "Signs you're heading to one nap: the second nap gets short, refused, or pushes bedtime late. Wait for two weeks of consistent signs before making the change.",
        "Tap Build a sleep plan for a personalized day built from your recent bedtime data.",
      ],
      tips: [
        { icon: Clock, text: "2 naps, ~3-3.5 hour wake windows" },
        { icon: Sun, text: "Same wake time + bedtime daily" },
        { icon: ListChecks, text: "Track 2 weeks before switching nap counts" },
      ],
      chatPrompt: "My 9-12 month old's schedule isn't clicking. Are we on the right number of naps?",
    }),
    "12-18mo": N({
      title: "Schedule in the 1-nap transition",
      body: [
        "Most toddlers move to one nap somewhere between 12-18 months. The transition is bumpy — short naps, early or late bedtimes, generally weird.",
        "Once you're fully on one nap, aim for an after-lunch start and a 1.5-2.5 hour stretch. That sets up the rest of the day.",
        "Tap Build a sleep plan for the one-nap target day, bedtime range, and a sample schedule.",
      ],
      tips: [
        { icon: Clock, text: "One nap after lunch, 1.5-2.5 hours" },
        { icon: Sun, text: "Bedtime around 12 hours after wake time" },
        { icon: ListChecks, text: "Same nap routine as bedtime, just shorter" },
      ],
      chatPrompt: "My 12-18 month old's nap schedule is messy. Are we on one nap and how do I make it work?",
    }),
    "18-24mo": N({
      title: "Schedule at 18-24 months",
      body: [
        "Most toddlers this age are firmly on one nap of 1.5-2.5 hours, with bedtime about 5-6 hours after the nap ends.",
        "A schedule that 'feels off' is often the nap going too late or too long. Aim for the nap to end by 3pm.",
        "Tap Build a sleep plan for the toddler target day plus a personalized bedtime check from your recent data.",
      ],
      tips: [
        { icon: Clock, text: "Cap the nap at 2-2.5 hours" },
        { icon: Sun, text: "Nap ends by 3pm for a 7-8pm bedtime" },
        { icon: ListChecks, text: "Same anchor times — wake, nap, bedtime" },
      ],
      chatPrompt: "My 18-24 month old's schedule feels off. What's a typical day at this age?",
    }),
    "2-3yr": N({
      title: "Schedule at 2-3 years",
      body: [
        "By now the structure is set: one nap or quiet time after lunch, bedtime around 7-8pm. Variability is fine — rigidity isn't required.",
        "If the day feels off, look at the morning wake time and the nap end time. Those two anchors usually pull the rest of the day into shape.",
        "Tap Build a sleep plan for the target total sleep, bedtime range, and a sample day at this age.",
      ],
      tips: [
        { icon: Sun, text: "Wake within a 30-min window most days" },
        { icon: Clock, text: "Nap or rest ends by 3pm" },
        { icon: ListChecks, text: "Same evening flow — dinner, bath, bed" },
      ],
      chatPrompt: "My 2-3 year old's schedule needs a reset. What does a typical day look like at this age?",
    }),
    "3yr+": N({
      title: "Schedule at age 3 and up",
      body: [
        "At this age the day is shaped more by activities (school, daycare, preschool) than by infant-style wake windows.",
        "If sleep is off, look at total hours per 24 hours, what time the day ends, and whether the wind-down is genuinely calm.",
        "Tap Build a sleep plan for the target total sleep at this age plus a bedtime range to anchor the week.",
      ],
      tips: [
        { icon: Sun, text: "Anchor the wake time across weekdays and weekends" },
        { icon: Clock, text: "Lights-out within a 30-min window each night" },
        { icon: ListChecks, text: "Calm 30-min wind-down before lights out" },
      ],
      chatPrompt: "My 3+ year old's schedule feels off. What's a routine that holds across weekdays and weekends?",
    }),
  },
  environment: {
    "0-3mo": N({
      title: "Setting up the newborn sleep space",
      body: [
        "Newborns sleep best in dim, cool spaces with steady white noise — the world before birth was noisier and tighter than the bedroom.",
        "Safe sleep first: flat firm surface, no loose items, on the back. Everything else is preference.",
      ],
      tips: [
        { icon: Wind, text: "Steady white noise the whole sleep" },
        { icon: Moon, text: "Dim red or amber nightlight for night feeds" },
        { icon: Thermometer, text: "Cool room — around 68-72°F is ideal" },
      ],
      chatPrompt: "Help me set up a good sleep space for my newborn. What's worth investing in?",
    }),
    "3-6mo": N({
      title: "Sleep environment at 3-6 months",
      body: [
        "Around now babies are more aware of their surroundings, and a properly dark, quiet room makes a real difference.",
        "Blackout curtains and white noise become genuinely useful at this age — not just nice-to-haves.",
      ],
      tips: [
        { icon: Moon, text: "Blackout the windows — total darkness for naps too" },
        { icon: Speaker, text: "Continuous white noise (not music)" },
        { icon: Thermometer, text: "Cool room, light layered sleep sack" },
      ],
      chatPrompt: "How do I set up the sleep environment for a 3-6 month old?",
    }),
    "6-9mo": N({
      title: "Sleep space at 6-9 months",
      body: [
        "More awareness means more stimulation. A boring, dark, quiet room is the goal — anything interesting will be inspected at 5am.",
        "Keep crib toys minimal and out of reach during sleep. Save the fun stuff for awake time.",
      ],
      tips: [
        { icon: Moon, text: "Truly dark room — even small light leaks matter" },
        { icon: Speaker, text: "White noise blocks household sounds" },
        { icon: BedDouble, text: "Crib stays empty during sleep (safe-sleep rules)" },
      ],
      chatPrompt: "How can I make the sleep room more boring for my 6-9 month old?",
    }),
    "9-12mo": N({
      title: "Crib environment at 9-12 months",
      body: [
        "As they start pulling to stand, the crib mattress needs to be on the lowest setting. Anything within reach becomes a toy.",
        "A safe lovey (when age-appropriate) can bridge the comfort gap between you and the crib.",
      ],
      tips: [
        { icon: BedDouble, text: "Crib mattress on the lowest setting" },
        { icon: Heart, text: "One small safe lovey if developmentally ready" },
        { icon: Moon, text: "Total dark + white noise" },
      ],
      chatPrompt: "My 9-12 month old keeps pulling up in the crib. How do I keep the space safe and boring?",
    }),
    "12-18mo": N({
      title: "Crib or bed at 12-18 months",
      body: [
        "Stay in the crib as long as it's safe — most kids do best in a crib until 2.5-3.5 years.",
        "If you need to move sooner (climbing out), a floor bed or toddler bed with a gate at the door keeps the room safe.",
      ],
      tips: [
        { icon: BedDouble, text: "Sleep sack instead of loose blankets" },
        { icon: Wind, text: "Cool room, breathable layers" },
        { icon: Lightbulb, text: "Tiny nightlight if they want one — keep it warm-toned" },
      ],
      chatPrompt: "Should my 12-18 month old still be in a crib? What does a good sleep space look like?",
    }),
    "18-24mo": N({
      title: "Sleep space at 18-24 months",
      body: [
        "Most kids this age are still happiest in a crib. The room itself can stay simple: dark, quiet, cool.",
        "A small warm-toned nightlight is a fair trade for nighttime peace of mind — it doesn't have to be bright to be reassuring.",
      ],
      tips: [
        { icon: Moon, text: "Blackout curtains stay on" },
        { icon: Lightbulb, text: "Warm-toned (red/amber) nightlight" },
        { icon: Speaker, text: "Steady white noise covers household sounds" },
      ],
      chatPrompt: "What's a good sleep environment for my 18-24 month old toddler?",
    }),
    "2-3yr": N({
      title: "Bedroom setup at 2-3 years",
      body: [
        "Imagination shows up in the room — shadows, sounds, what's-under-the-bed. A calm, predictable space helps a lot.",
        "Less is more — minimize visual clutter, keep one comfort item, and use a warm nightlight.",
      ],
      tips: [
        { icon: Lightbulb, text: "Warm nightlight stays on all night" },
        { icon: BedDouble, text: "One favorite comfort item" },
        { icon: Speaker, text: "White noise to soften scary sounds" },
      ],
      chatPrompt: "How do I set up my 2-3 year old's room to feel safe and calming?",
    }),
    "3yr+": N({
      title: "Bedroom setup at age 3 and up",
      body: [
        "By now the bedroom is theirs. Let them have a say in the comfort items and nightlight — ownership reduces bedtime pushback.",
        "Keep the room cool, the curtains dark, and the wind-down predictable. Tech and screens stay out of the bedroom.",
      ],
      tips: [
        { icon: Lightbulb, text: "Nightlight of their choosing — warm tones only" },
        { icon: Moon, text: "Blackout curtains and a cool room" },
        { icon: BedDouble, text: "No screens in the bedroom" },
      ],
      chatPrompt: "How do I set up my 3+ year old's bedroom for better sleep?",
    }),
  },
  other: {
    "0-3mo": N({
      title: "Let's talk about it",
      body: [
        "Newborn sleep questions don't always fit a tidy category. Tell us what's on your mind and we'll work through it together.",
      ],
      tips: [
        { icon: Wand2, text: "Open the chat and describe what you're seeing" },
      ],
      chatPrompt: "I have a newborn sleep question that doesn't fit a category. Can we talk through what's going on?",
    }),
    "3-6mo": N({
      title: "Tell us what's going on",
      body: [
        "Every baby is different and sleep questions don't always fit a category. Open the chat and walk us through what you're noticing.",
      ],
      tips: [
        { icon: Wand2, text: "Describe what you're seeing in your own words" },
      ],
      chatPrompt: "I have a sleep question about my 3-6 month old that doesn't fit a category. Can we talk it through?",
    }),
    "6-9mo": N({
      title: "Something else on your mind?",
      body: [
        "If your sleep question doesn't fit one of these buckets, open the chat — we can talk through what's specifically happening.",
      ],
      tips: [
        { icon: Wand2, text: "Open the chat and tell us what you're seeing" },
      ],
      chatPrompt: "I have a sleep question about my 6-9 month old that doesn't fit a category. Can we talk it through?",
    }),
    "9-12mo": N({
      title: "Tell us what's going on",
      body: [
        "Open the chat and walk us through what you're noticing — even if it feels small or vague.",
      ],
      tips: [
        { icon: Wand2, text: "Describe the pattern over the last few days" },
      ],
      chatPrompt: "I have a sleep question about my 9-12 month old that doesn't fit a category. Can we talk it through?",
    }),
    "12-18mo": N({
      title: "Something else?",
      body: [
        "Toddler sleep gets specific. Open the chat and walk us through what's happening — we'll figure it out with you.",
      ],
      tips: [
        { icon: Wand2, text: "Open the chat and describe what's going on" },
      ],
      chatPrompt: "I have a sleep question about my 12-18 month old that doesn't fit a category. Can we talk it through?",
    }),
    "18-24mo": N({
      title: "Tell us what's going on",
      body: [
        "If your sleep question doesn't fit one of the buckets above, open the chat — we'll work through it with you.",
      ],
      tips: [
        { icon: Wand2, text: "Describe what's happening in plain words" },
      ],
      chatPrompt: "I have a sleep question about my 18-24 month old that doesn't fit a category. Can we talk it through?",
    }),
    "2-3yr": N({
      title: "Something else on your mind?",
      body: [
        "If none of the categories above match what's going on, open the chat and tell us what you're noticing.",
      ],
      tips: [
        { icon: Wand2, text: "Open the chat with a description of what's going on" },
      ],
      chatPrompt: "I have a sleep question about my 2-3 year old that doesn't fit a category. Can we talk it through?",
    }),
    "3yr+": N({
      title: "Tell us what's going on",
      body: [
        "Sleep at this age can be very individual. Open the chat and walk us through what you're seeing.",
      ],
      tips: [
        { icon: Wand2, text: "Describe what's been happening at bedtime or overnight" },
      ],
      chatPrompt: "I have a sleep question about my 3+ year old that doesn't fit a category. Can we talk it through?",
    }),
  },
};

export function lookupContent(
  reason: TriageReason,
  bucket: AgeBucket,
  flavor: MethodFlavor,
): TriageContent | null {
  const reasonTable = TRIAGE_CONTENT[reason];
  if (!reasonTable) return null;

  // Walk bucket then nearest-younger buckets until we find one.
  const bucketIdx = BUCKET_ORDER.indexOf(bucket);
  for (let i = bucketIdx; i >= 0; i--) {
    const candidate = reasonTable[BUCKET_ORDER[i]];
    if (!candidate) continue;
    return candidate[flavor] ?? candidate.neutral;
  }
  return null;
}

// Re-export the icons used inside content tips so consumers can render them
// without importing lucide-react directly (kept colocated for ergonomics).
export {
  BedDouble,
  Clock,
  CloudMoon,
  Coffee,
  Eye,
  Hand,
  Heart,
  Lightbulb,
  ListChecks,
  Moon,
  Repeat,
  Speaker,
  Sun,
  Sunrise,
  Thermometer,
  Timer,
  Wand2,
  Wind,
};
