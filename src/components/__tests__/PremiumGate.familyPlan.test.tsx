import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PremiumGate } from "@/components/PremiumGate";
import type { PremiumFeature } from "@/hooks/usePremium";

const state = vi.hoisted(() => ({
  isPremium: false,
  role: "caregiver" as string,
  caregiverCoach: true,
  rpc: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "caregiver-1" } }) }));
vi.mock("@/hooks/useChildren", () => ({ useChildren: () => ({ activeChild: { id: "child-1" } }) }));
vi.mock("@/hooks/useCurrentRole", () => ({
  useCurrentRoleQuery: () => ({ role: state.role, isResolved: true, caregiverCoach: state.caregiverCoach }),
}));
vi.mock("@/components/UpgradeSheet", () => ({ UpgradeSheet: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const self: Record<string, unknown> = {
        maybeSingle: async () => ({
          data: state.isPremium ? { tier: "plus", status: "active", current_period_end: null, trial_ends_at: null } : null,
          error: null,
        }),
      };
      self.select = () => self;
      self.eq = () => self;
      return self;
    },
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));

function renderGate(feature: PremiumFeature) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <PremiumGate feature={feature} variant="blur">
        <p>Gated content</p>
      </PremiumGate>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.isPremium = false;
  state.role = "caregiver";
  state.caregiverCoach = true;
  state.rpc.mockReset();
});

describe("PremiumGate family plan inheritance", () => {
  it("shows predictions to a free caregiver when the child's owner has Flare+", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    renderGate("predictions");
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("child_owner_is_premium", { _child_id: "child-1" }));
    await waitFor(() => expect(screen.getByText("Gated content")).toBeInTheDocument());
  });

  it("hides predictions from a free caregiver when the family is free", async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });
    renderGate("predictions");
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Gated content")).not.toBeInTheDocument());
  });

  it("degrades to free, without retrying, when the RPC is missing", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "function not found", code: "PGRST202" } });
    renderGate("predictions");
    await waitFor(() => expect(screen.queryByText("Gated content")).not.toBeInTheDocument());
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("degrades to free, without retrying, when the RPC call throws", async () => {
    state.rpc.mockRejectedValue(new Error("network"));
    renderGate("predictions");
    await waitFor(() => expect(screen.queryByText("Gated content")).not.toBeInTheDocument());
    // Default react-query retry fires after ~1s; wait past it.
    await new Promise((r) => setTimeout(r, 1200));
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not let AI features inherit the family plan", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    renderGate("visit-prep-ai");
    await waitFor(() => expect(screen.queryByText("Gated content")).not.toBeInTheDocument());
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("skips the RPC for a premium user", async () => {
    state.isPremium = true;
    state.role = "owner";
    renderGate("predictions");
    await waitFor(() => expect(screen.getByText("Gated content")).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("PremiumGate caregiver sleep & feed coach", () => {
  it("hides predictions from a Log-only caregiver without checking the owner's plan", async () => {
    state.caregiverCoach = false;
    state.rpc.mockResolvedValue({ data: true, error: null });
    renderGate("predictions");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
    expect(screen.queryByText("Try free for 7 days")).not.toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("follows the owner's choice even when the caregiver has their own Flare+", async () => {
    state.isPremium = true;
    state.caregiverCoach = false;
    renderGate("predictions");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
  });

  it("hides the coach from a subscribed caregiver when the owner's Flare+ has lapsed", async () => {
    state.isPremium = true;
    state.rpc.mockResolvedValue({ data: false, error: null });
    renderGate("predictions");
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("child_owner_is_premium", { _child_id: "child-1" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
  });

  it("shows the coach to a subscribed caregiver when it's on and the owner has Flare+", async () => {
    state.isPremium = true;
    state.rpc.mockResolvedValue({ data: true, error: null });
    renderGate("predictions");
    await waitFor(() => expect(screen.getByText("Gated content")).toBeInTheDocument());
  });

  it("leaves a co-parent's family-plan inheritance alone", async () => {
    state.role = "coparent";
    state.caregiverCoach = false;
    state.rpc.mockResolvedValue({ data: true, error: null });
    renderGate("predictions");
    await waitFor(() => expect(screen.getByText("Gated content")).toBeInTheDocument());
  });

  it("does not let the coach flag unlock other features for a caregiver", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    renderGate("exports");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
