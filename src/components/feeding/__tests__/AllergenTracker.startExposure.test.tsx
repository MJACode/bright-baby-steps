import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AllergenTracker from "@/components/feeding/AllergenTracker";
import { toast } from "@/hooks/use-toast";

const BACKDATED_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

const { writes, failures, roleState } = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: "insert" | "update" | "delete"; payload?: Record<string, unknown>; id?: string }>,
  failures: { exposureLogInsert: false, introInsertDuplicate: false, rollbackDeletesNothing: false },
  roleState: { role: "owner" },
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

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const state: { op?: "insert" | "update" | "delete"; payload?: Record<string, unknown>; id?: string } = {};
    const result = () => {
      if (state.op) writes.push({ table, op: state.op, payload: state.payload, id: state.id });
      if (state.op === "insert" && table === "allergen_exposure_logs" && failures.exposureLogInsert) {
        return { data: null, error: { code: "23502", message: "null value in column violates not-null constraint" } };
      }
      if (state.op === "insert" && table === "allergen_introductions" && failures.introInsertDuplicate) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      if (state.op === "insert" && table === "allergen_introductions") {
        return { data: { id: "intro-1", allergen_id: state.payload?.allergen_id }, error: null };
      }
      if (state.op === "delete") {
        return { data: failures.rollbackDeletesNothing ? [] : [{ id: state.id }], error: null };
      }
      if (!state.op && table === "allergens") return { data: [PEANUT], error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === "id") state.id = val;
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
  return { ...actual, useCurrentRoleQuery: () => ({ role: roleState.role, isResolved: true }) };
});

vi.mock("@/components/AddChildDialog", () => ({ AddChildDialog: () => null }));

// The real wheel picker can't be driven from jsdom.
vi.mock("@/components/MobileDateTimePicker", () => ({
  MobileDateTimePicker: ({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label?: string }) => (
    <div>
      <span data-testid="picker-label">{label}</span>
      <span data-testid="picker-value">{value.toISOString()}</span>
      <button type="button" onClick={() => onChange(new Date(BACKDATED_AT))}>
        back-date
      </button>
      <button type="button" onClick={() => onChange(new Date(Date.now() + 2 * 60 * 60 * 1000))}>
        future
      </button>
    </div>
  ),
}));

const renderTracker = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AllergenTracker />
    </QueryClientProvider>,
  );

const openPeanut = async () => {
  renderTracker();
  fireEvent.click(await screen.findByText("Peanut"));
  fireEvent.click(await screen.findByRole("button", { name: /Start First Exposure/ }));
  await screen.findByText("Log Peanut's first exposure?");
};

const inserts = (table: string) => writes.filter((w) => w.table === table && w.op === "insert");

beforeEach(() => {
  writes.length = 0;
  failures.exposureLogInsert = false;
  failures.introInsertDuplicate = false;
  failures.rollbackDeletesNothing = false;
  roleState.role = "owner";
  vi.mocked(toast).mockClear();
});

describe("AllergenTracker start first exposure", () => {
  it("opens a confirmation without writing, and writes once on confirm", async () => {
    await openPeanut();

    expect(screen.getByText("This starts the 2-hour watch and the 3-day wait for Rae.")).toBeInTheDocument();
    expect(screen.getByTestId("picker-label")).toHaveTextContent("When did Rae have it?");
    expect(inserts("allergen_introductions")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    expect(inserts("allergen_introductions")).toHaveLength(1);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "First exposure logged" })),
    );
  });

  it("writes the back-dated time to the introduction and the first exposure log", async () => {
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "back-date" }));
    expect(screen.getByTestId("picker-value")).toHaveTextContent(BACKDATED_AT);
    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    expect(inserts("allergen_introductions")[0].payload).toMatchObject({
      allergen_id: PEANUT.id,
      status: "in_progress",
      first_introduced_at: BACKDATED_AT,
    });
    expect(inserts("allergen_exposure_logs")[0].payload).toMatchObject({
      allergen_introduction_id: "intro-1",
      exposure_number: 1,
      logged_at: BACKDATED_AT,
    });
  });

  it("clamps a future time to now on both rows", async () => {
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "future" }));
    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() => expect(inserts("allergen_exposure_logs")).toHaveLength(1));
    const introAt = new Date(inserts("allergen_introductions")[0].payload?.first_introduced_at as string).getTime();
    expect(introAt).toBeLessThanOrEqual(Date.now());
    expect(inserts("allergen_exposure_logs")[0].payload?.logged_at).toBe(
      inserts("allergen_introductions")[0].payload?.first_introduced_at,
    );
  });

  it("deletes the introduction and shows an error when the exposure log fails", async () => {
    failures.exposureLogInsert = true;
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() =>
      expect(writes.find((w) => w.table === "allergen_introductions" && w.op === "delete")).toMatchObject({
        id: "intro-1",
      }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Couldn't log that exposure",
        description: "Nothing was saved. Check your connection and try again.",
        variant: "destructive",
      }),
    );
    expect(JSON.stringify(vi.mocked(toast).mock.calls)).not.toMatch(/not-null|violates/);
  });

  it("writes nothing when the parent taps Not yet", async () => {
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByText("Log Peanut's first exposure?")).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);

    // Prove the path is live: reopening and confirming does write, exactly once.
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Log exposure" }));
    await waitFor(() => expect(inserts("allergen_introductions")).toHaveLength(1));
    expect(inserts("allergen_exposure_logs")).toHaveLength(1);
  });

  it("resets the picker to now each time the dialog opens", async () => {
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: "back-date" }));
    expect(screen.getByTestId("picker-value")).toHaveTextContent(BACKDATED_AT);

    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByText("Log Peanut's first exposure?")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
    await screen.findByText("Log Peanut's first exposure?");

    const shown = new Date(screen.getByTestId("picker-value").textContent ?? "").getTime();
    expect(Math.abs(Date.now() - shown)).toBeLessThan(60_000);
  });

  it("says the next exposure date in the success toast", async () => {
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "First exposure logged",
          description: expect.stringContaining("Next exposure on"),
        }),
      ),
    );
  });

  it("shows Already started on a duplicate introduction and logs no exposure", async () => {
    failures.introInsertDuplicate = true;
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Already started",
        description: "Peanut was already started on another device. We've refreshed it.",
        variant: "destructive",
      }),
    );
    expect(inserts("allergen_introductions")).toHaveLength(1);
    expect(inserts("allergen_exposure_logs")).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Log Peanut's first exposure?")).not.toBeInTheDocument());
  });

  it("reports a half-saved start and closes the dialog when the rollback deletes nothing", async () => {
    failures.exposureLogInsert = true;
    failures.rollbackDeletesNothing = true;
    await openPeanut();

    fireEvent.click(screen.getByRole("button", { name: "Log exposure" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't log that exposure",
          description: expect.stringContaining("may show as In Progress. Remove its tracking"),
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("Log Peanut's first exposure?")).not.toBeInTheDocument());
  });

  it("hides Start First Exposure from a viewer", async () => {
    roleState.role = "viewer";
    renderTracker();
    fireEvent.click(await screen.findByText("Peanut"));

    await screen.findByText("Offer thinned peanut butter.");
    expect(screen.queryByRole("button", { name: /Start First Exposure/ })).not.toBeInTheDocument();
  });
});
