import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOwnDisplayName } from "@/hooks/useOwnDisplayName";

const h = vi.hoisted(() => ({
  fullName: "Sam" as string | null,
  update: vi.fn(),
  singleError: null as { message: string } | null,
  updateUser: vi.fn(async (_: unknown) => ({ error: null })),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) self[m] = () => self;
    self.update = (payload: unknown) => {
      h.update(table, payload);
      return self;
    };
    self.maybeSingle = async () => ({ data: { full_name: h.fullName }, error: null });
    self.single = async () => ({ data: h.singleError ? null : { id: "me" }, error: h.singleError });
    return self;
  };
  return { supabase: { from: (t: string) => builder(t), auth: { updateUser: h.updateUser } } };
});

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useOwnDisplayName(), { wrapper }), invalidate };
};

beforeEach(() => {
  h.fullName = "Sam";
  h.singleError = null;
  vi.clearAllMocks();
});

describe("useOwnDisplayName", () => {
  it("loads the user's own full_name", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.fullName).toBe("Sam");
  });

  it("saves to the profile and auth metadata, then refreshes logged-by names", async () => {
    const { result, invalidate } = setup();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      await result.current.save.mutateAsync("Barbara");
    });
    expect(h.update).toHaveBeenCalledWith("profiles", { full_name: "Barbara" });
    expect(h.updateUser).toHaveBeenCalledWith({ data: { full_name: "Barbara" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["logged-by-names"] });
    await waitFor(() => expect(result.current.fullName).toBe("Barbara"));
  });

  it("stops before auth metadata and shows plain copy when the profile write fails", async () => {
    h.singleError = { message: "JWT expired" };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      await result.current.save.mutateAsync("Barbara").catch(() => {});
    });
    expect(h.updateUser).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "We couldn't save your name", variant: "destructive" }),
    );
    expect(JSON.stringify(h.toast.mock.calls)).not.toContain("JWT expired");
    consoleError.mockRestore();
  });
});
