import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FamilyNamePrompt, shouldShowFamilyNamePrompt } from "@/components/FamilyNamePrompt";

const h = vi.hoisted(() => ({
  fullName: null as string | null,
  partnerRows: [{ id: "pa-1" }] as unknown[],
  dismissed: false,
  setPrefs: vi.fn(),
  update: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null })),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: { familyNamePromptDismissed: h.dismissed }, setPrefs: h.setPrefs }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "limit"]) self[m] = () => self;
    self.update = (payload: unknown) => {
      h.update(table, payload);
      return self;
    };
    self.maybeSingle = async () => ({ data: { full_name: h.fullName }, error: null });
    self.single = async () => ({ data: { id: "me" }, error: null });
    self.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: table === "partner_access" ? h.partnerRows : [], error: null });
    return self;
  };
  return {
    supabase: { from: (t: string) => builder(t), auth: { updateUser: h.updateUser } },
  };
});

const renderPrompt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FamilyNamePrompt />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.fullName = null;
  h.partnerRows = [{ id: "pa-1" }];
  h.dismissed = false;
  vi.clearAllMocks();
});

describe("shouldShowFamilyNamePrompt", () => {
  it("shows only for an unnamed member of a shared family who hasn't dismissed it", () => {
    expect(shouldShowFamilyNamePrompt({ fullName: null, sharesFamily: true, dismissed: false })).toBe(true);
    expect(shouldShowFamilyNamePrompt({ fullName: "  ", sharesFamily: true, dismissed: false })).toBe(true);
    expect(shouldShowFamilyNamePrompt({ fullName: "Sam", sharesFamily: true, dismissed: false })).toBe(false);
    expect(shouldShowFamilyNamePrompt({ fullName: null, sharesFamily: false, dismissed: false })).toBe(false);
    expect(shouldShowFamilyNamePrompt({ fullName: null, sharesFamily: undefined, dismissed: false })).toBe(false);
    expect(shouldShowFamilyNamePrompt({ fullName: null, sharesFamily: true, dismissed: true })).toBe(false);
  });
});

describe("FamilyNamePrompt", () => {
  it("saves the trimmed name to the profile and auth metadata, then hides", async () => {
    renderPrompt();
    const input = await screen.findByPlaceholderText("First name");
    fireEvent.change(input, { target: { value: "  Barbara " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(h.updateUser).toHaveBeenCalledWith({ data: { full_name: "Barbara" } }));
    expect(h.update).toHaveBeenCalledWith("profiles", { full_name: "Barbara" });
    await waitFor(() => expect(screen.queryByPlaceholderText("First name")).toBeNull());
  });

  it("stays hidden for a solo parent", async () => {
    h.partnerRows = [];
    renderPrompt();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText("What should your family call you?")).toBeNull();
  });

  it("persists Not now", async () => {
    renderPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(h.setPrefs).toHaveBeenCalledWith({ familyNamePromptDismissed: true });
  });
});
