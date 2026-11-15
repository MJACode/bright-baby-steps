import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeatureRequestCard } from "@/components/FeatureRequestCard";
import { REQUEST_FEATURE_ERROR, REQUEST_FEATURE_SESSION_ERROR } from "@/hooks/useRequestFeature";

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: h.invoke } },
}));

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <FeatureRequestCard feature="baby-signs" title="Sign Language is coming soon" description="20 signs." />
    </QueryClientProvider>,
  );

const SUCCESS = /Request sent — thanks! We'll let you know when it's ready\./;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("FeatureRequestCard", () => {
  it("sends one request, shows the loading then success state, and remembers it per user", async () => {
    let resolve!: (v: unknown) => void;
    h.invoke.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Request early access" }));
    const pending = await screen.findByRole("button", { name: /Sending your request/ });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);

    resolve({ data: { ok: true, emailed: true }, error: null });
    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("request-feature", { body: { feature: "baby-signs" } });
    expect(JSON.parse(localStorage.getItem("prefs_user-1")!).requestedFeatures).toEqual(["baby-signs"]);

    unmount();
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(SUCCESS);
    expect(screen.queryByRole("button", { name: "Request early access" })).not.toBeInTheDocument();
  });

  it("still lands in the success state when the email didn't send", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, emailed: false }, error: null });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Request early access" }));
    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS);
  });

  it("toasts what happened and what to do, and lets them try again", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 500 } } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Request early access" }));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ ...REQUEST_FEATURE_ERROR, variant: "destructive" }),
    );
    expect(screen.getByRole("button", { name: "Request early access" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(localStorage.getItem("prefs_user-1")).toBeNull();

    h.invoke.mockResolvedValueOnce({ data: { ok: true, emailed: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Request early access" }));
    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS);
  });

  it("asks them to sign in again on a 401", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 401 } } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Request early access" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ ...REQUEST_FEATURE_SESSION_ERROR, variant: "destructive" }),
    );
  });

  it("treats a 2xx without ok as a failure", async () => {
    h.invoke.mockResolvedValueOnce({ data: {}, error: null });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Request early access" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ ...REQUEST_FEATURE_ERROR, variant: "destructive" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
