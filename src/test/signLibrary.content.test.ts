import { SIGN_LIBRARY, SIGN_STAGES, type Sign } from "@/data/signLibrary";

// Principle I / FR-006–FR-007: no pressure, deficit, or guilt wording.
const BANNED = /streak|in a row|missed|haven't|behind|delay|should/i;

// The v1 program constants (SIGNS_WHY, SIGNS_EXPECTATIONS, SIGNS_RED_FLAG, …)
// are SLP-vetted and locked by FR-008, and some of them name these words on
// purpose — "Signing doesn't delay talking" is the myth they exist to correct.
// So the check covers every per-sign and per-stage string instead.
function signCopy(sign: Sign): string[] {
  return [
    sign.label,
    sign.howTo,
    sign.whenToUse,
    sign.tip ?? "",
    sign.steps.model,
    sign.steps.prompt,
    sign.steps.celebrate,
    sign.stuckTip,
  ];
}

describe("signLibrary content", () => {
  it.each(SIGN_LIBRARY.map((s) => [s.slug, s] as const))(
    "%s has Model / Prompt / Celebrate steps and a stuck tip",
    (_slug, sign) => {
      expect(sign.steps.model.trim()).not.toBe("");
      expect(sign.steps.prompt.trim()).not.toBe("");
      expect(sign.steps.celebrate.trim()).not.toBe("");
      expect(sign.stuckTip.trim()).not.toBe("");
    },
  );

  it("uses no pressure or deficit wording in sign or stage copy", () => {
    const copy = [
      ...SIGN_LIBRARY.flatMap((s) => signCopy(s).map((text) => ({ where: s.slug, text }))),
      ...SIGN_STAGES.flatMap((s) => [s.title, s.subtitle].map((text) => ({ where: s.id, text }))),
    ];
    const hits = copy.filter(({ text }) => BANNED.test(text));
    expect(hits).toEqual([]);
  });

  it("has unique kebab-case slugs", () => {
    const slugs = SIGN_LIBRARY.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("puts every sign in a known stage", () => {
    const stageIds = new Set(SIGN_STAGES.map((s) => s.id));
    for (const sign of SIGN_LIBRARY) expect(stageIds.has(sign.stageId)).toBe(true);
  });
});
