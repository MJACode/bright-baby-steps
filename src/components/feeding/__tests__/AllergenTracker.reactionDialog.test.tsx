import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AllergenTracker from "@/components/feeding/AllergenTracker";

const FIRST_EXPOSURE_AT = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
const BACKDATED_AT = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

const { writes } = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: "insert" | "update" | "delete"; payload?: Record<string, unknown> }>,
}));

const PEANUT = {
  id: "allergen-peanut",
  slug: "peanut",
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
      if (state.op === "update") return { data: [{ id: INTRO.id }], error: null };
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

// The real wheel picker can't be driven from jsdom.
vi.mock("@/components/MobileDateTimePicker", () => ({
  MobileDateTimePicker: ({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label?: string }) => (
    <div>
      <span data-testid="picker-label">{label}</span>
      <span data-testid="picker-value">{value.toISOString()}</span>
      <button type="button" onClick={() => onChange(new Date(BACKDATED_AT))}>back-date</button>
    </div>
  ),
}));

const inserts = (table: string) => writes.filter((w) => w.table === table && w.op === "insert");

beforeEach(() => {
  writes.length = 0;
});

const openExposure2 = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AllergenTracker />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText("Peanut"));
  fireEvent.click(await screen.findByRole("button", { name: /Log Exposure #2/ }));
  return screen.findByRole("dialog");
};

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

  // No status write: two clean exposures no longer auto-complete. Before the
  // sign-off this path wrote status "completed" here.
  it("writes no status update for a clean exposure #2", async () => {
    await openExposure2();
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));
    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes.filter((w) => w.table === "allergen_introductions" && w.op === "update")).toHaveLength(0);
  });

  it("writes the back-dated When? time as logged_at", async () => {
    const dialog = await openExposure2();
    expect(dialog).toHaveTextContent("When?");
    const shown = new Date(screen.getByTestId("picker-value").textContent ?? "").getTime();
    expect(Math.abs(Date.now() - shown)).toBeLessThan(60_000);

    fireEvent.click(screen.getByRole("button", { name: "back-date" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")[0].payload).toMatchObject({
      exposure_number: 2,
      logged_at: BACKDATED_AT,
    });
  });

  it("saves a reaction at the chosen time and marks the introduction reaction_observed", async () => {
    await openExposure2();
    fireEvent.click(screen.getByRole("button", { name: "back-date" }));
    fireEvent.click(screen.getByRole("button", { name: /Mild/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hives" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(inserts("allergen_reactions")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")[0].payload).toMatchObject({ reaction_observed: true, logged_at: BACKDATED_AT });
    expect(inserts("allergen_reactions")[0].payload).toMatchObject({
      severity: "mild",
      symptoms: ["Hives"],
      observed_at: BACKDATED_AT,
    });
    await waitFor(() =>
      expect(writes.filter((w) => w.table === "allergen_introductions" && w.op === "update")).toHaveLength(1),
    );
    expect(writes.find((w) => w.table === "allergen_introductions" && w.op === "update")?.payload).toEqual({
      status: "reaction_observed",
      completed_at: null,
    });
  });
});
