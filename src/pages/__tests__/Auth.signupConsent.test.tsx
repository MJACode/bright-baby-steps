import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "@/pages/Auth";

const { signUp, from } = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ data: { user: { id: "u-1" }, session: null }, error: null })),
  from: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: null, loading: false }) }));
vi.mock("@/hooks/useGeoBlock", () => ({ useGeoBlock: () => ({ blocked: false, loading: false }) }));
vi.mock("@/lib/partnerInvite", () => ({ peekPendingInvite: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp, exchangeCodeForSession: vi.fn() }, from },
}));

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe("Auth signup consent", () => {
  it("sends data_consent_version in signup metadata and makes no client-side profiles write", async () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Pat Parent" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });

    const submit = screen.getByRole("button", { name: "Create Account" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "pat@example.com",
        options: expect.objectContaining({
          data: { full_name: "Pat Parent", data_consent_version: "1.0" },
        }),
      }),
    );
    expect(from).not.toHaveBeenCalled();
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
  });
});
