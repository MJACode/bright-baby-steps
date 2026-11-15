import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignsPage from "@/pages/dashboard/SignsPage";

const h = vi.hoisted(() => ({
  activeChild: null as Record<string, unknown> | null,
  signHook: vi.fn(),
}));

vi.mock("@/hooks/useChildren", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useChildren")>()),
  useChildren: () => ({ activeChild: h.activeChild }),
}));
vi.mock("@/components/AddChildDialog", () => ({ AddChildDialog: () => <button>Add child</button> }));
vi.mock("@/components/FeatureRequestCard", () => ({
  FeatureRequestCard: ({ feature, title }: { feature: string; title: string }) => (
    <div data-testid="request-card" data-feature={feature}>
      {title}
    </div>
  ),
}));
vi.mock("@/components/PremiumGate", () => ({
  PremiumGate: () => {
    throw new Error("PremiumGate must not render while the program is off");
  },
}));
vi.mock("@/hooks/useSignProgress", () => ({
  useSignProgress: h.signHook,
  useSetSignStatus: h.signHook,
  useSetSignFocus: h.signHook,
}));
vi.mock("@/hooks/useSignPractice", () => ({
  TOGGLE_SIGN_PRACTICE_KEY: ["toggle-sign-practice"],
  useSignPractice: h.signHook,
  useToggleSignPractice: h.signHook,
}));
vi.mock("@/hooks/useCurrentRole", () => ({
  useCurrentRoleQuery: h.signHook,
  assertCanWrite: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignsPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.activeChild = null;
  vi.clearAllMocks();
});

describe("SignsPage with the Sign Language program off", () => {
  it("shows the intro, the request card, and the safety footer without loading any sign data", () => {
    h.activeChild = { id: "child-1", name: "Rae Lee", date_of_birth: "2026-01-01", parent_id: "p-1" };
    renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign Language");
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText("Flare+")).not.toBeInTheDocument();
    expect(screen.getByText(/Signing doesn't delay talking/)).toBeInTheDocument();
    expect(screen.getByTestId("request-card")).toHaveAttribute("data-feature", "baby-signs");
    expect(screen.getByRole("link", { name: "Early Intervention resources" })).toHaveAttribute(
      "href",
      "/dashboard/early-intervention",
    );
    expect(screen.queryByText("All signs")).not.toBeInTheDocument();
    expect(h.signHook).not.toHaveBeenCalled();
  });

  it("keeps the add-a-child state when there's no child", () => {
    renderPage();
    expect(screen.getByText("Add a child to start signing together.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add child" })).toBeInTheDocument();
    expect(screen.queryByTestId("request-card")).not.toBeInTheDocument();
  });
});
