import { forwardRef, useImperativeHandle } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FeedingPage from "@/pages/dashboard/FeedingPage";
import { FEEDING_ALLERGENS_PATH } from "@/lib/feedingRoutes";
import { routeForNotificationType } from "@/lib/notificationRoutes";

const { openSpy } = vi.hoisted(() => ({ openSpy: vi.fn() }));

vi.mock("@/components/feeding/FeedingLog", () => ({
  default: forwardRef<{ open: () => void }, { mode?: string }>(function FeedingLogStub({ mode = "milk" }, ref) {
    useImperativeHandle(ref, () => ({ open: openSpy }));
    return <div data-testid={`feeding-log-${mode}`} />;
  }),
}));
vi.mock("@/components/feeding/AllergenTracker", () => ({ default: () => <div data-testid="allergen-tracker" /> }));
vi.mock("@/components/PageInstructions", () => ({ PageInstructions: () => null }));
vi.mock("@/hooks/useChildren", () => ({ useChildren: () => ({ activeChild: { id: "child-1", name: "Rae" } }) }));
vi.mock("@/hooks/useAllergenData", () => ({
  useAllergens: () => ({ data: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}` })) }),
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

  it("lays out Solids as Log solids, allergens, then solids history", () => {
    renderAt("/dashboard/feeding?tab=solids");
    expect(selectedTab()).toHaveTextContent("Solids");
    const button = screen.getByRole("button", { name: "Log solids" });
    const tracker = screen.getByTestId("allergen-tracker");
    const history = screen.getByTestId("feeding-log-solids");
    expect(button.compareDocumentPosition(tracker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tracker.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("feeding-log-milk")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("opens the solids sheet from Log solids", () => {
    renderAt("/dashboard/feeding?tab=solids");
    fireEvent.click(screen.getByRole("button", { name: "Log solids" }));
    expect(openSpy).toHaveBeenCalledTimes(1);
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
