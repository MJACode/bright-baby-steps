import {
  getAllergenStatus,
  getDaysSinceLastExposure,
  canLogNextExposure,
  getNextExposureDate,
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
