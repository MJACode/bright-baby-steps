import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";

/**
 * Handles deep links opened from email (password reset, partner invites).
 * Only active in the native Capacitor app -- does nothing on web.
 *
 * Registered URL scheme: graceflare://
 * Expected URL shapes:
 *   graceflare://localhost/reset-password#type=recovery&access_token=...
 *   graceflare://localhost/invite/:code
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      try {
        const parsed = new URL(url);
        const hash = parsed.hash; // e.g. #type=recovery&access_token=xxx
        const path = parsed.pathname; // e.g. /invite/abc123

        // --- Password reset deep link ---
        if (hash.includes("type=recovery")) {
          const params = new URLSearchParams(hash.slice(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
          // Pass isRecovery via router state so ResetPassword can detect it
          // without relying on window.location.hash (which stays empty in WebView)
          navigate("/reset-password", { state: { isRecovery: true } });
          return;
        }

        // --- Partner invite deep link ---
        const inviteMatch = path.match(/^\/invite\/(.+)$/);
        if (inviteMatch) {
          navigate(`/invite/${inviteMatch[1]}`);
          return;
        }

        // --- Generic auth callback (email confirmation) ---
        if (hash.includes("access_token")) {
          const params = new URLSearchParams(hash.slice(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            navigate("/dashboard");
          }
        }
      } catch (err) {
        console.error("DeepLinkHandler error:", err);
      }
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, [navigate]);

  return null;
}
