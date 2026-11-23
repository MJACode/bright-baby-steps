import { forwardRef, useImperativeHandle } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FeedingPage from "@/pages/dashboard/FeedingPage";
import { FEEDING_ALLERGENS_PATH } from "@/lib/feedingRoutes";
import { routeForNotificationType } from "@/lib/notificationRoutes";

const { openSpy, child } = vi.hoisted(() => ({
  openSpy: vi.fn(),
  child: {
    current: {} as Record<string, unknown>,
  },
}));

const IDEA = {
  id: "i1",
  name: "Egg and spinach muffin",
  mealSlot: "breakfast",
  allergens: ["egg", "wheat"],
  foodCategory: "protein",
};

vi.mock("@/components/feeding/FeedingLog", () => ({
  default: forwardRef<{ open: () => void }, { mode?: string }>(function FeedingLogStub({ mode = "milk" }, ref) {
    useImperativeHandle(ref, () => ({ open: openSpy }));
    return <div data-testid={`feeding-log-${mode}`} />;
  }),
}));
vi.mock("@/components/feeding/AllergenTracker", () => ({ default: () => <div data-testid="allergen-tracker" /> }));
vi.mock("@/components/PageInstructions", () => ({ PageInstructions: () => null }));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ activeChild: child.current }),
  getAgeInMonths: (dob: string) => {
    const d = new Date(dob);
    const n = new Date();
    return (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth();
  },
}));
vi.mock("@/hooks/useCurrentRole", () => ({ useCurrentRoleQuery: () => ({ role: "owner", isResolved: true }) }));
vi.mock("@/components/feeding/SolidsMethodPicker", () => ({
  SolidsMethodPicker: ({ method }: { method: string | null }) => <div data-testid="method-picker">{method ?? "unset"}</div>,
}));
vi.mock("@/components/feeding/FoodAvoidList", () => ({ FoodAvoidList: () => <div data-testid="food-avoid-list" /> }));
vi.mock("@/components/feeding/MealPlanCard", () => ({
  MealPlanCard: ({ onLogIdea }: { onLogIdea: (idea: typeof IDEA) => void }) => (
    <button type="button" data-testid="meal-plan-card" onClick={() => onLogIdea(IDEA)}>
      Log this
    </button>
  ),
}));

const monthsAgo = (m: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - m);
  return d.toISOString().slice(0, 10);
};
vi.mock("@/hooks/useAllergenData", () => ({
  useAllergens: () => ({ data: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, slug: `s${i}` })) }),
  useAllergenIntroductions: () => ({
    data: [
      { allergen_id: "a0", status: "completed" },
      { allergen_id: "a1", status: "completed" },
      { allergen_id: "a2", status: "in_progress" },
    ],
  }),
}));

const scrollIntoView = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
beforeEach(() => {
  child.current = { id: "child-1", name: "Rae", date_of_birth: monthsAgo(8), solids_method: "mix" };
  scrollIntoView.mockClear();
  openSpy.mockClear();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dashboard/feeding" element={<FeedingPage />} />
        <Route path="/dashboard/vitamins" element={<div>Vitamins page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

const selectedTab = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");

describe("FeedingPage tabs", () => {
  it("has Feeding and Solids tabs, opening on Feeding with the milk log", () => {
    renderAt("/dashboard/feeding");
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.trim())).toEqual(["Feeding", "Solids2/9"]);
    expect(selectedTab()).toHaveTextContent("Feeding");
    expect(screen.getByTestId("feeding-log-milk")).toBeInTheDocument();
    expect(screen.queryByTestId("allergen-tracker")).not.toBeInTheDocument();
  });

  it("puts the allergen badge on Solids", () => {
    renderAt("/dashboard/feeding");
    expect(screen.getByLabelText("2 of 9 allergens introduced")).toBeInTheDocument();
  });

  it("lays out Solids as Log solids, method, meal plan, allergens, then solids history", () => {
    renderAt("/dashboard/feeding?tab=solids");
    expect(selectedTab()).toHaveTextContent("Solids");
    const button = screen.getByRole("button", { name: "Log solids" });
    const method = screen.getByTestId("method-picker");
    const plan = screen.getByTestId("meal-plan-card");
    const tracker = screen.getByTestId("allergen-tracker");
    const history = screen.getByTestId("feeding-log-solids");
    expect(button.compareDocumentPosition(method) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(method.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plan.compareDocumentPosition(tracker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tracker.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("feeding-log-milk")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("opens the solids sheet from Log solids", () => {
    renderAt("/dashboard/feeding?tab=solids");
    fireEvent.click(screen.getByRole("button", { name: "Log solids" }));
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("Log this on a meal idea opens the solids sheet prefilled from the idea", () => {
    renderAt("/dashboard/feeding?tab=solids");
    fireEvent.click(screen.getByTestId("meal-plan-card"));
    expect(openSpy).toHaveBeenCalledWith({
      foodDesc: "Egg and spinach muffin",
      foodCategory: "protein",
      allergenSlugs: ["egg", "wheat"],
    });
  });

  it("asks the feeding style before showing a meal plan", () => {
    child.current = { ...child.current, solids_method: null };
    renderAt("/dashboard/feeding?tab=solids");
    expect(screen.getByTestId("method-picker")).toHaveTextContent("unset");
    expect(screen.queryByTestId("meal-plan-card")).not.toBeInTheDocument();
  });

  it("under 4 months shows a gentle note instead of the picker and plan, and keeps Log solids", () => {
    child.current = { ...child.current, date_of_birth: monthsAgo(2) };
    renderAt("/dashboard/feeding?tab=solids");
    expect(screen.getByText(/Solids usually start around 6 months/)).toBeInTheDocument();
    expect(screen.queryByTestId("method-picker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("meal-plan-card")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log solids" })).toBeInTheDocument();
  });

  it("writes the tab back to the URL", () => {
    renderAt("/dashboard/feeding");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Solids/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/feeding?tab=solids");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Feeding/ }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/dashboard\/feeding$/);
  });

  it.each(["/dashboard/feeding?tab=allergens", FEEDING_ALLERGENS_PATH])(
    "%s opens Solids and brings the allergens into view",
    async (url) => {
      renderAt(url);
      expect(selectedTab()).toHaveTextContent("Solids");
      const section = screen.getByRole("region", { name: "Allergens" });
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(section);
      expect(document.activeElement).toBe(section);
    },
  );

  it("sends ?tab=supplements to the Vitamins page", () => {
    renderAt("/dashboard/feeding?tab=supplements");
    expect(screen.getByText("Vitamins page")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/vitamins");
  });

  it("routes the allergen push to the Solids allergens", () => {
    expect(routeForNotificationType("allergen_maintenance")).toBe(FEEDING_ALLERGENS_PATH);
    expect(FEEDING_ALLERGENS_PATH).toBe("/dashboard/feeding?tab=solids#allergens");
  });
});
