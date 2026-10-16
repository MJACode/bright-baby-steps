import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteShareSheet } from "@/components/onboarding/InviteShareSheet";

const state = vi.hoisted(() => ({
  isPremium: true,
  createPartnerInvite: vi.fn(async (_args: unknown) => ({ inviteCode: "abc", url: "https://x/invite/abc" })),
  copyInviteUrl: vi.fn(async (_url: string) => {}),
}));

vi.mock("@/hooks/usePremium", () => ({ usePremium: () => ({ isPremium: state.isPremium, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/partnerInvite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/partnerInvite")>()),
  createPartnerInvite: state.createPartnerInvite,
  copyInviteUrl: state.copyInviteUrl,
}));
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: Pass,
    DrawerDescription: Pass,
  };
});

function renderSheet(role: "coparent" | "caregiver") {
  return render(
    <InviteShareSheet open onOpenChange={() => {}} ownerId="owner-1" role={role} babyName="Ada" />,
  );
}

beforeEach(() => {
  state.isPremium = true;
  state.createPartnerInvite.mockClear();
  state.copyInviteUrl.mockClear();
});

describe("InviteShareSheet caregiver coach choice", () => {
  it("defaults a Flare+ caregiver invite to Log only", async () => {
    renderSheet("caregiver");
    expect(screen.getByRole("radio", { name: /^Log only/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() =>
      expect(state.createPartnerInvite).toHaveBeenCalledWith(
        expect.objectContaining({ role: "caregiver", caregiverCoach: false }),
      ),
    );
  });

  it("writes the coach choice onto the invite and locks it once the invite exists", async () => {
    renderSheet("caregiver");
    fireEvent.click(screen.getByRole("radio", { name: /Log \+ sleep & feed coach/ }));
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() =>
      expect(state.createPartnerInvite).toHaveBeenCalledWith(
        expect.objectContaining({ role: "caregiver", caregiverCoach: true }),
      ),
    );
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Log only/ })).toBeDisabled());
  });

  it("hides the choice on the free plan and invites log-only", async () => {
    state.isPremium = false;
    renderSheet("caregiver");
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() =>
      expect(state.createPartnerInvite).toHaveBeenCalledWith(expect.objectContaining({ caregiverCoach: false })),
    );
  });

  it("never shows the choice for a co-parent", () => {
    renderSheet("coparent");
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
