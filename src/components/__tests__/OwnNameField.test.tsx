import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OwnNameField } from "@/components/OwnNameField";
import { ownPartnerLabel } from "@/lib/familyNamePrompt";

const h = vi.hoisted(() => ({
  fullName: "Sam" as string | null,
  partnerRows: [] as unknown[],
  update: vi.fn(),
  updateUser: vi.fn(async (_: unknown) => ({ error: null })),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or"]) self[m] = () => self;
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
  return { supabase: { from: (t: string) => builder(t), auth: { updateUser: h.updateUser } } };
});

const renderField = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OwnNameField />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.fullName = "Sam";
  h.partnerRows = [];
  vi.clearAllMocks();
});

describe("OwnNameField", () => {
  it("prefills the saved name and keeps Save off until it changes", async () => {
    renderField();
    const input = await screen.findByDisplayValue("Sam");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: " Sam " } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "   " } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "Samantha" } });
    expect(save).toBeEnabled();
  });

  it("saves the trimmed name and confirms", async () => {
    renderField();
    const input = await screen.findByDisplayValue("Sam");
    fireEvent.change(input, { target: { value: " Samantha " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Name saved" }));
    expect(h.update).toHaveBeenCalledWith("profiles", { full_name: "Samantha" });
    expect(h.updateUser).toHaveBeenCalledWith({ data: { full_name: "Samantha" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("lets someone with no name yet set one", async () => {
    h.fullName = null;
    renderField();
    const input = await screen.findByLabelText("Your name");
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "Barbara" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("tells a labelled partner what the family sees", async () => {
    h.partnerRows = [{ owner_id: "owner-1", partner_id: "me", label: "Nana" }];
    renderField();
    expect(await screen.findByText("Your family sees you as “Nana”, set by the account owner.")).toBeTruthy();
  });

  it("shows no label note for an owner", async () => {
    h.partnerRows = [{ owner_id: "me", partner_id: "p-1", label: "Barbara" }];
    renderField();
    await screen.findByDisplayValue("Sam");
    expect(screen.queryByText(/Your family sees you as/)).toBeNull();
  });
});

describe("ownPartnerLabel", () => {
  it("returns only a label set on the caller's partner row", () => {
    expect(ownPartnerLabel([{ owner_id: "o", partner_id: "me", label: " Nana " }], "me")).toBe("Nana");
    expect(ownPartnerLabel([{ owner_id: "o", partner_id: "me", label: "  " }], "me")).toBeNull();
    expect(ownPartnerLabel([{ owner_id: "me", partner_id: "p", label: "Barbara" }], "me")).toBeNull();
  });
});
