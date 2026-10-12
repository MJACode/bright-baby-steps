import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AllergenTracker from "@/components/feeding/AllergenTracker";

const FIRST_EXPOSURE_AT = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

const { writes } = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: "insert" | "update" | "delete"; payload?: Record<string, unknown> }>,
}));

const PEANUT = {
  id: "allergen-peanut",
  slug: "peanuts",
  name: "Peanut",
  sort_order: 1,
  introduction_age_weeks_min: 17,
  introduction_age_weeks_max: 26,
  clinical_guidance: "Offer thinned peanut butter.",
  clinical_source: "AAP",
  common_forms: [],
};

const INTRO = {
  id: "intro-1",
  allergen_id: PEANUT.id,
  child_id: "child-1",
  status: "in_progress",
  first_introduced_at: FIRST_EXPOSURE_AT,
  is_high_risk: false,
  allergen_exposure_logs: [
    { id: "log-1", exposure_number: 1, logged_at: FIRST_EXPOSURE_AT, reaction_observed: false },
  ],
};

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const state: { op?: "insert" | "update" | "delete"; payload?: Record<string, unknown> } = {};
    const result = () => {
      if (state.op) writes.push({ table, op: state.op, payload: state.payload });
      if (state.op === "insert" && table === "allergen_exposure_logs") {
        return { data: { id: "log-2", ...state.payload }, error: null };
      }
      if (!state.op && table === "allergens") return { data: [PEANUT], error: null };
      if (!state.op && table === "allergen_introductions") return { data: [INTRO], error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      insert: (payload: Record<string, unknown>) => {
        state.op = "insert";
        state.payload = payload;
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        state.op = "update";
        state.payload = payload;
        return chain;
      },
      delete: () => {
        state.op = "delete";
        return chain;
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  return { supabase: { from: (table: string) => makeChain(table) } };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));

vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ activeChild: { id: "child-1", name: "Rae", date_of_birth: "2026-01-01" } }),
}));

vi.mock("@/hooks/useCurrentRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCurrentRole")>();
  return { ...actual, useCurrentRoleQuery: () => ({ role: "owner", isResolved: true }) };
});

vi.mock("@/components/AddChildDialog", () => ({ AddChildDialog: () => null }));

const inserts = (table: string) => writes.filter((w) => w.table === table && w.op === "insert");

beforeEach(() => {
  writes.length = 0;
});

describe("AllergenTracker reaction dialog", () => {
  it("opens from the detail view and logs exposure #2 once", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AllergenTracker />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText("Peanut"));
    fireEvent.click(await screen.findByRole("button", { name: /Log Exposure #2/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Log Exposure #2");
    expect(dialog).toHaveTextContent("Any Reaction?");

    fireEvent.click(screen.getByRole("button", { name: /None/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")[0].payload).toMatchObject({
      allergen_introduction_id: INTRO.id,
      allergen_id: PEANUT.id,
      exposure_number: 2,
      reaction_observed: false,
    });
    expect(inserts("allergen_reactions")).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(inserts("allergen_exposure_logs")).toHaveLength(1);
  });
});
