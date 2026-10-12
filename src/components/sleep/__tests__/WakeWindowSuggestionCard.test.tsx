import { render, screen } from "@testing-library/react";

import { WakeWindowSuggestionCard } from "@/components/sleep/WakeWindowSheet";

const state = vi.hoisted(() => ({ role: "owner" as string, isPremium: true }));

vi.mock("@/hooks/useCurrentRole", () => ({
  useCurrentRoleQuery: () => ({ role: state.role, isResolved: true }),
}));
vi.mock("@/hooks/usePremium", () => ({
  usePremium: () => ({ isPremium: state.isPremium, isLoading: false }),
  useChildOwnerPremium: () => ({ isChildOwnerPremium: false, isLoading: false }),
  PREMIUM_FEATURES: { predictions: "Predictions" },
}));
vi.mock("@/hooks/useChildren", () => ({ useChildren: () => ({ activeChild: { id: "child-1" } }) }));
vi.mock("@/components/UpgradeSheet", () => ({ UpgradeSheet: () => null }));
vi.mock("@/hooks/useSleepPlan", () => ({
  useWakeWindowDecision: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderCard = (hasSavedPlan = true) =>
  render(
    <WakeWindowSuggestionCard
      child={{ id: "child-1", parent_id: "parent-1", name: "Lulu" }}
      suggestion={{ kind: "stretch", fromMin: 98, toMin: 108 }}
      hasSavedPlan={hasSavedPlan}
    />,
  );

beforeEach(() => {
  state.role = "owner";
  state.isPremium = true;
});

describe("WakeWindowSuggestionCard visibility", () => {
  it("shows Try it to a Flare+ owner with a saved plan", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Try it" })).toBeInTheDocument();
  });

  it("is hidden without a saved plan", () => {
    renderCard(false);
    expect(screen.queryByRole("button", { name: "Try it" })).toBeNull();
  });

  it.each(["viewer", "caregiver"])("is hidden for a %s", (role) => {
    state.role = role;
    renderCard();
    expect(screen.queryByRole("button", { name: "Try it" })).toBeNull();
  });

  it("is hidden on the free tier", () => {
    state.isPremium = false;
    const { container } = renderCard();
    expect(screen.queryByRole("button", { name: "Try it" })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
