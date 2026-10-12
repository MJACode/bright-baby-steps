import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AllergenTracker from "@/components/feeding/AllergenTracker";

const FIRST_EXPOSURE_AT = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

const { writes, mockState } = vi.hoisted(() => ({
  writes: [] as Array<{
    table: string;
    op: "insert" | "update" | "delete";
    payload?: Record<string, unknown>;
    eqs: Array<[string, unknown]>;
  }>,
  mockState: { failReactionInsert: false, exposureInsertCount: 0 },
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
    const state: {
      op?: "insert" | "update" | "delete";
      payload?: Record<string, unknown>;
      eqs: Array<[string, unknown]>;
    } = { eqs: [] };
    const result = () => {
      if (state.op) writes.push({ table, op: state.op, payload: state.payload, eqs: state.eqs });
      if (state.op === "insert" && table === "allergen_exposure_logs") {
        mockState.exposureInsertCount += 1;
        return { data: { id: `log-new-${mockState.exposureInsertCount}`, ...state.payload }, error: null };
      }
      if (state.op === "insert" && table === "allergen_reactions" && mockState.failReactionInsert) {
        return { data: null, error: { message: "network down" } };
      }
      // Updates echo a row; deletes return none, i.e. an RLS-blocked rollback.
      if (state.op === "update") return { data: [{ id: "row" }], error: null };
      if (!state.op && table === "allergens") return { data: [PEANUT], error: null };
      if (!state.op && table === "allergen_introductions") return { data: [INTRO], error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        state.eqs.push([col, val]);
        return chain;
      },
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

const renderTracker = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AllergenTracker />
    </QueryClientProvider>,
  );

const openExposureTwo = async () => {
  renderTracker();
  fireEvent.click(await screen.findByText("Peanut"));
  fireEvent.click(await screen.findByRole("button", { name: /Log Exposure #2/ }));
  return screen.findByRole("dialog");
};

beforeEach(() => {
  writes.length = 0;
  mockState.failReactionInsert = false;
  mockState.exposureInsertCount = 0;
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

  it("retries a half-saved reaction against the orphaned exposure instead of inserting another", async () => {
    mockState.failReactionInsert = true;
    await openExposureTwo();

    fireEvent.click(screen.getByRole("button", { name: "Hives all over" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_reactions")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")).toHaveLength(1);
    const retry = await screen.findByRole("button", { name: "Save reaction" });
    expect(screen.getByRole("dialog")).toHaveTextContent("Log a reaction to exposure #2");

    mockState.failReactionInsert = false;
    fireEvent.click(retry);

    await waitFor(() => expect(inserts("allergen_reactions")).toHaveLength(2));
    expect(inserts("allergen_exposure_logs")).toHaveLength(1);
    expect(inserts("allergen_reactions")[1].payload).toMatchObject({
      exposure_log_id: "log-new-1",
      symptoms: ["Hives all over"],
    });
    const markReacted = writes.find(
      (w) => w.table === "allergen_exposure_logs" && w.op === "update" && w.payload?.reaction_observed === true,
    );
    expect(markReacted?.eqs).toContainEqual(["id", "log-new-1"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reverts an auto-bumped Mild to None when the last chip is removed", async () => {
    await openExposureTwo();

    const chip = screen.getByRole("button", { name: "Hives all over" });
    fireEvent.click(chip);
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")[0].payload).toMatchObject({ reaction_observed: false });
    expect(inserts("allergen_reactions")).toHaveLength(0);
  });

  it("keeps a Mild the parent picked when the last chip is removed", async () => {
    await openExposureTwo();

    fireEvent.click(screen.getByRole("button", { name: /Mild/ }));
    const chip = screen.getByRole("button", { name: "Hives all over" });
    fireEvent.click(chip);
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_reactions")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")[0].payload).toMatchObject({ reaction_observed: true });
    expect(inserts("allergen_reactions")[0].payload).toMatchObject({ severity: "mild", symptoms: [] });
  });

  it("keeps Mild when the parent confirms it after a chip bumped it", async () => {
    await openExposureTwo();

    const chip = screen.getByRole("button", { name: "Hives all over" });
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: /Mild/ }));
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_reactions")).toHaveLength(1));
    expect(inserts("allergen_reactions")[0].payload).toMatchObject({ severity: "mild", symptoms: [] });
  });
});
