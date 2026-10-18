import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  order: [] as string[],
  signOutError: null as null | { message: string },
  localSignOutError: null as null | { name: string; message: string },
  initialSession: null as null | Record<string, unknown>,
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {} }));
vi.mock("@/lib/pushNotifications", () => ({
  unregisterPush: async () => {
    h.order.push("unregisterPush");
  },
}));
vi.mock("@/lib/offlineCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offlineCache")>()),
  clearDeviceStore: async () => {
    h.order.push("clearDeviceStore");
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: h.initialSession }, error: null }),
      signOut: async (opts?: { scope?: string }) => {
        h.order.push(`signOut:${opts?.scope ?? "global"}`);
        return { error: opts?.scope ? h.localSignOutError : h.signOutError };
      },
    },
  },
}));

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AUTH_STORAGE_KEY, readStoredSession } from "@/lib/offlineCache";
import { waitFor } from "@testing-library/react";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  h.order = [];
  h.signOutError = null;
  h.localSignOutError = null;
  h.initialSession = null;
});
afterEach(() => localStorage.clear());

describe("signOut clears the device first", () => {
  it("wipes the device store before the session is ended", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signOut());
    expect(h.order).toEqual(["clearDeviceStore", "unregisterPush", "signOut:global"]);
  });

  it("ends the session on this device when the server can't be reached", async () => {
    h.signOutError = { message: "Failed to fetch" };
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signOut());
    expect(h.order).toEqual(["clearDeviceStore", "unregisterPush", "signOut:global", "signOut:local"]);
  });
});

describe("offline sign-out with an expired token", () => {
  it("still signs out when supabase-js can't refresh and refuses even a local sign-out", async () => {
    const stored = { access_token: "old", refresh_token: "r", user: { id: "u1" } };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored));
    localStorage.setItem(`${AUTH_STORAGE_KEY}-code-verifier`, "v");
    h.initialSession = stored;
    h.signOutError = { message: "Load failed" };
    h.localSignOutError = { name: "AuthRetryableFetchError", message: "Load failed" };

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe("u1"));

    await act(() => result.current.signOut());

    expect(result.current.user).toBeNull();
    expect(readStoredSession()).toBeNull();
    expect(localStorage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).toBeNull();
  });
});

describe("readStoredSession", () => {
  it("returns the stored session supabase kept after a failed offline refresh", () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ access_token: "old", refresh_token: "r", user: { id: "u1" } }),
    );
    expect(readStoredSession()?.user.id).toBe("u1");
  });

  it("ignores a session stored under another project's key", () => {
    localStorage.setItem("sb-other-auth-token", JSON.stringify({ refresh_token: "r", user: { id: "u2" } }));
    expect(readStoredSession()).toBeNull();
  });

  it("returns nothing once supabase has removed the session", () => {
    localStorage.setItem("unrelated", "x");
    expect(readStoredSession()).toBeNull();
  });
});
