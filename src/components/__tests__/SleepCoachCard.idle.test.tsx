import { render, screen, within } from "@testing-library/react";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import { FeedCoachCard } from "@/components/feeding/FeedCoachCard";
import { SLEEPY_CUES } from "@/lib/sleepCoachState";
import { HUNGER_CUES } from "@/lib/feedCoach";

const NOW = new Date("2026-11-26T15:00:00Z");
const MIN = 60_000;
const at = (offsetMin: number) => new Date(NOW.getTime() + offsetMin * MIN);

const state = vi.hoisted(() => ({
  premium: true,
  markGate: false,
  coach: null as unknown,
  wake: {} as Record<string, unknown>,
  feed: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useCaregiverCoachHidden", () => ({ useCaregiverCoachHidden: () => false }));
vi.mock("@/components/PremiumGate", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) =>
    state.markGate ? <div data-testid="gated">{children}</div> : <>{children}</>,
}));
vi.mock("@/hooks/usePremium", () => ({
  usePremium: () => ({ isPremium: state.premium, isLoading: false }),
  useChildOwnerPremium: () => ({ isChildOwnerPremium: false, isLoading: false }),
}));
vi.mock("@/components/sleep/WakeWindowSheet", () => ({
  WakeWindowWhyButton: () => <button type="button">Why this time?</button>,
  WakeWindowSuggestionCard: () => null,
  WakeWindowWhySheet: () => null,
}));
vi.mock("@/hooks/useSleepCoach", () => ({ useSleepCoach: () => ({ data: state.coach }) }));
vi.mock("@/hooks/useSleepPlan", () => ({ useSleepPlan: () => ({ data: null }) }));
vi.mock("@/hooks/useActiveSleep", () => ({
  useActiveSleep: () => ({ start: { isPending: false, mutateAsync: vi.fn() } }),
}));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => ({ prefs: { calmMode: false } }) }));
vi.mock("@/hooks/useTrackingSchedule", () => ({ useTrackingSchedule: () => ({}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useWakePrediction", () => ({ useWakePrediction: () => state.wake }));
vi.mock("@/hooks/useFeedCoach", () => ({ useFeedCoach: () => state.feed }));

const child = {
  id: "c1",
  name: "Ada Lovelace",
  date_of_birth: "2026-07-26",
  parent_id: "p1",
};

const endedNap = (endOffsetMin: number) => ({
  started_at: at(endOffsetMin - 60).toISOString(),
  ended_at: at(endOffsetMin).toISOString(),
  duration_minutes: 60,
  sleep_type: "nap",
  source: "timer",
});

function coachData(opts: { logs?: unknown[]; windowStartOffsetMin?: number | null }) {
  const start = opts.windowStartOffsetMin;
  return {
    prediction:
      start == null
        ? null
        : {
            windowStart: at(start),
            windowEnd: at(start + 30),
            confidence: "medium",
            reason: "Based on a few afternoon naps — improving with more data.",
            windowMin: 105,
          },
    logs: opts.logs ?? [],
    ageMonths: 4,
    wakeWindow: null,
    hasSavedPlan: false,
  };
}

const cueTrigger = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  state.premium = true;
  state.markGate = false;
  state.wake = { wake: null, hungryOnWake: false, activeSleep: null, sleepTimerOn: false, now: NOW };
  state.feed = { now: NOW, night: null, ageMonths: 4, prediction: null, lastFeedAt: null };
});

describe("SleepCoachCard outside the nap window", () => {
  beforeEach(() => {
    // Window opens 3h out: deriveCoachState returns null.
    state.coach = coachData({ logs: [endedNap(-80)], windowStartOffsetMin: 180 });
  });

  it("renders the idle state on the Home card", () => {
    render(<SleepCoachCard activeChild={child} />);
    expect(screen.getByText("Sleep Coach")).toBeInTheDocument();
    expect(screen.getByText("Awake")).toBeInTheDocument();
    expect(screen.getByText("Awake for 1h 20m")).toBeInTheDocument();
    expect(
      screen.getByText("Most babies this age are ready for sleep after about 1h 15m – 2h 15m awake."),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Next nap around \d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
    expect(screen.getByText("General guidance — not medical advice.")).toBeInTheDocument();
    // Collapsed: no window is active.
    expect(cueTrigger(/sleepy cues/i)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(SLEEPY_CUES[0])).not.toBeInTheDocument();
  });

  it("keeps the Sleep tab strip empty, exactly as before", () => {
    const { container } = render(<SleepCoachCard activeChild={child} variant="strip" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("drops the prediction once the window is long past, keeping the free content", () => {
    state.coach = coachData({ logs: [endedNap(-80)], windowStartOffsetMin: -150 });
    render(<SleepCoachCard activeChild={child} />);
    expect(screen.getByText("Awake for 1h 20m")).toBeInTheDocument();
    expect(screen.queryByText(/^Next nap around/)).not.toBeInTheDocument();
  });

  it("invites a first log when there are no sleeps yet", () => {
    state.coach = coachData({ logs: [], windowStartOffsetMin: null });
    render(<SleepCoachCard activeChild={child} />);
    expect(screen.getByText("Tap Sleep to log a nap")).toBeInTheDocument();
    expect(screen.getByText(/^We'll learn Ada's rhythm from there\./)).toBeInTheDocument();
    expect(screen.queryByText("Awake")).not.toBeInTheDocument();
  });

  it("asks for the latest sleep instead of printing an implausible awake time", () => {
    state.coach = coachData({ logs: [endedNap(-6 * 60)], windowStartOffsetMin: null });
    render(<SleepCoachCard activeChild={child} />);
    expect(screen.getByText("Tap Sleep to log the latest sleep")).toBeInTheDocument();
    expect(screen.queryByText(/^Awake for/)).not.toBeInTheDocument();
  });

  it("renders nothing while a stale timer is still in the banner", () => {
    state.wake = { ...state.wake, sleepTimerOn: true };
    const { container } = render(<SleepCoachCard activeChild={child} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SleepCoachCard inside the nap window", () => {
  it("opens the sleepy cues and keeps the Start nap CTA", () => {
    state.coach = coachData({ logs: [endedNap(-100)], windowStartOffsetMin: -5 });
    render(<SleepCoachCard activeChild={child} />);
    expect(screen.getByText("Window open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start nap" })).toBeInTheDocument();
    expect(cueTrigger(/sleepy cues/i)).toHaveAttribute("aria-expanded", "true");
    for (const cue of SLEEPY_CUES) expect(screen.getByText(cue)).toBeInTheDocument();
  });

  it("collapses the cues in the heads-up stretch", () => {
    state.coach = coachData({ logs: [endedNap(-60)], windowStartOffsetMin: 40 });
    render(<SleepCoachCard activeChild={child} />);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(cueTrigger(/sleepy cues/i)).toHaveAttribute("aria-expanded", "false");
  });

  it("strip variant still renders the window, without the cue list", () => {
    state.coach = coachData({ logs: [endedNap(-100)], windowStartOffsetMin: -5 });
    render(<SleepCoachCard activeChild={child} variant="strip" />);
    expect(screen.getByText("Window open")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sleepy cues/i })).not.toBeInTheDocument();
    // SleepTimer directly below owns the Sleep tab's one Start button.
    expect(screen.queryByRole("button", { name: "Start nap" })).not.toBeInTheDocument();
  });
});

describe("SleepCoachCard Flare+ boundary", () => {
  beforeEach(() => {
    state.markGate = true;
  });

  it("keeps the window inside the gate and the free guidance outside it", () => {
    state.coach = coachData({ logs: [endedNap(-100)], windowStartOffsetMin: -5 });
    render(<SleepCoachCard activeChild={child} />);
    const gated = screen.getByTestId("gated");
    expect(within(gated).getByText("Window open")).toBeInTheDocument();
    expect(within(gated).getByRole("button", { name: "Start nap" })).toBeInTheDocument();
    expect(gated).not.toContainElement(screen.getByText("Awake for 1h 40m"));
    expect(gated).not.toContainElement(screen.getByRole("button", { name: /sleepy cues/i }));
  });

  it("gates the idle next-nap line too", () => {
    state.coach = coachData({ logs: [endedNap(-80)], windowStartOffsetMin: 180 });
    render(<SleepCoachCard activeChild={child} />);
    const gated = screen.getByTestId("gated");
    expect(within(gated).getByText(/^Next nap around/)).toBeInTheDocument();
    expect(gated).not.toContainElement(screen.getByText("Awake for 1h 20m"));
  });

  // An auto-opening list would announce the window to a free account, so
  // without predictions it follows awake time against the age minimum (75 min
  // at 4 months), never the prediction.
  it("opens the cues for a free account from awake time alone", () => {
    state.premium = false;
    state.coach = coachData({ logs: [endedNap(-30)], windowStartOffsetMin: -5 });
    const { unmount } = render(<SleepCoachCard activeChild={child} />);
    expect(cueTrigger(/sleepy cues/i)).toHaveAttribute("aria-expanded", "false");
    unmount();

    state.coach = coachData({ logs: [endedNap(-80)], windowStartOffsetMin: 180 });
    render(<SleepCoachCard activeChild={child} />);
    expect(cueTrigger(/sleepy cues/i)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("FeedCoachCard hunger cues", () => {
  const feedChild = { ...child, name: "Ada" };

  it("start open when the card is asking for a feed", () => {
    render(<FeedCoachCard activeChild={feedChild} lastFeedAt={at(-5 * 60)} />);
    expect(screen.getByText("Consider a feed")).toBeInTheDocument();
    expect(cueTrigger(/hunger cues/i)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(HUNGER_CUES[0])).toBeInTheDocument();
  });

  it("start collapsed shortly after a feed", () => {
    render(<FeedCoachCard activeChild={feedChild} lastFeedAt={at(-30)} />);
    expect(screen.getByText("Watch for cues")).toBeInTheDocument();
    expect(cueTrigger(/hunger cues/i)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(HUNGER_CUES[0])).not.toBeInTheDocument();
  });
});
