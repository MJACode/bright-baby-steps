import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushPermission } from "@/hooks/usePushPermission";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "@/hooks/use-toast";
import {
  isPushFeatureEnabled,
  isPushSupported,
  PUSH_ENABLE_FAILED_TOAST,
} from "@/lib/pushNotifications";

// Pre-permission ask inside the notification sheet: the parent is already
// looking at notifications, so this is the moment the iOS prompt makes sense.
// iOS only shows its system prompt once, so we never fire it unprompted.
export function PushSoftAsk() {
  return isPushFeatureEnabled() && isPushSupported() ? <PushSoftAskCard /> : null;
}

function PushSoftAskCard() {
  const { permission, request } = usePushPermission();
  const { prefs: notifPrefs, isReady, save } = useNotificationPrefs();
  const { prefs, setPrefs } = usePreferences();

  // Permission may already be granted by the sleep/nursing timers'
  // LocalNotifications prompt; that is not an opt-in to push, so the card
  // still shows until the parent taps Turn on.
  const canAsk = permission === "prompt" || permission === "granted";
  if (!canAsk || !isReady || notifPrefs.push_enabled === true || prefs.pushSoftAskDismissed) {
    return null;
  }

  const handleTurnOn = async () => {
    save({ push_enabled: true });
    try {
      const next = await request();
      if (next === "granted") toast({ title: "Push notifications are on" });
    } catch (err) {
      console.error("Push permission request failed", err);
      toast(PUSH_ENABLE_FAILED_TOAST);
    }
  };

  return (
    <div className="m-4 rounded-xl bg-primary/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <BellRing className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">Get these on your lock screen</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reminders, development updates, and occasional savings tips reach you even when Grace Flare is closed.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1 touch-target text-sm" onClick={handleTurnOn}>
          Turn on
        </Button>
        <Button
          variant="ghost"
          className="flex-1 touch-target text-sm"
          onClick={() => setPrefs({ pushSoftAskDismissed: true })}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
