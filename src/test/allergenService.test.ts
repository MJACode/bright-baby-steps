import {
  getAllergenStatus,
  getDaysSinceLastExposure,
  canLogNextExposure,
  getNextExposureDate,
  introStateAfterExposureRemoval,
  classifyReaction,
  resolveReactionSeverity,
  isReaction,
  exposureWatchEnd,
  isExposureInWatchWindow,
  exposureAwaitingReaction,
  SYMPTOM_CHIPS,
  beforeYouStartFor,
  SAFE_FORM_NUTS,
  SAFE_FORM_GENERAL,
  CALL_911,
  CALL_PEDIATRICIAN,
  USUALLY_NOT_A_REACTION,
  LATER_SAME_DAY,
  NEXT_FEW_DAYS,
  ONCE_IT_GOES_WELL,
  GUIDANCE_FOOTER,
  type Severity,
  type ReactionLevel,
} from "@/services/allergenService";

// Mock supabase to prevent real network initialisation
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// ── getAllergenStatus ─────────────────────────────────────────────────────────

describe("getAllergenStatus", () => {
  it("returns 'not_started' when intro is undefined", () => {
    expect(getAllergenStatus(undefined)).toBe("not_started");
  });

  it("returns 'introduced' for status 'completed'", () => {
    expect(getAllergenStatus({ status: "completed" })).toBe("introduced");
  });

  it("returns 'introduced' for status 'safe'", () => {
    expect(getAllergenStatus({ status: "safe" })).toBe("introduced");
  });

  it("returns 'reaction_noted' for status 'reaction_observed'", () => {
    expect(getAllergenStatus({ status: "reaction_observed" })).toBe("reaction_noted");
  });

  it("returns 'reaction_noted' when any exposure log has reaction_observed true", () => {
    expect(
      getAllergenStatus({
        status: "in_progress",
        allergen_exposure_logs: [{ reaction_observed: false }, { reaction_observed: true }],
      })
    ).toBe("reaction_noted");
  });

  it("returns 'introduced' when 2+ exposure logs have no reaction", () => {
    expect(
      getAllergenStatus({
        status: "in_progress",
        allergen_exposure_logs: [{ reaction_observed: false }, { reaction_observed: false }],
      })
    ).toBe("introduced");
  });

  it("returns 'not_started' for status 'not_started' with no logs", () => {
    expect(
      getAllergenStatus({
        status: "not_started",
        allergen_exposure_logs: [],
      })
    ).toBe("not_started");
  });

  it("returns 'in_progress' for status 'in_progress' with one successful exposure", () => {
    expect(
      getAllergenStatus({
        status: "in_progress",
        allergen_exposure_logs: [{ reaction_observed: false }],
      })
    ).toBe("in_progress");
  });

  it("returns 'in_progress' when status is not_started but there is one exposure log", () => {
    // Unusual state but the logic falls through to the final return
    expect(
      getAllergenStatus({
        status: "not_started",
        allergen_exposure_logs: [{ reaction_observed: false }],
      })
    ).toBe("in_progress");
  });

  it("treats missing allergen_exposure_logs as empty array", () => {
    expect(getAllergenStatus({ status: "in_progress" })).toBe("in_progress");
  });
});

// ── getDaysSinceLastExposure ──────────────────────────────────────────────────

describe("getDaysSinceLastExposure", () => {
  const NOW = new Date("2024-06-15T12:00:00Z");

  beforeEach(() => vi.setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it("returns null for empty log array", () => {
    expect(getDaysSinceLastExposure([])).toBeNull();
  });

  it("returns 0 when last exposure was today", () => {
    expect(getDaysSinceLastExposure([{ logged_at: "2024-06-15T08:00:00Z" }])).toBe(0);
  });

  it("returns 1 when last exposure was yesterday", () => {
    expect(getDaysSinceLastExposure([{ logged_at: "2024-06-14T08:00:00Z" }])).toBe(1);
  });

  it("returns 3 when last exposure was 3 days ago", () => {
    expect(getDaysSinceLastExposure([{ logged_at: "2024-06-12T08:00:00Z" }])).toBe(3);
  });

  it("picks the most recent log when given multiple entries", () => {
    const logs = [
      { logged_at: "2024-06-10T08:00:00Z" }, // 5 days ago
      { logged_at: "2024-06-13T08:00:00Z" }, // 2 days ago
      { logged_at: "2024-06-12T08:00:00Z" }, // 3 days ago
    ];
    expect(getDaysSinceLastExposure(logs)).toBe(2);
  });
});

// ── canLogNextExposure ────────────────────────────────────────────────────────

describe("canLogNextExposure", () => {
  const NOW = new Date("2024-06-15T12:00:00Z");

  beforeEach(() => vi.setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it("returns true when there are no exposure logs", () => {
    expect(canLogNextExposure([])).toBe(true);
  });

  it("returns false when last exposure was 0 days ago (today)", () => {
    expect(canLogNextExposure([{ logged_at: "2024-06-15T08:00:00Z" }])).toBe(false);
  });

  it("returns false when last exposure was 2 days ago", () => {
    expect(canLogNextExposure([{ logged_at: "2024-06-13T08:00:00Z" }])).toBe(false);
  });

  it("returns true when last exposure was exactly 3 days ago", () => {
    expect(canLogNextExposure([{ logged_at: "2024-06-12T08:00:00Z" }])).toBe(true);
  });

  it("returns true when last exposure was more than 3 days ago", () => {
    expect(canLogNextExposure([{ logged_at: "2024-06-08T08:00:00Z" }])).toBe(true);
  });
});

// ── getNextExposureDate ───────────────────────────────────────────────────────

describe("getNextExposureDate", () => {
  it("returns null when there are no logs", () => {
    expect(getNextExposureDate([])).toBeNull();
  });

  it("returns last exposure date + 3 days", () => {
    const result = getNextExposureDate([{ logged_at: "2024-06-12T08:00:00Z" }]);
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith("2024-06-15")).toBe(true);
  });

  it("uses the most recent log when multiple entries exist", () => {
    const logs = [
      { logged_at: "2024-06-10T08:00:00Z" },
      { logged_at: "2024-06-14T08:00:00Z" }, // most recent
    ];
    const result = getNextExposureDate(logs);
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith("2024-06-17")).toBe(true);
  });

  it("does not mutate the original logs array", () => {
    const logs = [{ logged_at: "2024-06-10T08:00:00Z" }, { logged_at: "2024-06-12T08:00:00Z" }];
    const copy = [...logs];
    getNextExposureDate(logs);
    expect(logs).toEqual(copy);
  });
});

// ── introStateAfterExposureRemoval ────────────────────────────────────────────

describe("introStateAfterExposureRemoval", () => {
  it("returns 'not_started' when nothing is left", () => {
    expect(introStateAfterExposureRemoval([])).toEqual({ status: "not_started", completed_at: null });
  });

  it("returns 'in_progress' when a single clean exposure remains", () => {
    expect(
      introStateAfterExposureRemoval([{ logged_at: "2024-06-10T08:00:00Z", reaction_observed: false }])
    ).toEqual({ status: "in_progress", completed_at: null });
  });

  it("returns 'completed' with the latest remaining log time when 2+ clean exposures remain", () => {
    expect(
      introStateAfterExposureRemoval([
        { logged_at: "2024-06-10T08:00:00Z", reaction_observed: false },
        { logged_at: "2024-06-14T08:00:00Z", reaction_observed: null },
      ])
    ).toEqual({ status: "completed", completed_at: "2024-06-14T08:00:00Z" });
  });

  it("returns 'reaction_observed' when any remaining exposure had a reaction", () => {
    expect(
      introStateAfterExposureRemoval([
        { logged_at: "2024-06-10T08:00:00Z", reaction_observed: true },
        { logged_at: "2024-06-14T08:00:00Z", reaction_observed: false },
      ])
    ).toEqual({ status: "reaction_observed", completed_at: null });
  });

  it("agrees with getAllergenStatus on the resulting row", () => {
    const remaining = [
      { logged_at: "2024-06-10T08:00:00Z", reaction_observed: false },
      { logged_at: "2024-06-14T08:00:00Z", reaction_observed: false },
    ];
    const next = introStateAfterExposureRemoval(remaining);
    expect(getAllergenStatus({ status: next.status, allergen_exposure_logs: remaining })).toBe("introduced");
  });
});

// ── Reactions vs. "completed" ─────────────────────────────────────────────────

describe("getAllergenStatus with a reaction on a completed intro", () => {
  const logs = [
    { logged_at: "2024-06-10T08:00:00Z", reaction_observed: false },
    { logged_at: "2024-06-14T08:00:00Z", reaction_observed: true },
  ];

  it("surfaces reaction_noted once the reaction_observed status write lands", () => {
    expect(getAllergenStatus({ status: "reaction_observed", allergen_exposure_logs: logs })).toBe("reaction_noted");
  });

  it("surfaces reaction_noted even while the stored status is still 'completed'", () => {
    expect(getAllergenStatus({ status: "completed", allergen_exposure_logs: logs })).toBe("reaction_noted");
  });

  it("still reads 'completed' with clean exposures as introduced", () => {
    expect(
      getAllergenStatus({
        status: "completed",
        allergen_exposure_logs: [{ reaction_observed: false }, { reaction_observed: null }],
      })
    ).toBe("introduced");
  });

  it("keeps 'safe' as an explicit override over an earlier reaction", () => {
    expect(getAllergenStatus({ status: "safe", allergen_exposure_logs: logs })).toBe("introduced");
  });

  it("agrees with introStateAfterExposureRemoval for every remaining-log shape", () => {
    const flags: (boolean | null)[] = [true, false, null];
    const shapes: { logged_at: string; reaction_observed: boolean | null }[][] = [[]];
    for (const a of flags) {
      shapes.push([{ logged_at: "2024-06-10T08:00:00Z", reaction_observed: a }]);
      for (const b of flags) {
        shapes.push([
          { logged_at: "2024-06-10T08:00:00Z", reaction_observed: a },
          { logged_at: "2024-06-14T08:00:00Z", reaction_observed: b },
        ]);
      }
    }
    for (const remaining of shapes) {
      const next = introStateAfterExposureRemoval(remaining);
      const derived = getAllergenStatus({ status: next.status, allergen_exposure_logs: remaining });
      const expected =
        next.status === "reaction_observed" ? "reaction_noted"
        : next.status === "completed" ? "introduced"
        : next.status === "not_started" ? "not_started"
        : "in_progress";
      expect(derived).toBe(expected);
    }
  });
});

// ── Watch window ──────────────────────────────────────────────────────────────

describe("watch window", () => {
  const exposure = { logged_at: "2024-06-15T10:00:00Z" };

  it("ends 2 hours after the exposure when no window is stored", () => {
    expect(exposureWatchEnd(exposure).toISOString()).toBe("2024-06-15T12:00:00.000Z");
    expect(exposureWatchEnd({ ...exposure, observation_window_ends_at: null }).toISOString())
      .toBe("2024-06-15T12:00:00.000Z");
  });

  it("prefers the row's stored observation window", () => {
    const stored = { ...exposure, observation_window_ends_at: "2024-06-15T13:30:00Z" };
    expect(exposureWatchEnd(stored).toISOString()).toBe("2024-06-15T13:30:00.000Z");
    expect(isExposureInWatchWindow(stored, new Date("2024-06-15T13:00:00Z"))).toBe(true);
  });

  it("ignores an unparseable stored window", () => {
    expect(exposureWatchEnd({ ...exposure, observation_window_ends_at: "nope" }).toISOString())
      .toBe("2024-06-15T12:00:00.000Z");
  });

  it("is open just before the end and closed at the end", () => {
    expect(isExposureInWatchWindow(exposure, new Date("2024-06-15T11:59:00Z"))).toBe(true);
    expect(isExposureInWatchWindow(exposure, new Date("2024-06-15T12:00:00Z"))).toBe(false);
  });
});

describe("exposureAwaitingReaction", () => {
  const e1 = { id: "e1", exposure_number: 1, reaction_observed: false as boolean | null, logged_at: "2024-06-10T10:00:00Z" };
  const e2 = { id: "e2", exposure_number: 2, reaction_observed: false as boolean | null, logged_at: "2024-06-14T10:00:00Z" };

  it("returns the only exposure while in progress", () => {
    expect(exposureAwaitingReaction({ status: "in_progress", allergen_exposure_logs: [e1] }, [])).toBe(e1);
  });

  it("returns exposure #2 after the intro auto-completed", () => {
    expect(exposureAwaitingReaction({ status: "completed", allergen_exposure_logs: [e2, e1] }, [])).toBe(e2);
    expect(exposureAwaitingReaction({ status: "in_progress", allergen_exposure_logs: [e1, e2] }, [])).toBe(e2);
  });

  it("returns nothing for a safe override, a recorded reaction, or no exposures", () => {
    expect(exposureAwaitingReaction({ status: "safe", allergen_exposure_logs: [e1, e2] }, [])).toBeNull();
    expect(exposureAwaitingReaction({ status: "completed", allergen_exposure_logs: [e1, e2] }, ["e2"])).toBeNull();
    expect(exposureAwaitingReaction(
      { status: "completed", allergen_exposure_logs: [e1, { ...e2, reaction_observed: true }] }, [],
    )).toBeNull();
    expect(exposureAwaitingReaction({ status: "reaction_observed", allergen_exposure_logs: [e1] }, [])).toBeNull();
    expect(exposureAwaitingReaction({ status: "in_progress", allergen_exposure_logs: [] }, [])).toBeNull();
    expect(exposureAwaitingReaction(undefined, [])).toBeNull();
  });
});

// ── classifyReaction ──────────────────────────────────────────────────────────

describe("classifyReaction", () => {
  const RANK: Record<ReactionLevel, number> = { none: 0, note: 1, pediatrician: 2, emergency: 3 };
  const SEVERITIES: Severity[] = ["none", "mild", "moderate", "severe"];

  it("keeps every legacy stored value so old rows still classify", () => {
    const values = SYMPTOM_CHIPS.map((c) => c.value);
    for (const legacy of ["Rash", "Hives", "Vomiting", "Swelling", "Difficulty breathing", "Diarrhea", "Fussiness"]) {
      expect(values).toContain(legacy);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it("maps severity alone", () => {
    expect(classifyReaction([], "none")).toBe("none");
    expect(classifyReaction([], "mild")).toBe("note");
    expect(classifyReaction([], "moderate")).toBe("pediatrician");
    expect(classifyReaction([], "severe")).toBe("emergency");
  });

  it("classifies each chip alone at its own level", () => {
    for (const chip of SYMPTOM_CHIPS) {
      expect(classifyReaction([chip.value], "none")).toBe(chip.level);
    }
  });

  it.each([
    ["Difficulty breathing", "emergency"],
    ["Coughing or wheezing", "emergency"],
    ["Swelling", "emergency"],
    ["Hives all over", "emergency"],
    ["Repeated vomiting", "emergency"],
    ["Pale, floppy, or very sleepy", "emergency"],
    ["Hives", "pediatrician"],
    ["Rash", "pediatrician"],
    ["Vomiting", "pediatrician"],
    ["Sneezing or runny nose", "pediatrician"],
    ["Blood in stool", "pediatrician"],
    ["Diarrhea", "note"],
    ["Fussiness", "note"],
  ] as const)("%s alone is %s", (value, level) => {
    expect(classifyReaction([value], "none")).toBe(level);
  });

  it("escalates Mild + trouble breathing to emergency (the hidden-chip bug)", () => {
    expect(classifyReaction(["Difficulty breathing"], "mild")).toBe("emergency");
  });

  it("treats signs in two different body areas as an emergency", () => {
    expect(classifyReaction(["Hives", "Vomiting"], "mild")).toBe("emergency");
    expect(classifyReaction(["Rash", "Sneezing or runny nose"], "none")).toBe("emergency");
    expect(classifyReaction(["Rash", "Diarrhea"], "none")).toBe("emergency");
  });

  it("does not treat two signs in the same area as an emergency", () => {
    expect(classifyReaction(["Hives", "Rash"], "mild")).toBe("pediatrician");
    expect(classifyReaction(["Vomiting", "Diarrhea"], "mild")).toBe("pediatrician");
  });

  it("does not count area-less chips toward the combination rule", () => {
    expect(classifyReaction(["Blood in stool", "Vomiting"], "none")).toBe("pediatrician");
    expect(classifyReaction(["Fussiness", "Rash"], "none")).toBe("pediatrician");
    expect(classifyReaction(["Fussiness", "Diarrhea"], "none")).toBe("note");
  });

  it("matches the combination rule for every chip pair", () => {
    for (const a of SYMPTOM_CHIPS) {
      for (const b of SYMPTOM_CHIPS) {
        if (a.value === b.value) continue;
        const crossArea = a.area !== null && b.area !== null && a.area !== b.area;
        const expected = crossArea ? "emergency" : RANK[a.level] >= RANK[b.level] ? a.level : b.level;
        expect(classifyReaction([a.value, b.value], "none")).toBe(expected);
      }
    }
  });

  it("never lets a chip lower the severity level, or severity lower a chip", () => {
    for (const sev of SEVERITIES) {
      const sevOnly = classifyReaction([], sev);
      for (const chip of SYMPTOM_CHIPS) {
        const both = classifyReaction([chip.value], sev);
        expect(RANK[both]).toBeGreaterThanOrEqual(RANK[sevOnly]);
        expect(RANK[both]).toBeGreaterThanOrEqual(RANK[chip.level]);
      }
    }
  });

  it("treats unknown legacy strings as a note with no area", () => {
    expect(classifyReaction(["Sneezing"], "none")).toBe("note");
    expect(classifyReaction(["Sneezing", "Rash"], "none")).toBe("pediatrician");
    expect(classifyReaction(["Sneezing"], "severe")).toBe("emergency");
  });

  it("ignores duplicate symptoms", () => {
    expect(classifyReaction(["Rash", "Rash"], "none")).toBe("pediatrician");
  });
});

describe("resolveReactionSeverity / isReaction", () => {
  it("stores chips picked at 'None' as a mild reaction", () => {
    expect(resolveReactionSeverity("none", ["Rash"])).toBe("mild");
    expect(isReaction("none", ["Rash"])).toBe(true);
  });

  it("keeps the parent's own rating otherwise", () => {
    expect(resolveReactionSeverity("none", [])).toBe("none");
    expect(resolveReactionSeverity("moderate", ["Rash"])).toBe("moderate");
    expect(resolveReactionSeverity("severe", [])).toBe("severe");
    expect(isReaction("none", [])).toBe(false);
    expect(isReaction("mild", [])).toBe(true);
  });

  it("never lowers the triage level by resolving severity", () => {
    for (const chip of SYMPTOM_CHIPS) {
      expect(classifyReaction([chip.value], resolveReactionSeverity("none", [chip.value]))).toBe(
        classifyReaction([chip.value], "none")
      );
    }
  });
});

// ── Guidance copy ─────────────────────────────────────────────────────────────
// Pediatrician-reviewed triage copy. A failing snapshot means the wording changed:
// get it re-reviewed before updating the snapshot.

describe("allergen guidance copy", () => {
  it("keeps the 911 triggers and the epinephrine instruction", () => {
    const all = [...CALL_911.items, ...(CALL_911.followUp ?? [])].join(" ");
    expect(all).toMatch(/Trouble breathing/);
    expect(all).toMatch(/Swelling of the lips, tongue, or face/);
    expect(all).toMatch(/two areas at once/);
    expect(all).toMatch(/epinephrine, use it right away, then call 911/);
    expect(all).toMatch(/Don't wait to see if it passes/);
  });

  it("only mentions nut butter for nut allergens", () => {
    expect(beforeYouStartFor("peanuts").items).toContain(SAFE_FORM_NUTS);
    expect(beforeYouStartFor("tree-nuts").items).toContain(SAFE_FORM_NUTS);
    for (const slug of ["milk", "eggs", "wheat", "soy", "fish", "shellfish", "sesame", "unknown"]) {
      const items = beforeYouStartFor(slug).items;
      expect(items).toContain(SAFE_FORM_GENERAL);
      expect(items.join(" ")).not.toMatch(/\bnuts?\b/i);
    }
  });

  it("matches the approved wording", () => {
    expect({
      BEFORE_YOU_START_NUTS: beforeYouStartFor("peanuts"),
      BEFORE_YOU_START_GENERAL: beforeYouStartFor("milk"),
      CALL_911, CALL_PEDIATRICIAN, USUALLY_NOT_A_REACTION,
      LATER_SAME_DAY, NEXT_FEW_DAYS, ONCE_IT_GOES_WELL, GUIDANCE_FOOTER,
    }).toMatchSnapshot();
  });
});
