export type MilkFeedType = "breast" | "bottle" | "pump";

export const MILK_FEED_TYPES: readonly MilkFeedType[] = ["breast", "bottle", "pump"];

export function isMilkFeedType(value: unknown): value is MilkFeedType {
  return typeof value === "string" && (MILK_FEED_TYPES as readonly string[]).includes(value);
}

/**
 * Most-used first over the rows given (the caller scopes them to the last 7
 * days), ties in the default breast → bottle → pump order, and a pinned type
 * always first. Non-milk rows (solids) are ignored.
 */
export function orderFeedTypes(
  rows: ReadonlyArray<{ feeding_type: string }>,
  pinned: MilkFeedType | null = null,
): MilkFeedType[] {
  const counts: Record<MilkFeedType, number> = { breast: 0, bottle: 0, pump: 0 };
  for (const row of rows) {
    if (isMilkFeedType(row.feeding_type)) counts[row.feeding_type] += 1;
  }
  const rank = (t: MilkFeedType) => (t === pinned ? Infinity : counts[t]);
  // Array.prototype.sort is stable, so equal ranks keep MILK_FEED_TYPES order.
  return [...MILK_FEED_TYPES].sort((a, b) => rank(b) - rank(a));
}
