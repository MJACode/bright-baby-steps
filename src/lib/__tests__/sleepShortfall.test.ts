import { SHORTFALL_ESCALATION_COPY, SHORTFALL_ESCALATION_HOURS } from "@/lib/sleepPlan";
import { getAgeBucket, type AgeBucket } from "@/lib/sleepTriage";

// The one note calm mode cannot switch off. Its thresholds are a safety floor,
// not a reference range, so every value is pinned here: an edit that lowers one
// has to be deliberate and has to say so, which is exactly what stopped the
// original `displayMinimum * 0.7` derivation from silently following a
// correction to the age bands.
describe("SHORTFALL_ESCALATION_HOURS", () => {
  it("holds the reviewed floor for every bucket", () => {
    expect(SHORTFALL_ESCALATION_HOURS).toEqual({
      "0-3mo": 9.8,
      "3-6mo": 9.8,
      "6-9mo": 8.4,
      "9-12mo": 8.4,
      "12-18mo": 7.7,
      "18-24mo": 7.7,
      "2-3yr": 7.7,
      "3yr+": 7.7,
    });
  });

  it("covers every bucket a child can be banded into", () => {
    const buckets: AgeBucket[] = [1, 4, 7, 10, 14, 20, 30, 42].map(getAgeBucket);
    for (const bucket of buckets) {
      expect(SHORTFALL_ESCALATION_HOURS[bucket]).toBeGreaterThan(0);
    }
    expect(new Set(buckets).size).toBe(Object.keys(SHORTFALL_ESCALATION_HOURS).length);
  });

  it("never rises with age — an older child needs less, never more", () => {
    const inOrder: AgeBucket[] = [
      "0-3mo",
      "3-6mo",
      "6-9mo",
      "9-12mo",
      "12-18mo",
      "18-24mo",
      "2-3yr",
      "3yr+",
    ];
    for (let i = 1; i < inOrder.length; i++) {
      expect(SHORTFALL_ESCALATION_HOURS[inOrder[i]]).toBeLessThanOrEqual(
        SHORTFALL_ESCALATION_HOURS[inOrder[i - 1]],
      );
    }
  });

  it("points at a pediatrician rather than stating a verdict", () => {
    expect(SHORTFALL_ESCALATION_COPY).toContain("pediatrician");
    expect(SHORTFALL_ESCALATION_COPY).not.toMatch(/%|\bscore\b|\bpoor\b|\bbad\b/i);
  });
});
