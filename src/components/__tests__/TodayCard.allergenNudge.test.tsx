import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayCard } from "@/components/TodayCard";
import type { Preferences } from "@/hooks/usePreferences";

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const { allergenData, signs } = vi.hoisted(() => ({
  allergenData: { intros: [] as unknown[], enabledFor: [] as (string | undefined)[] },
  signs: { programEnabled: false, enabledFor: [] as (string | undefined)[] },
}));

vi.mock("@/lib/signsPromo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/signsPromo")>()),
  get SIGNS_PROGRAM_ENABLED() {
    return signs.programEnabled;
  },
}));

vi.mock("@/hooks/useSignProgress", () => ({
  useSignProgress: (childId: string | undefined) => {
    signs.enabledFor.push(childId);
    return { data: {}, isPending: false, isError: false };
  },
}));
vi.mock("@/hooks/useSignPractice", () => ({
  useSignPractice: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useAllergenData", () => ({
  useAllergens: () => ({
    data: [
      { id: "a-peanut", slug: "peanut", name: "Peanut" },
      { id: "a-egg", slug: "egg", name: "Egg" },
    ],
  }),
  useAllergenIntroductions: (childId: string | undefined) => {
    allergenData.enabledFor.push(childId);
    return { data: childId ? allergenData.intros : undefined };
  },
}));

const servings = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    exposure_number: i + 1,
    logged_at: ago((count - i) * DAY / 2),
    reaction_observed: false,
  }));

const basePrefs = {
  homeQuickTiles: ["food", "sleep", "diaper", "milestone"],
  signsPromoDismissed: true,
  signsNudgeSnoozedUntil: null,
  allergenNudgeDismissedFor: null,
} as unknown as Preferences;

const child = (dob: string) => ({ id: "child-1", name: "Rae", date_of_birth: dob });

const renderCard = (dob: string, prefs: Preferences = basePrefs, setPrefs = vi.fn(), showWhatToExpect = false) =>
  render(
    <MemoryRouter>
      <TodayCard activeChild={child(dob)} showWhatToExpect={showWhatToExpect} prefs={prefs} setPrefs={setPrefs} />
    </MemoryRouter>,
  );

beforeEach(() => {
  allergenData.enabledFor.length = 0;
  signs.enabledFor.length = 0;
  signs.programEnabled = false;
  // Peanut: signed off, 2 protocol exposures only → 0 of 3 servings, due.
  // Egg: signed off with 2 servings this week → on target.
  allergenData.intros = [
    { allergen_id: "a-peanut", status: "completed", allergen_exposure_logs: servings(2) },
    { allergen_id: "a-egg", status: "completed", allergen_exposure_logs: servings(4) },
  ];
});

describe("TodayCard allergen nudge", () => {
  it("names the due allergens and links to the allergen tracker", () => {
    renderCard("2026-01-01");
    const link = screen.getByRole("link", { name: /Keep it on the menu: Peanut due this week/ });
    expect(link).toHaveAttribute("href", "/dashboard/feeding?tab=solids#allergens");
    expect(screen.queryByText(/Egg/)).not.toBeInTheDocument();
  });

  it("hides for the rest of the day when dismissed", () => {
    const setPrefs = vi.fn();
    renderCard("2026-01-01", basePrefs, setPrefs);
    fireEvent.click(screen.getByRole("button", { name: "Hide until tomorrow" }));
    const [[update]] = setPrefs.mock.calls;
    expect(update.allergenNudgeDismissedFor).toMatch(/^child-1:\d{4}-\d{2}-\d{2}$/);

    renderCard("2026-01-01", { ...basePrefs, allergenNudgeDismissedFor: update.allergenNudgeDismissedFor });
    expect(screen.getAllByRole("link", { name: /Keep it on the menu/ })).toHaveLength(1);
  });

  it("stays quiet in the first week after sign-off", () => {
    allergenData.intros = [
      { allergen_id: "a-peanut", status: "completed", completed_at: ago(6 * DAY), allergen_exposure_logs: servings(2) },
    ];
    const { container } = renderCard("2026-01-01");
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when every introduced allergen is on target", () => {
    allergenData.intros = [{ allergen_id: "a-peanut", status: "completed", allergen_exposure_logs: servings(5) }];
    const { container } = renderCard("2026-01-01");
    expect(container).toBeEmptyDOMElement();
  });

  it("is not shown, and doesn't fetch, for a child 36 months or older", () => {
    const { container } = renderCard("2022-01-01");
    expect(container).toBeEmptyDOMElement();
    expect(allergenData.enabledFor.every((id) => id === undefined)).toBe(true);
  });
});

describe("TodayCard sign slot", () => {
  const promoPrefs = { ...basePrefs, signsPromoDismissed: false } as Preferences;

  it("shows the first-time promo while the Sign Language program is on", () => {
    signs.programEnabled = true;
    renderCard("2026-01-01", promoPrefs, vi.fn(), true);
    expect(screen.getByText(/A great age to start signing with Rae/)).toBeInTheDocument();
    expect(signs.enabledFor).toContain("child-1");
  });

  it("hides the promo and skips the sign queries while the program is off", () => {
    renderCard("2026-01-01", promoPrefs, vi.fn(), true);
    expect(screen.queryByText(/start signing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Home Screen" })).not.toBeInTheDocument();
    expect(signs.enabledFor.every((id) => id === undefined)).toBe(true);
  });
});
