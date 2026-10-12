import { describe, expect, it } from "vitest";

import {
  MAX_NOTE,
  SIGNAL_PHRASES,
  WAKE_WINDOW_OFF_TONE_RE,
  WAKE_WINDOW_PROMPT,
  WAKE_WINDOW_SIGNAL_CODES,
  buildWakeWindowContext,
  enginePick,
  fallbackWakeWindow,
  sanitizeWakeWindowOutput,
  validateWakeWindowRequest,
  type WakeWindowRequest,
} from "../../supabase/functions/_shared/wakeWindowInsight";

// Server-side guard for the weekly-insights wake-window block
// (specs/002-adaptive-wake-windows FR-011 / FR-012), imported straight from
// supabase/functions/_shared (same pattern as signPlan.server.test.ts).

const LULU = {
  ageTypicalMin: 132,
  minMin: 89,
  maxMin: 162,
  currentMin: 98,
  signals: ["U1", "U5"],
  options: [0, 10],
};

function valid(overrides: Record<string, unknown> = {}): WakeWindowRequest {
  const v = validateWakeWindowRequest({ ...LULU, ...overrides });
  if (!v) throw new Error("expected a valid request");
  return v;
}

describe("validateWakeWindowRequest", () => {
  it("accepts the spec's Lulu example", () => {
    expect(validateWakeWindowRequest(LULU)).toEqual(LULU);
  });

  it("accepts edge values", () => {
    expect(validateWakeWindowRequest({ ...LULU, minMin: 20, ageTypicalMin: 20, maxMin: 480, currentMin: 480 })).not.toBeNull();
    expect(validateWakeWindowRequest({ ...LULU, options: [0] })).not.toBeNull();
    expect(validateWakeWindowRequest({ ...LULU, options: [-30, 0, 30] })).not.toBeNull();
    expect(validateWakeWindowRequest({ ...LULU, options: [0, -5] })).not.toBeNull();
    expect(validateWakeWindowRequest({ ...LULU, signals: [] })).not.toBeNull();
    expect(validateWakeWindowRequest({ ...LULU, signals: [...WAKE_WINDOW_SIGNAL_CODES] })).not.toBeNull();
  });

  it("ignores unknown extra keys and returns copies", () => {
    const input = { ...LULU, extra: "x", signals: ["U1"] };
    const v = validateWakeWindowRequest(input);
    expect(v).not.toBeNull();
    expect(v).not.toHaveProperty("extra");
    v!.signals.push("O1");
    expect(input.signals).toEqual(["U1"]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["array", [LULU]],
    ["string", "wake"],
  ])("rejects a non-object (%s)", (_l, raw) => {
    expect(validateWakeWindowRequest(raw)).toBeNull();
  });

  it.each([
    ["missing currentMin", { currentMin: undefined }],
    ["float", { currentMin: 98.5 }],
    ["string number", { currentMin: "98" }],
    ["below 20", { minMin: 19 }],
    ["above 480", { maxMin: 481 }],
    ["NaN", { ageTypicalMin: Number.NaN }],
    ["typical below min", { ageTypicalMin: 80 }],
    ["typical above max", { ageTypicalMin: 170 }],
    ["min above max", { minMin: 170, ageTypicalMin: 165, maxMin: 162 }],
  ])("rejects bad numbers: %s", (_l, o) => {
    expect(validateWakeWindowRequest({ ...LULU, ...o })).toBeNull();
  });

  it.each([
    ["not an array", { signals: "U1" }],
    ["unknown code", { signals: ["U1", "X9"] }],
    ["lower-case code", { signals: ["u1"] }],
    ["duplicate", { signals: ["U1", "U1"] }],
    ["non-string", { signals: [1] }],
    ["more than 9", { signals: [...WAKE_WINDOW_SIGNAL_CODES, "U1"] }],
  ])("rejects bad signals: %s", (_l, o) => {
    expect(validateWakeWindowRequest({ ...LULU, ...o })).toBeNull();
  });

  it.each([
    ["missing", { options: undefined }],
    ["empty", { options: [] }],
    ["more than 3", { options: [0, 5, 10, 15] }],
    ["no hold", { options: [10] }],
    ["duplicate", { options: [0, 0] }],
    ["step too small", { options: [0, 4] }],
    ["step too large", { options: [0, 31] }],
    ["negative too large", { options: [0, -45] }],
    ["float", { options: [0, 10.5] }],
    ["string", { options: [0, "10"] }],
  ])("rejects bad options: %s", (_l, o) => {
    expect(validateWakeWindowRequest({ ...LULU, ...o })).toBeNull();
  });
});

describe("buildWakeWindowContext", () => {
  it("lists the numbers, signal meanings and options", () => {
    const text = buildWakeWindowContext(valid(), "Lulu");
    expect(text).toContain("about 89-162 min, typical 132 min");
    expect(text).toContain("about 98 min");
    expect(text).toContain(SIGNAL_PHRASES.U1);
    expect(text).toContain(SIGNAL_PHRASES.U5);
    expect(text).toContain("0: hold at about 98 min");
    expect(text).toContain("10: try a slightly longer first stretch, about 108 min");
    expect(text).not.toContain("U1");
  });

  it("describes shorten options and an empty signal list", () => {
    const text = buildWakeWindowContext(valid({ signals: [], options: [0, -10] }), "Lulu");
    expect(text).toContain("no clear pattern");
    expect(text).toContain("-10: try a slightly shorter first stretch, about 88 min");
  });

  it("signal phrases and prompt avoid the FR-011 banned words outside the ban list", () => {
    for (const phrase of Object.values(SIGNAL_PHRASES)) {
      expect(WAKE_WINDOW_OFF_TONE_RE.test(phrase)).toBe(false);
    }
    expect(WAKE_WINDOW_PROMPT).toContain('"wakeWindow"');
    expect(WAKE_WINDOW_PROMPT).toMatch(/Cues come first/);
  });
});

describe("enginePick / fallbackWakeWindow", () => {
  it("picks the single non-zero option, else hold", () => {
    expect(enginePick(valid({ options: [0, 10] }))).toBe(10);
    expect(enginePick(valid({ options: [-10, 0] }))).toBe(-10);
    expect(enginePick(valid({ options: [0] }))).toBe(0);
    expect(enginePick(valid({ options: [-10, 0, 10] }))).toBe(0);
  });

  it("builds a warm, in-tone, bounded note using only given numbers", () => {
    for (const options of [[0], [0, 10], [0, -15], [-10, 0, 10]]) {
      const req = valid({ options });
      const fb = fallbackWakeWindow(req, "Lulu");
      expect(fb.note.length).toBeLessThanOrEqual(MAX_NOTE);
      expect(fb.note).toMatch(/Cues come first/);
      expect(WAKE_WINDOW_OFF_TONE_RE.test(fb.note)).toBe(false);
      // A fallback note must itself pass output validation.
      expect(sanitizeWakeWindowOutput(fb, req, "Lulu")).toEqual(fb);
    }
    expect(fallbackWakeWindow(valid(), "Lulu").note).toContain("about 108 min");
  });

  it("drops the name when it would overflow the note cap", () => {
    const fb = fallbackWakeWindow(valid(), "x".repeat(400));
    expect(fb.note.startsWith("Your baby's")).toBe(true);
    expect(fb.note.length).toBeLessThanOrEqual(MAX_NOTE);
  });
});

describe("sanitizeWakeWindowOutput", () => {
  const req = valid();
  const fb = fallbackWakeWindow(req, "Lulu");

  it("keeps a valid model answer (trimmed)", () => {
    const note = "  Lulu has been holding about 98 min comfortably. You might try about 108 min this week; cues come first.  ";
    expect(sanitizeWakeWindowOutput({ choice: 10, note }, req, "Lulu")).toEqual({ choice: 10, note: note.trim() });
    expect(sanitizeWakeWindowOutput({ choice: 0, note: "Holding near 98 min is lovely. Cues come first." }, req, "Lulu"))
      .toEqual({ choice: 0, note: "Holding near 98 min is lovely. Cues come first." });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["array", [10, "note"]],
    ["choice not in options", { choice: 15, note: "Try about 113 min." }],
    ["choice as string", { choice: "10", note: "Try about 108 min." }],
    ["missing note", { choice: 10 }],
    ["blank note", { choice: 10, note: "   " }],
    ["note too long", { choice: 10, note: "a".repeat(MAX_NOTE + 1) }],
    ["banned: should", { choice: 10, note: "You should try about 108 min." }],
    ["banned: behind", { choice: 0, note: "Lulu is not behind at about 98 min." }],
    ["banned: sleep debt", { choice: 0, note: "Watch for sleep debt around 98 min." }],
    ["banned: crying", { choice: 10, note: "Let her cry a bit at about 108 min." }],
    ["invented number", { choice: 10, note: "Try about 120 min this week." }],
    ["invented duration", { choice: 10, note: "Try about 108 min for 3 days." }],
  ])("falls back on %s", (_l, raw) => {
    expect(sanitizeWakeWindowOutput(raw, req, "Lulu")).toEqual(fb);
  });

  it("falls back to hold when there is no single engine pick", () => {
    const multi = valid({ options: [-10, 0, 10] });
    expect(sanitizeWakeWindowOutput({ choice: 20, note: "x" }, multi, "Lulu").choice).toBe(0);
  });
});
