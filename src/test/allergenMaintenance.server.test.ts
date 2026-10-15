import { describe, expect, it } from "vitest";

import {
  allergenMaintenanceMessage,
  commonAllergenName,
  dropViewerAllergenCopies,
  formatAllergenList,
  planAllergenMaintenance,
  weeklyTarget,
  type MaintenanceInput,
  type MaintenanceLog,
} from "../../supabase/functions/_shared/allergenMaintenance";

// Locks the check-notifications `allergen_maintenance` producer rules
// (tasks/todo-allergen-maintenance.md), imported straight from
// supabase/functions/_shared (same pattern as signPlan.server.test.ts).

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-12T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const CHILD = "child-1";
const PEANUT = { id: "a-peanut", slug: "peanut", name: "Peanut", sort_order: 1 };
const EGG = { id: "a-egg", slug: "egg", name: "Egg", sort_order: 2 };
const MILK = { id: "a-milk", slug: "milk", name: "Cow's Milk (Dairy)", sort_order: 3 };

function base(overrides: Partial<MaintenanceInput> = {}): MaintenanceInput {
  return {
    children: [{ id: CHILD, name: "Lulu", date_of_birth: "2025-08-01", is_expected: false }],
    intros: [{ id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(30) }],
    logs: [
      { id: "l1", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(20), reaction_observed: false },
      { id: "l2", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(8), reaction_observed: false },
    ],
    reactions: [],
    allergens: [PEANUT, EGG, MILK],
    recentSends: [],
    now: NOW,
    ...overrides,
  };
}

describe("planAllergenMaintenance", () => {
  it("lapsed allergen -> one message for the child", () => {
    const out = planAllergenMaintenance(base());
    expect(out.size).toBe(1);
    expect(out.get(CHILD)).toBe(
      "Time for another taste of peanut. Regular servings help keep it on Lulu's menu.",
    );
  });

  it("batches every lapsed allergen into one message, in allergen sort order", () => {
    const out = planAllergenMaintenance(
      base({
        intros: [
          { id: "i-egg", child_id: CHILD, allergen_id: EGG.id, status: "completed", completed_at: daysAgo(30) },
          { id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(30) },
        ],
        logs: [
          { id: "l1", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(9), reaction_observed: false },
          { id: "l2", allergen_introduction_id: "i-egg", exposure_number: 2, logged_at: daysAgo(7), reaction_observed: null },
        ],
      }),
    );
    expect(out.size).toBe(1);
    expect(out.get(CHILD)).toBe(
      "Time for another taste of peanut and egg. Regular servings help keep them on Lulu's menu.",
    );
  });

  it("latest exposure 3 days ago -> none, even under target", () => {
    const out = planAllergenMaintenance(
      base({
        logs: [
          { id: "l1", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(20), reaction_observed: false },
          { id: "l2", allergen_introduction_id: "i-peanut", exposure_number: 3, logged_at: daysAgo(3), reaction_observed: false },
        ],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("an exposure with reaction_observed = true -> none", () => {
    const out = planAllergenMaintenance(
      base({
        logs: [
          { id: "l1", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(20), reaction_observed: true },
          { id: "l2", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(8), reaction_observed: false },
        ],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("an allergen_reactions row on any exposure -> none", () => {
    const out = planAllergenMaintenance(base({ reactions: [{ exposure_log_id: "l1" }] }));
    expect(out.size).toBe(0);
  });

  it("child 36+ months -> none", () => {
    const out = planAllergenMaintenance(
      base({
        children: [{ id: CHILD, name: "Lulu", date_of_birth: "2023-10-01", is_expected: false }],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("child at 35 months is still eligible", () => {
    const out = planAllergenMaintenance(
      base({
        children: [{ id: CHILD, name: "Lulu", date_of_birth: "2023-11-01", is_expected: false }],
      }),
    );
    expect(out.size).toBe(1);
  });

  it("expected (unborn) child -> none", () => {
    const out = planAllergenMaintenance(
      base({
        children: [{ id: CHILD, name: "Lulu", date_of_birth: "2026-12-01", is_expected: true }],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("already sent within 7 days (any recipient) -> none", () => {
    const out = planAllergenMaintenance(
      base({ recentSends: [{ child_id: CHILD, created_at: daysAgo(6) }] }),
    );
    expect(out.size).toBe(0);
  });

  it("last send 7+ days ago -> sends again", () => {
    const out = planAllergenMaintenance(
      base({ recentSends: [{ child_id: CHILD, created_at: daysAgo(7.5) }] }),
    );
    expect(out.size).toBe(1);
  });

  it("in_progress intro (not signed off) -> none", () => {
    const out = planAllergenMaintenance(
      base({
        intros: [{ id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "in_progress", completed_at: null }],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("signed off under 7 days ago (grace period) -> none", () => {
    const out = planAllergenMaintenance(
      base({
        intros: [
          { id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(6) },
        ],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("signed off 7+ days ago -> grace period over, sends", () => {
    const out = planAllergenMaintenance(
      base({
        intros: [
          { id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(7) },
        ],
      }),
    );
    expect(out.size).toBe(1);
  });

  it("completed intro with no exposure rows -> none", () => {
    const out = planAllergenMaintenance(base({ logs: [] }));
    expect(out.size).toBe(0);
  });

  it("only the lapsed allergens are listed", () => {
    const out = planAllergenMaintenance(
      base({
        intros: [
          { id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(30) },
          { id: "i-egg", child_id: CHILD, allergen_id: EGG.id, status: "completed", completed_at: daysAgo(30) },
        ],
        logs: [
          { id: "l1", allergen_introduction_id: "i-peanut", exposure_number: 2, logged_at: daysAgo(10), reaction_observed: false },
          { id: "l2", allergen_introduction_id: "i-egg", exposure_number: 2, logged_at: daysAgo(2), reaction_observed: false },
        ],
      }),
    );
    expect(out.get(CHILD)).toBe(
      "Time for another taste of peanut. Regular servings help keep it on Lulu's menu.",
    );
  });
});

describe("copy helpers", () => {
  it("lower-cases common names and drops the parenthetical", () => {
    expect(commonAllergenName("Cow's Milk (Dairy)")).toBe("cow's milk");
    expect(commonAllergenName("Tree Nuts")).toBe("tree nuts");
  });

  it("formats 1 / 2 / 3+ allergens", () => {
    expect(formatAllergenList(["peanut"])).toBe("peanut");
    expect(formatAllergenList(["peanut", "egg"])).toBe("peanut and egg");
    expect(formatAllergenList(["peanut", "egg", "sesame"])).toBe("peanut, egg and 1 more");
    expect(formatAllergenList(["peanut", "egg", "sesame", "fish"])).toBe("peanut, egg and 2 more");
  });

  it("never uses the banned words", () => {
    const msgs = [
      allergenMaintenanceMessage("Lulu", ["peanut"]),
      allergenMaintenanceMessage("Lulu", ["peanut", "egg", "cow's milk"]),
    ];
    for (const m of msgs) expect(m).not.toMatch(/\b(safe|prevents?|cleared|allergic)\b/i);
  });
});

// Founder follow-up 2026-10-14: nudge before the week ends when an allergen is
// under its weekly target and the latest exposure is 4+ days old.
describe("planAllergenMaintenance — under target before the week ends", () => {
  const MIN = 60 * 1000;
  const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const serving = (id: string, intro: string, msAgo: number, n = 3): MaintenanceLog => ({
    id, allergen_introduction_id: intro, exposure_number: n, logged_at: at(msAgo), reaction_observed: false,
  });
  const protocol = (intro: string): MaintenanceLog[] => [
    { id: `${intro}-1`, allergen_introduction_id: intro, exposure_number: 1, logged_at: daysAgo(40), reaction_observed: false },
    { id: `${intro}-2`, allergen_introduction_id: intro, exposure_number: 2, logged_at: daysAgo(35), reaction_observed: false },
  ];
  const EGG_INTRO = { id: "i-egg", child_id: CHILD, allergen_id: EGG.id, status: "completed", completed_at: daysAgo(30) };

  it("targets: peanut 3, everything else 2", () => {
    expect(weeklyTarget("peanut")).toBe(3);
    expect(weeklyTarget("egg")).toBe(2);
    expect(weeklyTarget(null)).toBe(2);
  });

  it("peanut once a week, last serving 5 days ago -> nudged", () => {
    const out = planAllergenMaintenance(base({ logs: [...protocol("i-peanut"), serving("s1", "i-peanut", 5 * DAY)] }));
    expect(out.get(CHILD)).toBe("Time for another taste of peanut. Regular servings help keep it on Lulu's menu.");
  });

  it("latest exposure exactly 4 days ago -> nudged; a minute short of 4 days -> none", () => {
    expect(planAllergenMaintenance(base({ logs: [...protocol("i-peanut"), serving("s1", "i-peanut", 4 * DAY)] })).size).toBe(1);
    expect(
      planAllergenMaintenance(base({ logs: [...protocol("i-peanut"), serving("s1", "i-peanut", 4 * DAY - MIN)] })).size,
    ).toBe(0);
  });

  it("peanut at its target of 3 in the window -> none; 2 of 3 -> nudged", () => {
    const three = [serving("s1", "i-peanut", 4 * DAY), serving("s2", "i-peanut", 5 * DAY), serving("s3", "i-peanut", 6 * DAY)];
    expect(planAllergenMaintenance(base({ logs: [...protocol("i-peanut"), ...three] })).size).toBe(0);
    expect(planAllergenMaintenance(base({ logs: [...protocol("i-peanut"), ...three.slice(0, 2)] })).size).toBe(1);
  });

  it("egg at its target of 2 -> none; 1 of 2 -> nudged", () => {
    const intros = [EGG_INTRO];
    const two = [serving("e1", "i-egg", 4 * DAY), serving("e2", "i-egg", 5 * DAY)];
    expect(planAllergenMaintenance(base({ intros, logs: [...protocol("i-egg"), ...two] })).size).toBe(0);
    expect(planAllergenMaintenance(base({ intros, logs: [...protocol("i-egg"), two[1]] })).get(CHILD)).toBe(
      "Time for another taste of egg. Regular servings help keep it on Lulu's menu.",
    );
  });

  it("a serving exactly 7 days ago has left the window; one a minute inside still counts", () => {
    const intros = [EGG_INTRO];
    const out = (msAgo: number) =>
      planAllergenMaintenance(
        base({ intros, logs: [...protocol("i-egg"), serving("e1", "i-egg", msAgo), serving("e2", "i-egg", 5 * DAY)] }),
      );
    expect(out(7 * DAY).size).toBe(1);
    expect(out(7 * DAY - MIN).size).toBe(0);
  });

  it("protocol exposures don't count as servings", () => {
    const intros = [{ ...EGG_INTRO, completed_at: daysAgo(8) }];
    const logs: MaintenanceLog[] = [
      { id: "e1", allergen_introduction_id: "i-egg", exposure_number: 1, logged_at: daysAgo(6), reaction_observed: false },
      { id: "e2", allergen_introduction_id: "i-egg", exposure_number: 2, logged_at: daysAgo(5), reaction_observed: false },
    ];
    expect(planAllergenMaintenance(base({ intros, logs })).size).toBe(1);
  });

  it("keeps the grace period, reaction suppression, age cap and 7-day batching", () => {
    const logs = [...protocol("i-peanut"), serving("s1", "i-peanut", 5 * DAY)];
    const grace = [{ id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(6) }];
    expect(planAllergenMaintenance(base({ logs, intros: grace })).size).toBe(0);
    expect(planAllergenMaintenance(base({ logs, reactions: [{ exposure_log_id: "s1" }] })).size).toBe(0);
    expect(
      planAllergenMaintenance(
        base({ logs, children: [{ id: CHILD, name: "Lulu", date_of_birth: "2023-10-01", is_expected: false }] }),
      ).size,
    ).toBe(0);
    expect(planAllergenMaintenance(base({ logs, recentSends: [{ child_id: CHILD, created_at: daysAgo(3) }] })).size).toBe(0);
  });

  it("batches a lapsed allergen and an under-target one into one message", () => {
    const out = planAllergenMaintenance(
      base({
        intros: [base().intros[0], EGG_INTRO],
        logs: [...protocol("i-peanut"), serving("s1", "i-peanut", 5 * DAY), ...protocol("i-egg")],
      }),
    );
    expect(out.size).toBe(1);
    expect(out.get(CHILD)).toBe(
      "Time for another taste of peanut and egg. Regular servings help keep them on Lulu's menu.",
    );
  });
});

describe("dropViewerAllergenCopies", () => {
  const OWNER = "owner-1";
  const owners = new Map([[CHILD, OWNER]]);
  const row = (user_id: string, type = "allergen_maintenance") => ({ user_id, child_id: CHILD, type, message: "m" });

  it("keeps the owner and a coparent, drops a viewer", () => {
    const rows = [row(OWNER), row("coparent-1"), row("viewer-1")];
    const kept = dropViewerAllergenCopies(rows, owners, [{ owner_id: OWNER, partner_id: "viewer-1" }]);
    expect(kept.map((r) => r.user_id)).toEqual([OWNER, "coparent-1"]);
  });

  it("leaves every other type alone, viewers included", () => {
    const rows = [row("viewer-1", "appointment_reminder"), row("viewer-1", "weekly_development")];
    expect(dropViewerAllergenCopies(rows, owners, [{ owner_id: OWNER, partner_id: "viewer-1" }])).toEqual(rows);
  });

  it("matches the viewer role per family, not per person", () => {
    const rows = [row("person-1")];
    expect(dropViewerAllergenCopies(rows, owners, [{ owner_id: "other-owner", partner_id: "person-1" }])).toEqual(rows);
  });

  it("fails closed when the role read failed: only the owner's own row stays", () => {
    const rows = [row(OWNER), row("coparent-1"), row("viewer-1"), row("viewer-1", "appointment_reminder")];
    const kept = dropViewerAllergenCopies(rows, owners, null);
    expect(kept.map((r) => [r.user_id, r.type])).toEqual([
      [OWNER, "allergen_maintenance"],
      ["viewer-1", "appointment_reminder"],
    ]);
  });
});
