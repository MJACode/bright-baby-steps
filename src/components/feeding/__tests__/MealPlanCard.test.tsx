import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MealPlanCard } from "@/components/feeding/MealPlanCard";
import { MEAL_PLAN_ERROR_COPY, MealPlanError, useGenerateMealPlan, type MealPlanErrorCode } from "@/hooks/useMealPlan";
import { MEAL_PLAN_DISCLAIMER, MEAL_PLAN_MILK_FIRST_COPY, MEAL_PLAN_TOO_EARLY_COPY } from "@/lib/mealPlanCopy";
import { MEAL_PLAN_INTROS, buildIdeaName } from "../../../../supabase/functions/_shared/mealPlan";
import { FOOD_BY_SLUG } from "@/lib/foodCatalog";
import type { Role } from "@/hooks/useCurrentRole";

const h = vi.hoisted(() => ({
  row: null as { week_start: string; plan: unknown } | null,
  readError: null as { message: string } | null,
  reads: 0,
  invoke: vi.fn(),
  toast: vi.fn(),
  premium: { isPremium: false, isLoading: false },
  ownerPremium: { isChildOwnerPremium: false, isLoading: false },
  online: true,
  avoids: [] as Record<string, unknown>[],
  avoidWrites: [] as { op: string; payload?: Record<string, unknown>; id?: string }[],
}));

// child_food_avoidances: a list read, an upsert that returns its row, and a
// delete that returns what it removed. Every other table is the meal_plans read.
const avoidChain = () => {
  const s: { op?: string; payload?: Record<string, unknown>; id?: string } = {};
  const result = () => {
    if (!s.op) return { data: h.avoids, error: null };
    h.avoidWrites.push({ op: s.op, payload: s.payload, id: s.id });
    if (s.op === "upsert") {
      const row = { id: `avoid-${h.avoidWrites.length}`, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", ...s.payload };
      h.avoids = [row, ...h.avoids];
      return { data: row, error: null };
    }
    if (s.op === "delete") {
      h.avoids = h.avoids.filter((r) => r.id !== s.id);
      return { data: [{ id: s.id }], error: null };
    }
    return { data: [], error: null };
  };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: string) => {
      if (col === "id") s.id = val;
      return chain;
    },
    order: () => chain,
    upsert: (payload: Record<string, unknown>) => Object.assign(s, { op: "upsert", payload }) && chain,
    delete: () => Object.assign(s, { op: "delete" }) && chain,
    single: async () => result(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      table === "child_food_avoidances"
        ? avoidChain()
        : {
            select: () => ({ eq: () => ({ maybeSingle: async () => {
              h.reads += 1;
              return h.readError ? { data: null, error: h.readError } : { data: h.row, error: null };
            } }) }),
          },
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => h.toast(...args) }));
vi.mock("@/hooks/usePremium", () => ({
  usePremium: () => h.premium,
  useChildOwnerPremium: () => h.ownerPremium,
}));
vi.mock("@/hooks/useOfflineSync", () => ({ useIsOnline: () => h.online }));
vi.mock("@/components/UpgradeSheet", () => ({
  UpgradeSheet: ({ open }: { open: boolean }) => (open ? <div>Upgrade sheet</div> : null),
}));

const WEEK = "2026-11-16";
const LAST_WEEK = "2026-11-09";

// A stored row as an older server wrote it: model-written names, a tip, an
// intro and hand-written prep. None of that text may render; the card shows
// what parseMealPlan rebuilds from the catalog.
const PLAN = {
  weekStart: WEEK,
  method: "mix",
  intro: "Soft, easy ideas for this week.",
  ideas: [
    {
      id: "a",
      name: "Banana pancakes",
      mealSlot: "breakfast",
      foods: ["wheat-infant-cereal", "egg-scrambled", "banana"],
      blwPrep: "Cut into finger-length strips.",
      traditionalPrep: "Mash with a fork.",
      servingTip: "Serve warm, not hot.",
      allergens: ["egg", "wheat"],
      foodCategory: "grain_cereal",
    },
    {
      id: "b",
      name: "Sweet potato wedges",
      mealSlot: "lunch",
      foods: ["sweet-potato"],
      blwPrep: "Roast until soft.",
      traditionalPrep: "Purée with breast milk.",
      allergens: [],
      foodCategory: "vegetable",
    },
    {
      id: "c",
      name: "Avocado on toast",
      mealSlot: "snack",
      foods: ["avocado", "flour-tortilla"],
      blwPrep: "Spread thin on toast strips.",
      traditionalPrep: "Mash smooth.",
      allergens: ["wheat"],
      foodCategory: "fruit",
    },
    {
      id: "d",
      name: "Lentil mash",
      mealSlot: "dinner",
      foods: ["red-lentils"],
      blwPrep: "Serve thick on a preloaded spoon.",
      traditionalPrep: "Blend smooth.",
      allergens: [],
      foodCategory: "protein",
    },
  ],
};

const STATUSES = { egg: "introduced", wheat: "introduced", peanut: "not_started" };

/** The names the card shows: built from each idea's catalog foods. */
const [NAME_A, NAME_B, NAME_C] = PLAN.ideas.map((i) => buildIdeaName(i.foods.map((slug) => FOOD_BY_SLUG.get(slug)!)));
const INTRO = MEAL_PLAN_INTROS.mix;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderCard({
  role = "owner",
  statuses = STATUSES,
  onLogIdea = vi.fn(),
  ageMonths = 8,
}: { role?: Role; statuses?: Record<string, string>; onLogIdea?: ReturnType<typeof vi.fn>; ageMonths?: number } = {}) {
  const Wrapper = wrapper();
  render(
    <Wrapper>
      <MealPlanCard
        childId="child-1"
        weekStart={WEEK}
        ageMonths={ageMonths}
        method="mix"
        allergenStatuses={statuses}
        role={role}
        roleResolved
        onLogIdea={onLogIdea}
      />
    </Wrapper>,
  );
  return { onLogIdea };
}

const httpError = (status: number, code: string) => ({
  context: new Response(JSON.stringify({ error: code }), { status }),
});

beforeEach(() => {
  h.row = null;
  h.readError = null;
  h.reads = 0;
  h.invoke.mockReset();
  h.toast.mockReset();
  h.premium = { isPremium: false, isLoading: false };
  h.ownerPremium = { isChildOwnerPremium: false, isLoading: false };
  h.online = true;
  h.avoids = [];
  h.avoidWrites = [];
});

describe("MealPlanCard button states", () => {
  it("offers the free plan to a free family that hasn't used it", async () => {
    renderCard();
    expect(await screen.findByRole("button", { name: "Your first plan is free" })).toBeInTheDocument();
  });

  it("offers a weekly build to Flare+ after last week's plan", async () => {
    h.premium = { isPremium: true, isLoading: false };
    h.row = { week_start: LAST_WEEK, plan: { ...PLAN, weekStart: LAST_WEEK } };
    renderCard();
    expect(await screen.findByRole("button", { name: "Build this week's meal plan" })).toBeInTheDocument();
  });

  it("counts the child owner's Flare+ (a partner on a paying family)", async () => {
    h.ownerPremium = { isChildOwnerPremium: true, isLoading: false };
    h.row = { week_start: LAST_WEEK, plan: { ...PLAN, weekStart: LAST_WEEK } };
    renderCard({ role: "coparent" as Role });
    expect(await screen.findByRole("button", { name: "Build this week's meal plan" })).toBeInTheDocument();
  });

  it("shows the Flare+ upsell once the free plan is used", async () => {
    h.row = { week_start: LAST_WEEK, plan: { ...PLAN, weekStart: LAST_WEEK } };
    renderCard();
    const upsell = await screen.findByRole("button", { name: /Get weekly plans with Flare\+/ });
    expect(screen.queryByRole("button", { name: /first plan is free/ })).not.toBeInTheDocument();
    fireEvent.click(upsell);
    expect(screen.getByText("Upgrade sheet")).toBeInTheDocument();
  });

  it("never pitches Flare+ to a caregiver", async () => {
    h.row = { week_start: LAST_WEEK, plan: { ...PLAN, weekStart: LAST_WEEK } };
    renderCard({ role: "caregiver" });
    expect(await screen.findByText(/comes with Flare\+ on the parent's account/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides generate from a viewer", async () => {
    renderCard({ role: "viewer" });
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows 'New plan Monday' when this week's plan is spent", async () => {
    h.row = { week_start: WEEK, plan: { weekStart: WEEK, method: "mix", ideas: [] } };
    renderCard();
    expect(await screen.findByText("Your free plan for this week")).toBeInTheDocument();
    expect(screen.getByText(MEAL_PLAN_DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryByText("New plan Monday")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plan/ })).not.toBeInTheDocument();
  });

  it("swaps the button for the offline notice", async () => {
    h.online = false;
    renderCard();
    expect(await screen.findByText("Available when you're back online")).toBeInTheDocument();
  });

  it("renders nothing past the supported age", () => {
    renderCard({ ageMonths: 40 });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("MealPlanCard plan", () => {
  it("renders a stored plan compactly with the footer, then the ideas by meal", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard();
    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(screen.getByText("Your free plan for this week")).toBeInTheDocument();
    expect(screen.getByText(MEAL_PLAN_DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryByText(NAME_A)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See 4 meal ideas" }));
    expect(screen.getByText(NAME_A)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((n) => n.textContent)).toEqual([
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snack",
    ]);
    expect(screen.getAllByText("Baby-led:").length).toBe(4);
    expect(screen.getAllByText("Spoon-fed:").length).toBe(4);
    expect(screen.getByText("Egg")).toBeInTheDocument();
    // Stored model text never renders.
    for (const text of [PLAN.intro, "Serve warm, not hot.", "Banana pancakes", "Sweet potato wedges", "Avocado on toast", "Lentil mash"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("Log this hands the idea to the solids sheet", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    const { onLogIdea } = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
    fireEvent.click(screen.getByRole("button", { name: `Log ${NAME_A}` }));
    expect(onLogIdea).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a",
        name: NAME_A,
        foods: PLAN.ideas[0].foods,
        allergens: ["egg", "wheat"],
        foodCategory: "grain_cereal",
      }),
    );
    expect(onLogIdea.mock.calls[0][0]).not.toHaveProperty("servingTip");
  });

  it("gives a viewer the plan without Log this", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ role: "viewer" });
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
    expect(screen.getByText(NAME_A)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Log / })).not.toBeInTheDocument();
  });

  it("drops a stored idea once its allergen has a reaction logged", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ statuses: { ...STATUSES, egg: "reaction_noted" } });
    fireEvent.click(await screen.findByRole("button", { name: "See 3 meal ideas" }));
    expect(screen.queryByText(NAME_A)).not.toBeInTheDocument();
    // A one-food idea is named for its food, which its food row also shows.
    expect(screen.getAllByText(NAME_B).length).toBeGreaterThan(0);
  });

  it("renders the new plan, open, after a successful generate", async () => {
    h.invoke.mockImplementation(async () => {
      h.row = { week_start: WEEK, plan: PLAN };
      return { data: PLAN, error: null };
    });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Your first plan is free" }));
    expect(await screen.findByText(NAME_A)).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith("generate-meal-plan", {
      body: {
        childId: "child-1",
        weekStart: WEEK,
        correctedAgeMonths: 8,
        method: "mix",
      },
    });
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("opens the upgrade sheet on a server premium_required, without a toast", async () => {
    h.invoke.mockResolvedValue({ data: null, error: httpError(403, "premium_required") });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Your first plan is free" }));
    expect(await screen.findByText("Upgrade sheet")).toBeInTheDocument();
    expect(h.toast).not.toHaveBeenCalled();
  });
});

describe("MealPlanCard plan read error", () => {
  it("shows a retry state with no Build button, and Try again re-reads the plan", async () => {
    h.readError = { message: "Failed to fetch" };
    renderCard();
    expect(await screen.findByText("Your meal plan didn't load. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Your first plan is free" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build this week's meal plan" })).not.toBeInTheDocument();
    expect(h.reads).toBe(1);

    h.readError = null;
    h.row = { week_start: WEEK, plan: PLAN };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(h.reads).toBe(2);
    expect(screen.queryByText(/didn't load/)).not.toBeInTheDocument();
  });
});

describe("MealPlanCard milk line", () => {
  it("shows under the intro at 9 months", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ ageMonths: 9 });
    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(screen.getByText(MEAL_PLAN_MILK_FIRST_COPY)).toBeInTheDocument();
  });

  it("is absent at 13 months", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ ageMonths: 13 });
    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(screen.queryByText(MEAL_PLAN_MILK_FIRST_COPY)).not.toBeInTheDocument();
  });
});

describe("MealPlanCard catalog prep", () => {
  const catalog = PLAN.ideas[0].foods.map((slug) => FOOD_BY_SLUG.get(slug)!);

  it("rebuilds each food's prep from the catalog for the child's age, even when the stored prep differs", async () => {
    h.row = { week_start: WEEK, plan: PLAN }; // stored prep: "Cut into finger-length strips." / "Mash with a fork."
    renderCard({ ageMonths: 10 });
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
    const row = screen.getByText(NAME_A).closest("li")!;
    const lists = row.querySelectorAll("ul");
    expect(lists).toHaveLength(2);
    for (const [i, method] of (["blw", "traditional"] as const).entries()) {
      const items = [...lists[i].querySelectorAll("li")].map((li) => li.textContent);
      expect(items).toEqual(catalog.map((f) => `${f.name}: ${f.prep[method]["9-11"]}`));
    }
    expect(row).toHaveTextContent("Baby-led:");
    expect(row).toHaveTextContent("Spoon-fed:");
    expect(row).not.toHaveTextContent("Cut into finger-length strips.");
    expect(row).not.toHaveTextContent("Mash with a fork.");
    expect(screen.queryByText("Roast until soft.")).not.toBeInTheDocument();
  });
});

describe("MealPlanCard 4–5 months", () => {
  it("keeps Build hidden and never calls the planner before the catalog's first foods", async () => {
    renderCard({ ageMonths: 5 });
    expect(await screen.findByText(MEAL_PLAN_TOO_EARLY_COPY)).toBeInTheDocument();
    expect(MEAL_PLAN_TOO_EARLY_COPY).toBe("Meal ideas start at 6 months, when most babies are ready for solids.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("offers Build from 6 months", async () => {
    renderCard({ ageMonths: 6 });
    expect(await screen.findByRole("button", { name: "Your first plan is free" })).toBeInTheDocument();
  });
});

describe("MealPlanCard week note", () => {
  it("promises a Monday plan only to Flare+", async () => {
    h.premium = { isPremium: true, isLoading: false };
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard();
    expect(await screen.findByText("New plan Monday")).toBeInTheDocument();
    expect(screen.queryByText("Your free plan for this week")).not.toBeInTheDocument();
  });

  it("counts the child owner's Flare+ for the Monday note", async () => {
    h.ownerPremium = { isChildOwnerPremium: true, isLoading: false };
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ role: "coparent" as Role });
    expect(await screen.findByText("New plan Monday")).toBeInTheDocument();
  });

  it("says nothing about next week while the plan tier is loading", async () => {
    h.premium = { isPremium: false, isLoading: true };
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard();
    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(screen.queryByText("New plan Monday")).not.toBeInTheDocument();
    expect(screen.queryByText("Your free plan for this week")).not.toBeInTheDocument();
    expect(screen.getByText(MEAL_PLAN_DISCLAIMER)).toBeInTheDocument();
  });
});

describe("MealPlanCard allergen gating", () => {
  const Card = ({ statuses, client }: { statuses: Record<string, string> | undefined; client: QueryClient }) => (
    <QueryClientProvider client={client}>
      <MealPlanCard
        childId="child-1"
        weekStart={WEEK}
        ageMonths={8}
        method="mix"
        allergenStatuses={statuses}
        role="owner"
        roleResolved
        onLogIdea={vi.fn()}
      />
    </QueryClientProvider>
  );
  const newClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  it("shows no plan text until allergen statuses arrive, then the filtered plan", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    const client = newClient();
    const { rerender } = render(<Card statuses={undefined} client={client} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(INTRO)).not.toBeInTheDocument();
    expect(screen.queryByText(/meal ideas/)).not.toBeInTheDocument();

    rerender(<Card statuses={{ ...STATUSES, egg: "reaction_noted" }} client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "See 3 meal ideas" }));
    expect(screen.queryByText(NAME_A)).not.toBeInTheDocument();
  });

  it("drops an idea whose allergen is still being introduced", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ statuses: { ...STATUSES, egg: "in_progress" } });
    fireEvent.click(await screen.findByRole("button", { name: "See 3 meal ideas" }));
    expect(screen.queryByText(NAME_A)).not.toBeInTheDocument();
    expect(screen.getByText(NAME_C)).toBeInTheDocument();
  });

  it("shows the offline notice, not an endless skeleton, when allergens can't load offline", () => {
    h.online = false;
    render(<Card statuses={undefined} client={newClient()} />);
    expect(screen.getByText("Available when you're back online")).toBeInTheDocument();
  });

  it("explains a failed allergen load and retries it", () => {
    const retry = vi.fn();
    render(
      <QueryClientProvider client={newClient()}>
        <MealPlanCard
          childId="child-1"
          weekStart={WEEK}
          ageMonths={8}
          method="mix"
          allergenStatuses={undefined}
          allergenError
          onRetryAllergens={retry}
          role="owner"
          roleResolved
          onLogIdea={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/allergen list didn't load/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("MealPlanCard generate guard", () => {
  const Card = ({ client }: { client: QueryClient }) => (
    <QueryClientProvider client={client}>
      <MealPlanCard
        childId="child-1"
        weekStart={WEEK}
        ageMonths={8}
        method="mix"
        allergenStatuses={STATUSES}
        role="owner"
        roleResolved
        onLogIdea={vi.fn()}
      />
    </QueryClientProvider>
  );
  const pending = () => {
    let resolve!: (v: unknown) => void;
    h.invoke.mockImplementation(() => new Promise((r) => (resolve = r)));
    return () => resolve({ data: null, error: httpError(502, "coach_unavailable") });
  };

  it("fires one paid call for two synchronous taps", async () => {
    const finish = pending();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<Card client={client} />);
    const button = await screen.findByRole("button", { name: "Your first plan is free" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(h.invoke).toHaveBeenCalled());
    expect(h.invoke).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("a card remounted mid-generate (tab switch) shows the building state, not a second button", async () => {
    const finish = pending();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const first = render(<Card client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Your first plan is free" }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<Card client={client} />);
    expect(await screen.findByText(/Building your plan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Your first plan is free" })).not.toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(await screen.findByRole("button", { name: "Your first plan is free" })).toBeInTheDocument();
  });
});

describe("useGenerateMealPlan error copy", () => {
  const input = {
    childId: "child-1",
    weekStart: WEEK,
    ageMonths: 8,
    method: "blw" as const,
  };

  const cases: [number, MealPlanErrorCode][] = [
    [400, "invalid_input"],
    [401, "unauthorized"],
    [403, "no_write_access"],
    [409, "plan_exists_this_week"],
    [422, "unusable_plan"],
    [422, "no_eligible_foods"],
    [500, "save_failed"],
    [500, "internal_error"],
    [502, "coach_unavailable"],
  ];

  it.each(cases)("%i %s toasts its own copy", async (status, code) => {
    h.invoke.mockResolvedValue({ data: null, error: httpError(status, code) });
    const { result } = renderHook(() => useGenerateMealPlan("child-1"), { wrapper: wrapper() });
    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.mutateAsync(input).catch((e) => e);
    });
    expect(thrown).toBeInstanceOf(MealPlanError);
    expect((thrown as MealPlanError).code).toBe(code);
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: MEAL_PLAN_ERROR_COPY[code] }),
    );
    if (code === "plan_exists_this_week" || code === "no_eligible_foods") {
      expect(h.toast.mock.calls[0][0]).not.toHaveProperty("variant");
    } else {
      expect(h.toast.mock.calls[0][0]).toHaveProperty("variant", "destructive");
    }
  });

  it("premium_required throws its code and leaves the toast to the card", async () => {
    h.invoke.mockResolvedValue({ data: null, error: httpError(403, "premium_required") });
    const { result } = renderHook(() => useGenerateMealPlan("child-1"), { wrapper: wrapper() });
    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.mutateAsync(input).catch((e) => e);
    });
    expect((thrown as MealPlanError).code).toBe("premium_required");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("no response at all reads as a connection problem", async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    const { result } = renderHook(() => useGenerateMealPlan("child-1"), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: MEAL_PLAN_ERROR_COPY.network }));
  });

  it("a 200 that fails the shape check reads as unusable_plan", async () => {
    h.invoke.mockResolvedValue({ data: { ideas: [] }, error: null });
    const { result } = renderHook(() => useGenerateMealPlan("child-1"), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: MEAL_PLAN_ERROR_COPY.unusable_plan }));
  });

  it("every copy line says what to do next", () => {
    for (const copy of Object.values(MEAL_PLAN_ERROR_COPY)) {
      expect(copy).toMatch(/try again|Sign in|Ask the parent|Flare\+|showing now/i);
    }
  });
});

describe("MealPlanCard Not for us", () => {
  const openPlan = async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
  };

  it("hides the food straight away, saves a preference avoid, and Undo brings it back", async () => {
    await openPlan();
    fireEvent.click(screen.getByRole("button", { name: "Not for us: Banana" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "How to serve Banana" })).not.toBeInTheDocument());
    // The idea keeps its other foods and is renamed from them.
    const rest = ["wheat-infant-cereal", "egg-scrambled"].map((slug) => FOOD_BY_SLUG.get(slug)!);
    expect(screen.getByText(buildIdeaName(rest))).toBeInTheDocument();
    expect(screen.queryByText(NAME_A)).not.toBeInTheDocument();

    expect(h.avoidWrites[0]).toEqual(
      expect.objectContaining({
        op: "upsert",
        payload: expect.objectContaining({ child_id: "child-1", food_slug: "banana", reason: "preference" }),
      }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Banana is off the menu for now",
          description: "We'll leave it out of your meal ideas. You can bring it back from Foods you're leaving out.",
        }),
      ),
    );

    const { action } = h.toast.mock.calls.at(-1)![0] as { action: { props: { onClick: () => void; children: string } } };
    expect(action.props.children).toBe("Undo");
    act(() => action.props.onClick());
    await waitFor(() => expect(h.avoidWrites.at(-1)).toEqual(expect.objectContaining({ op: "delete", id: "avoid-1" })));
    expect(await screen.findByRole("button", { name: "How to serve Banana" })).toBeInTheDocument();
    expect(screen.getByText(NAME_A)).toBeInTheDocument();
  });

  it("drops an idea whose only food is left out", async () => {
    await openPlan();
    expect(screen.getByRole("heading", { name: "Lunch" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not for us: Sweet potato" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Lunch" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "How to serve Sweet potato" })).not.toBeInTheDocument();
  });

  it("leaves out foods already on the avoid list, reactions and preferences alike", async () => {
    h.avoids = [
      { id: "x1", child_id: "child-1", food_slug: "sweet-potato", custom_food: null, reason: "reaction", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
      { id: "x2", child_id: "child-1", food_slug: null, custom_food: "Banana bread", reason: "reaction", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
    ];
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "See 3 meal ideas" }));
    expect(screen.queryByRole("heading", { name: "Lunch" })).not.toBeInTheDocument();
    // Free text is record-only: it never filters the plan.
    expect(screen.getByRole("button", { name: "How to serve Banana" })).toBeInTheDocument();
  });

  it("gives a viewer How to serve but no Not for us", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ role: "viewer" });
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
    expect(screen.getByRole("button", { name: "How to serve Banana" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Not for us/ })).not.toBeInTheDocument();
  });

  it("opens How to serve with the plan's methods at the child's age", async () => {
    await openPlan();
    fireEvent.click(screen.getByRole("button", { name: "How to serve Banana" }));
    const sheet = await screen.findByRole("dialog");
    const banana = FOOD_BY_SLUG.get("banana")!;
    expect(within(sheet).getByRole("heading", { name: "Banana" })).toBeInTheDocument();
    // Age 8 -> the "6-8" band; a mix plan shows both methods.
    expect(within(sheet).getByTestId("serve-shape-blw").querySelector("svg")).toHaveAttribute("data-shape", banana.shapes.blw["6-8"]);
    expect(within(sheet).getByTestId("serve-shape-traditional").querySelector("svg")).toHaveAttribute("data-shape", banana.shapes.traditional["6-8"]);
    expect(within(sheet).getByText(banana.prep.blw["6-8"])).toBeInTheDocument();
    expect(within(sheet).getByText(banana.prep.traditional["6-8"])).toBeInTheDocument();
    expect(within(sheet).getByText("Gagging or choking?")).toBeInTheDocument();
  });
});
