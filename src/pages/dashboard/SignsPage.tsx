import { Link } from "react-router-dom";
import { Hand, Sparkles, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AddChildDialog } from "@/components/AddChildDialog";
import { PremiumGate } from "@/components/PremiumGate";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { useSignProgress, useSetSignStatus, type ChildSignRow, type SignStatus } from "@/hooks/useSignProgress";
import {
  SIGN_STAGES,
  SIGN_LIBRARY,
  getSignsForStage,
  SIGNS_WHY,
  SIGNS_HOW_TO_TEACH,
  SIGNS_BILINGUAL_NOTE,
  SIGNS_EXPECTATIONS,
  SIGNS_RED_FLAG,
  SIGNS_SPEECH_VS_LANGUAGE,
  type Sign,
} from "@/data/signLibrary";

const STATUS_OPTIONS: { value: SignStatus; label: string }[] = [
  { value: "introduced", label: "We're using it" },
  { value: "emerging", label: "Trying it" },
  { value: "signing", label: "Signs it!" },
];

const STATUS_CHIP: Record<SignStatus, string> = {
  introduced: "Using it",
  emerging: "Trying it",
  signing: "Signs it!",
};

function SignCard({
  sign,
  row,
  disabled,
  onSetStatus,
}: {
  sign: Sign;
  row: ChildSignRow | undefined;
  disabled: boolean;
  onSetStatus: (sign: Sign, next: SignStatus) => void;
}) {
  const status = row?.status as SignStatus | undefined;

  return (
    <Card className="border-0 bg-milestones-bg/60">
      <Collapsible>
        <CollapsibleTrigger className="w-full text-left touch-target group">
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-2xl shrink-0" aria-hidden>
              {sign.emoji}
            </span>
            <p className="flex-1 min-w-0 text-sm font-semibold">{sign.label}</p>
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
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            <div className="space-y-1.5 text-sm leading-relaxed">
              <p>
                <span className="font-semibold">How: </span>
                {sign.howTo}
              </p>
              <p>
                <span className="font-semibold">When: </span>
                {sign.whenToUse}
              </p>
              {sign.tip && <p className="text-xs text-muted-foreground leading-relaxed">{sign.tip}</p>}
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Progress for ${sign.label}`}>
              {STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={status === value}
                  onClick={() => onSetStatus(sign, value)}
                  className={cn(
                    "min-h-[48px] rounded-xl px-2 text-sm font-semibold leading-tight transition-colors disabled:opacity-50",
                    status === value
                      ? "bg-milestones text-white"
                      : "bg-milestones/10 text-milestones hover:bg-milestones/20",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function SignsPage() {
  const { activeChild } = useChildren();
  const { data: progress, isLoading: progressLoading } = useSignProgress(activeChild?.id);
  const setStatus = useSetSignStatus();

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Hand className="w-7 h-7 text-milestones" /> Baby Signs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start signing together.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const ageMonths = getAgeInMonths(
    activeChild.date_of_birth,
    activeChild.is_premature ?? false,
    activeChild.due_date,
  );
  const firstName = activeChild.name.split(" ")[0];

  const rows = Object.values(progress ?? {});
  const introducedCount = rows.length;
  const signingCount = rows.filter((r) => r.status === "signing").length;

  const handleSetStatus = (sign: Sign, next: SignStatus) => {
    const existing = progress?.[sign.slug];
    const target: SignStatus | null = existing?.status === next ? null : next;
    const isFirstSigning = target === "signing" && !existing?.first_signed_at;

    setStatus.mutate(
      {
        childId: activeChild.id,
        // Owner-keyed on purpose — see useSetSignStatus for why writer-keying
        // breaks the directional partner-access RLS.
        childOwnerId: activeChild.parent_id,
        signSlug: sign.slug,
        status: target,
      },
      {
        onSuccess: () => {
          if (isFirstSigning) {
            toast({
              title: `🎉 ${firstName} signs ${sign.label.toUpperCase()}!`,
              description:
                "A sign used on its own counts as a word — add it to the Word Journal too.",
            });
          }
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Hand className="w-7 h-7 text-milestones" /> Baby Signs
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-mono">
            <Sparkles className="w-3 h-3 mr-1" />
            Flare+
          </Badge>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name} • {ageMonths}mo {activeChild.is_premature ? "(adjusted)" : ""}
        </p>
      </div>

      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm leading-relaxed">{SIGNS_WHY}</p>
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 touch-target group text-sm font-semibold text-milestones">
              How to teach signs
              <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-1">
              <p className="text-sm leading-relaxed">{SIGNS_HOW_TO_TEACH}</p>
              <p className="text-sm leading-relaxed">{SIGNS_BILINGUAL_NOTE}</p>
              <p className="text-sm leading-relaxed">{SIGNS_EXPECTATIONS}</p>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {ageMonths < 6 && (
        <p className="text-xs text-muted-foreground italic">
          You can start modeling signs anytime — most families begin around 6 months.
        </p>
      )}

      <PremiumGate
        feature="baby-signs"
        variant="replace"
        description="The full ASL-based program — 20 signs in 5 stages, with per-sign progress tracking for your baby."
      >
        <div className="space-y-6">
          {progressLoading ? (
            <Skeleton className="h-5 w-64" />
          ) : (
            <p className="text-sm font-semibold">
              {introducedCount} of {SIGN_LIBRARY.length} signs introduced · {signingCount} signed back
            </p>
          )}

          {SIGN_STAGES.map((stage) => (
            <div key={stage.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg">{stage.title}</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-milestones/15 text-milestones">
                  from ~{stage.fromMonths}mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{stage.subtitle}</p>
              <div className="space-y-2">
                {getSignsForStage(stage.id).map((sign) => (
                  <SignCard
                    key={sign.slug}
                    sign={sign}
                    row={progress?.[sign.slug]}
                    disabled={progressLoading || setStatus.isPending}
                    onSetStatus={handleSetStatus}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </PremiumGate>

      <div className="space-y-2 pt-1">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {SIGNS_RED_FLAG}{" "}
          <Link to="/dashboard/early-intervention" className="underline font-semibold text-milestones">
            Early Intervention resources
          </Link>
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">{SIGNS_SPEECH_VS_LANGUAGE}</p>
        <p className="text-xs text-muted-foreground italic">
          Every child develops at their own pace. Consult your pediatrician with concerns.
        </p>
      </div>
    </div>
  );
}
