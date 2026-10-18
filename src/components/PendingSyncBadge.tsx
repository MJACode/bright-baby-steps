import { CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";

/** Quiet caption on a log row that hasn't reached the server yet. */
export function PendingSyncBadge({ pending, className }: { pending: boolean; className?: string }) {
  if (!pending) return null;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-semibold text-muted-foreground", className)}>
      <CloudUpload aria-hidden className="w-3.5 h-3.5 shrink-0" />
      Waiting to sync
    </span>
  );
}
