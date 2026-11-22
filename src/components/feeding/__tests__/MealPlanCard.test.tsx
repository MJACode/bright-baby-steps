import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MealPlanCard } from "@/components/feeding/MealPlanCard";
import { MEAL_PLAN_ERROR_COPY, MealPlanError, useGenerateMealPlan, type MealPlanErrorCode } from "@/hooks/useMealPlan";
import { MEAL_PLAN_DISCLAIMER } from "@/lib/mealPlanCopy";
import type { Role } from "@/hooks/useCurrentRole";

const h = vi.hoisted(() => ({
  row: null as { week_start: string; plan: unknown } | null,
  invoke: vi.fn(),
  toast: vi.fn(),
  premium: { isPremium: false, isLoading: false },
  ownerPremium: { isChildOwnerPremium: false, isLoading: false },
  online: true,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }),
    }),
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

const PLAN = {
  weekStart: WEEK,
  method: "mix",
  intro: "Soft, easy ideas for this week.",
  ideas: [
    {
      id: "a",
      name: "Banana pancakes",
      mealSlot: "breakfast",
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
      blwPrep: "Roast until soft.",
      traditionalPrep: "Purée with breast milk.",
      allergens: [],
      foodCategory: "vegetable",
    },
    {
      id: "c",
      name: "Avocado on toast",
      mealSlot: "snack",
      blwPrep: "Spread thin on toast strips.",
      traditionalPrep: "Mash smooth.",
      allergens: ["wheat"],
      foodCategory: "fruit",
    },
    {
      id: "d",
      name: "Lentil mash",
      mealSlot: "dinner",
      blwPrep: "Serve thick on a preloaded spoon.",
      traditionalPrep: "Blend smooth.",
      allergens: [],
      foodCategory: "protein",
    },
  ],
};

const STATUSES = { egg: "introduced", wheat: "introduced", peanut: "not_started" };

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
  h.invoke.mockReset();
  h.toast.mockReset();
  h.premium = { isPremium: false, isLoading: false };
  h.ownerPremium = { isChildOwnerPremium: false, isLoading: false };
  h.online = true;
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
    expect(await screen.findByText("New plan Monday")).toBeInTheDocument();
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
    expect(await screen.findByText(PLAN.intro)).toBeInTheDocument();
    expect(screen.getByText("New plan Monday")).toBeInTheDocument();
    expect(screen.getByText(MEAL_PLAN_DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryByText("Banana pancakes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See 4 meal ideas" }));
    expect(screen.getByText("Banana pancakes")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((n) => n.textContent)).toEqual([
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snack",
    ]);
    expect(screen.getAllByText("Baby-led:").length).toBe(4);
    expect(screen.getAllByText("Spoon-fed:").length).toBe(4);
    expect(screen.getByText("Serve warm, not hot.")).toBeInTheDocument();
    expect(screen.getByText("Egg")).toBeInTheDocument();
  });

  it("Log this hands the idea to the solids sheet", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    const { onLogIdea } = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
    fireEvent.click(screen.getByRole("button", { name: "Log Banana pancakes" }));
    expect(onLogIdea).toHaveBeenCalledWith(expect.objectContaining(PLAN.ideas[0]));
  });

  it("gives a viewer the plan without Log this", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ role: "viewer" });
    fireEvent.click(await screen.findByRole("button", { name: "See 4 meal ideas" }));
    expect(screen.getByText("Banana pancakes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Log / })).not.toBeInTheDocument();
  });

  it("drops a stored idea once its allergen has a reaction logged", async () => {
    h.row = { week_start: WEEK, plan: PLAN };
    renderCard({ statuses: { ...STATUSES, egg: "reaction_noted" } });
    fireEvent.click(await screen.findByRole("button", { name: "See 3 meal ideas" }));
    expect(screen.queryByText("Banana pancakes")).not.toBeInTheDocument();
    expect(screen.getByText("Sweet potato wedges")).toBeInTheDocument();
  });

  it("renders the new plan, open, after a successful generate", async () => {
    h.invoke.mockImplementation(async () => {
      h.row = { week_start: WEEK, plan: PLAN };
      return { data: PLAN, error: null };
    });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Your first plan is free" }));
    expect(await screen.findByText("Banana pancakes")).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith("generate-meal-plan", {
      body: {
        childId: "child-1",
        weekStart: WEEK,
        correctedAgeMonths: 8,
        method: "mix",
        introducedAllergens: ["egg", "wheat"],
        reactionAllergens: [],
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

describe("useGenerateMealPlan error copy", () => {
  const input = {
    childId: "child-1",
    weekStart: WEEK,
    ageMonths: 8,
    method: "blw" as const,
    allergenStatuses: STATUSES,
  };

  const cases: [number, MealPlanErrorCode][] = [
    [400, "invalid_input"],
    [401, "unauthorized"],
    [403, "no_write_access"],
    [409, "plan_exists_this_week"],
    [422, "unusable_plan"],
    [500, "save_failed"],
    [500, "internal_error"],
    [502, "coach_unavailable"],
  ];

  it.each(cases)("%i %s toasts its own copy", async (status, code) => {
    h.invoke.mockResolvedValue({ data: null, error: httpError(status, code) });
    const { result } = renderHook(() => useGenerateMealPlan(), { wrapper: wrapper() });
    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.mutateAsync(input).catch((e) => e);
    });
    expect(thrown).toBeInstanceOf(MealPlanError);
    expect((thrown as MealPlanError).code).toBe(code);
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: MEAL_PLAN_ERROR_COPY[code] }),
    );
    if (code === "plan_exists_this_week") {
      expect(h.toast.mock.calls[0][0]).not.toHaveProperty("variant");
    } else {
      expect(h.toast.mock.calls[0][0]).toHaveProperty("variant", "destructive");
    }
  });

  it("premium_required throws its code and leaves the toast to the card", async () => {
    h.invoke.mockResolvedValue({ data: null, error: httpError(403, "premium_required") });
    const { result } = renderHook(() => useGenerateMealPlan(), { wrapper: wrapper() });
    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.mutateAsync(input).catch((e) => e);
    });
    expect((thrown as MealPlanError).code).toBe("premium_required");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("no response at all reads as a connection problem", async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    const { result } = renderHook(() => useGenerateMealPlan(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: MEAL_PLAN_ERROR_COPY.network }));
  });

  it("a 200 that fails the shape check reads as unusable_plan", async () => {
    h.invoke.mockResolvedValue({ data: { ideas: [] }, error: null });
    const { result } = renderHook(() => useGenerateMealPlan(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: MEAL_PLAN_ERROR_COPY.unusable_plan }));
  });

  it("every copy line says what to do next", () => {
    for (const copy of Object.values(MEAL_PLAN_ERROR_COPY)) {
      expect(copy).toMatch(/try again|Sign in|Ask the parent|Flare\+|Monday/i);
    }
  });
});
