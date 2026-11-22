import { describe, expect, it } from "vitest";
import { orderFeedTypes } from "@/lib/feedTypeOrder";

const rows = (...types: string[]) => types.map((feeding_type) => ({ feeding_type }));

describe("orderFeedTypes", () => {
  it("keeps breast, bottle, pump with no history", () => {
    expect(orderFeedTypes([])).toEqual(["breast", "bottle", "pump"]);
  });

  it("puts the most-logged type first", () => {
    expect(orderFeedTypes(rows("bottle", "pump", "bottle", "breast", "bottle", "pump"))).toEqual([
      "bottle",
      "pump",
      "breast",
    ]);
  });

  it("breaks ties in the default order", () => {
    expect(orderFeedTypes(rows("pump", "bottle"))).toEqual(["bottle", "pump", "breast"]);
    expect(orderFeedTypes(rows("pump", "breast", "bottle"))).toEqual(["breast", "bottle", "pump"]);
  });

  it("ignores solids", () => {
    expect(orderFeedTypes(rows("solid", "solid", "solid", "pump"))).toEqual(["pump", "breast", "bottle"]);
  });

  it("always puts a pinned type first, even an unused one", () => {
    expect(orderFeedTypes(rows("bottle", "bottle", "breast"), "pump")).toEqual(["pump", "bottle", "breast"]);
  });

  it("still sorts the rest by usage under a pin", () => {
    expect(orderFeedTypes(rows("pump", "pump", "bottle"), "breast")).toEqual(["breast", "pump", "bottle"]);
  });
});
