import { shouldShowSignsPromo, type SignsPromoInput } from "@/lib/signsPromo";

const NOW = new Date(2024, 6, 15, 12);

function input(overrides: Partial<SignsPromoInput> = {}): SignsPromoInput {
  return {
    child: { date_of_birth: "2024-01-15" },
    briefingVisible: true,
    homeQuickTiles: ["food", "sleep", "diaper", "milestone"],
    dismissed: false,
    now: NOW,
    ...overrides,
  };
}

describe("shouldShowSignsPromo", () => {
  it("shows at 6 months", () => {
    expect(shouldShowSignsPromo(input())).toBe(true);
  });

  it("hides under 6 months", () => {
    expect(shouldShowSignsPromo(input({ child: { date_of_birth: "2024-01-16" } }))).toBe(false);
  });

  it("hides a preemie whose corrected age is under 6 months", () => {
    const child = { date_of_birth: "2024-01-15", is_premature: true, due_date: "2024-03-15" };
    expect(shouldShowSignsPromo(input({ child }))).toBe(false);
  });

  it("shows a preemie once corrected age reaches 6 months", () => {
    const child = { date_of_birth: "2023-11-15", is_premature: true, due_date: "2024-01-15" };
    expect(shouldShowSignsPromo(input({ child }))).toBe(true);
  });

  it("hides when the Sign Language tile is already on Home", () => {
    expect(
      shouldShowSignsPromo(input({ homeQuickTiles: ["food", "signs"] })),
    ).toBe(false);
  });

  it("hides once dismissed", () => {
    expect(shouldShowSignsPromo(input({ dismissed: true }))).toBe(false);
  });

  it("hides when the briefing is hidden", () => {
    expect(shouldShowSignsPromo(input({ briefingVisible: false }))).toBe(false);
  });

  it("hides for an expected baby and with no child", () => {
    expect(
      shouldShowSignsPromo(input({ child: { date_of_birth: "2024-09-01", is_expected: true } })),
    ).toBe(false);
    expect(shouldShowSignsPromo(input({ child: null }))).toBe(false);
  });
});
