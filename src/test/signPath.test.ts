import { describe, it, expect } from "vitest";
import {
  SIGN_LIBRARY,
  SIGN_PATH,
  SIGN_STAGES,
  getDefaultFocusSet,
  getNextFocusSet,
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

describe("getNextFocusSet", () => {
  const firstSet = ["milk", "more", "all-done"];
  const trying = (slugs: string[]): Record<string, string> =>
    Object.fromEntries(slugs.map((slug) => [slug, "emerging"]));

  it("moves past focus signs that are only at Trying it", () => {
    expect(getDefaultFocusSet(8, trying(firstSet))).toEqual(firstSet);
    expect(getNextFocusSet(8, trying(firstSet), firstSet)).toEqual({ kind: "set", signSlugs: ["eat", "water"] });
  });

  it("never offers a current focus sign", () => {
    const status = { milk: "introduced", more: "introduced", "all-done": "introduced" };
    const next = getNextFocusSet(8, status, firstSet);
    expect(next).toEqual({ kind: "set", signSlugs: ["eat", "water"] });
  });

  it("prefers new signs over earlier signs already at Trying it", () => {
    const status = { ...trying(firstSet), eat: "emerging", water: "emerging" };
    expect(getNextFocusSet(8, status, ["eat", "water"])).toEqual({
      kind: "set",
      signSlugs: ["sleep", "bath", "change"],
    });
  });

  it("only returns the new signs from a partly started set", () => {
    const status = { ...trying(firstSet), eat: "introduced" };
    expect(getNextFocusSet(8, status, firstSet)).toEqual({ kind: "set", signSlugs: ["water"] });
  });

  it("reports age-gated instead of skipping ahead", () => {
    const status = trying([...firstSet, "eat", "water", "sleep", "bath", "change"]);
    expect(getNextFocusSet(7, status, ["sleep", "bath", "change"])).toEqual({ kind: "age-gated" });
    expect(getNextFocusSet(8, status, ["sleep", "bath", "change"])).toEqual({
      kind: "set",
      signSlugs: ["mommy", "daddy"],
    });
  });

  it("falls back to unfinished signs once every sign has a status", () => {
    const status: Record<string, string> = { ...allSigning(), milk: "emerging", dog: "introduced" };
    expect(getNextFocusSet(24, status, ["dog"])).toEqual({ kind: "set", signSlugs: ["milk"] });
  });

  it("returns none when the only unfinished signs are the current focus signs", () => {
    const status: Record<string, string> = { ...allSigning(), dog: "emerging", cat: "introduced" };
    expect(getNextFocusSet(24, status, ["dog", "cat"])).toEqual({ kind: "none" });
  });

  it("returns none when every sign is signing", () => {
    expect(getNextFocusSet(24, allSigning(), [])).toEqual({ kind: "none" });
  });

  it("never returns more than 3 signs", () => {
    for (let age = 6; age <= 24; age++) {
      const next = getNextFocusSet(age, {}, []);
      if (next.kind === "set") expect(next.signSlugs.length).toBeLessThanOrEqual(3);
    }
  });
});
