import type { ActionPerformed, Token } from "@capacitor/push-notifications";

type Listener = (payload: unknown) => void;

const h = vi.hoisted(() => ({
  native: true,
  platform: "ios",
  receive: "granted" as string,
  listeners: new Map<string, Listener>(),
  rpc: vi.fn(async (..._args: unknown[]) => ({ error: null as { message: string } | null })),
  register: vi.fn(async () => {}),
  requestPermissions: vi.fn(async () => ({ receive: "granted" })),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => h.native,
    getPlatform: () => h.platform,
  },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: async () => ({ receive: h.receive }),
    requestPermissions: h.requestPermissions,
    register: h.register,
    addListener: async (event: string, fn: Listener) => {
      h.listeners.set(event, fn);
      return { remove: async () => h.listeners.delete(event) };
    },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: h.rpc },
}));

import {
  attachPushListeners,
  getPushPermission,
  initPush,
  pushEnvironment,
  requestPushPermission,
  routeForPush,
  UNREGISTER_TIMEOUT_MS,
  unregisterPush,
} from "@/lib/pushNotifications";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  h.native = true;
  h.platform = "ios";
  h.receive = "granted";
  h.listeners.clear();
  h.rpc.mockClear();
  h.register.mockClear();
  h.requestPermissions.mockClear();
  localStorage.clear();
});

describe("on web", () => {
  beforeEach(() => {
    h.native = false;
    h.platform = "web";
  });

  it("does nothing", async () => {
    expect(await getPushPermission()).toBe("unsupported");
    expect(await requestPushPermission()).toBe("unsupported");
    await initPush("user-1");
    localStorage.setItem("push_device_token", "tok");
    await unregisterPush();
    const detach = attachPushListeners(vi.fn());
    detach();
    expect(h.register).not.toHaveBeenCalled();
    expect(h.requestPermissions).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });
});

describe("initPush", () => {
  it("registers when permission is already granted", async () => {
    await initPush("user-1");
    expect(h.register).toHaveBeenCalledTimes(1);
  });

  it("never prompts when permission hasn't been asked yet", async () => {
    h.receive = "prompt";
    await initPush("user-1");
    expect(h.requestPermissions).not.toHaveBeenCalled();
    expect(h.register).not.toHaveBeenCalled();
  });

  it("waits for a signed-in user", async () => {
    await initPush(null);
    expect(h.register).not.toHaveBeenCalled();
  });
});

describe("requestPushPermission", () => {
  it("registers after the parent allows", async () => {
    expect(await requestPushPermission()).toBe("granted");
    expect(h.register).toHaveBeenCalledTimes(1);
  });

  it("doesn't register when the parent declines", async () => {
    h.requestPermissions.mockResolvedValueOnce({ receive: "denied" });
    expect(await requestPushPermission()).toBe("denied");
    expect(h.register).not.toHaveBeenCalled();
  });
});

describe("registration", () => {
  it("sends the token and build environment to register_push_device", async () => {
    attachPushListeners(vi.fn());
    await flush();
    h.listeners.get("registration")!({ value: "apns-token" } satisfies Token);
    await flush();
    expect(h.rpc).toHaveBeenCalledWith("register_push_device", {
      p_token: "apns-token",
      p_environment: pushEnvironment(),
    });
    expect(localStorage.getItem("push_device_token")).toBe("apns-token");
  });

  it("uses the sandbox environment outside production builds", () => {
    // vitest runs with MODE=test.
    expect(pushEnvironment()).toBe("sandbox");
  });
});

describe("unregisterPush", () => {
  it("removes the stored token server-side and forgets it locally", async () => {
    localStorage.setItem("push_device_token", "apns-token");
    await unregisterPush();
    expect(h.rpc).toHaveBeenCalledWith("unregister_push_device", { p_token: "apns-token" });
    expect(localStorage.getItem("push_device_token")).toBeNull();
  });

  it("still resolves when the RPC fails, so sign-out isn't blocked", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("push_device_token", "apns-token");
    h.rpc.mockRejectedValueOnce(new Error("offline"));
    await expect(unregisterPush()).resolves.toBeUndefined();
    expect(localStorage.getItem("push_device_token")).toBeNull();
    err.mockRestore();
  });

  it("gives up on a hung RPC after the timeout, so sign-out isn't blocked", async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      localStorage.setItem("push_device_token", "apns-token");
      h.rpc.mockImplementationOnce(() => new Promise(() => {}));
      let settled = false;
      const done = unregisterPush().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(UNREGISTER_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(settled).toBe(true);
      expect(localStorage.getItem("push_device_token")).toBeNull();
    } finally {
      err.mockRestore();
      vi.useRealTimers();
    }
  });

  it("skips the RPC when this device never registered", async () => {
    await unregisterPush();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("tapping a push", () => {
  const tap = (data: unknown) =>
    h.listeners.get("pushNotificationActionPerformed")!({
      actionId: "tap",
      notification: { id: "1", data },
    } as ActionPerformed);

  it("navigates to the route in the payload", async () => {
    const navigate = vi.fn();
    attachPushListeners(navigate);
    await flush();
    tap({ route: "/dashboard/sleep" });
    expect(navigate).toHaveBeenCalledWith("/dashboard/sleep");
  });

  it("falls back to the same type→route mapping as the bell", async () => {
    const navigate = vi.fn();
    attachPushListeners(navigate);
    await flush();
    tap({ type: "finance_529_birthday" });
    expect(navigate).toHaveBeenCalledWith("/dashboard/financial");
  });

  it("stays put when there's nowhere to go", async () => {
    const navigate = vi.fn();
    attachPushListeners(navigate);
    await flush();
    tap({ type: "sleep_reminder" });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("routeForPush", () => {
  it("only follows in-app paths", () => {
    expect(routeForPush({ route: "https://evil.example" })).toBeNull();
    expect(routeForPush({ route: "//evil.example" })).toBeNull();
    expect(routeForPush({ route: "/\\evil.example" })).toBeNull();
    expect(routeForPush({ route: "/\\/evil.example" })).toBeNull();
    expect(routeForPush({ route: "/dashboard\\..\\x" })).toBeNull();
    expect(routeForPush({ route: "dashboard" })).toBeNull();
    expect(routeForPush(null)).toBeNull();
    expect(routeForPush({ route: "/dashboard" })).toBe("/dashboard");
  });
});
