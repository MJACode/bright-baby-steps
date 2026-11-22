import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedingLog from "@/components/feeding/FeedingLog";
import { toast } from "@/hooks/use-toast";
import { REACTION_NOTED_DESCRIPTION, REACTION_SAVED_TOAST } from "@/services/allergenService";
import { AVOID_OTHER_SAVED_NOTE, LOG_REACTION_PEDIATRICIAN_NUDGE } from "@/lib/solidsAvoidCopy";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Write = { table: string; op: "insert" | "update" | "upsert" | "delete"; payload: Record<string, unknown> };

const { writes, state } = vi.hoisted(() => ({
  writes: [] as Write[],
  state: { eggFirstMsAgo: 0 },
}));

const allergen = (id: string, slug: string, name: string, sort_order: number) => ({ id, slug, name, sort_order });
const PEANUT = allergen("a-peanut", "peanut", "Peanut", 1);
const EGG = allergen("a-egg", "egg", "Egg", 2);
const MILK = allergen("a-milk", "milk", "Cow's Milk (Dairy)", 3);
const WHEAT = allergen("a-wheat", "wheat", "Wheat", 4);

const exposure = (id: string, n: number, msAgo: number, reaction = false) => ({
  id, exposure_number: n, logged_at: ago(msAgo), reaction_observed: reaction,
});

// Peanut is signed off, egg is partway, milk had a reaction, wheat isn't started.
const intros = () => [
  {
    id: "i-peanut", allergen_id: PEANUT.id, status: "completed", completed_at: ago(20 * DAY),
    allergen_exposure_logs: [exposure("p1", 1, 30 * DAY), exposure("p2", 2, 25 * DAY)],
  },
  { id: "i-egg", allergen_id: EGG.id, status: "in_progress", completed_at: null, allergen_exposure_logs: [exposure("e1", 1, state.eggFirstMsAgo)] },
  {
    id: "i-milk", allergen_id: MILK.id, status: "reaction_observed", completed_at: null,
    allergen_exposure_logs: [exposure("m1", 1, 10 * DAY, true)],
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const s: { op?: Write["op"]; payload?: Record<string, unknown>; introId?: string; exposureNumber?: number } = {};
    const result = () => {
      if (s.op) writes.push({ table, op: s.op, payload: s.payload ?? {} });
      if ((s.op === "insert" || s.op === "upsert") && table === "child_food_avoidances") {
        return { data: { id: `avoid-${writes.length}`, ...s.payload }, error: null };
      }
      if (s.op === "insert" && table === "allergen_introductions") {
        return { data: { id: "i-new", allergen_id: s.payload?.allergen_id }, error: null };
      }
      if (s.op === "insert" && table === "allergen_exposure_logs") return { data: { id: `log-${writes.length}` }, error: null };
      if (s.op === "update") return { data: [{ id: "row" }], error: null };
      if (s.op) return { data: [], error: null };
      if (table === "allergen_exposure_logs") {
        if (s.exposureNumber === 1) return { data: { id: "new-exp-1" }, error: null };
        return { data: intros().find((i) => i.id === s.introId)?.allergen_exposure_logs ?? [], error: null };
      }
      if (table === "allergens") return { data: [PEANUT, EGG, MILK, WHEAT], error: null };
      if (table === "allergen_introductions") return { data: intros(), error: null };
      if (table === "children") return { data: { parent_id: "parent-1" }, error: null };
      if (table === "partner_access") return { data: { role: "owner" }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        if (col === "allergen_introduction_id") s.introId = val as string;
        if (col === "exposure_number") s.exposureNumber = val as number;
        return chain;
      },
      neq: () => chain,
      is: () => chain,
      in: () => chain,
      gte: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      delete: () => chain,
      update: (payload: Record<string, unknown>) => Object.assign(s, { op: "update", payload }) && chain,
      insert: (payload: Record<string, unknown>) => Object.assign(s, { op: "insert", payload }) && chain,
      upsert: (payload: Record<string, unknown>) => Object.assign(s, { op: "upsert", payload }) && chain,
      maybeSingle: async () => result(),
      single: async () => result(),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "parent-1" } } }, error: null }) },
      from: (table: string) => makeChain(table),
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ activeChild: { id: "child-1", name: "Rae", date_of_birth: "2026-01-01" } }),
}));
vi.mock("@/hooks/useLoggedByNames", () => ({ useLoggedByNames: () => ({}) }));
vi.mock("@/hooks/useDeleteWithUndo", () => ({ useDeleteWithUndo: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/charts/SevenDayChart", () => ({ SevenDayChart: () => null }));
vi.mock("@/components/feeding/FeedCoachCard", () => ({ FeedCoachCard: () => null }));
vi.mock("@/components/MobileDateTimePicker", () => ({ MobileDateTimePicker: () => null }));
vi.mock("@/hooks/useActiveFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useActiveFeed")>();
  return {
    ...actual,
    useActiveFeed: () => ({
      active: null,
      start: { mutateAsync: vi.fn() },
      setSide: { mutateAsync: vi.fn() },
      adjust: { mutateAsync: vi.fn(), isPending: false },
      cancel: { mutateAsync: vi.fn() },
    }),
  };
});

const renderLog = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <FeedingLog mode="solids" />
    </QueryClientProvider>,
  );

const openSolid = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Log solids" }));
  await screen.findByText("Food Description");
};

const pickFood = async (typed: string, name: string) => {
  fireEvent.change(screen.getByPlaceholderText("e.g. pureed sweet potato"), { target: { value: typed } });
  fireEvent.click(await screen.findByRole("option", { name }));
};

const noteReaction = (text = "rash on cheeks") => {
  fireEvent.click(screen.getByLabelText(/Reaction noted/));
  fireEvent.change(screen.getByPlaceholderText("e.g. mild rash on cheeks, fussiness after eating"), { target: { value: text } });
};

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save solids" }));
const of = (table: string, op: Write["op"]) => writes.filter((w) => w.table === table && w.op === op);

beforeEach(() => {
  writes.length = 0;
  state.eggFirstMsAgo = DAY;
  vi.mocked(toast).mockClear();
});

describe("Log solids catalog autocomplete", () => {
  it("fills the description, food group and slug from a picked food", async () => {
    renderLog();
    await openSolid();
    await pickFood("avoc", "Avocado");
    expect(screen.getByPlaceholderText("e.g. pureed sweet potato")).toHaveValue("Avocado");
    expect(screen.getByText("🍎 Fruit")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(of("feeding_logs", "insert")).toHaveLength(1));
    expect(of("feeding_logs", "insert")[0].payload).toEqual(
      expect.objectContaining({ food_description: "Avocado", food_category: "fruit", food_slug: "avocado" }),
    );
  });

  it("keeps free text free: editing the picked name clears the slug", async () => {
    renderLog();
    await openSolid();
    await pickFood("avoc", "Avocado");
    fireEvent.change(screen.getByPlaceholderText("e.g. pureed sweet potato"), { target: { value: "Avocado toast" } });
    save();
    await waitFor(() => expect(of("feeding_logs", "insert")).toHaveLength(1));
    expect(of("feeding_logs", "insert")[0].payload).toEqual(
      expect.objectContaining({ food_description: "Avocado toast", food_slug: null }),
    );
  });

  it("pre-ticks the serving chip of a signed-off allergen the food contains, and it stays editable", async () => {
    renderLog();
    await openSolid();
    await screen.findByRole("button", { name: /Peanut/ });
    await pickFood("peanut butter", "Smooth peanut butter (thinned)");
    const chip = screen.getByRole("button", { name: /Peanut/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Log solids allergen suggestion", () => {
  it("offers the next egg exposure but writes nothing unless confirmed", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    expect(await screen.findByText("Scrambled egg contains egg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log egg exposure" })).toBeInTheDocument();
    save();
    await waitFor(() => expect(of("feeding_logs", "insert")).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(of("allergen_exposure_logs", "insert")).toHaveLength(0);
  });

  it("on confirm logs exposure #2 through the tracker path, at the feed's time", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    await waitFor(() => expect(of("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(of("allergen_exposure_logs", "insert")[0].payload).toEqual(
      expect.objectContaining({ allergen_id: EGG.id, allergen_introduction_id: "i-egg", exposure_number: 2, reaction_observed: false }),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Exposure logged" })));
    await waitFor(() => expect(screen.queryByText("Scrambled egg contains egg")).not.toBeInTheDocument());
  });

  it("asks the same-day question before a second taste on the day of the first", async () => {
    state.eggFirstMsAgo = 60 * 1000;
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    expect(await screen.findByText("Offer the second taste today?")).toBeInTheDocument();
    expect(of("allergen_exposure_logs", "insert")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Log it anyway" }));
    await waitFor(() => expect(of("allergen_exposure_logs", "insert")).toHaveLength(1));
  });

  it("starts a not-yet-introduced allergen as exposure #1, after the spacing note", async () => {
    renderLog();
    await openSolid();
    await pickFood("couscous", "Couscous");
    fireEvent.click(await screen.findByRole("button", { name: "Log wheat exposure" }));
    // Egg's first taste was a day ago: the tracker's one-new-allergen spacing note asks first.
    expect(await screen.findByText("Starting another new allergen?")).toBeInTheDocument();
    expect(of("allergen_introductions", "insert")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    await waitFor(() => expect(of("allergen_introductions", "insert")).toHaveLength(1));
    expect(of("allergen_introductions", "insert")[0].payload).toEqual(
      expect.objectContaining({ allergen_id: WHEAT.id, status: "in_progress" }),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "First exposure logged" })));
  });

  it("gives an allergen with a reaction on record no offer, only the reaction note", async () => {
    renderLog();
    await openSolid();
    await pickFood("yogurt", "Plain whole-milk yogurt");
    expect(await screen.findByText(REACTION_NOTED_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exposure/ })).not.toBeInTheDocument();
  });
});

describe("Log solids reaction food", () => {
  it("keeps the 911 guidance on the reaction step", async () => {
    renderLog();
    await openSolid();
    noteReaction();
    expect(screen.getByText("Get emergency help now — call 911 if you see")).toBeInTheDocument();
  });

  it("defaults Which food? to the picked food and saves a reaction avoid row linked to the log", async () => {
    renderLog();
    await openSolid();
    await pickFood("avoc", "Avocado");
    noteReaction("hives on chin");
    expect(screen.getByRole("button", { name: /Avocado/, pressed: true })).toBeInTheDocument();
    // No allergens: the nudge only, no tracker offer.
    expect(screen.getByText(LOG_REACTION_PEDIATRICIAN_NUDGE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to allergen tracker" })).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(of("child_food_avoidances", "upsert")).toHaveLength(1));
    const feed = of("feeding_logs", "insert")[0].payload;
    expect(of("child_food_avoidances", "upsert")[0].payload).toEqual(
      expect.objectContaining({
        child_id: "child-1", food_slug: "avocado", reason: "reaction", note: "hives on chin", source_feeding_log_id: feed.id,
      }),
    );
    expect(of("child_food_avoidances", "upsert")[0].payload).not.toHaveProperty("created_by");
  });

  it("saves Something else as a record-only custom_food row, and offers a catalog match for typed text", async () => {
    renderLog();
    await openSolid();
    noteReaction();
    fireEvent.click(screen.getByRole("button", { name: "Something else" }));
    const other = screen.getByPlaceholderText("What did your baby eat?");
    fireEvent.change(other, { target: { value: "avacado" } });
    expect(screen.getByRole("button", { name: "Avocado" })).toBeInTheDocument();
    fireEvent.change(other, { target: { value: "Grandma's stew" } });
    save();
    await waitFor(() => expect(of("child_food_avoidances", "insert")).toHaveLength(1));
    expect(of("child_food_avoidances", "insert")[0].payload).toEqual(
      expect.objectContaining({ custom_food: "Grandma's stew", reason: "reaction" }),
    );
    expect(of("child_food_avoidances", "upsert")).toHaveLength(0);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining(AVOID_OTHER_SAVED_NOTE) })),
    );
  });

  it("suggests the allergen reaction but writes it only on confirm, via the tracker reaction path", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    noteReaction("vomited once");
    expect(screen.getByText("Scrambled egg can contain egg")).toBeInTheDocument();
    expect(screen.getByText("Adding it marks egg as Review with Pediatrician in the tracker.")).toBeInTheDocument();
    expect(of("allergen_reactions", "insert")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Add to allergen tracker" }));
    await waitFor(() => expect(of("allergen_reactions", "insert")).toHaveLength(1));
    expect(of("allergen_exposure_logs", "insert")[0].payload).toEqual(
      expect.objectContaining({ allergen_id: EGG.id, exposure_number: 2, reaction_observed: true }),
    );
    expect(of("allergen_reactions", "insert")[0].payload).toEqual(
      expect.objectContaining({ severity: "mild", parent_description: "vomited once" }),
    );
    expect(of("allergen_introductions", "update")[0].payload).toEqual(expect.objectContaining({ status: "reaction_observed" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(REACTION_SAVED_TOAST.note));
  });

  it("writes no reaction when the allergen suggestion is skipped", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    noteReaction();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Scrambled egg can contain egg")).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(of("child_food_avoidances", "upsert")).toHaveLength(1));
    expect(of("allergen_reactions", "insert")).toHaveLength(0);
  });
});
