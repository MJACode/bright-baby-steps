import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import AllergenTracker from "@/components/feeding/AllergenTracker";
import { ACTION_PLAN } from "@/services/allergenService";

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
type Injection = { table: string; op: string; result: "error" | "empty" };

const { toastSpy, db } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  db: {
    calls: [] as Call[],
    introductions: [] as unknown[],
    reactions: [] as unknown[],
    // Consumed in order: the next matching write returns this instead of a row.
    inject: [] as Injection[],
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: toastSpy,
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ activeChild: { id: "c1", name: "Lulu", parent_id: "u1", date_of_birth: "2026-01-01" } }),
}));
vi.mock("@/hooks/useCurrentRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCurrentRole")>();
  return { ...actual, useCurrentRoleQuery: () => ({ role: "owner", isResolved: true }) };
});
vi.mock("@/components/AddChildDialog", () => ({ AddChildDialog: () => null }));

const ALLERGENS = [{
  id: "a1", name: "Peanuts", slug: "peanut", sort_order: 1,
  introduction_age_weeks_min: 17, introduction_age_weeks_max: 26,
  clinical_guidance: "Offer early.", clinical_source: "AAP", common_forms: [],
}];

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const resolve = () => {
      if (call.op === "select") {
        if (table === "allergens") return { data: ALLERGENS, error: null };
        if (table === "allergen_introductions") return { data: db.introductions, error: null };
        if (table === "allergen_reactions") return { data: db.reactions, error: null };
        return { data: [], error: null };
      }
      db.calls.push(call);
      const i = db.inject.findIndex((j) => j.table === table && j.op === call.op);
      if (i >= 0) {
        const [{ result }] = db.inject.splice(i, 1);
        if (result === "error") return { data: null, error: { message: `${table} ${call.op} failed` } };
        return { data: single ? null : [], error: null };
      }
      const row = { id: `${table}-new`, allergen_id: "a1" };
      return { data: single ? row : [row], error: null };
    };
    let single = false;
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: unknown) => { call.op = "insert"; call.payload = p; return b; },
      update: (p: unknown) => { call.op = "update"; call.payload = p; return b; },
      delete: () => { call.op = "delete"; return b; },
      eq: (c: string, v: unknown) => { call.filters.push([c, v]); return b; },
      in: (c: string, v: unknown) => { call.filters.push([c, v]); return b; },
      order: () => b,
      single: () => { single = true; return b; },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolve()).then(res, rej),
    };
    return b;
  };
  return { supabase: { from } };
});

type Exposure = {
  id: string; logged_at: string; exposure_number: number; reaction_observed: boolean | null;
  observation_window_ends_at?: string | null;
};

const intro = (exposures: Exposure[], status = "in_progress") => ({
  id: "i1", allergen_id: "a1", child_id: "c1", status, is_high_risk: false,
  first_introduced_at: exposures[0]?.logged_at ?? null,
  allergen_exposure_logs: exposures,
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function renderOpenPeanuts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AllergenTracker />
    </QueryClientProvider>,
  );
  return screen.findByText("Peanuts").then((card) => fireEvent.click(card));
}

const writes = (table: string, op: string) => db.calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  db.calls = [];
  db.reactions = [];
  db.introductions = [];
  db.inject = [];
  toastSpy.mockClear();
});

describe("AllergenTracker", () => {
  it("asks before starting and only writes on the confirm button", async () => {
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Before you offer Peanuts")).toBeInTheDocument();
    expect(within(dialog).getByText("Get emergency help now — call 911 if you see")).toBeInTheDocument();
    expect(db.calls).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: /Start — I'll watch for 2 hours/ }));
    await waitFor(() => expect(writes("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writes("allergen_introductions", "insert")).toHaveLength(1);
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "First exposure logged",
      description: expect.stringMatching(/^Keep watching until .+\. Offer it again on another day, in the next few days\.$/),
    })));
  });

  it("opens the emergency list by default during the 2-hour window", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    expect(screen.getByText(/Watching until/)).toBeInTheDocument();
    expect(screen.getByText("Get emergency help now — call 911 if you see")).toBeInTheDocument();
  });

  it("keeps the emergency list one tap away after the window closes", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(300), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    expect(screen.queryByText(/Watching until/)).not.toBeInTheDocument();
    expect(screen.queryByText("Get emergency help now — call 911 if you see")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /What to watch for/ })[0]);
    expect(screen.getByText("Get emergency help now — call 911 if you see")).toBeInTheDocument();
  });

  it("logs a reaction against exposure #1 by updating it, not inserting a new exposure", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log a reaction/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /None/ })).not.toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save reaction" });
    expect(save).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Hives" }));
    expect(within(dialog).getByText("Call your pediatrician now")).toBeInTheDocument();
    fireEvent.click(save);

    await waitFor(() => expect(writes("allergen_introductions", "update")).toHaveLength(1));
    expect(writes("allergen_exposure_logs", "insert")).toHaveLength(0);
    const [logUpdate] = writes("allergen_exposure_logs", "update");
    expect(logUpdate.payload).toEqual({ reaction_observed: true });
    expect(logUpdate.filters).toContainEqual(["id", "e1"]);
    const [rx] = writes("allergen_reactions", "insert");
    expect(rx.payload).toMatchObject({ exposure_log_id: "e1", severity: "mild", symptoms: ["Hives"] });
    expect(writes("allergen_introductions", "update")[0].payload).toEqual({ status: "reaction_observed", completed_at: null });
  });

  it("shows the 911 banner for Mild + trouble breathing", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log a reaction/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Mild/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Trouble breathing or hoarse cry" }));
    expect(within(dialog).getByText("Get emergency help now — call 911")).toBeInTheDocument();
    expect(within(dialog).getByText(ACTION_PLAN)).toBeInTheDocument();
  });

  it("ends a note-level reaction with the action-plan line", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log a reaction/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fussiness" }));
    expect(within(dialog).queryByText("Call your pediatrician now")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Get emergency help now — call 911")).not.toBeInTheDocument();
    expect(within(dialog).getByText(ACTION_PLAN)).toBeInTheDocument();
  });

  it("opens the exposure #2 dialog and routes two-area chips picked at None to the pediatrician", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Log Exposure #2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Rash" }));
    expect(within(dialog).getByText("Call your pediatrician now")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Vomited once" }));
    expect(within(dialog).getByText("Call your pediatrician now")).toBeInTheDocument();
    expect(within(dialog).queryByText("Get emergency help now — call 911")).not.toBeInTheDocument();
    expect(within(dialog).getByText(ACTION_PLAN)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save Exposure" }));
    await waitFor(() => expect(writes("allergen_introductions", "update")).toHaveLength(1));
    expect(writes("allergen_exposure_logs", "insert")[0].payload).toMatchObject({ exposure_number: 2, reaction_observed: true });
    expect(writes("allergen_reactions", "insert")[0].payload).toMatchObject({ severity: "mild", symptoms: ["Rash", "Vomiting"] });
    expect(writes("allergen_introductions", "update")[0].payload).toEqual({ status: "reaction_observed", completed_at: null });
  });

  it("keeps the triage toast when the status write fails, with the warning appended", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    db.inject = [{ table: "allergen_introductions", op: "update", result: "error" }];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log a reaction/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hives" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save reaction" }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    const [shown] = toastSpy.mock.calls[0] as [{ title: string; description: string; variant?: string }];
    expect(shown.title).toBe("Reaction saved");
    expect(shown.description).toMatch(/^Call your pediatrician now\. Make an allergy action plan/);
    expect(shown.description).toMatch(/may not show this reaction/);
    expect(shown.variant).toBeUndefined();
  });

  it("rolls back the new exposure when the reaction row fails to save", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false }])];
    db.inject = [{ table: "allergen_reactions", op: "insert", result: "error" }];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Rash" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(writes("allergen_exposure_logs", "delete")).toHaveLength(1));
    expect(writes("allergen_exposure_logs", "delete")[0].filters).toContainEqual(["id", "allergen_exposure_logs-new"]);
    expect(writes("allergen_introductions", "update")).toHaveLength(0);
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringMatching(/didn't save and nothing was changed/),
      variant: "destructive",
    })));
  });

  it("restores the existing exposure when its reaction row fails to save", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    db.inject = [{ table: "allergen_reactions", op: "insert", result: "error" }];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log a reaction/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Rash" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save reaction" }));

    await waitFor(() => expect(writes("allergen_exposure_logs", "update")).toHaveLength(2));
    expect(writes("allergen_exposure_logs", "update")[1].payload).toEqual({ reaction_observed: false });
  });

  it("says the save is half-done when the rollback touches zero rows", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false }])];
    db.inject = [
      { table: "allergen_reactions", op: "insert", result: "error" },
      { table: "allergen_exposure_logs", op: "delete", result: "empty" },
    ];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Rash" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringMatching(/symptoms didn't save, but this exposure is marked as a reaction/),
    })));
  });

  it("says Start is half-done when the intro rollback touches zero rows", async () => {
    db.inject = [
      { table: "allergen_exposure_logs", op: "insert", result: "error" },
      { table: "allergen_introductions", op: "delete", result: "empty" },
    ];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Start — I'll watch for 2 hours/ }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringMatching(/We couldn't log the first exposure/),
    })));
  });

  // Renamed only: "completed" now means the parent signed off, not auto-completion.
  it("logs a reaction to exposure #2 after sign-off by updating that exposure", async () => {
    db.introductions = [intro([
      { id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false },
      { id: "e2", logged_at: minutesAgo(30), exposure_number: 2, reaction_observed: false },
    ], "completed")];
    await renderOpenPeanuts();
    expect(screen.getByText("Successfully Introduced!")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Log a reaction to exposure #2" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Log a reaction to exposure #2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hives" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save reaction" }));

    await waitFor(() => expect(writes("allergen_introductions", "update")).toHaveLength(1));
    expect(writes("allergen_exposure_logs", "insert")).toHaveLength(0);
    expect(writes("allergen_exposure_logs", "update")[0].filters).toContainEqual(["id", "e2"]);
    expect(writes("allergen_reactions", "insert")[0].payload).toMatchObject({ exposure_log_id: "e2" });
    expect(writes("allergen_introductions", "update")[0].payload).toEqual({ status: "reaction_observed", completed_at: null });
  });

  it("hides Log a reaction once the latest exposure has one, and for a safe override", async () => {
    db.introductions = [intro([
      { id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false },
      { id: "e2", logged_at: minutesAgo(30), exposure_number: 2, reaction_observed: false },
    ], "safe")];
    await renderOpenPeanuts();
    expect(screen.queryByRole("button", { name: /Log a reaction/ })).not.toBeInTheDocument();
  });

  // Changed for the sign-off model: #290 asserted these controls were gone
  // because two clean exposures auto-completed. Now they wait for the parent,
  // and Flag for Review routes into #290's "Log a reaction" flow on exposure #2.
  it("asks for sign-off after two clean exposures; Flag for Review logs a reaction on exposure #2", async () => {
    db.introductions = [intro([
      { id: "e1", logged_at: minutesAgo(8 * 24 * 60), exposure_number: 1, reaction_observed: false },
      { id: "e2", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 2, reaction_observed: false },
    ])];
    await renderOpenPeanuts();
    expect(screen.getByText("Did Lulu eat a typical portion with no reaction?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yes, it's on the menu/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Successfully Introduced/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Flag for Review/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Log a reaction to exposure #2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hives" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save reaction" }));

    await waitFor(() => expect(writes("allergen_introductions", "update")).toHaveLength(1));
    expect(writes("allergen_exposure_logs", "insert")).toHaveLength(0);
    expect(writes("allergen_exposure_logs", "update")[0].filters).toContainEqual(["id", "e2"]);
    expect(writes("allergen_introductions", "update")[0].payload).toEqual({ status: "reaction_observed", completed_at: null });
  });

  it("saves a severity-only reaction with no chips", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(30), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log a reaction/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Pick how strong it is or what you see/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Moderate/ }));
    const save = within(dialog).getByRole("button", { name: "Save reaction" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(writes("allergen_reactions", "insert")).toHaveLength(1));
    expect(writes("allergen_reactions", "insert")[0].payload).toMatchObject({ severity: "moderate", symptoms: [] });
  });

  it("stays saveable after every auto-bumping chip is deselected", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fussiness" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Fussiness" }));
    expect(within(dialog).getByRole("button", { name: "Save Exposure" })).toBeEnabled();
  });

  it("writes one exposure on a double tap of Save", async () => {
    db.introductions = [intro([{ id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false }])];
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save Exposure" });
    fireEvent.click(save);
    fireEvent.click(save);
    // Changed for the sign-off model: a clean #2 no longer writes the intro
    // status, so wait on the toast instead of the auto-complete update.
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(writes("allergen_exposure_logs", "insert")).toHaveLength(1);
    expect(writes("allergen_introductions", "update")).toHaveLength(0);
  });

  it("starts once on a double tap of Start", async () => {
    await renderOpenPeanuts();
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
    const dialog = await screen.findByRole("dialog");
    const start = within(dialog).getByRole("button", { name: /Start — I'll watch for 2 hours/ });
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(writes("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writes("allergen_introductions", "insert")).toHaveLength(1);
  });

  it("shows the watch line on the card of the exposure it belongs to, using the stored window", async () => {
    const storedEnd = new Date(Date.now() + 150 * 60_000);
    db.introductions = [intro([
      { id: "e1", logged_at: minutesAgo(4 * 24 * 60), exposure_number: 1, reaction_observed: false },
      {
        id: "e2", logged_at: minutesAgo(30), exposure_number: 2, reaction_observed: false,
        observation_window_ends_at: storedEnd.toISOString(),
      },
    ], "completed")];
    await renderOpenPeanuts();
    const line = screen.getByText(/Watching until/);
    expect(line.textContent).toContain(format(storedEnd, "h:mm a"));
    const step3 = screen.getByText("Second Exposure").closest("div.flex-1") as HTMLElement;
    expect(within(step3).getByText(/Watching until/)).toBeInTheDocument();
    expect(within(step3).getByText("Get emergency help now — call 911 if you see")).toBeInTheDocument();
    const step1 = screen.getByText("First Exposure").closest("div.flex-1") as HTMLElement;
    expect(within(step1).queryByText(/Watching until/)).not.toBeInTheDocument();
    expect(within(step1).queryByText("Get emergency help now — call 911 if you see")).not.toBeInTheDocument();
  });

  it("uses nut-free safe-form copy for a non-nut allergen", async () => {
    ALLERGENS[0] = { ...ALLERGENS[0], name: "Milk", slug: "milk" };
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<QueryClientProvider client={client}><AllergenTracker /></QueryClientProvider>);
      fireEvent.click(await screen.findByText("Milk"));
      fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Serve it in a baby-safe form — soft, thinned, or pureed.")).toBeInTheDocument();
      expect(within(dialog).queryByText(/nut butter/)).not.toBeInTheDocument();
    } finally {
      ALLERGENS[0] = { ...ALLERGENS[0], name: "Peanuts", slug: "peanut" };
    }
  });
});
