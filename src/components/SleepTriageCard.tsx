import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Moon, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSleepTriage } from "@/hooks/useSleepTriage";
import {
  TRIAGE_REASON_HUMAN,
  TRIAGE_REASON_ORDER,
  lookupContent,
  type TriageReason,
} from "@/lib/sleepTriage";
import { openChat } from "@/lib/chatOpener";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

interface SleepTriageCardProps {
  activeChild: ChildLite | null;
  ageMonths: number;
}

export function SleepTriageCard({ activeChild, ageMonths: ageFromPage }: SleepTriageCardProps) {
  const {
    detected,
    selected,
    setSelected,
    ageBucket,
    methodFlavor,
    content,
    writeMemory,
    collapsed,
    setCollapsed,
  } = useSleepTriage(activeChild);

  if (!activeChild) return null;

  const detectedBadgeText =
    detected.length > 0
      ? detected.length === 1
        ? `AI suggests: ${TRIAGE_REASON_HUMAN[detected[0]].toLowerCase()}`
        : `AI suggests: ${detected.length} possible patterns`
      : null;

  const handleSelect = (reason: TriageReason) => {
    setSelected(reason);
  };

  const handleTalk = () => {
    if (!content) return;
    const prompt = content.chatPrompt ?? `I'd like help with: ${selected ? TRIAGE_REASON_HUMAN[selected] : "sleep"}`;
    // Fire-and-forget memory write — the chat handoff shouldn't wait on it.
    void writeMemory();
    openChat({ seedPrompt: prompt, forceSkill: "sleep" });
  };

  const isOpen = !collapsed;
  const onOpenChange = (open: boolean) => setCollapsed(!open);

  // Newborn special case — single neutral panel, no grid. The taxonomy doesn't
  // map cleanly under 1 month: there's no schedule to be confused about, no
  // bedtime to fight, no regression. Hand straight to the sleep persona.
  const isNewborn = ageFromPage < 1;

  return (
    <Card className="border border-sleep/20 bg-sleep/5">
      <CardContent className="p-0">
        <Collapsible open={isOpen} onOpenChange={onOpenChange}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left touch-target hover:bg-sleep/10 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-sleep/15 flex items-center justify-center shrink-0">
                <Moon className="w-5 h-5 text-sleep" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-bold text-foreground leading-tight">
                  What's going on with sleep tonight?
                </p>
                {detectedBadgeText && (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-sleep/15 text-sleep text-xs font-semibold">
                    <Sparkles className="w-3 h-3" />
                    {detectedBadgeText}
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0",
                  isOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-4">
              {isNewborn ? (
                <NewbornPanel onTalk={() => {
                  const fallback = lookupContent("other", ageBucket, methodFlavor);
                  openChat({
                    seedPrompt:
                      fallback?.chatPrompt ??
                      "My newborn's sleep feels unpredictable. Can we talk through what's normal?",
                    forceSkill: "sleep",
                  });
                }} />
              ) : selected && content ? (
                <DetailPanel
                  title={content.title}
                  body={content.body}
                  tips={content.tips}
                  onChange={() => setSelected(null)}
                  onTalk={handleTalk}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {TRIAGE_REASON_ORDER.map((reason) => {
                    const isDetected = detected.includes(reason);
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => handleSelect(reason)}
                        className={cn(
                          "relative touch-target rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors text-left",
                          "border-border bg-card text-foreground hover:border-primary/50",
                        )}
                      >
                        {isDetected && (
                          <Sparkles className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-sleep" />
                        )}
                        {TRIAGE_REASON_HUMAN[reason]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

interface DetailPanelProps {
  title: string;
  body: string[];
  tips: { icon: React.ComponentType<{ className?: string }>; text: string }[];
  onChange: () => void;
  onTalk: () => void;
}

function DetailPanel({ title, body, tips, onChange, onTalk }: DetailPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
        {body.map((para, i) => (
          <p key={i} className="text-sm text-foreground/80 leading-relaxed">
            {para}
          </p>
        ))}
      </div>

      {tips.length > 0 && (
        <ul className="space-y-2">
          {tips.map((tip, i) => {
            const Icon = tip.icon;
            return (
              <li key={i} className="flex items-start gap-2.5 rounded-lg bg-background/60 p-2.5">
                <Icon className="w-4 h-4 text-sleep shrink-0 mt-0.5" />
                <span className="text-sm text-foreground/80 leading-relaxed">{tip.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 touch-target text-muted-foreground"
          onClick={onChange}
        >
          Change answer
        </Button>
        <Button
          type="button"
          className="flex-1 touch-target gap-2 bg-sleep hover:bg-sleep/90 text-white"
          onClick={onTalk}
        >
          <MessageCircle className="w-4 h-4" />
          Talk to Sleep Coach
        </Button>
      </div>
    </div>
  );
}

function NewbornPanel({ onTalk }: { onTalk: () => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-display text-lg font-bold text-foreground">
          Newborn sleep is unpredictable — and that's okay
        </h3>
        <p className="text-sm text-foreground/80 leading-relaxed">
          In the first few weeks there isn't really a schedule yet. Your baby's
          sleep is driven by short wake windows and feeding, not the clock.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          We'll start surfacing pattern-based suggestions once your baby is a
          little older. For now, the Sleep Coach can talk through anything
          you're seeing tonight.
        </p>
      </div>
      <Button
        type="button"
        className="w-full touch-target gap-2 bg-sleep hover:bg-sleep/90 text-white"
        onClick={onTalk}
      >
        <MessageCircle className="w-4 h-4" />
        Talk to Sleep Coach
      </Button>
    </div>
  );
}
