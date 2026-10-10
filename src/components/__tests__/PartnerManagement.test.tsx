import { createContext, useContext, type ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerManagement from "@/components/PartnerManagement";

const { rpc, tables, copyInviteUrl, shareInvite, toast } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: null, error: null })),
  tables: {
    owned: [] as unknown[],
    partnerOf: [] as unknown[],
    invites: [] as unknown[],
  },
  copyInviteUrl: vi.fn(async (_url: string) => {}),
  shareInvite: vi.fn(async () => "copied" as const),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/usePremium", () => ({ usePremium: () => ({ isPremium: true, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({
    children: [{ id: "c-1", parent_id: "owner-1", name: "Ada" }],
    activeChild: { id: "c-1", parent_id: "owner-1", name: "Ada" },
  }),
}));
vi.mock("@/lib/partnerInvite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/partnerInvite")>()),
  copyInviteUrl,
  shareInvite,
}));
vi.mock("@/components/UpgradeSheet", () => ({ UpgradeSheet: () => null }));

// Resolves each select chain by table + which side of partner_access it filters on.
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const filters: string[] = [];
    const self: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
        let data: unknown[] = [];
        if (table === "partner_access") {
          data = filters.includes("owner_id") ? tables.owned : tables.partnerOf;
        }
        if (table === "partner_invitations") data = tables.invites;
        resolve({ data, error: null });
      },
    };
    for (const m of ["select", "in", "gt", "update", "insert", "single"]) {
      self[m] = () => self;
    }
    self.eq = (col: string) => {
      filters.push(col);
      return self;
    };
    return self;
  };
  return { supabase: { from: (t: string) => builder(t), rpc } };
});

// Radix Select doesn't open in jsdom; render each option as a button that
// calls onValueChange directly so the component's own no-op guard is exercised.
const SelectCtx = createContext<{ onValueChange?: (v: string) => void; disabled?: boolean }>({});
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    disabled,
  }: {
    children: ReactNode;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
  }) => <SelectCtx.Provider value={{ onValueChange, disabled }}>{children}</SelectCtx.Provider>,
  SelectTrigger: ({ children, "aria-label": label }: { children: ReactNode; "aria-label"?: string }) => (
    <div data-testid="role-trigger" aria-label={label}>
      {children}
    </div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
    const ctx = useContext(SelectCtx);
    return (
      <button type="button" disabled={ctx.disabled} onClick={() => ctx.onValueChange?.(value)}>
        {children}
      </button>
    );
  },
}));

const ownedRow = {
  id: "pa-1",
  owner_id: "owner-1",
  partner_id: "partner-1",
  role: "caregiver",
  status: "active",
  created_at: "2026-08-01T12:00:00Z",
  partner: { email: "sam@example.com" },
};

const partnerOfRow = {
  id: "pa-9",
  owner_id: "other-owner",
  partner_id: "owner-1",
  role: "viewer",
  status: "active",
  created_at: "2026-08-01T12:00:00Z",
  owner: { email: "alex@example.com" },
};

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PartnerManagement />
    </QueryClientProvider>,
  );
}

describe("PartnerManagement role switch", () => {
  beforeEach(() => {
    rpc.mockClear();
    tables.owned = [ownedRow];
    tables.partnerOf = [];
    tables.invites = [];
  });

  it("does not call the RPC when the current role is picked", async () => {
    renderIt();
    await screen.findByLabelText("Role for sam@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Caregiver" }));
    // The RPC fires asynchronously, so follow with a real change and assert
    // it is the only call that ever reached the server.
    fireEvent.click(screen.getByRole("button", { name: "View-only" }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("set_partner_role", { _partner_id: "partner-1", _role: "viewer" });
  });

  it("calls set_partner_role with the partner id and the new role", async () => {
    renderIt();
    await screen.findByLabelText("Role for sam@example.com");
    fireEvent.click(screen.getByRole("button", { name: "View-only" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_partner_role", {
        _partner_id: "partner-1",
        _role: "viewer",
      }),
    );
  });

  it("shows no role control on accounts you're a partner on", async () => {
    tables.owned = [];
    tables.partnerOf = [partnerOfRow];
    renderIt();
    await screen.findByText("alex@example.com's account");
    expect(screen.queryByTestId("role-trigger")).toBeNull();
    expect(screen.queryByRole("button", { name: "View-only" })).toBeNull();
  });
});

describe("PartnerManagement pending invites", () => {
  const invite = {
    id: "inv-1",
    owner_id: "owner-1",
    role: "caregiver",
    status: "pending",
    invite_code: "abc123",
    expires_at: "2099-01-01T00:00:00Z",
  };

  beforeEach(() => {
    tables.owned = [];
    tables.partnerOf = [];
    tables.invites = [invite];
    copyInviteUrl.mockClear();
    shareInvite.mockClear();
    toast.mockClear();
  });

  it("offers Share and Copy link without printing the raw URL", async () => {
    renderIt();
    await screen.findByRole("button", { name: /Share/ });
    expect(screen.getByRole("button", { name: /Copy link/ })).toBeTruthy();
    expect(screen.queryByText(/\/invite\/abc123/)).toBeNull();
  });

  it("copies the invite URL", async () => {
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /Copy link/ }));
    await waitFor(() => expect(copyInviteUrl).toHaveBeenCalledTimes(1));
    expect(copyInviteUrl.mock.calls[0][0]).toMatch(/\/invite\/abc123$/);
  });

  it("shares with the baby's name and role, and toasts when it fell back to the clipboard", async () => {
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /Share/ }));
    await waitFor(() => expect(shareInvite).toHaveBeenCalledTimes(1));
    expect(shareInvite).toHaveBeenCalledWith(
      expect.objectContaining({ babyName: "Ada", role: "caregiver" }),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invite copied" })));
  });
});
