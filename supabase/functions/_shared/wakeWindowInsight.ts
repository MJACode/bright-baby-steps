// Pure helpers for the weekly-insights wake-window read (spec
// specs/002-adaptive-wake-windows, FR-011 / FR-012, User Story 4).
//
// Kept free of Deno globals and URL imports on purpose so vitest can import
// this file directly (src/test/wakeWindowInsight.server.test.ts), same pattern
// as signPlan.ts.
//
// Contract (request, optional block next to childId):
//   wakeWindow: {
//     ageTypicalMin, minMin, maxMin, currentMin: integers 20..480,
//       minMin <= ageTypicalMin <= maxMin
//     signals: unique subset of U1..U5, O1..O4 (<= 9)
//     options: 1-3 unique integers, each 0 or 5 <= |x| <= 30, must include 0
//   }
// Invalid -> the whole block is ignored (no 400; the rest of the insight runs).
//
// Response addition (only when the request block was valid):
//   wakeWindow: { choice: number (one of options), note: string (<= 280) }
// The model can only pick from the engine's options; anything else falls back
// to the engine's own pick with a deterministic note.

export const WAKE_WINDOW_SIGNAL_CODES = [
  "U1", "U2", "U3", "U4", "U5", "O1", "O2", "O3", "O4",
] as const;
export type WakeWindowSignal = (typeof WAKE_WINDOW_SIGNAL_CODES)[number];

export const MIN_WINDOW_MIN = 20;
export const MAX_WINDOW_MIN = 480;
export const MIN_STEP_MIN = 5;
export const MAX_STEP_MIN = 30;
export const MAX_OPTIONS = 3;
export const MAX_NOTE = 280;

export type WakeWindowRequest = {
  ageTypicalMin: number;
  minMin: number;
  maxMin: number;
  currentMin: number;
  signals: WakeWindowSignal[];
  options: number[];
};

export type WakeWindowResult = { choice: number; note: string };

// Plain-language meaning of each engine signal (FR-005), phrased without the
// FR-011 banned words so the model can echo them safely.
export const SIGNAL_PHRASES: Record<WakeWindowSignal, string> = {
  U1: "has been comfortably holding longer stretches before naps, with good naps after",
  U2: "has been taking one fewer nap than usual on several days",
  U3: "has had a long awake stretch in the middle of the night on several nights",
  U4: "has had more daytime sleep than is typical for this age on most days",
  U5: "short naps have tended to follow shorter stretches awake",
  O1: "short naps tend to follow longer stretches",
  O2: "total sleep has been on the low side on several days",
  O3: "has been starting the day before 6am on several days after a long last stretch",
  O4: "bedtime has been drifting later after a long last stretch",
};

const SIGNAL_SET: ReadonlySet<string> = new Set(WAKE_WINDOW_SIGNAL_CODES);

// Backstop for FR-011: a model note containing any of these is replaced by the
// deterministic fallback rather than shown to a parent.
export const WAKE_WINDOW_OFF_TONE_RE = new RegExp(
  "\\b(?:" +
    [
      "should(?:n't)?",
      "must",
      "behind",
      "off[\\s-]track",
      "fix(?:es|ed|ing)?",
      "sleep debt",
      "ideal schedule",
      "overtired baby",
      "cry(?:ing)?[\\s-]it[\\s-]out",
      "let (?:her|him|them|your baby) cry",
      "diagnos\\w*",
      "disorder",
      "pediatrician",
      "doctor",
    ].join("|") +
    ")\\b",
  "i",
);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function isValidOption(v: unknown): v is number {
  if (typeof v !== "number" || !Number.isInteger(v)) return false;
  if (v === 0) return true;
  const abs = Math.abs(v);
  return abs >= MIN_STEP_MIN && abs <= MAX_STEP_MIN;
}

/** Strict validation of the optional request block. Any defect -> null. */
export function validateWakeWindowRequest(raw: unknown): WakeWindowRequest | null {
  if (!isPlainObject(raw)) return null;
  const { ageTypicalMin, minMin, maxMin, currentMin, signals, options } = raw;

  for (const v of [ageTypicalMin, minMin, maxMin, currentMin]) {
    if (!isIntInRange(v, MIN_WINDOW_MIN, MAX_WINDOW_MIN)) return null;
  }
  const typical = ageTypicalMin as number;
  const lo = minMin as number;
  const hi = maxMin as number;
  if (!(lo <= typical && typical <= hi)) return null;

  if (!Array.isArray(signals) || signals.length > WAKE_WINDOW_SIGNAL_CODES.length) return null;
  if (!signals.every((s) => typeof s === "string" && SIGNAL_SET.has(s))) return null;
  if (new Set(signals).size !== signals.length) return null;

  if (!Array.isArray(options) || options.length < 1 || options.length > MAX_OPTIONS) return null;
  if (!options.every(isValidOption)) return null;
  if (new Set(options).size !== options.length) return null;
  if (!options.includes(0)) return null;

  return {
    ageTypicalMin: typical,
    minMin: lo,
    maxMin: hi,
    currentMin: currentMin as number,
    signals: [...signals] as WakeWindowSignal[],
    options: [...options] as number[],
  };
}

function describeOption(opt: number, current: number): string {
  if (opt === 0) return `${opt}: hold at about ${current} min`;
  const target = current + opt;
  return opt > 0
    ? `${opt}: try a slightly longer first stretch, about ${target} min`
    : `${opt}: try a slightly shorter first stretch, about ${target} min`;
}

/** User-turn context section. Numbers here are the only ones the note may use. */
export function buildWakeWindowContext(req: WakeWindowRequest, name: string): string {
  const lines = [
    "Wake window (from the app's age-and-pattern engine, in minutes):",
    `- Typical range at ${name}'s age: about ${req.minMin}-${req.maxMin} min, typical ${req.ageTypicalMin} min`,
    `- ${name}'s first stretch of the day right now: about ${req.currentMin} min`,
  ];
  if (req.signals.length) {
    lines.push("- What the last 7 days of logs suggest:");
    for (const s of req.signals) lines.push(`  - ${SIGNAL_PHRASES[s]}`);
  } else {
    lines.push("- What the last 7 days of logs suggest: no clear pattern either way");
  }
  lines.push('- Options for "choice" (pick exactly one value):');
  for (const o of req.options) lines.push(`  - ${describeOption(o, req.currentMin)}`);
  return lines.join("\n");
}

/** System-prompt addition, sent only when the context section is present. */
export const WAKE_WINDOW_PROMPT = `Wake window: the user message includes a "Wake window" section. In addition to the 4 fields above, include a 5th field:
- "wakeWindow": { "choice": <one of the listed option values, as a number>, "note": "<1-2 warm sentences, at most 280 characters>" }

Rules for "wakeWindow":
- "choice" must be exactly one of the listed option values. If the signals are mixed or unclear, choose 0 (hold).
- In "note", only use numbers that appear in the Wake window section, written in minutes (for example "about 108 min"). Never state any other number, duration, or count.
- Cues come first: say that the baby's sleepy cues lead and the number is only a guide.
- Never use these words or phrases: should, must, behind, off track, fix, sleep debt, ideal schedule, overtired baby.
- Never give advice about letting the baby cry or how long to tolerate crying.
- Never diagnose, never suggest something is wrong, and do not suggest a doctor visit about wake windows.
- Keep wake-window advice in "wakeWindow.note"; do not repeat it in the "sleep" field.`;

/** The engine's own pick: the single non-zero option if exactly one exists, else hold. */
export function enginePick(req: WakeWindowRequest): number {
  const nonZero = req.options.filter((o) => o !== 0);
  return nonZero.length === 1 ? nonZero[0] : 0;
}

/** Deterministic warm note for the engine pick. Always <= MAX_NOTE. */
export function fallbackWakeWindow(req: WakeWindowRequest, name: string): WakeWindowResult {
  const choice = enginePick(req);
  const current = req.currentMin;
  const build = (whose: string) => {
    if (choice === 0) {
      return `${whose} first stretch of the day is about ${current} min, and holding there this week is a steady choice. Cues come first, so let sleepy signs lead.`;
    }
    const direction = choice > 0 ? "a little longer" : "a little shorter";
    return `${whose} first stretch of the day is about ${current} min. You might try ${direction}, about ${current + choice} min, this week. Cues come first: if sleepy signs show up sooner, follow them.`;
  };
  const trimmedName = name.trim();
  let note = trimmedName ? build(`${trimmedName}'s`) : "";
  if (!note || note.length > MAX_NOTE) note = build("Your baby's");
  return { choice, note };
}

function numbersAllowed(req: WakeWindowRequest): Set<number> {
  const s = new Set<number>([req.ageTypicalMin, req.minMin, req.maxMin, req.currentMin]);
  for (const o of req.options) {
    s.add(Math.abs(o));
    s.add(req.currentMin + o);
  }
  return s;
}

/**
 * Validate the model's wakeWindow field. Requires choice in options and a
 * non-empty note <= MAX_NOTE after trim; also drops notes that break FR-011
 * tone rules or state a number the engine did not give. On any failure the
 * whole result falls back to the engine pick + deterministic note.
 */
export function sanitizeWakeWindowOutput(
  raw: unknown,
  req: WakeWindowRequest,
  name: string,
): WakeWindowResult {
  if (!isPlainObject(raw)) return fallbackWakeWindow(req, name);
  const { choice, note } = raw;
  if (typeof choice !== "number" || !req.options.includes(choice)) {
    return fallbackWakeWindow(req, name);
  }
  if (typeof note !== "string") return fallbackWakeWindow(req, name);
  const trimmed = note.trim();
  if (!trimmed || trimmed.length > MAX_NOTE) return fallbackWakeWindow(req, name);
  if (WAKE_WINDOW_OFF_TONE_RE.test(trimmed)) return fallbackWakeWindow(req, name);
  const allowed = numbersAllowed(req);
  const stated = trimmed.match(/\d+(?:\.\d+)?/g) ?? [];
  if (stated.some((n) => !allowed.has(Number(n)))) return fallbackWakeWindow(req, name);
  return { choice, note: trimmed };
}
