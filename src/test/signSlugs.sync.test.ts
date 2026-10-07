import { describe, expect, it } from "vitest";
import { SIGN_LIBRARY } from "@/data/signLibrary";
import { SIGN_SLUGS } from "../../supabase/functions/_shared/signSlugs";

// Principle V lock (research R7): the edge function's slug allowlist must
// match the client library exactly, in order.
describe("SIGN_SLUGS sync", () => {
  it("matches SIGN_LIBRARY slugs in order", () => {
    expect([...SIGN_SLUGS]).toEqual(SIGN_LIBRARY.map((s) => s.slug));
  });

  it("has no duplicates", () => {
    expect(new Set(SIGN_SLUGS).size).toBe(SIGN_SLUGS.length);
  });
});
