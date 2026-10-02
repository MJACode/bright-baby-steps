import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TeamPage from "@/pages/dashboard/TeamPage";
import type { TeamInvite, TeamMember } from "@/hooks/useTeam";

const { team, myAccess } = vi.hoisted(() => ({
  team: { current: {} as Record<string, unknown> },
  myAccess: { current: {} as Record<string, unknown> },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));

let activeParent = "owner-1";
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({
    children: [{ id: "c1", name: "Lulu Smith", parent_id: activeParent }],
    activeChild: { id: "c1", name: "Lulu Smith", parent_id: activeParent },
  }),
}));

vi.mock("@/hooks/useTeam", () => ({
  useTeam: () => team.current,
  useMyTeamAccess: () => myAccess.current,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const mutation = () => ({ mutate: vi.fn(), isPending: false });

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: "pa-1",
  partnerId: "p-1",
  role: "coparent",
  status: "active",
  createdAt: "2026-08-01T12:00:00Z",
  name: "Sam",
  email: "sam@example.com",
  onHold: false,
  ...over,
});

function setTeam(over: Record<string, unknown>) {
  const members = (over.members as TeamMember[]) ?? [];
  const pending = (over.pending as TeamInvite[]) ?? [];
  const isPremium = (over.isPremium as boolean) ?? false;
  const limit = isPremium ? 2 : 1;
  const used = members.length + pending.length;
  team.current = {
    ownerId: "owner-1",
    isPremium,
    premiumLoading: false,
    members,
    pending,
    expired: [],
    seats: { used, limit, remaining: Math.max(0, limit - used), canInvite: used < limit },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    invalidate: vi.fn(),
    setPaused: mutation(),
    setRole: mutation(),
    remove: mutation(),
    cancelInvite: mutation(),
    ...over,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <TeamPage />
    </MemoryRouter>,
  );

describe("TeamPage (owner)", () => {
  beforeEach(() => {
    activeParent = "owner-1";
  });

  it("shows the empty state and the invite button on a fresh free account", () => {
    setTeam({});
    renderPage();
    expect(screen.getByRole("heading", { name: "Your team" })).toBeInTheDocument();
    expect(screen.getByText("People who can see and log for Lulu.")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 free spot used")).toBeInTheDocument();
    expect(screen.getByText("Track together")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invite someone/ })).toBeInTheDocument();
  });

  it("offers Flare+ once the free spot is used, and hides the invite button", () => {
    setTeam({ members: [member({})] });
    renderPage();
    expect(screen.getByText("1 of 1 free spot used")).toBeInTheDocument();
    expect(screen.getByText("Add a second person with Flare+")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite someone/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Sam, Co-parent, Added Aug 1\. Opens options\.$/ }),
    ).toBeInTheDocument();
  });

  it("explains a lapse: the senior partner stays, the other is on hold", () => {
    setTeam({
      members: [
        member({}),
        member({ id: "pa-2", partnerId: "p-2", name: "Grandma", role: "caregiver", onHold: true }),
      ],
    });
    renderPage();
    expect(screen.getByText("Flare+ has ended — Grandma's access is on hold")).toBeInTheDocument();
    expect(screen.getByText(/Sam still has full access on the free plan\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Flare+" })).toBeInTheDocument();
    expect(screen.getByText("Caregiver · On hold until Flare+ restarts")).toBeInTheDocument();
    // The upsell card would duplicate the banner's call to action.
    expect(screen.queryByText("Add a second person with Flare+")).toBeNull();
  });

  it("says the team is full on Flare+", () => {
    setTeam({
      isPremium: true,
      members: [member({}), member({ id: "pa-2", partnerId: "p-2", name: "Lucia" })],
    });
    renderPage();
    expect(screen.getByText("2 of 2 spots used")).toBeInTheDocument();
    expect(
      screen.getByText("Your team is full. To invite someone new, remove someone or cancel a waiting invite."),
    ).toBeInTheDocument();
  });

  it("lists a waiting invite", () => {
    setTeam({
      isPremium: true,
      members: [member({})],
      pending: [
        {
          id: "inv-1",
          inviteCode: "abc",
          url: "https://x/invite/abc",
          role: "caregiver",
          label: "Grandma",
          expiresAt: "2026-10-09T12:00:00Z",
          expired: false,
        },
      ],
    });
    renderPage();
    expect(screen.getByText("2 of 2 spots used · 1 invite waiting")).toBeInTheDocument();
    expect(screen.getByText("Grandma · Caregiver")).toBeInTheDocument();
    expect(screen.getByText(/^Waiting to join · link works until Oct \d+$/)).toBeInTheDocument();
  });

  it("removes a member only after the confirm", async () => {
    setTeam({ isPremium: true, members: [member({})] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Sam, Co-parent/ }));
    expect(await screen.findByText("What they can do")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from team" }));
    expect(await screen.findByText("Remove Sam?")).toBeInTheDocument();
    const remove = team.current.remove as { mutate: ReturnType<typeof vi.fn> };
    expect(remove.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(remove.mutate).toHaveBeenCalledWith("p-1", expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("asks before making someone a co-parent, but applies other roles on tap", async () => {
    setTeam({ isPremium: true, members: [member({ role: "viewer" })] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Sam, View-only/ }));
    await screen.findByText("What they can do");
    const setRole = team.current.setRole as { mutate: ReturnType<typeof vi.fn> };

    fireEvent.click(screen.getByRole("radio", { name: /Caregiver/ }));
    expect(setRole.mutate).toHaveBeenCalledWith(
      { partnerId: "p-1", role: "caregiver" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    setRole.mutate.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: /Co-parent/ }));
    expect(await screen.findByText("Make Sam a co-parent?")).toBeInTheDocument();
    expect(setRole.mutate).not.toHaveBeenCalled();
  });

  it("shows the load error with a retry", () => {
    setTeam({ isError: true });
    renderPage();
    expect(screen.getByText("Couldn't load your team")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(team.current.refetch).toHaveBeenCalled();
  });
});

describe("TeamPage (partner)", () => {
  it("is read-only", () => {
    activeParent = "someone-else";
    myAccess.current = {
      access: { id: "pa-1", role: "viewer", status: "active", created_at: "2026-08-01T00:00:00Z" },
      ownerName: "Alex",
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText(/^View-only · /)).toBeInTheDocument();
    expect(screen.getByText("Only Alex can change the team.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
