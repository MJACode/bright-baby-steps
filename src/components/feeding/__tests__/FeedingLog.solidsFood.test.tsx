import { format } from "date-fns";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedingLog from "@/components/feeding/FeedingLog";
import { toast } from "@/hooks/use-toast";
import { REACTION_NOTED_DESCRIPTION, REACTION_SAVED_TOAST } from "@/services/allergenService";
import { writeSolidsAllergenPlan } from "@/services/solidsAllergenWrites";
import { writeFoodAvoidance } from "@/hooks/useFoodAvoidances";
import { AVOID_NOTE_MAX } from "@/lib/foodAvoidances";
import {
  AVOID_OTHER_SAVED_NOTE, LOG_REACTION_FOOD_LABEL, LOG_REACTION_PEDIATRICIAN_NUDGE, reactionFoodFailedText,
} from "@/lib/solidsAvoidCopy";

// Pin the clock to local midday. Fixtures are "N minutes/an hour ago"; just
// after midnight they'd fall under the collapsed "Yesterday" group and the
// tests couldn't find them (CI failed at 00:31 UTC on 2026-11-23). Only Date
// is faked, so timers, waitFor and promises behave normally.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 5, 15, 12, 0, 0) });
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const PICKED_AT = new Date(Date.now() - 20 * 60 * 1000).toISOString();

type Write = {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  payload: Record<string, unknown>;
  id?: string;
};
type Exposure = { id: string; exposure_number: number; logged_at: string; reaction_observed: boolean | null };
type Intro = { id: string; allergen_id: string; status: string; completed_at: string | null; allergen_exposure_logs: Exposure[] };

const { writes, state, db } = vi.hoisted(() => ({
  writes: [] as Write[],
  state: {
    eggFirstMsAgo: 0,
    failExposureFor: null as string | null,
    failAvoidWrite: false,
    avoidRead: "ok" as "ok" | "pending" | "error",
  },
  db: { intros: [] as Intro[], avoids: [] as Record<string, unknown>[], logs: [] as Record<string, unknown>[] },
}));

const allergen = (id: string, slug: string, name: string, sort_order: number) => ({ id, slug, name, sort_order });
const PEANUT = allergen("a-peanut", "peanut", "Peanut", 1);
const EGG = allergen("a-egg", "egg", "Egg", 2);
const MILK = allergen("a-milk", "milk", "Cow's Milk (Dairy)", 3);
const WHEAT = allergen("a-wheat", "wheat", "Wheat", 4);

const exposure = (id: string, n: number, msAgo: number, reaction = false): Exposure => ({
  id, exposure_number: n, logged_at: ago(msAgo), reaction_observed: reaction,
});

// Peanut is signed off, egg is partway, milk had a reaction, wheat isn't started.
const seed = (): Intro[] => [
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
    const s: { op?: Write["op"]; payload?: Record<string, unknown>; eq: Record<string, unknown>; before?: boolean } = { eq: {} };
    const result = (single: boolean) => {
      const p = s.payload ?? {};
      if (s.op) writes.push({ table, op: s.op, payload: p, id: s.eq.id as string | undefined });
      if (table === "feeding_logs" && !single) {
        if (s.op === "insert") db.logs.push(p);
        if (!s.op) return { data: s.before ? [] : db.logs, error: null, count: s.before ? 0 : db.logs.length };
      }
      if (table === "child_food_avoidances") {
        if ((s.op === "insert" || s.op === "upsert") && state.failAvoidWrite) {
          return { data: null, error: { code: "08006", message: "network" } };
        }
        if (s.op === "insert" || s.op === "upsert") return { data: { id: `avoid-${writes.length}`, ...p }, error: null };
        if (!s.op && !single && state.avoidRead === "error") return { data: null, error: { code: "08006", message: "network" } };
        if (single) return { data: db.avoids.find((r) => r.food_slug === s.eq.food_slug) ?? null, error: null };
        return { data: db.avoids, error: null };
      }
      if (table === "allergen_introductions") {
        if (s.op === "insert") {
          const intro = { id: `i-new-${p.allergen_id}`, allergen_id: p.allergen_id as string, status: "in_progress", completed_at: null, allergen_exposure_logs: [] };
          db.intros.push(intro);
          return { data: intro, error: null };
        }
        if (s.op === "delete") {
          db.intros = db.intros.filter((i) => i.id !== s.eq.id);
          return { data: [{ id: s.eq.id }], error: null };
        }
        if (s.op) return { data: [{ id: "row" }], error: null };
        if (single) return { data: db.intros.find((i) => i.allergen_id === s.eq.allergen_id) ?? null, error: null };
        return { data: db.intros, error: null };
      }
      if (table === "allergen_exposure_logs") {
        if (s.op === "insert") {
          if (state.failExposureFor === p.allergen_id) return { data: null, error: { code: "08006", message: "network" } };
          const row = {
            id: `log-${writes.length}`, exposure_number: p.exposure_number as number, logged_at: p.logged_at as string,
            reaction_observed: (p.reaction_observed as boolean | undefined) ?? false,
          };
          db.intros.find((i) => i.id === p.allergen_introduction_id)?.allergen_exposure_logs.push(row);
          return { data: { id: row.id }, error: null };
        }
        if (s.op === "update") {
          for (const i of db.intros) for (const e of i.allergen_exposure_logs) if (e.id === s.eq.id) Object.assign(e, p);
          return { data: [{ id: s.eq.id }], error: null };
        }
        if (s.op) return { data: [{ id: s.eq.id }], error: null };
        const logs = db.intros.find((i) => i.id === s.eq.allergen_introduction_id)?.allergen_exposure_logs ?? [];
        return { data: logs, error: null };
      }
      if (s.op === "update") return { data: [{ id: "row" }], error: null };
      if (s.op) return { data: [], error: null };
      if (table === "allergens") return { data: [PEANUT, EGG, MILK, WHEAT], error: null };
      if (table === "children") return { data: { parent_id: "parent-1" }, error: null };
      if (table === "partner_access") return { data: { role: "owner" }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        s.eq[col] = val;
        return chain;
      },
      neq: () => chain,
      is: () => chain,
      in: () => chain,
      gte: () => chain,
      lt: () => Object.assign(s, { before: true }) && chain,
      order: () => chain,
      limit: () => chain,
      delete: () => Object.assign(s, { op: "delete" }) && chain,
      update: (payload: Record<string, unknown>) => Object.assign(s, { op: "update", payload }) && chain,
      insert: (payload: Record<string, unknown>) => Object.assign(s, { op: "insert", payload }) && chain,
      upsert: (payload: Record<string, unknown>) => Object.assign(s, { op: "upsert", payload }) && chain,
      maybeSingle: async () => result(true),
      single: async () => result(true),
      then: (resolve: (v: unknown) => unknown) =>
        table === "child_food_avoidances" && !s.op && state.avoidRead === "pending"
          ? new Promise(() => {})
          : Promise.resolve(result(false)).then(resolve),
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
vi.mock("@/components/MobileDateTimePicker", () => ({
  MobileDateTimePicker: ({ onChange, label }: { onChange: (d: Date) => void; label?: string }) => (
    <button type="button" data-testid={`pick-${label}`} onClick={() => onChange(new Date(PICKED_AT))}>
      pick {label}
    </button>
  ),
}));
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

// The suggestions and the reaction step render from three async reads (role,
// allergen list, introductions). The serving-chip label needs all three, so
// waiting for it means every later step can assert synchronously. Waiting only
// for the dialog raced those reads under the full suite's load.
const openSolid = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Log solids" }));
  await screen.findByText("Food Description");
  await screen.findByText("Allergens in this meal (optional)");
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
const update = () => fireEvent.click(screen.getByRole("button", { name: "Update solids" }));
const of = (table: string, op: Write["op"]) => writes.filter((w) => w.table === table && w.op === op);

beforeEach(() => {
  writes.length = 0;
  state.eggFirstMsAgo = DAY;
  state.failExposureFor = null;
  state.failAvoidWrite = false;
  state.avoidRead = "ok";
  db.intros = seed();
  db.avoids = [];
  db.logs = [];
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
    expect(of("feeding_logs", "insert")[0].payload).toEqual(expect.objectContaining({ food_description: "Avocado toast" }));
    // No slug, no key: a client deployed ahead of the column's migration still saves.
    expect(of("feeding_logs", "insert")[0].payload).not.toHaveProperty("food_slug");
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

const tracker = () => writes.filter((w) => w.table.startsWith("allergen_") && w.op !== undefined);

describe("Log solids allergen suggestion", () => {
  it("offers the next egg exposure but writes nothing unless confirmed", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    expect(await screen.findByText("Scrambled egg contains egg")).toBeInTheDocument();
    save();
    await waitFor(() => expect(of("feeding_logs", "insert")).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(tracker()).toHaveLength(0);
  });

  it("keeps a confirmed exposure as pending and writes it on Save, after the feed, at the final Started time", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    expect(await screen.findByText("Egg exposure will be logged when you save.")).toBeInTheDocument();
    expect(screen.queryByText("Scrambled egg contains egg")).not.toBeInTheDocument();
    expect(tracker()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("pick-Started"));
    save();
    await waitFor(() => expect(of("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writes.findIndex((w) => w.table === "feeding_logs")).toBeLessThan(
      writes.findIndex((w) => w.table === "allergen_exposure_logs"),
    );
    expect(of("allergen_exposure_logs", "insert")[0].payload).toEqual(
      expect.objectContaining({
        allergen_id: EGG.id, allergen_introduction_id: "i-egg", exposure_number: 2, reaction_observed: false, logged_at: PICKED_AT,
      }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Solids logged! 🥣", description: expect.stringMatching(/Keep watching until/) })),
    );
  });

  it("Cancel after confirming writes nothing to the tracker", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    await screen.findByText("Egg exposure will be logged when you save.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Food Description")).not.toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 30));
    expect(writes).toHaveLength(0);
  });

  it("Undo takes the choice back: Save then logs only the feed", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Egg exposure" }));
    expect(screen.getByText("Scrambled egg contains egg")).toBeInTheDocument();
    save();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(tracker()).toHaveLength(0);
  });

  it("asks the same-day question at confirm, and still writes only on Save", async () => {
    state.eggFirstMsAgo = 60 * 1000;
    db.intros = seed();
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    expect(await screen.findByText("Offer the second taste today?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log it anyway" }));
    await screen.findByText("Egg exposure will be logged when you save.");
    expect(tracker()).toHaveLength(0);
    save();
    await waitFor(() => expect(of("allergen_exposure_logs", "insert")).toHaveLength(1));
  });

  it("asks the spacing note at confirm, then starts the allergen as exposure #1 on Save", async () => {
    renderLog();
    await openSolid();
    await pickFood("couscous", "Couscous");
    fireEvent.click(await screen.findByRole("button", { name: "Log wheat exposure" }));
    // Egg's first taste was a day ago: the tracker's one-new-allergen spacing note asks first.
    expect(await screen.findByText("Starting another new allergen?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    await screen.findByText("Wheat exposure will be logged when you save.");
    expect(tracker()).toHaveLength(0);
    save();
    await waitFor(() => expect(of("allergen_introductions", "insert")).toHaveLength(1));
    expect(of("allergen_introductions", "insert")[0].payload).toEqual(expect.objectContaining({ allergen_id: WHEAT.id, status: "in_progress" }));
  });

  it("reports a failed tracker write in the save toast without losing the feed", async () => {
    state.failExposureFor = EGG.id;
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    save();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Solids logged! 🥣",
        description: expect.stringContaining("egg didn't reach the allergen tracker"),
      })),
    );
    expect(of("feeding_logs", "insert")).toHaveLength(1);
  });

  it("gives an allergen with a reaction on record no offer, only the reaction note", async () => {
    renderLog();
    await openSolid();
    await pickFood("yogurt", "Plain whole-milk yogurt");
    expect(await screen.findByText(REACTION_NOTED_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exposure/ })).not.toBeInTheDocument();
  });
});

describe("writeSolidsAllergenPlan retries", () => {
  it("skips what already landed and retries only what failed", async () => {
    const done = new Set<string>();
    const plan = { exposures: [EGG.id, WHEAT.id], reaction: null };
    state.failExposureFor = WHEAT.id;
    const first = await writeSolidsAllergenPlan({ childId: "child-1", parentId: "parent-1", at: new Date(), notes: "", plan, done });
    expect(first.failed).toEqual([WHEAT.id]);
    const eggWrites = () => of("allergen_exposure_logs", "insert").filter((w) => w.payload.allergen_id === EGG.id);
    expect(eggWrites()).toHaveLength(1);

    state.failExposureFor = null;
    const second = await writeSolidsAllergenPlan({ childId: "child-1", parentId: "parent-1", at: new Date(), notes: "", plan, done });
    expect(second.failed).toEqual([]);
    expect(eggWrites()).toHaveLength(1);
  });
});

describe("Log solids reaction food", () => {
  it("keeps the 911 guidance on the reaction step", async () => {
    renderLog();
    await openSolid();
    noteReaction();
    expect(screen.getByText("Get emergency help now — call 911 if you see")).toBeInTheDocument();
    // Emergency signs are never narrowed here (legal R7): same CALL_911 as the tracker.
    expect(screen.getByText("Trouble breathing, wheezing, a repeated cough, or a hoarse cry")).toBeInTheDocument();
  });

  it("defaults Which food? to the picked food and saves a reaction avoid row linked to the log", async () => {
    renderLog();
    await openSolid();
    await pickFood("avoc", "Avocado");
    noteReaction("hives on chin");
    expect(screen.getByRole("button", { name: /Avocado/, pressed: true })).toBeInTheDocument();
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

  it("a second reaction on a food keeps the first note and log link, and adds the new note under its date", async () => {
    db.avoids = [{ id: "x1", child_id: "child-1", food_slug: "avocado", reason: "reaction", note: "First rash", source_feeding_log_id: "old-log" }];
    renderLog();
    await openSolid();
    await pickFood("avoc", "Avocado");
    noteReaction("hives on chin");
    save();
    await waitFor(() => expect(of("child_food_avoidances", "upsert")).toHaveLength(1));
    expect(of("child_food_avoidances", "upsert")[0].payload).toEqual(
      expect.objectContaining({
        reason: "reaction",
        note: `First rash\n${format(new Date(), "MMM d, yyyy")}: hives on chin`,
        source_feeding_log_id: "old-log",
      }),
    );
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

  it("needs a severity before Add to allergen tracker, and writes nothing until Save", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    noteReaction("vomited once");
    expect(screen.getByText("Scrambled egg can contain egg")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Add to allergen tracker" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Moderate/ }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText(/moderate reaction to egg will be added to the allergen tracker when you save/)).toBeInTheDocument();
    expect(tracker()).toHaveLength(0);
  });

  it("on Save attaches the reaction to the exposure still waiting for one, not a new exposure", async () => {
    state.eggFirstMsAgo = 60 * 1000;
    db.intros = seed();
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    noteReaction("vomited once");
    fireEvent.click(screen.getByRole("button", { name: /Moderate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to allergen tracker" }));
    save();
    await waitFor(() => expect(of("allergen_reactions", "insert")).toHaveLength(1));
    expect(of("allergen_exposure_logs", "insert")).toHaveLength(0);
    expect(of("allergen_exposure_logs", "update")[0]).toEqual(expect.objectContaining({ id: "e1", payload: { reaction_observed: true } }));
    expect(of("allergen_reactions", "insert")[0].payload).toEqual(
      expect.objectContaining({ exposure_log_id: "e1", severity: "moderate", parent_description: "vomited once" }),
    );
    expect(of("allergen_introductions", "update")[0].payload).toEqual(expect.objectContaining({ status: "reaction_observed" }));
    // Triage copy leads the one toast.
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: REACTION_SAVED_TOAST.pediatrician.title,
        description: expect.stringMatching(new RegExp(`^${REACTION_SAVED_TOAST.pediatrician.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)),
      })),
    );
  });

  it("an exposure confirmed in the same entry is saved first, then the reaction goes on it", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    fireEvent.click(await screen.findByRole("button", { name: "Log egg exposure" }));
    noteReaction("hives");
    fireEvent.click(screen.getByRole("button", { name: /Mild/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to allergen tracker" }));
    save();
    await waitFor(() => expect(of("allergen_reactions", "insert")).toHaveLength(1));
    const inserted = of("allergen_exposure_logs", "insert");
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload).toEqual(expect.objectContaining({ exposure_number: 2, reaction_observed: false }));
    const newId = db.intros.find((i) => i.id === "i-egg")!.allergen_exposure_logs.find((e) => e.exposure_number === 2)!.id;
    expect(of("allergen_exposure_logs", "update")[0]).toEqual(expect.objectContaining({ id: newId }));
    expect(of("allergen_reactions", "insert")[0].payload).toEqual(expect.objectContaining({ exposure_log_id: newId, severity: "mild" }));
  });

  it("with no exposure waiting today, the reaction gets a new exposure", async () => {
    renderLog();
    await openSolid();
    await pickFood("scram", "Scrambled egg");
    noteReaction();
    fireEvent.click(screen.getByRole("button", { name: /Severe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to allergen tracker" }));
    save();
    await waitFor(() => expect(of("allergen_reactions", "insert")).toHaveLength(1));
    expect(of("allergen_exposure_logs", "insert")[0].payload).toEqual(
      expect.objectContaining({ allergen_id: EGG.id, exposure_number: 2, reaction_observed: true }),
    );
    expect(of("allergen_reactions", "insert")[0].payload).toEqual(expect.objectContaining({ severity: "severe" }));
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

const solidLog = (over: Record<string, unknown> = {}) => ({
  id: "log-old",
  child_id: "child-1",
  parent_id: "parent-1",
  feeding_type: "solid",
  logged_at: ago(HOUR),
  food_description: "Avocado",
  food_category: "fruit",
  food_slug: "avocado",
  reaction_noted: true,
  reaction_description: "rash",
  side: null, duration_minutes: null, amount_oz: null, amount_oz_left: null, amount_oz_right: null,
  notes: null, source: "manual",
  ...over,
});

const openEditOf = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole("button", { name }));
  await screen.findByText("Edit solids");
};

describe("Log solids reaction food on an edit", () => {
  it("after a failed avoid write, reopening the log offers the food the parent picked, not the Food Description pick", async () => {
    state.failAvoidWrite = true;
    renderLog();
    await openSolid();
    await pickFood("avoc", "Avocado");
    noteReaction("hives on chin");
    // The parent says the reaction was to something else.
    fireEvent.click(screen.getByRole("button", { name: /Avocado/, pressed: true }));
    fireEvent.change(screen.getByPlaceholderText("Search foods"), { target: { value: "scram" } });
    fireEvent.click(await screen.findByRole("option", { name: "Scrambled egg" }));
    save();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        description: expect.stringContaining(reactionFoodFailedText("Scrambled egg")),
      })),
    );
    const logId = of("feeding_logs", "insert")[0].payload.id;

    state.failAvoidWrite = false;
    await openEditOf(/Edit solid feed, Avocado/);
    expect(await screen.findByText(LOG_REACTION_FOOD_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scrambled egg/, pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Avocado/, pressed: true })).not.toBeInTheDocument();
    update();
    await waitFor(() => expect(of("child_food_avoidances", "upsert").length).toBeGreaterThan(1));
    expect(of("child_food_avoidances", "upsert").at(-1)!.payload).toEqual(
      expect.objectContaining({ food_slug: "egg-scrambled", reason: "reaction", source_feeding_log_id: logId }),
    );
  });

  it("with no recoverable pick, leaves Which food? empty instead of defaulting to food_slug", async () => {
    db.logs = [solidLog()];
    renderLog();
    await openEditOf(/Edit solid feed, Avocado/);
    expect(await screen.findByText(LOG_REACTION_FOOD_LABEL)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Avocado/, pressed: true })).not.toBeInTheDocument();
    update();
    await waitFor(() => expect(of("feeding_logs", "update")).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(writes.filter((w) => w.table === "child_food_avoidances")).toHaveLength(0);
  });

  it.each(["pending", "error"] as const)("hides Which food? while the avoid list is %s", async (mode) => {
    state.avoidRead = mode;
    db.logs = [solidLog()];
    renderLog();
    await openEditOf(/Edit solid feed, Avocado/);
    expect(screen.getByText("Describe the reaction")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(LOG_REACTION_FOOD_LABEL)).not.toBeInTheDocument();
  });
});

describe("Log solids food_slug payload", () => {
  it("sends no food_slug key when nothing was picked", async () => {
    renderLog();
    await openSolid();
    fireEvent.change(screen.getByPlaceholderText("e.g. pureed sweet potato"), { target: { value: "Grandma's stew" } });
    save();
    await waitFor(() => expect(of("feeding_logs", "insert")).toHaveLength(1));
    expect(of("feeding_logs", "insert")[0].payload).not.toHaveProperty("food_slug");
  });

  it("sends food_slug: null when an edit drops the pick", async () => {
    db.logs = [solidLog({ reaction_noted: false, reaction_description: null })];
    renderLog();
    await openEditOf(/Edit solid feed, Avocado/);
    fireEvent.change(screen.getByPlaceholderText("e.g. pureed sweet potato"), { target: { value: "Avocado toast" } });
    update();
    await waitFor(() => expect(of("feeding_logs", "update")).toHaveLength(1));
    expect(of("feeding_logs", "update")[0].payload).toEqual(
      expect.objectContaining({ food_description: "Avocado toast", food_slug: null }),
    );
  });
});

describe("reaction note length", () => {
  const long = "r".repeat(AVOID_NOTE_MAX + 100);

  it("caps the Describe the reaction field at the avoid note limit", async () => {
    renderLog();
    await openSolid();
    noteReaction();
    expect(screen.getByPlaceholderText("e.g. mild rash on cheeks, fussiness after eating")).toHaveAttribute(
      "maxLength", String(AVOID_NOTE_MAX),
    );
  });

  it.each([
    ["a catalog food", { foodSlug: "avocado" }, "upsert"],
    ["Something else", { customFood: "Grandma's stew" }, "insert"],
  ] as const)("cuts a first reaction note on %s to the column limit", async (_label, food, op) => {
    await writeFoodAvoidance({ childId: "child-1", reason: "reaction", note: long, ...food });
    expect(of("child_food_avoidances", op)[0].payload.note).toBe("r".repeat(AVOID_NOTE_MAX));
  });
});
