import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PremiumGate } from "@/components/PremiumGate";
import type { PremiumFeature } from "@/hooks/usePremium";

const state = vi.hoisted(() => ({
  isPremium: false,
  role: "caregiver" as string,
  rpc: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "caregiver-1" } }) }));
vi.mock("@/hooks/useChildren", () => ({ useChildren: () => ({ activeChild: { id: "child-1" } }) }));
vi.mock("@/hooks/useCurrentRole", () => ({
  useCurrentRoleQuery: () => ({ role: state.role, isResolved: true }),
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
    renderGate("ai-insights");
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
