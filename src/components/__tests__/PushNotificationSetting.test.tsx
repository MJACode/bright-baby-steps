import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PushNotificationSetting } from "@/components/PushNotificationSetting";
import { PUSH_ENABLE_FAILED_TOAST } from "@/lib/pushNotifications";

const h = vi.hoisted(() => ({
  supported: true,
  permission: "granted" as string | null,
  request: vi.fn(async () => "granted"),
  toast: vi.fn(),
}));

vi.mock("@/hooks/usePushPermission", () => ({
  usePushPermission: () => ({
    supported: h.supported,
    permission: h.supported ? h.permission : "unsupported",
    request: h.request,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  vi.stubEnv("VITE_PUSH_ENABLED", "true");
  h.supported = true;
  h.permission = "granted";
  h.request.mockClear();
  h.toast.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const renderSetting = (pushEnabled: boolean) => {
  const onChange = vi.fn();
  render(
    <PushNotificationSetting pushEnabled={pushEnabled} disabled={false} onPushEnabledChange={onChange} />,
  );
  return { onChange, toggle: screen.getByRole("switch", { name: "Push notifications" }) };
};

describe("PushNotificationSetting", () => {
  it("is hidden on web", () => {
    h.supported = false;
    const { container } = render(
      <PushNotificationSetting pushEnabled disabled={false} onPushEnabledChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the push flag is off", () => {
    vi.stubEnv("VITE_PUSH_ENABLED", "");
    const { container } = render(
      <PushNotificationSetting pushEnabled disabled={false} onPushEnabledChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows off for a parent who hasn't opted in, even when iOS already allows it", () => {
    const { toggle } = renderSetting(false);
    expect(toggle).not.toBeChecked();
  });

  it("turns push_enabled off", () => {
    const { onChange, toggle } = renderSetting(true);
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(h.request).not.toHaveBeenCalled();
  });

  it("turns push_enabled on without re-prompting once iOS already allows it", () => {
    const { onChange, toggle } = renderSetting(false);
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(h.request).not.toHaveBeenCalled();
  });

  it("asks iOS for permission when it hasn't been asked yet", async () => {
    h.permission = "prompt";
    const { onChange, toggle } = renderSetting(true);
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Push notifications are on" }));
  });

  it("shows fixed, parent-readable copy instead of the native error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.permission = "prompt";
    h.request.mockRejectedValueOnce(new Error("UNUserNotificationCenter error 1"));
    const { toggle } = renderSetting(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(PUSH_ENABLE_FAILED_TOAST));
    expect(JSON.stringify(h.toast.mock.calls)).not.toContain("UNUserNotificationCenter");
    err.mockRestore();
  });

  it("saves push_enabled without re-prompting when iOS blocks it", () => {
    h.permission = "denied";
    const { onChange, toggle } = renderSetting(false);
    expect(screen.queryByText(/open Settings/)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(h.request).not.toHaveBeenCalled();
  });

  it("keeps the guidance visible while push is on but iOS blocks it", () => {
    h.permission = "denied";
    renderSetting(true);
    expect(screen.getByText(/open Settings, tap Grace Flare/)).toBeInTheDocument();
  });
});

describe("resolvePrefs push_enabled", () => {
  it("defaults off and only an explicit true opts in", async () => {
    const { resolvePrefs } = await import("@/hooks/useNotificationPrefs");
    expect(resolvePrefs(null).push_enabled).toBe(false);
    expect(resolvePrefs({}).push_enabled).toBe(false);
    expect(resolvePrefs({ push_enabled: false }).push_enabled).toBe(false);
    expect(resolvePrefs({ push_enabled: "true" }).push_enabled).toBe(false);
    expect(resolvePrefs({ push_enabled: true }).push_enabled).toBe(true);
  });
});
