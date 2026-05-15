import { useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Tint = "sleep" | "feeding" | "diaper" | "milestones" | "cry";

const TINT_BG: Record<Tint, string> = {
  sleep: "bg-sleep-bg/60",
  feeding: "bg-feeding-bg/60",
  diaper: "bg-diapers-bg/60",
  milestones: "bg-milestones-bg/60",
  cry: "bg-muted/60",
};

const TINT_TEXT: Record<Tint, string> = {
  sleep: "text-sleep",
  feeding: "text-feeding",
  diaper: "text-diapers",
  milestones: "text-milestones",
  cry: "text-muted-foreground",
};

interface PageInstructionsProps {
  tint: Tint;
  title?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function PageInstructions({ tint, title = "How to use this page", children, defaultOpen = false }: PageInstructionsProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full rounded-xl px-3 py-2 flex items-center gap-2 text-left transition-colors",
            TINT_BG[tint],
            "hover:brightness-95",
          )}
        >
          <Info className={cn("w-4 h-4 shrink-0", TINT_TEXT[tint])} />
          <span className="text-xs font-semibold flex-1">{title}</span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 px-3 text-xs text-muted-foreground space-y-1.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
