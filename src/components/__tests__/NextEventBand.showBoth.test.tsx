import { render, screen } from "@testing-library/react";
import { NextEventBand } from "@/components/NextEventBand";

const NOW = new Date("2026-10-16T12:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

const state = vi.hoisted(() => ({
  coach: undefined as unknown,
  feedPrediction: null as unknown,
  wake: { wake: null as unknown, hungryOnWake: false, activeSleep: null as unknown, sleepTimerOn: false },
}));

vi.mock("@/components/PremiumGate", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useSleepCoach", () => ({ useSleepCoach: () => ({ data: state.coach }) }));
vi.mock("@/hooks/useFeedCoach", () => ({
  useFeedCoach: () => ({ now: NOW, night: false, ageMonths: 4, prediction: state.feedPrediction, lastFeedAt: null }),
}));
vi.mock("@/hooks/useWakePrediction", () => ({
  useWakePrediction: () => ({ ...state.wake, now: NOW }),
}));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => ({ prefs: { calmMode: false } }) }));

const child = { id: "c1", name: "Ada", date_of_birth: "2026-06-01", parent_id: "owner" };

const nap = (min: number) => ({
  logs: [],
  prediction: { windowStart: at(min), windowEnd: at(min + 20), reason: "Nap reason" },
});
const feed = (min: number) => ({ windowStart: at(min), windowEnd: at(min + 20), reason: "Feed reason" });

beforeEach(() => {
  state.coach = undefined;
  state.feedPrediction = null;
  state.wake = { wake: null, hungryOnWake: false, activeSleep: null, sleepTimerOn: false };
});

const rowText = () =>
  screen.getAllByText((_, el) => el?.tagName === "P" && /^Likely|may be|wake/.test(el.textContent ?? ""))
    .map((el) => el.textContent);

describe("NextEventBand showBoth", () => {
  it("renders both rows, sooner first, under one header", () => {
    state.coach = nap(90);
    state.feedPrediction = feed(30);
    render(<NextEventBand activeChild={child} showBoth />);
    expect(screen.getAllByText("Coach predicts")).toHaveLength(1);
    const texts = rowText();
    expect(texts[0]).toBe("Likely hungry in ~30 min.");
    expect(texts[1]).toMatch(/^Likely sleepy around /);
    expect(screen.getByText("Nap reason")).toBeInTheDocument();
    expect(screen.getByText("Feed reason")).toBeInTheDocument();
  });

  it("shows only the feed row when there is no nap prediction", () => {
    state.coach = { logs: [], prediction: null };
    state.feedPrediction = feed(30);
    render(<NextEventBand activeChild={child} showBoth />);
    expect(rowText()).toEqual(["Likely hungry in ~30 min."]);
    expect(screen.queryByText(/sleepy/)).not.toBeInTheDocument();
  });

  it("while asleep shows the wake row and the hungry-on-wake row, never 'Likely sleepy'", () => {
    state.coach = nap(30);
    state.feedPrediction = feed(60);
    state.wake = {
      wake: { windowStart: at(40), windowEnd: at(70), reason: "Wake reason" },
      hungryOnWake: true,
      activeSleep: { sleep_type: "nap" },
      sleepTimerOn: true,
    };
    render(<NextEventBand activeChild={child} showBoth />);
    const texts = rowText();
    expect(texts[0]).toMatch(/^Likely to wake around /);
    expect(texts[1]).toBe("Ada may be hungry when they wake.");
    expect(screen.getByText("Wake reason")).toBeInTheDocument();
    expect(screen.queryByText(/sleepy/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Likely hungry/)).not.toBeInTheDocument();
  });

  it("while asleep with the feed due after the wake, shows the wake row then a timed feed row", () => {
    state.coach = { logs: [], prediction: null };
    state.feedPrediction = feed(120);
    state.wake = {
      wake: { windowStart: at(40), windowEnd: at(70), reason: "Wake reason" },
      hungryOnWake: false,
      activeSleep: { sleep_type: "nap" },
      sleepTimerOn: true,
    };
    render(<NextEventBand activeChild={child} showBoth />);
    const texts = rowText();
    expect(texts[0]).toMatch(/^Likely to wake around /);
    expect(texts[1]).toMatch(/^Likely hungry around /);
    expect(screen.queryByText(/when they wake/)).not.toBeInTheDocument();
  });

  it("hides 'Likely sleepy' when the logs hold an open timer before the timer flag lands", () => {
    state.coach = {
      logs: [{ ended_at: null, source: "timer" }],
      prediction: { windowStart: at(30), windowEnd: at(50), reason: "Nap reason" },
    };
    state.feedPrediction = feed(45);
    render(<NextEventBand activeChild={child} showBoth />);
    expect(screen.queryByText(/sleepy/)).not.toBeInTheDocument();
    expect(rowText()).toEqual(["Likely hungry in ~45 min."]);
  });

  it("returns nothing when neither side has data", () => {
    const { container } = render(<NextEventBand activeChild={child} showBoth />);
    expect(container).toBeEmptyDOMElement();
  });

  it("without showBoth still shows only the sooner event", () => {
    state.coach = nap(90);
    state.feedPrediction = feed(30);
    render(<NextEventBand activeChild={child} />);
    expect(rowText()).toEqual(["Likely hungry in ~30 min."]);
    expect(screen.queryByText(/sleepy/)).not.toBeInTheDocument();
  });
});
