import { describe, it, expect } from "vitest";
import {
  SIGN_LIBRARY,
  SIGN_PATH,
  SIGN_STAGES,
  getDefaultFocusSet,
} from "@/data/signLibrary";

const allSigning = (): Record<string, string> =>
  Object.fromEntries(SIGN_LIBRARY.map((s) => [s.slug, "signing"]));

const signingFor = (slugs: string[]): Record<string, string> =>
  Object.fromEntries(slugs.map((slug) => [slug, "signing"]));

describe("SIGN_PATH", () => {
  const pathSlugs = SIGN_PATH.flatMap((set) => set.signSlugs);
  const librarySlugs = SIGN_LIBRARY.map((s) => s.slug);

  it("uses only slugs that exist in the library", () => {
    for (const slug of pathSlugs) expect(librarySlugs).toContain(slug);
  });

  it("includes every library slug exactly once", () => {
    expect(pathSlugs).toHaveLength(librarySlugs.length);
    expect(new Set(pathSlugs)).toEqual(new Set(librarySlugs));
  });

  it("keeps every set between 2 and 3 signs", () => {
    for (const set of SIGN_PATH) {
      expect(set.signSlugs.length).toBeGreaterThanOrEqual(2);
      expect(set.signSlugs.length).toBeLessThanOrEqual(3);
    }
  });

  it("has unique set ids", () => {
    const ids = SIGN_PATH.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts with milk, more, all done", () => {
    expect(SIGN_PATH[0].signSlugs).toEqual(["milk", "more", "all-done"]);
  });

  it("sets fromMonths to the latest stage fromMonths among its signs", () => {
    for (const set of SIGN_PATH) {
      const stageMonths = set.signSlugs.map((slug) => {
        const sign = SIGN_LIBRARY.find((s) => s.slug === slug)!;
        return SIGN_STAGES.find((st) => st.id === sign.stageId)!.fromMonths;
      });
      expect(set.fromMonths).toBe(Math.max(...stageMonths));
    }
  });

  it("never decreases fromMonths along the path", () => {
    for (let i = 1; i < SIGN_PATH.length; i++) {
      expect(SIGN_PATH[i].fromMonths).toBeGreaterThanOrEqual(SIGN_PATH[i - 1].fromMonths);
    }
  });
});

describe("getDefaultFocusSet", () => {
  it("returns the first set for a 7-month-old with no progress", () => {
    expect(getDefaultFocusSet(7, {})).toEqual(["milk", "more", "all-done"]);
  });

  it("returns the first set for a 4-month-old", () => {
    expect(getDefaultFocusSet(4, {})).toEqual(["milk", "more", "all-done"]);
  });

  it("skips sets where every sign is signing", () => {
    const status = signingFor(["milk", "more", "all-done"]);
    expect(getDefaultFocusSet(7, status)).toEqual(["eat", "water"]);
  });

  it("returns only the non-signing slugs of a partially signed set", () => {
    const status = { milk: "signing", more: "trying", "all-done": undefined };
    expect(getDefaultFocusSet(7, status)).toEqual(["more", "all-done"]);
  });

  it("treats non-signing statuses as still to learn", () => {
    const status = { ...signingFor(["milk", "more"]), "all-done": "trying" };
    expect(getDefaultFocusSet(7, status)).toEqual(["all-done"]);
  });

  it("returns an empty array when every library sign is signing", () => {
    expect(getDefaultFocusSet(24, allSigning())).toEqual([]);
  });

  it("returns an empty array when the next unfinished set is not age-eligible yet", () => {
    const status = signingFor(["milk", "more", "all-done", "eat", "water", "sleep", "bath", "change"]);
    expect(getDefaultFocusSet(7, status)).toEqual([]);
    expect(getDefaultFocusSet(8, status)).toEqual(["mommy", "daddy"]);
  });

  it("does not skip ahead to a later set when an earlier set is not age-eligible", () => {
    const status = signingFor(["milk", "more", "all-done"]);
    expect(getDefaultFocusSet(6, status)).toEqual([]);
  });
});
