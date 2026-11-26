import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const TONE = {
  sleep: { trigger: "text-sleep", dot: "bg-sleep" },
  feeding: { trigger: "text-feeding", dot: "bg-feeding" },
} as const;

interface CoachCueListProps {
  label: string;
  cues: string[];
  tone: keyof typeof TONE;
  /** Open while the coach's window is active, collapsed otherwise. */
  defaultOpen: boolean;
  className?: string;
}

export function CoachCueList({ label, cues, tone, defaultOpen, className }: CoachCueListProps) {
  return (
    // Keyed on defaultOpen so the list opens on its own when the window does,
    // without overriding a parent's tap in between.
    <Collapsible key={defaultOpen ? "open" : "closed"} defaultOpen={defaultOpen} className={cn("mt-2", className)}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 text-left text-sm font-semibold touch-target",
          TONE[tone].trigger,
        )}
      >
        {label}
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-1 pb-1">
          {cues.map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm text-foreground/85 leading-snug">
              <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", TONE[tone].dot)} aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
