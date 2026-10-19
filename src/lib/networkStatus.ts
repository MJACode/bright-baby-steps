import { onlineManager } from "@tanstack/react-query";
import { Network, type ConnectionStatus } from "@capacitor/network";

// React Query's own listener only reacts to window online/offline events and
// assumes "online" at launch. WKWebView's events are unreliable, and a cold
// start with no signal would fire every query and write before anything said
// otherwise. @capacitor/network reads iOS's path monitor natively (and falls
// back to the navigator events on the web).

type BeforeOnline = () => Promise<void>;
let beforeOnline: BeforeOnline | null = null;
const BEFORE_ONLINE_TIMEOUT_MS = 8000;

/**
 * Runs before React Query is told the device is back online — i.e. before
 * queued writes replay. Used to confirm the account still exists.
 */
export function setBeforeOnline(fn: BeforeOnline | null) {
  beforeOnline = fn;
}

export function startNetworkStatus() {
  onlineManager.setEventListener((setOnline) => {
    let latest = 0;
    let disposed = false;

    const apply = async (online: boolean) => {
      const seq = ++latest;
      if (online && beforeOnline) {
        await Promise.race([
          beforeOnline().catch((err) => console.error("pre-sync check failed", err)),
          new Promise((resolve) => setTimeout(resolve, BEFORE_ONLINE_TIMEOUT_MS)),
        ]);
      }
      // A later change superseded this one while the check ran.
      if (!disposed && seq === latest) setOnline(online);
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) setOnline(false);
    Network.getStatus()
      .then((s: ConnectionStatus) => apply(s.connected))
      .catch(() => {});
    const handle = Network.addListener("networkStatusChange", (s: ConnectionStatus) => {
      void apply(s.connected);
    });

    return () => {
      disposed = true;
      void handle.then((h) => h.remove());
    };
  });
}
