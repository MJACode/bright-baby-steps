import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PushSoftAsk } from "@/components/PushSoftAsk";

const h = vi.hoisted(() => ({
  supported: true,
  permission: "prompt" as string | null,
  request: vi.fn(async () => "granted"),
  pushEnabled: false,
  isReady: true,
  save: vi.fn(),
  dismissed: false,
  toast: vi.fn(),
}));

vi.mock("@/lib/pushNotifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pushNotifications")>()),
  isPushSupported: () => h.supported,
}));

vi.mock("@/hooks/usePushPermission", () => ({
  usePushPermission: () => ({ supported: h.supported, permission: h.permission, request: h.request }),
}));

vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    prefs: { push_enabled: h.pushEnabled },
    isReady: h.isReady,
    save: h.save,
  }),
}));

vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: { pushSoftAskDismissed: h.dismissed }, setPrefs: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  vi.stubEnv("VITE_PUSH_ENABLED", "true");
  h.supported = true;
  h.permission = "prompt";
  h.pushEnabled = false;
  h.isReady = true;
  h.dismissed = false;
  h.request.mockClear();
  h.save.mockClear();
  h.toast.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const turnOn = () => screen.queryByRole("button", { name: "Turn on" });

describe("PushSoftAsk", () => {
  it("renders nothing while the push flag is off", () => {
    vi.stubEnv("VITE_PUSH_ENABLED", "");
    const { container } = render(<PushSoftAsk />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks a parent who hasn't opted in", () => {
    render(<PushSoftAsk />);
    expect(turnOn()).toBeInTheDocument();
  });

  it("still asks when iOS already allows notifications from the timers", () => {
    h.permission = "granted";
    render(<PushSoftAsk />);
    expect(turnOn()).toBeInTheDocument();
  });

  it("stays hidden once the parent has opted in", () => {
    h.pushEnabled = true;
    render(<PushSoftAsk />);
    expect(turnOn()).not.toBeInTheDocument();
  });

  it("stays hidden when iOS blocks notifications", () => {
    h.permission = "denied";
    render(<PushSoftAsk />);
    expect(turnOn()).not.toBeInTheDocument();
  });

  it("Turn on saves push_enabled and requests permission", async () => {
    render(<PushSoftAsk />);
    fireEvent.click(turnOn()!);
    expect(h.save).toHaveBeenCalledWith({ push_enabled: true });
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Push notifications are on" }));
  });
});
