import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { toReportFoodAvoidances } from "@/services/reportDataService";

// Pediatrician report: child_food_avoidances rows resolved for display.

describe("toReportFoodAvoidances", () => {
  it("resolves catalog names, keeps custom text, puts reactions first then newest", () => {
    const out = toReportFoodAvoidances([
      { food_slug: "pear", custom_food: null, reason: "preference", note: null, created_at: "2026-11-20T10:00:00Z" },
      { food_slug: "egg-scrambled", custom_food: null, reason: "reaction", note: "Hives on cheeks", created_at: "2026-11-01T10:00:00Z" },
      { food_slug: null, custom_food: "Grandma's lentil stew", reason: "reaction", note: null, created_at: "2026-11-10T10:00:00Z" },
      { food_slug: "banana", custom_food: null, reason: "preference", note: null, created_at: "2026-11-21T10:00:00Z" },
    ]);
    expect(out).toEqual([
      { food: "Grandma's lentil stew", isCustom: true, reason: "reaction", note: null, addedAt: "2026-11-10T10:00:00Z" },
      { food: "Scrambled egg", isCustom: false, reason: "reaction", note: "Hives on cheeks", addedAt: "2026-11-01T10:00:00Z" },
      { food: "Banana", isCustom: false, reason: "preference", note: null, addedAt: "2026-11-21T10:00:00Z" },
      { food: "Pear", isCustom: false, reason: "preference", note: null, addedAt: "2026-11-20T10:00:00Z" },
    ]);
  });

  it("shows an unknown slug as-is and drops unusable rows", () => {
    const out = toReportFoodAvoidances([
      { food_slug: "retired-food", custom_food: null, reason: "reaction", note: null, created_at: "2026-11-01T00:00:00Z" },
      { food_slug: null, custom_food: "  ", reason: "reaction", note: null, created_at: "2026-11-01T00:00:00Z" },
      { food_slug: "pear", custom_food: null, reason: "allergy", note: null, created_at: "2026-11-01T00:00:00Z" },
    ]);
    expect(out.map((a) => a.food)).toEqual(["retired-food"]);
    expect(toReportFoodAvoidances(null)).toEqual([]);
  });
});
