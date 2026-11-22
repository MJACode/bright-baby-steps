import { createRef, type ComponentProps } from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedingLog, { type FeedingLogHandle } from "@/components/feeding/FeedingLog";
import { toast } from "@/hooks/use-toast";
import { insertAllergenExposure } from "@/services/allergenExposureWrite";

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const PICKED_AT = new Date(Date.now() - 30 * 60 * 1000).toISOString();

type Write = { table: string; op: "insert" | "update"; payload: Record<string, unknown> };

const { writes, state } = vi.hoisted(() => ({
  writes: [] as Write[],
  state: {
    role: "owner" as "owner" | "viewer",
    failExposureInsert: false,
  },
}));

const allergen = (id: string, slug: string, name: string, sort_order: number) => ({ id, slug, name, sort_order });
const PEANUT = allergen("a-peanut", "peanut", "Peanut", 1);
const EGG = allergen("a-egg", "egg", "Egg", 2);
const MILK = allergen("a-milk", "milk", "Cow's Milk (Dairy)", 3);
const SESAME = allergen("a-sesame", "sesame", "Sesame", 9);

const exposure = (id: string, n: number, msAgo: number, reaction = false) => ({
  id, exposure_number: n, logged_at: ago(msAgo), reaction_observed: reaction,
});

// Peanut and sesame are signed off; egg is mid-protocol; milk had a reaction.
const INTROS = [
  {
    id: "i-peanut", allergen_id: PEANUT.id, status: "completed", completed_at: ago(20 * DAY),
    allergen_exposure_logs: [exposure("p1", 1, 30 * DAY), exposure("p2", 2, 25 * DAY), exposure("p3", 3, 2 * DAY)],
  },
  {
    id: "i-sesame", allergen_id: SESAME.id, status: "completed", completed_at: ago(20 * DAY),
    allergen_exposure_logs: [exposure("s1", 1, 30 * DAY), exposure("s2", 2, 25 * DAY)],
  },
  { id: "i-egg", allergen_id: EGG.id, status: "in_progress", completed_at: null, allergen_exposure_logs: [exposure("e1", 1, DAY)] },
  {
    id: "i-milk", allergen_id: MILK.id, status: "reaction_observed", completed_at: null,
    allergen_exposure_logs: [exposure("m1", 1, 10 * DAY, true)],
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const s: { op?: Write["op"]; payload?: Record<string, unknown>; introId?: string } = {};
    const result = () => {
      if (s.op) writes.push({ table, op: s.op, payload: s.payload ?? {} });
      if (s.op === "insert" && table === "allergen_exposure_logs") {
        return state.failExposureInsert
          ? { data: null, error: { code: "42501", message: "new row violates row-level security policy" } }
          : { data: { id: `log-${writes.length}` }, error: null };
      }
      // An UPDATE returns the row it changed; zero rows reads as RLS-blocked.
      if (s.op === "update") return { data: [{ id: "row" }], error: null };
      if (s.op) return { data: [], error: null };
      if (table === "allergen_exposure_logs") {
        return { data: INTROS.find((i) => i.id === s.introId)?.allergen_exposure_logs ?? [], error: null };
      }
      if (table === "allergens") return { data: [PEANUT, EGG, MILK, SESAME], error: null };
      if (table === "allergen_introductions") return { data: INTROS, error: null };
      if (table === "children") {
        return { data: { parent_id: state.role === "owner" ? "parent-1" : "someone-else" }, error: null };
      }
      if (table === "partner_access") return { data: { role: state.role }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        if (col === "allergen_introduction_id") s.introId = val as string;
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
      update: (payload: Record<string, unknown>) => {
        s.op = "update";
        s.payload = payload;
        return chain;
      },
      insert: (payload: Record<string, unknown>) => {
        s.op = "insert";
        s.payload = payload;
        return chain;
      },
      maybeSingle: async () => result(),
      single: async () => result(),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  return { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "parent-1" } } }, error: null }) }, from: (table: string) => makeChain(table) } };
});

vi.mock("@/services/allergenExposureWrite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/allergenExposureWrite")>();
  return { ...actual, insertAllergenExposure: vi.fn(actual.insertAllergenExposure) };
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
vi.mock("@/hooks/useDeleteWithUndo", () => ({
  useDeleteWithUndo: () => ({ mutate: vi.fn(), isPending: false }),
}));
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

// The chips live on the Solids tab's sheet.
const tree = (
  props: ComponentProps<typeof FeedingLog> = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) => (
  <QueryClientProvider client={client}>
    <FeedingLog mode="solids" {...props} />
  </QueryClientProvider>
);

const openSolid = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Log solids" }));
  await screen.findByText("Food Description");
};

const exposureInserts = () => writes.filter((w) => w.table === "allergen_exposure_logs" && w.op === "insert");
const feedInserts = () => writes.filter((w) => w.table === "feeding_logs" && w.op === "insert");

beforeEach(() => {
  writes.length = 0;
  state.role = "owner";
  state.failExposureInsert = false;
  vi.mocked(toast).mockClear();
  vi.mocked(insertAllergenExposure).mockClear();
});

describe("FeedingLog allergen chips", () => {
  it("lists only signed-off allergens, in catalog order", async () => {
    render(tree());
    await openSolid();
    await screen.findByText("Allergens in this meal (optional)");
    const peanut = screen.getByRole("button", { name: /Peanut/ });
    const sesame = screen.getByRole("button", { name: /Sesame/ });
    expect(peanut).toHaveAttribute("aria-pressed", "false");
    expect(sesame).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^.*Egg$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cow's Milk/ })).not.toBeInTheDocument();
  });

  it("logs one serving per chip through the shared helper, at the feed's time", async () => {
    render(tree());
    await openSolid();
    fireEvent.click(await screen.findByRole("button", { name: /Peanut/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sesame/ }));
    fireEvent.click(screen.getByTestId("pick-Started"));
    fireEvent.click(screen.getByRole("button", { name: "Save solids" }));

    await waitFor(() => expect(exposureInserts()).toHaveLength(2));
    expect(insertAllergenExposure).toHaveBeenCalledTimes(2);
    expect(feedInserts()).toHaveLength(1);
    // The feed row goes in first; servings follow it.
    expect(writes.findIndex((w) => w.table === "feeding_logs")).toBeLessThan(
      writes.findIndex((w) => w.table === "allergen_exposure_logs"),
    );
    expect(exposureInserts().map((w) => w.payload)).toEqual([
      expect.objectContaining({
        allergen_id: PEANUT.id, allergen_introduction_id: "i-peanut", exposure_number: 4,
        logged_at: PICKED_AT, reaction_observed: false, child_id: "child-1", parent_id: "parent-1",
      }),
      expect.objectContaining({
        allergen_id: SESAME.id, allergen_introduction_id: "i-sesame", exposure_number: 3,
        logged_at: PICKED_AT, reaction_observed: false,
      }),
    ]);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Solids logged! 🥣", description: "Counted as a serving of peanut and sesame." }),
    );
  });

  it("logs no serving when no chip is picked", async () => {
    render(tree());
    await openSolid();
    await screen.findByRole("button", { name: /Peanut/ });
    fireEvent.click(screen.getByRole("button", { name: "Save solids" }));
    await waitFor(() => expect(feedInserts()).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Solids logged! 🥣" }));
    expect(insertAllergenExposure).not.toHaveBeenCalled();
  });

  it("logs no clean serving when the feed has Reaction noted", async () => {
    render(tree());
    await openSolid();
    fireEvent.click(await screen.findByRole("button", { name: /Peanut/ }));
    fireEvent.click(screen.getByLabelText(/Reaction noted/));
    expect(
      screen.getByText("Log a reaction on the allergen itself in the Allergen Tracker, so it reaches your pediatrician report."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save solids" }));
    await waitFor(() => expect(feedInserts()).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(insertAllergenExposure).not.toHaveBeenCalled();
  });

  it("keeps the feed and says which serving didn't save when its insert fails", async () => {
    state.failExposureInsert = true;
    render(tree());
    await openSolid();
    fireEvent.click(await screen.findByRole("button", { name: /Peanut/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save solids" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Solids logged! 🥣",
        description: 'The feed saved, but the serving of peanut didn\'t. Tap "Had it today" in the Allergen Tracker to add it.',
      }),
    );
    expect(feedInserts()).toHaveLength(1);
  });

  it("offline, swaps the chips for a note and queues the feed without a serving", async () => {
    render(tree());
    await openSolid();
    await screen.findByRole("button", { name: /Peanut/ });

    act(() => onlineManager.setOnline(false));
    try {
      expect(screen.queryByRole("button", { name: /Peanut/ })).not.toBeInTheDocument();
      expect(screen.getByText("You're offline. Log allergen servings in the Allergen Tracker once you're back online.")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save solids" }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith({
          title: "Solids logged! 🥣",
          description: "Saved on this phone. It'll sync when you're back online.",
        }),
      );
      expect(insertAllergenExposure).not.toHaveBeenCalled();
    } finally {
      act(() => onlineManager.setOnline(true));
    }
  });

  it("hides the chips from a viewer", async () => {
    state.role = "viewer";
    render(tree());
    await openSolid();
    await screen.findByText("Food Description");
    // Give the role and allergen queries time to land before asserting absence.
    await waitFor(() => expect(writes).toHaveLength(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Allergens in this meal (optional)")).not.toBeInTheDocument();
  });

  it("opens pre-filled from the handle, with matching signed-off chips ticked", async () => {
    const ref = createRef<FeedingLogHandle>();
    render(tree({ ref }));
    await screen.findByRole("button", { name: "Log solids" });

    act(() => ref.current!.open({ foodDesc: "Sesame toast fingers", foodCategory: "grain_cereal", allergenSlugs: ["sesame", "egg"] }));

    expect(await screen.findByText("Log solids", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sesame toast fingers")).toBeInTheDocument();
    expect(screen.getByText("🌾 Grain/Cereal")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Sesame/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Peanut/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Save solids" }));
    await waitFor(() => expect(exposureInserts()).toHaveLength(1));
    expect(feedInserts()[0].payload).toEqual(
      expect.objectContaining({ feeding_type: "solid", food_description: "Sesame toast fingers", food_category: "grain_cereal" }),
    );
    expect(exposureInserts()[0].payload).toEqual(expect.objectContaining({ allergen_id: SESAME.id }));
  });

  it("ticks prefilled chips that resolve after the catalog loads", async () => {
    const ref = createRef<FeedingLogHandle>();
    render(tree({ ref }));
    // Before any query has settled, so the slugs wait for the allergen list.
    act(() => ref.current!.open({ foodDesc: "Peanut puffs", allergenSlugs: ["peanut"] }));
    expect(await screen.findByRole("button", { name: /Peanut/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Sesame/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("leaves an unknown prefill category blank", async () => {
    const ref = createRef<FeedingLogHandle>();
    render(tree({ ref }));
    await screen.findByRole("button", { name: "Log solids" });
    act(() => ref.current!.open({ foodDesc: "Mango", foodCategory: "dessert" }));
    expect(await screen.findByDisplayValue("Mango")).toBeInTheDocument();
    expect(screen.getByText("Select a category")).toBeInTheDocument();
  });

  it("opens blank with no prefill and offers no milk types", async () => {
    const ref = createRef<FeedingLogHandle>();
    render(tree({ ref }));
    await screen.findByRole("button", { name: "Log solids" });
    act(() => ref.current!.open());
    expect(await screen.findByPlaceholderText("e.g. pureed sweet potato")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "🤱 Breast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "🍼 Bottle" })).not.toBeInTheDocument();
  });
});
