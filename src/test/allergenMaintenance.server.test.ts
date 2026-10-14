import { describe, expect, it } from "vitest";

import {
  allergenMaintenanceMessage,
  commonAllergenName,
  formatAllergenList,
  planAllergenMaintenance,
  type MaintenanceInput,
} from "../../supabase/functions/_shared/allergenMaintenance";

// Locks the check-notifications `allergen_maintenance` producer rules
// (tasks/todo-allergen-maintenance.md), imported straight from
// supabase/functions/_shared (same pattern as signPlan.server.test.ts).

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-12T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const CHILD = "child-1";
const PEANUT = { id: "a-peanut", name: "Peanut", sort_order: 1 };
const EGG = { id: "a-egg", name: "Egg", sort_order: 2 };
const MILK = { id: "a-milk", name: "Cow's Milk (Dairy)", sort_order: 3 };

function base(overrides: Partial<MaintenanceInput> = {}): MaintenanceInput {
  return {
    children: [{ id: CHILD, name: "Lulu", date_of_birth: "2025-08-01", is_expected: false }],
    intros: [{ id: "i-peanut", child_id: CHILD, allergen_id: PEANUT.id, status: "completed", completed_at: daysAgo(30) }],
    logs: [
      { id: "l1", allergen_introduction_id: "i-peanut", logged_at: daysAgo(20), reaction_observed: false },
      { id: "l2", allergen_introduction_id: "i-peanut", logged_at: daysAgo(8), reaction_observed: false },
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
          { id: "l1", allergen_introduction_id: "i-peanut", logged_at: daysAgo(9), reaction_observed: false },
          { id: "l2", allergen_introduction_id: "i-egg", logged_at: daysAgo(7), reaction_observed: null },
        ],
      }),
    );
    expect(out.size).toBe(1);
    expect(out.get(CHILD)).toBe(
      "Time for another taste of peanut and egg. Regular servings help keep them on Lulu's menu.",
    );
  });

  it("not lapsed (latest serving 6 days ago) -> none", () => {
    const out = planAllergenMaintenance(
      base({
        logs: [
          { id: "l1", allergen_introduction_id: "i-peanut", logged_at: daysAgo(20), reaction_observed: false },
          { id: "l2", allergen_introduction_id: "i-peanut", logged_at: daysAgo(6), reaction_observed: false },
        ],
      }),
    );
    expect(out.size).toBe(0);
  });

  it("an exposure with reaction_observed = true -> none", () => {
    const out = planAllergenMaintenance(
      base({
        logs: [
          { id: "l1", allergen_introduction_id: "i-peanut", logged_at: daysAgo(20), reaction_observed: true },
          { id: "l2", allergen_introduction_id: "i-peanut", logged_at: daysAgo(8), reaction_observed: false },
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
          { id: "l1", allergen_introduction_id: "i-peanut", logged_at: daysAgo(10), reaction_observed: false },
          { id: "l2", allergen_introduction_id: "i-egg", logged_at: daysAgo(2), reaction_observed: false },
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
