import { Switch } from "@/components/ui/switch";
import { usePushPermission } from "@/hooks/usePushPermission";
import { toast } from "@/hooks/use-toast";
import { isPushFeatureEnabled, PUSH_ENABLE_FAILED_TOAST } from "@/lib/pushNotifications";

interface PushNotificationSettingProps {
  pushEnabled: boolean;
  disabled: boolean;
  onPushEnabledChange: (enabled: boolean) => void;
}

export function PushNotificationSetting(props: PushNotificationSettingProps) {
  return isPushFeatureEnabled() ? <PushNotificationSwitch {...props} /> : null;
}

function PushNotificationSwitch({
  pushEnabled,
  disabled,
  onPushEnabledChange,
}: PushNotificationSettingProps) {
  const { supported, permission, request } = usePushPermission();
  if (!supported) return null;

  // push_enabled is account-wide; OS permission is per device. The switch
  // shows on only when this iPhone will actually receive them.
  const on = pushEnabled && permission === "granted";

  const handleChange = async (checked: boolean) => {
    if (!checked) {
      onPushEnabledChange(false);
      return;
    }
    if (!pushEnabled) onPushEnabledChange(true);
    if (permission !== "prompt") return;
    try {
      const next = await request();
      if (next === "granted") toast({ title: "Push notifications are on" });
    } catch (err) {
      console.error("Push permission request failed", err);
      toast(PUSH_ENABLE_FAILED_TOAST);
    }
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3 min-h-[48px] cursor-pointer">
        <div>
          <p className="text-sm font-semibold">Push notifications</p>
          <p className="text-xs text-muted-foreground">
            Reminders, development updates, and occasional savings tips on your lock screen, even when the app is closed
          </p>
        </div>
        <Switch
          checked={on}
          disabled={disabled || permission === null}
          onCheckedChange={handleChange}
          aria-label="Push notifications"
        />
      </label>
      {pushEnabled && permission === "denied" && (
        <p className="text-xs text-muted-foreground rounded-lg bg-background p-3" role="status">
          To get them on this iPhone, open Settings, tap Grace Flare, then Notifications, and turn on
          Allow Notifications.
        </p>
      )}
    </div>
  );
}
