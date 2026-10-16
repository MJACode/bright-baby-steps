import { render, renderHook, screen } from "@testing-library/react";
import { SleepCoachCard } from "@/components/SleepCoachCard";
import { FeedCoachCard } from "@/components/feeding/FeedCoachCard";
import { useCaregiverCoachHidden } from "@/hooks/useCaregiverCoachHidden";

const state = vi.hoisted(() => ({
  role: "caregiver" as string,
  isResolved: true,
  caregiverCoach: false,
  isChildOwnerPremium: true,
  useSleepCoach: vi.fn(() => ({ data: undefined })),
  useFeedCoach: vi.fn(() => ({
    now: new Date("2026-10-16T12:00:00Z"),
    night: false,
    ageMonths: 4,
    prediction: null,
    lastFeedAt: null,
  })),
}));

vi.mock("@/hooks/useCurrentRole", () => ({
  useCurrentRoleQuery: () => ({
    role: state.role,
    isResolved: state.isResolved,
    caregiverCoach: state.caregiverCoach,
  }),
}));
vi.mock("@/hooks/usePremium", () => ({
  useChildOwnerPremium: () => ({ isChildOwnerPremium: state.isChildOwnerPremium, isLoading: false }),
}));
vi.mock("@/components/PremiumGate", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useSleepCoach", () => ({ useSleepCoach: state.useSleepCoach }));
vi.mock("@/hooks/useFeedCoach", () => ({ useFeedCoach: state.useFeedCoach }));
vi.mock("@/hooks/useSleepPlan", () => ({ useSleepPlan: () => ({ data: null }) }));
vi.mock("@/hooks/useActiveSleep", () => ({ useActiveSleep: () => ({ start: vi.fn() }) }));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => ({ prefs: { calmMode: false } }) }));
vi.mock("@/hooks/useTrackingSchedule", () => ({ useTrackingSchedule: () => ({}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useWakePrediction", () => ({
  useWakePrediction: () => ({ wake: null, hungryOnWake: false, activeSleep: null, now: new Date() }),
}));

const child = { id: "c1", name: "Ada", date_of_birth: "2026-06-01", parent_id: "owner" };

beforeEach(() => {
  state.role = "caregiver";
  state.isResolved = true;
  state.caregiverCoach = false;
  state.isChildOwnerPremium = true;
  state.useSleepCoach.mockClear();
  state.useFeedCoach.mockClear();
});

describe("useCaregiverCoachHidden", () => {
  const hidden = () => renderHook(() => useCaregiverCoachHidden("c1")).result.current;

  it("hides the coach from a Log-only caregiver", () => {
    expect(hidden()).toBe(true);
  });

  it("hides it when the owner's Flare+ has lapsed", () => {
    state.caregiverCoach = true;
    state.isChildOwnerPremium = false;
    expect(hidden()).toBe(true);
  });

  it("shows it when the coach is on and the owner has Flare+", () => {
    state.caregiverCoach = true;
    expect(hidden()).toBe(false);
  });

  it("never hides anything for other roles or before the role resolves", () => {
    state.role = "coparent";
    expect(hidden()).toBe(false);
    state.role = "caregiver";
    state.isResolved = false;
    expect(hidden()).toBe(false);
  });
});

describe("coach cards for a caregiver", () => {
  it("render nothing, and run no coach queries, for a Log-only caregiver", () => {
    const { container } = render(
      <>
        <SleepCoachCard activeChild={child} variant="strip" />
        <FeedCoachCard activeChild={child} variant="strip" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(state.useSleepCoach).not.toHaveBeenCalled();
    expect(state.useFeedCoach).not.toHaveBeenCalled();
  });

  it("render when the coach is on and the owner has Flare+", () => {
    state.caregiverCoach = true;
    render(
      <>
        <SleepCoachCard activeChild={child} variant="strip" />
        <FeedCoachCard activeChild={child} variant="strip" />
      </>,
    );
    expect(state.useSleepCoach).toHaveBeenCalled();
    expect(screen.getByText("Feed Coach")).toBeInTheDocument();
  });
});
