import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  order: [] as string[],
  signOutError: null as null | { message: string },
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
      getSession: () => new Promise(() => {}),
      signOut: async (opts?: { scope?: string }) => {
        h.order.push(`signOut:${opts?.scope ?? "global"}`);
        return { error: opts?.scope ? null : h.signOutError };
      },
    },
  },
}));

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { readStoredSession } from "@/lib/offlineCache";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  h.order = [];
  h.signOutError = null;
});

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

describe("readStoredSession", () => {
  afterEach(() => localStorage.clear());

  it("returns the stored session supabase kept after a failed offline refresh", () => {
    localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "old", refresh_token: "r", user: { id: "u1" } }),
    );
    expect(readStoredSession()?.user.id).toBe("u1");
  });

  it("returns nothing once supabase has removed the session", () => {
    localStorage.setItem("unrelated", "x");
    expect(readStoredSession()).toBeNull();
  });
});
