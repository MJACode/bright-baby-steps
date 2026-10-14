import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CoppaDirectNotice, COPPA_DIRECT_NOTICE_VERSION } from "@/components/CoppaDirectNotice";

const { rpc, from, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));

function renderNotice(onAcknowledged = vi.fn()) {
  render(
    <MemoryRouter>
      <CoppaDirectNotice onAcknowledged={onAcknowledged} />
    </MemoryRouter>,
  );
  return onAcknowledged;
}

function fillAndSign(name: string) {
  fireEvent.change(screen.getByLabelText(/digital signature/i), { target: { value: name } });
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
  fireEvent.click(screen.getByRole("button", { name: /sign and continue/i }));
}

describe("CoppaDirectNotice", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    toast.mockReset();
  });

  it("signs through the server RPC, never a direct profile write", async () => {
    rpc.mockResolvedValue({ data: { already_signed: false }, error: null });
    const onAcknowledged = renderNotice();

    fillAndSign("  Jane A. Doe ");

    await waitFor(() => expect(onAcknowledged).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("sign_coppa_direct_notice", {
      p_signed_name: "Jane A. Doe",
      p_notice_version: COPPA_DIRECT_NOTICE_VERSION,
    });
    expect(COPPA_DIRECT_NOTICE_VERSION).toMatch(/^[0-9A-Za-z._-]{1,32}$/);
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps the notice open and shows the server's message when signing fails", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Type your full name (first and last) to sign." },
    });
    const onAcknowledged = renderNotice();

    fillAndSign("Jane Doe");

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toMatchObject({
      description: "Type your full name (first and last) to sign.",
      variant: "destructive",
    });
    expect(onAcknowledged).not.toHaveBeenCalled();
  });

  it("does not call the server until a two-word name and both boxes are set", () => {
    renderNotice();
    fillAndSign("Jane");
    expect(screen.getByRole("button", { name: /sign and continue/i })).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
