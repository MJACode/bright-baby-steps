import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

export const AI_OFFLINE_COPY = "Available when you're back online";

/** Stands in for an AI action or result while the device has no signal. */
export function OfflineAiNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 min-h-[48px] text-sm text-muted-foreground", className)} role="status">
      <CloudOff aria-hidden className="w-4 h-4 shrink-0" />
      {AI_OFFLINE_COPY}
    </p>
  );
}
