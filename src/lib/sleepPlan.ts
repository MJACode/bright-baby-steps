import { format, subDays } from "date-fns";
import { getAgeBucket, type AgeBucket, type MethodFlavor } from "@/lib/sleepTriage";

// Evidence-based sleep plan generator. All clinical numbers come from the
// sources listed below and are surfaced in the UI alongside their source label
// so parents can see the provenance, not just the recommendation.
//
// Source posture: this is clinical guidance compiled from peer-reviewed
// consensus statements and the standard pediatric-sleep clinical reference.
// Medical-advice framing is handled by the existing Terms of Service language;
// we don't repeat disclaimers in the product surface.

export interface PlanLog {
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  sleep_type: string;
}

interface TotalSleepRange {
  low: number;
  high: number;
  source: string;
}

interface NapInfo {
  typical: number;
  transitionAhead?: string;
  note?: string;
}

interface WakeWindowRange {
  low: number;
  high: number;
  display: string;
  footnote: string;
}

interface BedtimeRange {
  earliest: string | null;
  latest: string | null;
  label?: string;
  source: string;
}

export interface SampleDayEntry {
  time: string;
  activity: string;
}

export interface SleepPlanSource {
  title: string;
  authors: string;
  year: number;
  journal: string;
  url?: string;
}

export interface SleepPlan {
  bucket: AgeBucket;
  bucketLabel: string;
  totalSleep: TotalSleepRange;
  naps: NapInfo;
  wakeWindow: WakeWindowRange;
  bedtimeRange: BedtimeRange;
  bedtimeRoutine: {
    minComponents: number;
    minMinutes: number;
    minNights: number;
    components: string[];
    source: string;
  };
  safeSleep: {
    a: string;
    b: string;
    c: string;
    plus: string[];
    source: string;
  } | null;
  sleepTrainingNote: string | null;
  observed: {
    bedtime: string | null;
    wakeTime: string | null;
    totalHours: number | null;
    nightLogCount: number;
    // Once we have 3+ night-sleep rows in the last 14 days we trust the
    // observed numbers enough to surface them next to the target.
    hasEnoughSignal: boolean;
  };
  adjustmentTip: string | null;
  // 0-3 mo skip the structured sample day — circadian rhythm isn't set yet
  // and a fixed clock would be misleading. Render `newbornNote` instead.
  sampleDay: SampleDayEntry[];
  newbornNote: string | null;
  sources: SleepPlanSource[];
}

const NSF_2015 = "NSF 2015 (expert consensus; AASM declined to recommend under 4 mo)";
const AASM_INFANT = "AASM 2016 (Paruthi et al.) — 4-12 mo";
const AASM_TODDLER = "AASM 2016 — 1-2 yr";
const AASM_TODDLER_TRANSITION = "AASM 2016 — 1-2 yr (transition to 3-5 yr range)";
const AASM_PRESCHOOL = "AASM 2016 — 3-5 yr";
const MINDELL_OWENS_BEDTIME = "Mindell & Owens 2015 clinical defaults; AAP recommends a consistent age-appropriate bedtime";
const MINDELL_OWENS_WW = "Approximate guidance from clinical practice (Mindell & Owens 2015) — not RCT-validated";
const MINDELL_ROUTINE = "Mindell et al. 2009 (RCT, n=405) + Mindell et al. 2015 (dose-response, n=10,085)";
const AAP_SAFE_SLEEP = "AAP Policy Statement: Moon et al. 2022, Pediatrics 150(1):e2022057990";

export const BUCKET_LABEL: Record<AgeBucket, string> = {
  "0-3mo": "0-3 months",
  "3-6mo": "3-6 months",
  "6-9mo": "6-9 months",
  "9-12mo": "9-12 months",
  "12-18mo": "12-18 months",
  "18-24mo": "18-24 months",
  "2-3yr": "2-3 years",
  "3yr+": "3+ years",
};

export const TOTAL_SLEEP_BY_BRACKET: Record<AgeBucket, TotalSleepRange> = {
  "0-3mo": { low: 14, high: 17, source: NSF_2015 },
  "3-6mo": { low: 12, high: 16, source: AASM_INFANT },
  "6-9mo": { low: 12, high: 16, source: AASM_INFANT },
  "9-12mo": { low: 12, high: 16, source: AASM_INFANT },
  "12-18mo": { low: 11, high: 14, source: AASM_TODDLER },
  "18-24mo": { low: 11, high: 14, source: AASM_TODDLER },
  "2-3yr": { low: 11, high: 14, source: AASM_TODDLER_TRANSITION },
  "3yr+": { low: 10, high: 13, source: AASM_PRESCHOOL },
};

export const NAPS_BY_BRACKET: Record<AgeBucket, NapInfo> = {
  "0-3mo": { typical: 4, transitionAhead: "Naps consolidate to 3 around 3-4 months" },
  "3-6mo": { typical: 3, transitionAhead: "3→2 nap drop typically 6-9 months" },
  "6-9mo": { typical: 3, transitionAhead: "Most drop to 2 naps by 9 months" },
  "9-12mo": { typical: 2 },
  "12-18mo": { typical: 2, transitionAhead: "2→1 nap drop typically 14-18 months" },
  "18-24mo": { typical: 1 },
  "2-3yr": { typical: 1, transitionAhead: "Nap drops typically between 3-5 years" },
  "3yr+": { typical: 0, note: "About half of 3-year-olds still nap; about 10% at 5" },
};

export const WAKE_WINDOW_BY_BRACKET: Record<AgeBucket, WakeWindowRange> = {
  "0-3mo": { low: 45, high: 90, display: "45-90 min", footnote: MINDELL_OWENS_WW },
  "3-6mo": { low: 75, high: 120, display: "75-120 min", footnote: MINDELL_OWENS_WW },
  "6-9mo": { low: 120, high: 180, display: "2-3 hours", footnote: MINDELL_OWENS_WW },
  "9-12mo": { low: 150, high: 210, display: "2.5-3.5 hours", footnote: MINDELL_OWENS_WW },
  "12-18mo": { low: 180, high: 240, display: "3-4 hours", footnote: MINDELL_OWENS_WW },
  "18-24mo": { low: 240, high: 360, display: "4-6 hours", footnote: MINDELL_OWENS_WW },
  "2-3yr": { low: 300, high: 360, display: "5-6 hours", footnote: MINDELL_OWENS_WW },
  "3yr+": { low: 360, high: 360, display: "6h+", footnote: MINDELL_OWENS_WW },
};

export const BEDTIME_RANGE_BY_BRACKET: Record<AgeBucket, BedtimeRange> = {
  "0-3mo": {
    earliest: null,
    latest: null,
    label: "No fixed bedtime — circadian rhythm consolidates around 10-12 weeks",
    source: MINDELL_OWENS_BEDTIME,
  },
  "3-6mo": { earliest: "19:00", latest: "21:00", source: MINDELL_OWENS_BEDTIME },
  "6-9mo": { earliest: "19:00", latest: "20:00", source: MINDELL_OWENS_BEDTIME },
  "9-12mo": { earliest: "19:00", latest: "20:00", source: MINDELL_OWENS_BEDTIME },
  "12-18mo": { earliest: "19:00", latest: "20:30", source: MINDELL_OWENS_BEDTIME },
  "18-24mo": { earliest: "19:00", latest: "20:30", source: MINDELL_OWENS_BEDTIME },
  "2-3yr": { earliest: "19:00", latest: "20:30", source: MINDELL_OWENS_BEDTIME },
  "3yr+": { earliest: "19:00", latest: "21:00", source: MINDELL_OWENS_BEDTIME },
};

export const BEDTIME_ROUTINE = {
  minComponents: 3,
  minMinutes: 20,
  minNights: 5,
  components: ["Bath", "Book", "Song or lullaby", "Cuddle or quiet talk", "Lights out"],
  source: MINDELL_ROUTINE,
};

export const SAFE_SLEEP_ABCS = {
  a: "Alone — no bed-sharing, no soft objects, bumpers, pillows, or blankets, no weighted swaddles or sleep sacks",
  b: "Back — supine for every sleep, every nap, the entire first year",
  c: "Crib — firm flat surface meeting CPSC standards, inclined no more than 10°, fitted sheet only",
  plus: [
    "Room-share for at least 6 months (ideally 12)",
    "Stop swaddling at the first sign of rolling (typically 3-4 months)",
    "Offering a pacifier at sleep onset is protective",
    "No home cardiorespiratory monitors for SIDS prevention",
  ],
  source: AAP_SAFE_SLEEP,
};

export const SOURCES: SleepPlanSource[] = [
  {
    title: "Recommended Amount of Sleep for Pediatric Populations: AASM Consensus Statement",
    authors: "Paruthi S et al.",
    year: 2016,
    journal: "J Clin Sleep Med 2016;12(6):785-786",
    url: "https://pubmed.ncbi.nlm.nih.gov/27250809/",
  },
  {
    title: "Sleep-Related Infant Deaths: Updated 2022 Recommendations",
    authors: "Moon RY et al.",
    year: 2022,
    journal: "Pediatrics 2022;150(1):e2022057990",
    url: "https://publications.aap.org/pediatrics/article/150/1/e2022057990/",
  },
  {
    title: "Sleep Duration From Infancy to Adolescence: Reference Values and Generational Trends",
    authors: "Iglowstein I et al.",
    year: 2003,
    journal: "Pediatrics 2003;111(2):302-307",
    url: "https://pubmed.ncbi.nlm.nih.gov/12563055/",
  },
  {
    title: "A Clinical Guide to Pediatric Sleep (3rd ed.)",
    authors: "Mindell JA, Owens JA",
    year: 2015,
    journal: "Wolters Kluwer",
  },
  {
    title: "A nightly bedtime routine: impact on sleep in young children",
    authors: "Mindell JA et al.",
    year: 2009,
    journal: "Sleep 2009;32(5):599-606",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2675894/",
  },
  {
    title: "Bedtime Routines for Young Children: A Dose-Dependent Association",
    authors: "Mindell JA et al.",
    year: 2015,
    journal: "Sleep 2015;38(5):717-722",
    url: "https://pubmed.ncbi.nlm.nih.gov/25325483/",
  },
  {
    title: "Five-Year Follow-up of Harms and Benefits of Behavioral Infant Sleep Intervention",
    authors: "Price AMH et al.",
    year: 2012,
    journal: "Pediatrics 2012;130(4):643-651",
    url: "https://publications.aap.org/pediatrics/article/130/4/643/",
  },
  {
    title: "National Sleep Foundation's sleep time duration recommendations",
    authors: "Hirshkowitz M et al.",
    year: 2015,
    journal: "Sleep Health 2015;1(1):40-43",
    url: "https://pubmed.ncbi.nlm.nih.gov/29073412/",
  },
];

function isSleepTrainingOk(ageMonths: number): boolean {
  return ageMonths >= 4;
}

function sleepTrainingNoteFor(ageMonths: number): string | null {
  if (ageMonths < 4) {
    return "Sleep training isn't appropriate yet — circadian rhythm and self-soothing capacity aren't ready before about 4-6 months (Mindell & Owens 2015; AAP).";
  }
  return null;
}

// Median over an array of numbers. Returns null on empty.
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Express a Date as minutes-since-midnight in local time.
function minutesSinceMidnightLocal(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function formatHHmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function parseHHmm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function addMinutes(time: string, delta: number): string {
  return formatHHmm(parseHHmm(time) + delta);
}

function diffInMinutes(later: string, earlier: string): number {
  return parseHHmm(later) - parseHHmm(earlier);
}

export interface SavedSleepPlan {
  wake_time: string | null;
  bedtime_earliest: string | null;
  bedtime_latest: string | null;
  wake_window_low_min: number | null;
  wake_window_high_min: number | null;
  nap_count: number | null;
  overrides: { wake_time?: boolean; bedtime?: boolean; nap_count?: boolean };
}

interface BuildSleepPlanArgs {
  ageMonths: number;
  logs: PlanLog[];
  methodFlavor?: MethodFlavor;
  savedPlan?: SavedSleepPlan | null;
}

export function buildSleepPlan({ ageMonths, logs, savedPlan }: BuildSleepPlanArgs): SleepPlan {
  const bucket = getAgeBucket(ageMonths);
  const totalSleep = TOTAL_SLEEP_BY_BRACKET[bucket];
  const defaultNaps = NAPS_BY_BRACKET[bucket];
  const wakeWindow = WAKE_WINDOW_BY_BRACKET[bucket];
  const defaultBedtimeRange = BEDTIME_RANGE_BY_BRACKET[bucket];

  const wakeOverride = savedPlan?.overrides?.wake_time && savedPlan.wake_time ? savedPlan.wake_time : null;
  const bedtimeOverride =
    savedPlan?.overrides?.bedtime && (savedPlan.bedtime_earliest || savedPlan.bedtime_latest)
      ? {
          earliest: savedPlan.bedtime_earliest,
          latest: savedPlan.bedtime_latest,
        }
      : null;
  const napCountOverride =
    savedPlan?.overrides?.nap_count && typeof savedPlan.nap_count === "number"
      ? savedPlan.nap_count
      : null;

  const bedtimeRange: BedtimeRange = bedtimeOverride
    ? {
        earliest: bedtimeOverride.earliest,
        latest: bedtimeOverride.latest,
        source: defaultBedtimeRange.source,
      }
    : defaultBedtimeRange;

  const naps: NapInfo = napCountOverride !== null
    ? { ...defaultNaps, typical: napCountOverride }
    : defaultNaps;

  // Observed values from the last 14 days of logs.
  const fourteenAgo = subDays(new Date(), 14);
  const recent = logs.filter((l) => new Date(l.started_at) >= fourteenAgo);
  const nightLogs = recent.filter((l) => l.sleep_type === "night");
  const nightWithEnd = nightLogs.filter((l) => l.ended_at);

  const bedtimeMinutes = nightLogs.map((l) => minutesSinceMidnightLocal(new Date(l.started_at)));
  const wakeMinutes = nightWithEnd.map((l) => minutesSinceMidnightLocal(new Date(l.ended_at as string)));

  const medianBedtime = median(bedtimeMinutes);
  const medianWake = median(wakeMinutes);
  const observedBedtime = medianBedtime !== null && nightLogs.length >= 3 ? formatHHmm(medianBedtime) : null;
  const observedWakeTime = medianWake !== null && nightWithEnd.length >= 3 ? formatHHmm(medianWake) : null;

  // Observed total sleep — last 7 days, mean night minutes per day + mean nap minutes per day.
  const sevenAgo = subDays(new Date(), 7);
  const last7 = logs.filter((l) => new Date(l.started_at) >= sevenAgo && typeof l.duration_minutes === "number");
  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
  const nightByDay = new Map<string, number>();
  const napByDay = new Map<string, number>();
  for (const l of last7) {
    const key = dayKey(new Date(l.started_at));
    const dur = l.duration_minutes ?? 0;
    if (l.sleep_type === "night") {
      nightByDay.set(key, (nightByDay.get(key) ?? 0) + dur);
    } else if (l.sleep_type === "nap") {
      napByDay.set(key, (napByDay.get(key) ?? 0) + dur);
    }
  }
  const meanNightMin = nightByDay.size > 0 ? Array.from(nightByDay.values()).reduce((a, b) => a + b, 0) / nightByDay.size : null;
  const meanNapMin = napByDay.size > 0 ? Array.from(napByDay.values()).reduce((a, b) => a + b, 0) / napByDay.size : 0;
  const observedTotalHours = meanNightMin !== null ? (meanNightMin + meanNapMin) / 60 : null;
  const hasEnoughLogs = nightLogs.length >= 3;

  // Adjustment tip — only surface when we have enough signal.
  let adjustmentTip: string | null = null;
  if (hasEnoughLogs && bedtimeRange.latest && observedBedtime) {
    const drift = diffInMinutes(observedBedtime, bedtimeRange.latest);
    if (drift > 30) {
      adjustmentTip = `Try shifting bedtime 15 min earlier each night for a few nights toward ${bedtimeRange.earliest ?? bedtimeRange.latest}-${bedtimeRange.latest}.`;
    }
  }
  if (!adjustmentTip && hasEnoughLogs && observedTotalHours !== null && observedTotalHours < totalSleep.low - 0.75) {
    const rounded = Math.round(observedTotalHours * 10) / 10;
    adjustmentTip = `Your baby's averaging ${rounded}h. Aiming closer to ${totalSleep.low}-${totalSleep.high}h often helps with daytime mood and nap quality.`;
  }

  const safeSleep = ageMonths < 12 ? SAFE_SLEEP_ABCS : null;
  const sleepTrainingNote = sleepTrainingNoteFor(ageMonths);

  // Sample day — built from observed wake time or 07:00 default, using the
  // lower end of the wake-window range to avoid pushing parents to over-extend.
  // 0-3 mo skip the structured day in favor of a newborn-flexibility note.
  const sampleDay: SampleDayEntry[] = [];
  let newbornNote: string | null = null;

  if (bucket === "0-3mo") {
    newbornNote =
      "Newborn schedules are flexible by design. Follow short wake windows and feeding cues rather than the clock — a real rhythm settles in around 10-12 weeks.";
  } else {
    const wakeAnchor = wakeOverride ?? observedWakeTime ?? "07:00";
    const bedtimeAnchor = bedtimeOverride?.earliest ?? observedBedtime ?? bedtimeRange.earliest ?? "19:30";
    const wwLow = wakeWindow.low;
    let cursor = wakeAnchor;
    sampleDay.push({ time: cursor, activity: "Wake + bright light" });

    const napCount = naps.typical;
    const napDurationMin = bucket === "3-6mo" ? 75 : bucket === "6-9mo" || bucket === "9-12mo" ? 90 : 120;

    if (napCount >= 1) {
      cursor = addMinutes(cursor, wwLow);
      sampleDay.push({ time: cursor, activity: "Nap 1" });
      cursor = addMinutes(cursor, napDurationMin);
      sampleDay.push({ time: cursor, activity: "Wake from nap 1" });
    }
    if (napCount >= 2) {
      cursor = addMinutes(cursor, wwLow);
      sampleDay.push({ time: cursor, activity: "Nap 2" });
      cursor = addMinutes(cursor, napDurationMin);
      sampleDay.push({ time: cursor, activity: "Wake from nap 2" });
    }
    if (napCount >= 3) {
      cursor = addMinutes(cursor, wwLow);
      sampleDay.push({ time: cursor, activity: "Nap 3" });
      cursor = addMinutes(cursor, Math.min(45, napDurationMin));
      sampleDay.push({ time: cursor, activity: "Wake from nap 3" });
    }

    const routineStart = addMinutes(bedtimeAnchor, -30);
    sampleDay.push({ time: routineStart, activity: "Start bedtime routine" });
    sampleDay.push({ time: bedtimeAnchor, activity: "Lights out" });
  }

  return {
    bucket,
    bucketLabel: BUCKET_LABEL[bucket],
    totalSleep,
    naps,
    wakeWindow,
    bedtimeRange,
    bedtimeRoutine: BEDTIME_ROUTINE,
    safeSleep,
    sleepTrainingNote,
    observed: {
      bedtime: bedtimeOverride?.earliest ?? observedBedtime,
      wakeTime: wakeOverride ?? observedWakeTime,
      totalHours: observedTotalHours !== null ? Math.round(observedTotalHours * 10) / 10 : null,
      nightLogCount: nightLogs.length,
      hasEnoughSignal: hasEnoughLogs,
    },
    adjustmentTip,
    sampleDay,
    newbornNote,
    sources: SOURCES,
  };
}

export { isSleepTrainingOk };
