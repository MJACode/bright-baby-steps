import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function WhyThisMatters({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 touch-target text-xs font-semibold text-finance">
        Why this matters
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
