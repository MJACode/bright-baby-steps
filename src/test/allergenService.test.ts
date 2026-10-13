import {
  getAllergenStatus,
  getDaysSinceLastExposure,
  canLogNextExposure,
  getNextExposureDate,
  introStateAfterExposureRemoval,
  isAwaitingSignOff,
  getStatusConfig,
  maintenanceTarget,
  maintenanceGuidance,
  servingsInLast7Days,
  isMaintenanceDue,
  isLapsed,
  maintenanceRemindersActive,
  getMaintenanceState,
  dueMaintenanceAllergenNames,
  sortDueIntroducedFirst,
  joinNames,
  inSignOffGrace,
  allergenEmoji,
  ALLERGEN_SLUGS,
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

  // Changed with the sign-off: two clean exposures used to auto-complete.
  // Only the parent's explicit "Yes, it's on the menu" writes completed now.
  it("stays 'in_progress' with 2+ reaction-free exposures until signed off", () => {
    expect(
      getAllergenStatus({
        status: "in_progress",
        allergen_exposure_logs: [{ reaction_observed: false }, { reaction_observed: false }],
      })
    ).toBe("in_progress");
  });

  it("lets a logged reaction outrank a sign-off", () => {
    expect(
      getAllergenStatus({
        status: "completed",
        allergen_exposure_logs: [{ reaction_observed: false }, { reaction_observed: false }, { reaction_observed: true }],
      })
    ).toBe("reaction_noted");
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
  const IN_PROGRESS = { status: "in_progress", completed_at: null };
  const SIGNED_OFF = { status: "completed", completed_at: "2024-06-15T09:00:00Z" };
  const clean = (logged_at: string) => ({ logged_at, reaction_observed: false });

  it("returns 'not_started' when nothing is left", () => {
    expect(introStateAfterExposureRemoval([], SIGNED_OFF)).toEqual({ status: "not_started", completed_at: null });
  });

  it("returns 'in_progress' when a single clean exposure remains", () => {
    expect(introStateAfterExposureRemoval([clean("2024-06-10T08:00:00Z")], IN_PROGRESS))
      .toEqual({ status: "in_progress", completed_at: null });
  });

  // Changed with the sign-off: this used to return 'completed' for any 2+ clean
  // exposures. Removing a log never confirms an allergen on the parent's behalf.
  it("keeps an unsigned intro 'in_progress' when 2+ clean exposures remain", () => {
    expect(
      introStateAfterExposureRemoval(
        [clean("2024-06-10T08:00:00Z"), { logged_at: "2024-06-14T08:00:00Z", reaction_observed: null }],
        IN_PROGRESS,
      )
    ).toEqual({ status: "in_progress", completed_at: null });
  });

  it("drops the sign-off when exposure #2 is undone", () => {
    expect(introStateAfterExposureRemoval([clean("2024-06-10T08:00:00Z")], SIGNED_OFF))
      .toEqual({ status: "in_progress", completed_at: null });
  });

  it("keeps the sign-off and its date when a maintenance serving is removed", () => {
    expect(
      introStateAfterExposureRemoval(
        [clean("2024-06-10T08:00:00Z"), clean("2024-06-14T08:00:00Z"), clean("2024-06-17T08:00:00Z")],
        SIGNED_OFF,
      )
    ).toEqual(SIGNED_OFF);
  });

  it("normalises a legacy 'safe' row to 'completed' and backfills a missing date", () => {
    expect(
      introStateAfterExposureRemoval(
        [clean("2024-06-10T08:00:00Z"), clean("2024-06-14T08:00:00Z")],
        { status: "safe", completed_at: null },
      )
    ).toEqual({ status: "completed", completed_at: "2024-06-14T08:00:00Z" });
  });

  it("returns 'reaction_observed' when any remaining exposure had a reaction", () => {
    expect(
      introStateAfterExposureRemoval(
        [{ logged_at: "2024-06-10T08:00:00Z", reaction_observed: true }, clean("2024-06-14T08:00:00Z")],
        SIGNED_OFF,
      )
    ).toEqual({ status: "reaction_observed", completed_at: null });
  });

  it("agrees with getAllergenStatus on the resulting row", () => {
    const remaining = [clean("2024-06-10T08:00:00Z"), clean("2024-06-14T08:00:00Z")];
    const unsigned = introStateAfterExposureRemoval(remaining, IN_PROGRESS);
    expect(getAllergenStatus({ status: unsigned.status, allergen_exposure_logs: remaining })).toBe("in_progress");
    const signed = introStateAfterExposureRemoval([...remaining, clean("2024-06-17T08:00:00Z")], SIGNED_OFF);
    expect(getAllergenStatus({ status: signed.status, allergen_exposure_logs: remaining })).toBe("introduced");
  });
});

// ── Sign-off status ───────────────────────────────────────────────────────────

describe("isAwaitingSignOff / getStatusConfig", () => {
  const two = [{ reaction_observed: false }, { reaction_observed: false }];

  it("is awaiting sign-off with 2 clean exposures in progress", () => {
    expect(isAwaitingSignOff({ status: "in_progress", allergen_exposure_logs: two })).toBe(true);
  });

  it("is not awaiting with one exposure, a reaction, or after sign-off", () => {
    expect(isAwaitingSignOff({ status: "in_progress", allergen_exposure_logs: [two[0]] })).toBe(false);
    expect(isAwaitingSignOff({ status: "in_progress", allergen_exposure_logs: [two[0], { reaction_observed: true }] })).toBe(false);
    expect(isAwaitingSignOff({ status: "completed", allergen_exposure_logs: two })).toBe(false);
    expect(isAwaitingSignOff(undefined)).toBe(false);
  });

  it("labels awaiting rows 'Ready to confirm' and introduced rows plain 'Introduced'", () => {
    expect(getStatusConfig("in_progress", { awaitingSignOff: true }).label).toBe("Ready to confirm");
    expect(getStatusConfig("in_progress").label).toBe("In Progress");
    expect(getStatusConfig("introduced").label).toBe("Introduced");
  });

  it("never renders the word safe in any status label", () => {
    const labels = (["not_started", "in_progress", "introduced", "reaction_noted"] as const).flatMap((s) => [
      getStatusConfig(s).label,
      getStatusConfig(s, { awaitingSignOff: true }).label,
    ]);
    labels.push(getStatusConfig(getAllergenStatus({ status: "safe" })).label);
    for (const label of labels) expect(label).not.toMatch(/safe|cleared|prevent|not allergic|✓/i);
  });
});

// ── Maintenance ───────────────────────────────────────────────────────────────

describe("maintenance helpers", () => {
  const NOW = new Date("2024-06-30T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const serving = (n: number, msAgo: number) => ({ exposure_number: n, logged_at: ago(msAgo), reaction_observed: false });

  it("covers exactly the live allergen slugs, with peanut the only 3-a-week target", () => {
    expect([...ALLERGEN_SLUGS].sort()).toEqual(
      ["egg", "fish", "milk", "peanut", "sesame", "shellfish", "soy", "tree-nuts", "wheat"],
    );
    expect(Object.keys(allergenEmoji).sort()).toEqual([...ALLERGEN_SLUGS].sort());
    expect(Object.fromEntries(ALLERGEN_SLUGS.map((slug) => [slug, maintenanceTarget(slug)]))).toEqual({
      peanut: 3, egg: 2, milk: 2, wheat: 2, soy: 2, "tree-nuts": 2, fish: 2, shellfish: 2, sesame: 2,
    });
    expect(maintenanceGuidance("peanut")).toMatch(/peanut butter/);
  });

  it("targets 3 a week for peanut and 2 for everything else", () => {
    expect(maintenanceTarget("peanut")).toBe(3);
    for (const slug of ["egg", "milk", "tree-nuts", "wheat", "soy", "fish", "shellfish", "sesame"]) {
      expect(maintenanceTarget(slug)).toBe(2);
    }
  });

  it("gives soft, approximate guidance copy", () => {
    expect(maintenanceGuidance("peanut")).toBe("About 3 servings a week, roughly 2 tsp thinned peanut butter each");
    expect(maintenanceGuidance("egg")).toBe("About twice a week");
  });

  it("counts only exposure #3 and later as servings", () => {
    expect(servingsInLast7Days([serving(1, DAY), serving(2, DAY), serving(3, DAY)], NOW)).toBe(1);
  });

  it("counts a serving just inside 7 days and drops one at exactly 7 days", () => {
    expect(servingsInLast7Days([serving(3, 7 * DAY - 1)], NOW)).toBe(1);
    expect(servingsInLast7Days([serving(3, 7 * DAY)], NOW)).toBe(0);
  });

  it("is due below target and not due at target", () => {
    expect(isMaintenanceDue("peanut", [serving(3, DAY), serving(4, 2 * DAY)], NOW)).toBe(true);
    expect(isMaintenanceDue("peanut", [serving(3, DAY), serving(4, 2 * DAY), serving(5, 3 * DAY)], NOW)).toBe(false);
    expect(isMaintenanceDue("egg", [serving(3, DAY), serving(4, 2 * DAY)], NOW)).toBe(false);
    expect(isMaintenanceDue("egg", [serving(3, DAY), serving(4, 7 * DAY)], NOW)).toBe(true);
  });

  it("is lapsed at exactly 14 days since any exposure and not a moment before", () => {
    expect(isLapsed([serving(2, 14 * DAY)], NOW)).toBe(true);
    expect(isLapsed([serving(2, 14 * DAY - 1)], NOW)).toBe(false);
    expect(isLapsed([], NOW)).toBe(false);
  });

  it("measures the lapse from the latest exposure, including #2", () => {
    expect(isLapsed([serving(1, 20 * DAY), serving(2, 3 * DAY)], NOW)).toBe(false);
    expect(isLapsed([serving(1, 30 * DAY), serving(2, 20 * DAY), serving(3, 15 * DAY)], NOW)).toBe(true);
  });

  it("stops reminders at 36 months", () => {
    expect(maintenanceRemindersActive({ date_of_birth: "2021-07-01" }, NOW)).toBe(true);
    expect(maintenanceRemindersActive({ date_of_birth: "2021-06-30" }, NOW)).toBe(false);
  });

  it("only builds maintenance state for introduced allergens", () => {
    const logs = [serving(1, 10 * DAY), serving(2, 6 * DAY)];
    expect(getMaintenanceState({ status: "in_progress", allergen_exposure_logs: logs }, "peanut", NOW)).toBeNull();
    expect(getMaintenanceState({ status: "completed", allergen_exposure_logs: logs }, "peanut", NOW))
      .toEqual({ servings: 0, target: 3, due: true, lapsed: false });
  });

  describe("sign-off grace period", () => {
    // Behind on servings and 14+ days since the last exposure: due and lapsed once grace ends.
    const logs = [serving(1, 30 * DAY), serving(2, 15 * DAY)];
    const intro = (completedMsAgo: number | null) => ({
      status: "completed",
      completed_at: completedMsAgo === null ? null : ago(completedMsAgo),
      allergen_exposure_logs: logs,
    });

    it("is neither due nor lapsed on day 6 after sign-off", () => {
      expect(inSignOffGrace(ago(6 * DAY), NOW)).toBe(true);
      expect(getMaintenanceState(intro(6 * DAY), "peanut", NOW)).toEqual({ servings: 0, target: 3, due: false, lapsed: false });
      expect(getMaintenanceState(intro(7 * DAY - 1), "peanut", NOW)).toMatchObject({ due: false, lapsed: false });
    });

    it("is due and lapsed again from exactly day 7", () => {
      expect(inSignOffGrace(ago(7 * DAY), NOW)).toBe(false);
      expect(getMaintenanceState(intro(7 * DAY), "peanut", NOW)).toEqual({ servings: 0, target: 3, due: true, lapsed: true });
    });

    it("gives a legacy row with no completed_at no grace", () => {
      expect(getMaintenanceState(intro(null), "peanut", NOW)).toMatchObject({ due: true, lapsed: true });
    });

    it("keeps an in-grace allergen out of the due list and the due-first sort", () => {
      const allergens = [{ id: "a1", slug: "peanut", name: "Peanut" }];
      expect(dueMaintenanceAllergenNames(allergens, [{ allergen_id: "a1", ...intro(6 * DAY) }], NOW)).toEqual([]);
      expect(dueMaintenanceAllergenNames(allergens, [{ allergen_id: "a1", ...intro(7 * DAY) }], NOW)).toEqual(["Peanut"]);
    });
  });

  it("lists due introduced allergens by name in catalog order", () => {
    const allergens = [
      { id: "a1", slug: "peanut", name: "Peanut" },
      { id: "a2", slug: "egg", name: "Egg" },
      { id: "a3", slug: "milk", name: "Milk" },
    ];
    const intros = [
      { allergen_id: "a2", status: "completed", allergen_exposure_logs: [serving(1, 9 * DAY), serving(2, 6 * DAY)] },
      { allergen_id: "a1", status: "completed", allergen_exposure_logs: [serving(3, DAY), serving(4, DAY), serving(5, DAY)] },
      { allergen_id: "a3", status: "in_progress", allergen_exposure_logs: [serving(1, 9 * DAY), serving(2, 6 * DAY)] },
    ];
    expect(dueMaintenanceAllergenNames(allergens, intros, NOW)).toEqual(["Egg"]);
  });

  it("reorders only the introduced slots, due first", () => {
    const items = [
      { id: "a", introduced: true, due: false },
      { id: "b", introduced: false, due: false },
      { id: "c", introduced: true, due: true },
      { id: "d", introduced: false, due: false },
    ];
    expect(sortDueIntroducedFirst(items, (i) => i.introduced, (i) => i.due).map((i) => i.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("joins names in plain English", () => {
    expect(joinNames(["Peanut"])).toBe("Peanut");
    expect(joinNames(["Peanut", "Egg"])).toBe("Peanut and Egg");
    expect(joinNames(["Peanut", "Egg", "Milk"])).toBe("Peanut, Egg, and Milk");
  });
});
