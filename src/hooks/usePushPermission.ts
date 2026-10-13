import { useCallback, useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import {
  getPushPermission,
  isPushSupported,
  requestPushPermission,
  type PushPermission,
} from "@/lib/pushNotifications";

// `permission` is null until the first check resolves, so callers don't flash
// a "turn on" prompt at a parent who already allowed notifications.
export function usePushPermission() {
  const supported = isPushSupported();
  const [permission, setPermission] = useState<PushPermission | null>(
    supported ? null : "unsupported",
  );

  useEffect(() => {
    if (!supported) return;
    const refresh = () => {
      getPushPermission()
        .then(setPermission)
        .catch((err) => console.error("Push permission check failed", err));
    };
    refresh();
    // The parent may have flipped the switch in iOS Settings while away.
    const resume = CapacitorApp.addListener("resume", refresh);
    return () => {
      void resume.then((l) => l.remove());
    };
  }, [supported]);

  const request = useCallback(async () => {
    const next = await requestPushPermission();
    setPermission(next);
    return next;
  }, []);

  return { supported, permission, request };
}
