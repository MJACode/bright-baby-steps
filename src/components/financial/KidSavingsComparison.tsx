import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, ChevronDown, ExternalLink, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SAVINGS_OPTIONS, type SavingsOptionKey } from "@/lib/savingsOptions";
import { KidSavingsWizard } from "./KidSavingsWizard";

export function KidSavingsComparison() {
  const [openKey, setOpenKey] = useState<SavingsOptionKey | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleJumpToOption = (key: SavingsOptionKey) => {
    setOpenKey(key);
    requestAnimationFrame(() => {
      document.getElementById(`savings-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-display font-bold text-base">Saving & investing for your child</h2>
        <p className="text-xs text-muted-foreground">
          There's no single "right" account. Compare the five options most parents use, or take a 30-second guided walkthrough.
        </p>
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => setWizardOpen(true)}
      >
        <Sparkles className="w-4 h-4 mr-1.5" />
        Help me pick the right one
      </Button>

      <div className="space-y-2">
        {SAVINGS_OPTIONS.map((opt) => {
          const open = openKey === opt.key;
          const Icon = opt.icon;
          return (
            <Card key={opt.key} id={`savings-${opt.key}`} className="border-0 bg-finance-bg">
              <Collapsible open={open} onOpenChange={(next) => setOpenKey(next ? opt.key : null)}>
                <CollapsibleTrigger className="w-full">
                  <CardContent className="p-3 flex items-start gap-3 text-left">
                    <div className="rounded-full bg-background/60 p-2 shrink-0">
                      <Icon className="w-4 h-4 text-finance" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-semibold">{opt.name}</p>
                      <p className="text-xs text-muted-foreground">{opt.tagline}</p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200",
                        open && "rotate-180",
                      )}
                    />
                  </CardContent>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-3 pb-3 pt-0 space-y-3">
                    <div className="rounded-md bg-background/60 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Best for</p>
                      <p className="text-xs text-foreground/90 mt-0.5">{opt.bestFor}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-success">Pros</p>
                        <ul className="space-y-1">
                          {opt.pros.map((pro) => (
                            <li key={pro} className="flex items-start gap-1.5 text-xs text-foreground/90">
                              <Check className="w-3 h-3 mt-0.5 shrink-0 text-success" />
                              <span>{pro}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-destructive">Cons</p>
                        <ul className="space-y-1">
                          {opt.cons.map((con) => (
                            <li key={con} className="flex items-start gap-1.5 text-xs text-foreground/90">
                              <X className="w-3 h-3 mt-0.5 shrink-0 text-destructive" />
                              <span>{con}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-md bg-background/60 px-3 py-2 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Key facts</p>
                      <FactRow label="Contribution" value={opt.facts.contribution} />
                      <FactRow label="Tax" value={opt.facts.tax} />
                      <FactRow label="Control" value={opt.facts.control} />
                      <FactRow label="Use" value={opt.facts.use} />
                    </div>

                    <a
                      href={opt.resourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline touch-target"
                    >
                      <ExternalLink className="w-3 h-3" /> {opt.resourceLabel}
                    </a>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        General guidance only — consult a licensed financial advisor for personalized advice. Tax limits and rules cited are 2026 figures; verify current-year numbers before contributing.
      </p>

      <KidSavingsWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onJumpToOption={handleJumpToOption}
      />
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="font-semibold text-foreground/80">{label}:</span>{" "}
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}
