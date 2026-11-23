import { cn } from "@/lib/utils";
import type { GuidanceSection } from "@/services/allergenService";

type GuidanceTone = "destructive" | "warning" | "muted";

const GUIDANCE_TONE: Record<GuidanceTone, { box: string; title: string; followUp: string }> = {
  destructive: { box: "bg-destructive/10 border-destructive/30", title: "text-destructive", followUp: "font-bold text-destructive" },
  warning: { box: "bg-warning/10 border-warning/30", title: "text-warning", followUp: "font-semibold text-foreground" },
  muted: { box: "bg-muted/60 border-border", title: "text-muted-foreground", followUp: "text-muted-foreground" },
};

export function GuidanceBlock({ section, tone }: { section: GuidanceSection; tone: GuidanceTone }) {
  const t = GUIDANCE_TONE[tone];
  return (
    <div className={cn("rounded-lg border p-3 space-y-2 text-left", t.box)}>
      <p className={cn("text-sm font-bold", t.title)}>{section.title}</p>
      <ul className="list-disc pl-4 space-y-1 text-sm text-foreground">
        {section.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {section.followUp?.map((line) => (
        <p key={line} className={cn("text-sm", t.followUp)}>{line}</p>
      ))}
    </div>
  );
}
