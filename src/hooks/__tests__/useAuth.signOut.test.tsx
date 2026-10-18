import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  rpc: vi.fn(() => new Promise(() => {})),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
}));

vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {} }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => new Promise(() => {}),
      signOut: h.signOut,
    },
  },
}));

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { UNREGISTER_TIMEOUT_MS } from "@/lib/pushNotifications";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("signOut", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("still signs out when unregister_push_device never answers", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("push_device_token", "apns-token");
    const { result } = renderHook(() => useAuth(), { wrapper });

    let done = false;
    act(() => {
      void result.current.signOut().then(() => {
        done = true;
      });
    });
    // The device store is cleared first (an async step), then push unregisters.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(h.rpc).toHaveBeenCalledWith("unregister_push_device", { p_token: "apns-token" });
    expect(h.signOut).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(UNREGISTER_TIMEOUT_MS));
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(done).toBe(true);
    expect(localStorage.getItem("push_device_token")).toBeNull();
    err.mockRestore();
  });
});
