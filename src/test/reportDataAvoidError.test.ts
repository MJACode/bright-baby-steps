import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ failAvoids: false }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) c[m] = () => c;
    c.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === "child_food_avoidances" && h.failAvoids
          ? { data: null, error: { code: "42P01", message: "relation does not exist" } }
          : table === "child_food_avoidances"
            ? { data: [{ food_slug: "banana", custom_food: null, reason: "preference", note: null, created_at: "2026-11-20T00:00:00Z" }], error: null }
            : { data: [], error: null },
      ).then(resolve);
    return c;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import { fetchReportData } from "@/services/reportDataService";

const allergensOnly = new Set(["allergens"]) as Parameters<typeof fetchReportData>[3];

describe("fetchReportData food avoidances", () => {
  it("flags a failed avoid-list read instead of reporting an empty list", async () => {
    h.failAvoids = true;
    const data = await fetchReportData("child-1", new Date("2026-11-01"), new Date("2026-11-22"), allergensOnly);
    expect(data.foodAvoidancesError).toBe(true);
    expect(data.foodAvoidances).toEqual([]);
  });

  it("is not flagged when the read works, or when the section isn't picked", async () => {
    h.failAvoids = false;
    const ok = await fetchReportData("child-1", new Date("2026-11-01"), new Date("2026-11-22"), allergensOnly);
    expect(ok.foodAvoidancesError).toBe(false);
    expect(ok.foodAvoidances.map((a) => a.food)).toEqual(["Banana"]);

    h.failAvoids = true;
    const skipped = await fetchReportData("child-1", new Date("2026-11-01"), new Date("2026-11-22"), new Set(["feeding"]) as Parameters<typeof fetchReportData>[3]);
    expect(skipped.foodAvoidancesError).toBe(false);
  });
});
