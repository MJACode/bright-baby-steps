import { Moon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SleepAlertPopupProps {
  title: string;
  body: string | null;
  onDismiss: () => void;
  onRemindLater: () => void;
}

export function SleepAlertPopup({
  title,
  body,
  onDismiss,
  onRemindLater,
}: SleepAlertPopupProps) {
  return (
    <div
      role="status"
      className="fixed bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+1rem)] inset-x-4 z-50 md:left-auto md:right-4 md:max-w-md animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="rounded-2xl bg-card border border-sleep/30 shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-sleep/15 flex items-center justify-center shrink-0">
            <Moon className="w-5 h-5 text-sleep" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold leading-tight">{title}</p>
            {body && (
              <p className="text-sm text-foreground/85 leading-snug mt-1">
                {body}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-h-[48px]"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 min-h-[48px] bg-sleep/15 text-sleep hover:bg-sleep/25"
            onClick={onRemindLater}
          >
            Remind me next time
          </Button>
        </div>
      </div>
    </div>
  );
}
