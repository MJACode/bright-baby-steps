import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { useAuth } from "@/hooks/useAuth";
import { attachPushListeners, initPush, isPushSupported } from "@/lib/pushNotifications";

export function PushBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? null;

  // useNavigate's identity changes with the location; a ref keeps the
  // listeners attached once instead of re-binding on every route change.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Attached before auth settles: iOS holds a cold-start tap until a listener
  // exists, and the registration listener must be live before register().
  useEffect(() => attachPushListeners((route) => navigateRef.current(route)), []);

  useEffect(() => {
    if (!userId || !isPushSupported()) return;
    void initPush(userId);
    const resume = CapacitorApp.addListener("resume", () => {
      void initPush(userId);
    });
    return () => {
      void resume.then((l) => l.remove());
    };
  }, [userId]);

  return null;
}
