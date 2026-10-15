import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AllergenTracker from "@/components/feeding/AllergenTracker";
import { toast } from "@/hooks/use-toast";
import { insertAllergenExposure } from "@/services/allergenExposureWrite";

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const BACKDATED_AT = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

type Write = {
  table: string;
  op: "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  filters: Record<string, unknown>;
};

const { writes, state } = vi.hoisted(() => ({
  writes: [] as Write[],
  state: {
    role: "owner",
    dob: "2026-01-01",
    intro: null as Record<string, unknown> | null,
    otherIntros: [] as Record<string, unknown>[],
    reactions: [] as Record<string, unknown>[],
  },
}));

const EGG = {
  id: "allergen-egg",
  slug: "egg",
  name: "Egg",
  sort_order: 2,
  introduction_age_weeks_min: 17,
  introduction_age_weeks_max: 26,
  clinical_guidance: "Offer well-cooked egg.",
  clinical_source: "AAP",
  common_forms: [],
};

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

const log = (n: number, msAgo: number, reaction = false) => ({
  id: `log-${n}`,
  exposure_number: n,
  logged_at: ago(msAgo),
  reaction_observed: reaction,
});

const makeIntro = (status: string, logs: ReturnType<typeof log>[], extra: Record<string, unknown> = {}) => ({
  id: "intro-1",
  allergen_id: PEANUT.id,
  child_id: "child-1",
  status,
  // Past the 7-day sign-off grace so Due and lapsed can show.
  completed_at: status === "completed" ? ago(20 * DAY) : null,
  first_introduced_at: logs[0]?.logged_at ?? null,
  is_high_risk: false,
  allergen_exposure_logs: logs,
  ...extra,
});

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const s: { op?: Write["op"]; payload?: Record<string, unknown>; filters: Record<string, unknown> } = { filters: {} };
    const result = () => {
      if (s.op) writes.push({ table, op: s.op, payload: s.payload, filters: s.filters });
      if (s.op === "insert" && table === "allergen_exposure_logs") {
        return { data: { id: "log-new", ...s.payload }, error: null };
      }
      if (s.op === "update" || s.op === "delete") return { data: [{ id: s.filters.id }], error: null };
      if (!s.op && table === "allergens") return { data: [PEANUT, EGG], error: null };
      if (!s.op && table === "allergen_introductions") {
        return { data: [...(state.intro ? [state.intro] : []), ...state.otherIntros], error: null };
      }
      if (!s.op && table === "allergen_reactions") return { data: state.reactions, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        s.filters[col] = val;
        return chain;
      },
      in: () => chain,
      order: () => chain,
      insert: (payload: Record<string, unknown>) => {
        s.op = "insert";
        s.payload = payload;
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        s.op = "update";
        s.payload = payload;
        return chain;
      },
      delete: () => {
        s.op = "delete";
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
  useChildren: () => ({ activeChild: { id: "child-1", name: "Rae", date_of_birth: state.dob } }),
}));

vi.mock("@/hooks/useCurrentRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCurrentRole")>();
  return { ...actual, useCurrentRoleQuery: () => ({ role: state.role, isResolved: true }) };
});

vi.mock("@/components/AddChildDialog", () => ({ AddChildDialog: () => null }));

// Pass-through spy: proves "Had it today" writes through the shared helper
// that FeedingLog's allergen chips also use.
vi.mock("@/services/allergenExposureWrite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/allergenExposureWrite")>();
  return { ...actual, insertAllergenExposure: vi.fn(actual.insertAllergenExposure) };
});

// The real wheel picker can't be driven from jsdom.
vi.mock("@/components/MobileDateTimePicker", () => ({
  MobileDateTimePicker: ({
    value, onChange, label, minDate,
  }: { value: Date; onChange: (d: Date) => void; label?: string; minDate?: Date }) => (
    <div>
      <span data-testid="picker-label">{label}</span>
      <span data-testid="picker-value">{value.toISOString()}</span>
      <span data-testid="picker-min">{minDate?.toISOString() ?? ""}</span>
      <button type="button" onClick={() => onChange(new Date(BACKDATED_AT))}>
        back-date
      </button>
      <button type="button" onClick={() => onChange(new Date(Date.now() - 60 * DAY))}>
        too-early
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
  await screen.findByText("Offer thinned peanut butter.");
};

const writesTo = (table: string, op: Write["op"]) => writes.filter((w) => w.table === table && w.op === op);

beforeEach(() => {
  writes.length = 0;
  state.role = "owner";
  state.dob = "2026-01-01";
  state.intro = null;
  state.otherIntros = [];
  state.reactions = [];
  vi.mocked(toast).mockClear();
  vi.mocked(insertAllergenExposure).mockClear();
});

describe("sign-off card", () => {
  beforeEach(() => {
    state.intro = makeIntro("in_progress", [log(1, 6 * DAY), log(2, 2 * DAY)]);
  });

  it("asks the question after two clean exposures and confirming writes completed", async () => {
    await openPeanut();

    expect(screen.getByText("Did Rae eat a typical portion with no reaction?")).toBeInTheDocument();
    expect(
      screen.getByText("Two reaction-free tastes is a great sign. Confirming moves Peanut to keeping it on the menu."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/check with your pediatrician before you confirm/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log Exposure #3/ })).not.toBeInTheDocument();
    expect(writesTo("allergen_introductions", "update")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Yes, it's on the menu/ }));

    await waitFor(() => expect(writesTo("allergen_introductions", "update")).toHaveLength(1));
    const [update] = writesTo("allergen_introductions", "update");
    expect(update.payload).toMatchObject({ status: "completed" });
    expect(update.filters).toMatchObject({ id: "intro-1", status: "in_progress" });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Peanut is on the menu" })),
    );
  });

  it("labels the allergen Ready to confirm", async () => {
    renderTracker();
    expect(await screen.findByText("Ready to confirm")).toBeInTheDocument();
  });

  it("adds the pediatrician line for a high-risk intro", async () => {
    state.intro = makeIntro("in_progress", [log(1, 6 * DAY), log(2, 2 * DAY)], { is_high_risk: true });
    await openPeanut();
    expect(
      screen.getByText("Because Rae has a higher allergy risk, check with your pediatrician before you confirm."),
    ).toBeInTheDocument();
  });

  it("adds the pediatrician line when the child has any reaction history", async () => {
    state.reactions = [{ id: "rx-1", exposure_log_id: "other-log", severity: "mild", symptoms: [], observed_at: ago(DAY) }];
    await openPeanut();
    expect(screen.getByText(/check with your pediatrician before you confirm/)).toBeInTheDocument();
  });

  // After merging #290: Flag for Review attaches the reaction to exposure #2
  // through its "Log a reaction" flow instead of inserting an exposure #3.
  it("Flag for Review opens Log a reaction for the latest exposure", async () => {
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Flag for Review/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Log a reaction to exposure #2");
    expect(dialog).toHaveTextContent("What do you see?");
    expect(within(dialog).queryByText("When?")).not.toBeInTheDocument();
  });

  it("shows a viewer no write controls", async () => {
    state.role = "viewer";
    await openPeanut();
    expect(screen.queryByText("Did Rae eat a typical portion with no reaction?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yes, it's on the menu/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Flag for Review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo exposure/ })).not.toBeInTheDocument();
  });
});

describe("protocol exposure #2", () => {
  it("hides Log Exposure #2 from a viewer", async () => {
    state.role = "viewer";
    state.intro = makeIntro("in_progress", [log(1, 4 * DAY)]);
    await openPeanut();
    expect(screen.queryByRole("button", { name: /Log Exposure #2/ })).not.toBeInTheDocument();
  });

  it("has no 3-day gate: exposure #2 logs the next day without a question", async () => {
    state.intro = makeIntro("in_progress", [log(1, 26 * 60 * 60 * 1000)]);
    await openPeanut();
    expect(screen.getByText("Offer it again")).toBeInTheDocument();
    expect(screen.getByText("Offer it again on another day, in the next few days.")).toBeInTheDocument();
    expect(screen.queryByText(/Wait until|3-day wait|Wait 3 Days/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writesTo("allergen_exposure_logs", "insert")[0].payload).toMatchObject({ exposure_number: 2 });
    expect(screen.queryByText("Offer the second taste today?")).not.toBeInTheDocument();
  });

  it("asks before logging exposure #2 on the same day as #1, and only writes on Log it anyway", async () => {
    state.intro = makeIntro("in_progress", [log(1, 1000)]);
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Save Exposure" }));

    expect(await screen.findByText("Offer the second taste today?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change the time" }));
    await waitFor(() =>
      expect(screen.queryByText("Offer the second taste today?")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));
    fireEvent.click(await screen.findByRole("button", { name: "Log it anyway" }));
    await waitFor(() => expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writesTo("allergen_exposure_logs", "insert")[0].payload).toMatchObject({ exposure_number: 2 });
  });

  it("never holds a same-day reaction behind the question", async () => {
    state.intro = makeIntro("in_progress", [log(1, 1000)]);
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Log Exposure #2/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Mild/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Exposure" }));

    await waitFor(() => expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writesTo("allergen_reactions", "insert")).toHaveLength(1);
    expect(screen.queryByText("Offer the second taste today?")).not.toBeInTheDocument();
  });

  it("shows a nudge from day 4 when exposure #2 isn't logged yet", async () => {
    state.intro = makeIntro("in_progress", [log(1, 4 * DAY)]);
    await openPeanut();
    expect(
      screen.getByText("Ready for another taste of peanut? Offering it again soon keeps the introduction on track."),
    ).toBeInTheDocument();
  });

  it("no nudge on the day of exposure #1", async () => {
    state.intro = makeIntro("in_progress", [log(1, 1000)]);
    await openPeanut();
    expect(screen.queryByText(/Ready for another taste/)).not.toBeInTheDocument();
  });
});

describe("spacing between new allergens", () => {
  const eggStartedAgo = (ms: number) => ({
    ...makeIntro("in_progress", [{ ...log(1, ms), id: "egg-log-1" }]),
    id: "intro-egg",
    allergen_id: EGG.id,
  });
  const SPACING = /You started egg .+ ago\. Waiting a few days between new allergens makes it easier to tell which food caused a reaction, if one happens\./;

  it("shows a soft note when another allergen started within 72 h; Not yet closes it", async () => {
    state.otherIntros = [eggStartedAgo(49 * 60 * 60 * 1000)];
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));

    expect(await screen.findByText(SPACING)).toHaveTextContent("You started egg 2 days ago.");
    expect(screen.queryByText("Before you offer Peanut")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByText(SPACING)).not.toBeInTheDocument());
    expect(screen.queryByText("Before you offer Peanut")).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("Start now continues to the start dialog", async () => {
    state.otherIntros = [eggStartedAgo(5 * 60 * 60 * 1000)];
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Start now" }));
    expect(await screen.findByText("Before you offer Peanut")).toBeInTheDocument();
  });

  it("goes straight to the start dialog when the other allergen started 72+ h ago", async () => {
    state.otherIntros = [eggStartedAgo(72 * 60 * 60 * 1000)];
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Start First Exposure/ }));
    expect(await screen.findByText("Before you offer Peanut")).toBeInTheDocument();
    expect(screen.queryByText(SPACING)).not.toBeInTheDocument();
  });

  it("never shows for a maintenance serving", async () => {
    state.intro = makeIntro("completed", [log(1, 12 * DAY), log(2, 8 * DAY), log(3, 2 * DAY)]);
    state.otherIntros = [eggStartedAgo(60 * 60 * 1000)];
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Had it today/ }));
    expect(await screen.findByText("Log a serving of Peanut?")).toBeInTheDocument();
    expect(screen.queryByText(SPACING)).not.toBeInTheDocument();
  });
});

describe("keep it on the menu", () => {
  beforeEach(() => {
    state.intro = makeIntro("completed", [log(1, 12 * DAY), log(2, 8 * DAY), log(3, 2 * DAY)]);
  });

  it("shows this week's progress, the guidance and a Due badge", async () => {
    await openPeanut();
    expect(screen.getByText("Keep it on the menu")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 this week")).toBeInTheDocument();
    expect(screen.getByText("About 3 servings a week, roughly 2 tsp thinned peanut butter each")).toBeInTheDocument();
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(screen.getAllByText("Introduced").length).toBeGreaterThan(0);
  });

  it("Had it today writes the next exposure number at the chosen time", async () => {
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Had it today/ }));
    await screen.findByText("Log a serving of Peanut?");
    expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "back-date" }));
    fireEvent.click(screen.getByRole("button", { name: "Log serving" }));

    await waitFor(() => expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writesTo("allergen_exposure_logs", "insert")[0].payload).toMatchObject({
      allergen_introduction_id: "intro-1",
      exposure_number: 4,
      logged_at: BACKDATED_AT,
      reaction_observed: false,
    });
    expect(insertAllergenExposure).toHaveBeenCalledTimes(1);
    expect(writesTo("allergen_reactions", "insert")).toHaveLength(0);
    expect(writesTo("allergen_introductions", "update")).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Log a serving of Peanut?")).not.toBeInTheDocument());
    // Back-dated 5 hours, so the 2-hour watch is already over.
    expect(toast).toHaveBeenCalledWith({ title: "Serving logged", description: "" });
  });

  it("won't let a serving predate the latest exposure", async () => {
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Had it today/ }));
    await screen.findByText("Log a serving of Peanut?");
    const latest = (state.intro!.allergen_exposure_logs as { logged_at: string }[])[2].logged_at;
    expect(screen.getByTestId("picker-min")).toHaveTextContent(latest);

    fireEvent.click(screen.getByRole("button", { name: "too-early" }));
    expect(screen.getByTestId("picker-value")).toHaveTextContent(latest);
    fireEvent.click(screen.getByRole("button", { name: "Log serving" }));

    await waitFor(() => expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writesTo("allergen_exposure_logs", "insert")[0].payload).toMatchObject({ logged_at: latest });
  });

  it("clamps at save time when a newer exposure arrives while the dialog is open", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AllergenTracker />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText("Peanut"));
    fireEvent.click(await screen.findByRole("button", { name: /Had it today/ }));
    await screen.findByText("Log a serving of Peanut?");
    fireEvent.click(screen.getByRole("button", { name: "back-date" }));

    // A partner logs a serving an hour ago, after the back-dated time already picked here.
    const partnerLog = log(4, 60 * 60 * 1000);
    state.intro = makeIntro("completed", [log(1, 12 * DAY), log(2, 8 * DAY), log(3, 2 * DAY), partnerLog]);
    await client.invalidateQueries({ queryKey: ["allergen-introductions"] });
    await waitFor(() => expect(screen.getByTestId("picker-min")).toHaveTextContent(partnerLog.logged_at));
    expect(screen.getByTestId("picker-value")).toHaveTextContent(BACKDATED_AT);

    fireEvent.click(screen.getByRole("button", { name: "Log serving" }));
    await waitFor(() => expect(writesTo("allergen_exposure_logs", "insert")).toHaveLength(1));
    expect(writesTo("allergen_exposure_logs", "insert")[0].payload).toMatchObject({
      exposure_number: 5,
      logged_at: partnerLog.logged_at,
    });
  });

  it("Noticed a reaction? hands the chosen time to the reaction dialog for the next exposure", async () => {
    await openPeanut();
    fireEvent.click(screen.getByRole("button", { name: /Had it today/ }));
    await screen.findByText("Log a serving of Peanut?");
    fireEvent.click(screen.getByRole("button", { name: "back-date" }));
    fireEvent.click(screen.getByRole("button", { name: "Noticed a reaction?" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Log Exposure #4");
    expect(within(dialog).getByTestId("picker-label")).toHaveTextContent("When?");
    expect(within(dialog).getByTestId("picker-value")).toHaveTextContent(BACKDATED_AT);
    expect(screen.queryByText("Log a serving of Peanut?")).not.toBeInTheDocument();
  });

  it("hides Had it today from a viewer but still shows progress", async () => {
    state.role = "viewer";
    await openPeanut();
    expect(screen.getByText("1 of 3 this week")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Had it today/ })).not.toBeInTheDocument();
  });

  it("shows a gentle lapsed card after 14 days without an exposure", async () => {
    state.intro = makeIntro("completed", [log(1, 30 * DAY), log(2, 15 * DAY)]);
    await openPeanut();
    expect(
      screen.getByText("Time for another taste of Peanut. Regular servings help keep it on the menu."),
    ).toBeInTheDocument();
  });

  it("drops the Due badge and lapsed card at 36 months but keeps progress", async () => {
    state.dob = "2022-01-01";
    state.intro = makeIntro("completed", [log(1, 30 * DAY), log(2, 15 * DAY)]);
    await openPeanut();
    expect(screen.getByText("0 of 3 this week")).toBeInTheDocument();
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
    expect(screen.queryByText(/Time for another taste/)).not.toBeInTheDocument();
  });

  it("shows no Due badge in the first week after sign-off", async () => {
    state.intro = makeIntro("completed", [log(1, 12 * DAY), log(2, 8 * DAY)], { completed_at: ago(6 * DAY) });
    await openPeanut();
    expect(screen.getByText("0 of 3 this week")).toBeInTheDocument();
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
  });

  it("shows progress and Due on the overview card", async () => {
    renderTracker();
    await screen.findByText("Peanut");
    expect(screen.getByText("1 of 3 this week")).toBeInTheDocument();
    expect(screen.getByText("Due")).toBeInTheDocument();
  });
});
