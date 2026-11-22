import { FIX_ROUTE, fixRouteFor, type OfflineLogVariables } from "@/lib/offlineLogs";

const base = { table: "feeding_logs" as const, rowId: "r1", childId: "c1", ownerId: "u1" };
const insert = (feeding_type: string): OfflineLogVariables => ({
  ...base,
  action: "insert",
  row: { id: "r1", child_id: "c1", feeding_type },
});

describe("fixRouteFor", () => {
  it("sends a failed solid to the Solids tab", () => {
    expect(fixRouteFor({ table: "feeding_logs", writes: [insert("solid")] }).href).toBe("/dashboard/feeding?tab=solids");
  });

  it("follows the latest write that set the type", () => {
    const retyped: OfflineLogVariables = { ...base, action: "update", patch: { feeding_type: "bottle" } };
    expect(fixRouteFor({ table: "feeding_logs", writes: [insert("solid"), retyped] })).toEqual(FIX_ROUTE.feeding_logs);
  });

  it("keeps milk feeds and other tables on their usual route", () => {
    expect(fixRouteFor({ table: "feeding_logs", writes: [insert("breast")] })).toEqual(FIX_ROUTE.feeding_logs);
    expect(fixRouteFor({ table: "sleep_logs", writes: [] })).toEqual(FIX_ROUTE.sleep_logs);
  });
});
