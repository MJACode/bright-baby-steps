import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type Token } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { routeForNotificationType } from "@/lib/notificationRoutes";

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";
export type PushEnvironment = "production" | "sandbox";

const TOKEN_KEY = "push_device_token";

// register_push_device / unregister_push_device aren't in the generated
// Supabase types until they're regenerated after the push_devices migration.
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ error: { message: string } | null }>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as UntypedRpc).call(supabase, fn, args);

// iOS only: Android would need an FCM config we don't ship, and calling
// register() there without one crashes the app.
export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

// Must match the aps-environment the binary was signed with, or APNs rejects
// the token as BadDeviceToken. Codemagic builds run `npm run build`
// (MODE=production) and sign with the App Store profile → "production".
// A local Xcode debug build signs with a development profile → build the web
// assets with `vite build --mode development` or set VITE_APNS_ENVIRONMENT.
export function pushEnvironment(): PushEnvironment {
  const override = import.meta.env.VITE_APNS_ENVIRONMENT;
  if (override === "sandbox" || override === "production") return override;
  return import.meta.env.MODE === "production" ? "production" : "sandbox";
}

function normalize(state: string): PushPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported";
  const { receive } = await PushNotifications.checkPermissions();
  return normalize(receive);
}

// Shows the one-shot iOS system prompt, so only call it from a tap the parent
// made to turn notifications on — never on launch or sign-in.
export async function requestPushPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported";
  const { receive } = await PushNotifications.requestPermissions();
  const state = normalize(receive);
  if (state === "granted") await PushNotifications.register();
  return state;
}

// Called once auth has settled with a signed-in user, and again on every app
// resume. Never prompts: registers only if the parent already said yes, which
// also refreshes last_seen_at server-side and picks up a permission the parent
// granted in iOS Settings while the app was backgrounded.
export async function initPush(userId: string | null | undefined): Promise<void> {
  if (!userId || !isPushSupported()) return;
  try {
    if ((await getPushPermission()) === "granted") await PushNotifications.register();
  } catch (err) {
    console.error("Push registration failed", err);
  }
}

export async function handleRegistration(token: Token): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token.value);
  const { error } = await rpc("register_push_device", {
    p_token: token.value,
    p_environment: pushEnvironment(),
  });
  // Background work on every launch — a toast here would nag on each resume
  // while offline. In-app notifications keep working either way.
  if (error) console.error("register_push_device failed", error.message);
}

// Runs before the session is cleared so the RPC still has auth.uid(). The
// local token is forgotten even if the call fails: the next sign-in on this
// device re-registers the same token to whoever signs in.
export async function unregisterPush(): Promise<void> {
  if (!isPushSupported()) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  localStorage.removeItem(TOKEN_KEY);
  try {
    const { error } = await rpc("unregister_push_device", { p_token: token });
    if (error) console.error("unregister_push_device failed", error.message);
  } catch (err) {
    // Sign-out must never be blocked by this.
    console.error("unregister_push_device failed", err);
  }
}

export function routeForPush(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const { route, type } = data as Record<string, unknown>;
  // In-app paths only — never follow a protocol-relative or absolute URL.
  if (typeof route === "string" && route.startsWith("/") && !route.startsWith("//")) {
    return route;
  }
  if (typeof type === "string") return routeForNotificationType(type);
  return null;
}

export function attachPushListeners(navigate: (route: string) => void): () => void {
  if (!isPushSupported()) return () => {};
  const handles: Promise<PluginListenerHandle>[] = [
    PushNotifications.addListener("registration", (token) => {
      void handleRegistration(token);
    }),
    PushNotifications.addListener("registrationError", (err) => {
      console.error("APNs registration error", err.error);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
      const route = routeForPush(action.notification.data);
      if (route) navigate(route);
    }),
  ];
  return () => {
    handles.forEach((h) => void h.then((l) => l.remove()));
  };
}
