import {
  getAllergenStatus,
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
  GUIDANCE_FOOTER,
  ACTION_PLAN,
  REACTION_SAVED_TOAST,
  EMERGENCY_BANNER_TITLE,
  PEDIATRICIAN_BANNER_TITLE,
  REACTION_NOTED_DESCRIPTION,
  type Severity,
  type ReactionLevel,
  exposureLoggedToast,
  startIntroToast,
  recentOtherFirstExposure,
  spacingNoteText,
  spokenAllergenName,
  isSameCalendarDay,
  isSecondExposureNudgeDue,
  nextExposureSlot,
  clampExposureTime,
  feedServingsLoggedText,
  feedServingsFailedText,
  SECOND_EXPOSURE_STEP_TITLE,
  SECOND_EXPOSURE_STEP_HELPER,
  SAME_DAY_SECOND_EXPOSURE_TITLE,
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
    // Merge with the sign-off model: removal now also takes the current row,
    // so sweep both an unsigned and a signed-off intro.
    const currents = [
      { status: "in_progress", completed_at: null },
      { status: "completed", completed_at: "2024-06-15T08:00:00Z" },
    ];
    for (const current of currents) {
      for (const remaining of shapes) {
        const next = introStateAfterExposureRemoval(remaining, current);
        const derived = getAllergenStatus({ status: next.status, allergen_exposure_logs: remaining });
        const expected =
          next.status === "reaction_observed" ? "reaction_noted"
          : next.status === "completed" ? "introduced"
          : next.status === "not_started" ? "not_started"
          : "in_progress";
        expect(derived).toBe(expected);
      }
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

  it("returns exposure #2 after sign-off and while awaiting it", () => {
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
    ["Pale, floppy, or very sleepy", "emergency"],
    ["Hives all over", "pediatrician"],
    ["Repeated vomiting", "pediatrician"],
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

  const EMERGENCY_CHIPS = ["Difficulty breathing", "Coughing or wheezing", "Swelling", "Pale, floppy, or very sleepy"];

  it("limits the emergency chips to airway, swelling, and circulation", () => {
    expect(SYMPTOM_CHIPS.filter((c) => c.level === "emergency").map((c) => c.value).sort()).toEqual(
      [...EMERGENCY_CHIPS].sort()
    );
  });

  it.each(EMERGENCY_CHIPS)("%s is an emergency at every severity", (value) => {
    for (const sev of SEVERITIES) {
      expect(classifyReaction([value], sev)).toBe("emergency");
    }
  });

  it("routes Hives all over and Repeated vomiting to the pediatrician unless rated Severe", () => {
    for (const value of ["Hives all over", "Repeated vomiting"]) {
      expect(classifyReaction([value], "none")).toBe("pediatrician");
      expect(classifyReaction([value], "mild")).toBe("pediatrician");
      expect(classifyReaction([value], "moderate")).toBe("pediatrician");
      expect(classifyReaction([value], "severe")).toBe("emergency");
    }
  });

  it("routes signs in two body areas to the pediatrician, not 911", () => {
    expect(classifyReaction(["Hives", "Vomiting"], "mild")).toBe("pediatrician");
    expect(classifyReaction(["Rash", "Sneezing or runny nose"], "none")).toBe("pediatrician");
    expect(classifyReaction(["Hives all over", "Repeated vomiting"], "moderate")).toBe("pediatrician");
    expect(classifyReaction(["Rash", "Diarrhea"], "none")).toBe("pediatrician");
    expect(classifyReaction(["Fussiness", "Diarrhea"], "none")).toBe("note");
  });

  it("takes the higher chip level for every chip pair", () => {
    for (const a of SYMPTOM_CHIPS) {
      for (const b of SYMPTOM_CHIPS) {
        const expected = RANK[a.level] >= RANK[b.level] ? a.level : b.level;
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

  it("never lowers the level when a chip is added to any set", () => {
    const values = SYMPTOM_CHIPS.map((c) => c.value);
    for (const sev of SEVERITIES) {
      for (const a of values) {
        for (const b of values) {
          expect(RANK[classifyReaction([a, b], sev)]).toBeGreaterThanOrEqual(RANK[classifyReaction([a], sev)]);
        }
      }
    }
  });

  it("treats unknown legacy strings as a note", () => {
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
    expect(all).toMatch(/floppiness/);
    expect(all).not.toMatch(/two areas at once|Repeated vomiting|Hives spreading/);
    expect(all).toMatch(/epinephrine, use it right away, then call 911/);
    expect(all).toMatch(/Don't wait to see if it passes/);
  });

  it("routes hives, two-area signs, and repeated vomiting to the pediatrician tier", () => {
    const items = CALL_PEDIATRICIAN.items.join(" ");
    expect(items).toMatch(/two areas at once/);
    expect(items).toMatch(/Repeated vomiting/);
    expect(items).toMatch(/Hives spreading across the body/);
  });

  it("ends every reaction surface with the action-plan prompt", () => {
    expect(CALL_PEDIATRICIAN.followUp).toContain(ACTION_PLAN);
    for (const toast of Object.values(REACTION_SAVED_TOAST)) {
      expect(toast.description.endsWith(ACTION_PLAN)).toBe(true);
    }
    expect(REACTION_SAVED_TOAST.emergency.description).toMatch(/^Get emergency help now — call 911 if you haven't already\. /);
    expect(REACTION_NOTED_DESCRIPTION).toMatch(/allergy action plan with your pediatrician/);
  });

  it("only mentions nut butter for nut allergens", () => {
    expect(beforeYouStartFor("peanut").items).toContain(SAFE_FORM_NUTS);
    expect(beforeYouStartFor("tree-nuts").items).toContain(SAFE_FORM_NUTS);
    for (const slug of ["milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame", "unknown"]) {
      const items = beforeYouStartFor(slug).items;
      expect(items).toContain(SAFE_FORM_GENERAL);
      expect(items.join(" ")).not.toMatch(/\bnuts?\b/i);
    }
  });

  it("matches the approved wording", () => {
    expect({
      BEFORE_YOU_START_NUTS: beforeYouStartFor("peanut"),
      BEFORE_YOU_START_GENERAL: beforeYouStartFor("milk"),
      CALL_911, CALL_PEDIATRICIAN, USUALLY_NOT_A_REACTION,
      LATER_SAME_DAY, NEXT_FEW_DAYS, GUIDANCE_FOOTER,
      ACTION_PLAN, REACTION_SAVED_TOAST, EMERGENCY_BANNER_TITLE, PEDIATRICIAN_BANNER_TITLE,
      REACTION_NOTED_DESCRIPTION,
    }).toMatchSnapshot();
  });
});

describe("exposureLoggedToast", () => {
  const NOW = new Date("2024-06-15T12:00:00Z");

  it("says keep watching until the end of a window that is still open", () => {
    const toast = exposureLoggedToast({ exposure_number: 2, logged_at: "2024-06-15T11:00:00Z" }, NOW);
    expect(toast.title).toBe("Exposure logged");
    expect(toast.description).toMatch(/^Keep watching until /);
  });

  it("drops the watch line for a back-dated exposure whose window has closed", () => {
    expect(exposureLoggedToast({ exposure_number: 2, logged_at: "2024-06-15T09:00:00Z" }, NOW))
      .toEqual({ title: "Exposure logged", description: "" });
  });

  it("calls exposure #3 and later a serving", () => {
    expect(exposureLoggedToast({ exposure_number: 3, logged_at: "2024-06-15T11:30:00Z" }, NOW).title).toBe("Serving logged");
  });
});

// ── No 3-day gate (founder follow-up 2026-10-14) ──────────────────────────────

describe("exposure #2 without a hard wait", () => {
  it("uses the new step copy and never names a fixed next date", () => {
    expect(SECOND_EXPOSURE_STEP_TITLE).toBe("Offer it again");
    expect(SECOND_EXPOSURE_STEP_HELPER).toBe("Offer it again on another day, in the next few days.");
    expect(SAME_DAY_SECOND_EXPOSURE_TITLE).toBe("Offer the second taste today?");
    const toast = startIntroToast({ logged_at: "2024-06-15T11:30:00Z" }, new Date("2024-06-15T12:00:00Z"));
    expect(toast.description).toMatch(/^Keep watching until .+\. Offer it again on another day, in the next few days\.$/);
    expect(toast.description).not.toMatch(/Next exposure|3-day|wait until/i);
  });

  it("isSameCalendarDay compares local calendar days", () => {
    expect(isSameCalendarDay(new Date(2024, 5, 15, 0, 1), new Date(2024, 5, 15, 23, 59))).toBe(true);
    expect(isSameCalendarDay(new Date(2024, 5, 15, 23, 59), new Date(2024, 5, 16, 0, 1))).toBe(false);
  });

  it("nudges for exposure #2 from day 4 (3 calendar days after #1)", () => {
    const first = new Date(2024, 5, 10, 18, 0).toISOString();
    expect(isSecondExposureNudgeDue(first, new Date(2024, 5, 12, 23, 59))).toBe(false);
    expect(isSecondExposureNudgeDue(first, new Date(2024, 5, 13, 0, 1))).toBe(true);
  });
});

describe("spacing between new allergens", () => {
  const NOW = new Date("2024-06-15T12:00:00Z");
  const H = 60 * 60 * 1000;
  const firstAt = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();
  const intro = (allergen_id: string, msAgo: number, exposure_number = 1) => ({
    allergen_id,
    allergen_exposure_logs: [{ exposure_number, logged_at: firstAt(msAgo) }],
  });

  it("finds another allergen's first exposure inside 72 h", () => {
    expect(recentOtherFirstExposure([intro("egg", 48 * H)], "peanut", NOW)).toEqual({
      allergenId: "egg",
      loggedAt: firstAt(48 * H),
    });
  });

  it("72 h boundary: a minute inside shows, exactly 72 h does not", () => {
    expect(recentOtherFirstExposure([intro("egg", 72 * H - 60_000)], "peanut", NOW)).not.toBeNull();
    expect(recentOtherFirstExposure([intro("egg", 72 * H)], "peanut", NOW)).toBeNull();
  });

  it("ignores the same allergen and anything that isn't exposure #1", () => {
    expect(recentOtherFirstExposure([intro("peanut", H)], "peanut", NOW)).toBeNull();
    expect(recentOtherFirstExposure([intro("egg", H, 2)], "peanut", NOW)).toBeNull();
    expect(recentOtherFirstExposure([intro("egg", H, 3)], "peanut", NOW)).toBeNull();
  });

  it("picks the most recent of several", () => {
    const out = recentOtherFirstExposure([intro("egg", 60 * H), intro("milk", 10 * H)], "peanut", NOW);
    expect(out?.allergenId).toBe("milk");
  });

  it("says how long ago, in plain words", () => {
    const tail = "Waiting a few days between new allergens makes it easier to tell which food caused a reaction, if one happens.";
    expect(spacingNoteText("Egg", firstAt(49 * H), NOW)).toBe(`You started egg 2 days ago. ${tail}`);
    expect(spacingNoteText("Cow's Milk (Dairy)", firstAt(25 * H), NOW)).toBe(`You started cow's milk 1 day ago. ${tail}`);
    expect(spacingNoteText("Egg", firstAt(5 * H), NOW)).toBe(`You started egg 5 hours ago. ${tail}`);
    expect(spacingNoteText("Egg", firstAt(10 * 60_000), NOW)).toBe(`You started egg less than an hour ago. ${tail}`);
    expect(spokenAllergenName("Tree Nuts")).toBe("tree nuts");
  });
});

describe("next exposure slot and clamping", () => {
  it("numbers the next exposure and floors it at the latest one", () => {
    expect(nextExposureSlot([])).toEqual({ exposureNumber: 1, notBefore: undefined });
    const slot = nextExposureSlot([
      { exposure_number: 1, logged_at: "2024-06-01T08:00:00Z" },
      { exposure_number: 3, logged_at: "2024-06-10T08:00:00Z" },
      { exposure_number: 2, logged_at: "2024-06-05T08:00:00Z" },
    ]);
    expect(slot.exposureNumber).toBe(4);
    expect(slot.notBefore?.toISOString()).toBe("2024-06-10T08:00:00.000Z");
  });

  it("clamps into [min, now]", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const min = new Date("2024-06-10T00:00:00Z");
    expect(clampExposureTime(new Date("2024-06-16T00:00:00Z"), min, now)).toEqual(now);
    expect(clampExposureTime(new Date("2024-06-01T00:00:00Z"), min, now)).toEqual(min);
    expect(clampExposureTime(new Date("2024-06-12T00:00:00Z"), min, now)).toEqual(new Date("2024-06-12T00:00:00Z"));
  });
});

describe("feed serving toast copy", () => {
  it("names the servings in spoken form", () => {
    expect(feedServingsLoggedText(["Egg", "Peanut"])).toBe("Counted as a serving of egg and peanut.");
    expect(feedServingsFailedText(["Cow's Milk (Dairy)"])).toBe(
      'The feed saved, but the serving of cow\'s milk didn\'t. Tap "Had it today" in the Allergen Tracker to add it.',
    );
  });
});
