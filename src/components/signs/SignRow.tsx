import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Sign } from "@/data/signLibrary";
import type { ChildSignRow, SignStatus } from "@/hooks/useSignProgress";

const STATUS_CHIP: Record<SignStatus, string> = {
  introduced: "Using it",
  emerging: "Trying it",
  signing: "Signs it!",
};

export function SignRow({
  sign,
  row,
  onOpen,
}: {
  sign: Sign;
  row: ChildSignRow | undefined;
  onOpen: (sign: Sign) => void;
}) {
  const status = row?.status as SignStatus | undefined;

  return (
    <button
      type="button"
      onClick={() => onOpen(sign)}
      className="flex w-full items-center gap-3 rounded-lg bg-milestones-bg/60 p-3 text-left touch-target card-hover"
    >
      <span className="text-2xl shrink-0" aria-hidden>
        {sign.emoji}
      </span>
      <span className="flex-1 min-w-0 text-sm font-semibold">{sign.label}</span>
      {status && (
        <span
          className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
            status === "signing" ? "bg-milestones text-white" : "bg-milestones/15 text-milestones",
          )}
        >
          {STATUS_CHIP[status]}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
    </button>
  );
}
