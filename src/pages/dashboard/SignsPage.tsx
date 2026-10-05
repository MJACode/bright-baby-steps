import { Link } from "react-router-dom";
import { useState } from "react";
import { Hand, Sparkles, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AddChildDialog } from "@/components/AddChildDialog";
import { PremiumGate } from "@/components/PremiumGate";
import { SignDetailSheet } from "@/components/signs/SignDetailSheet";
import { SignRow } from "@/components/signs/SignRow";
import { ThisWeekFocus } from "@/components/signs/ThisWeekFocus";
import { resolveTrackingSchedule, trackingDayKey } from "@/lib/trackingDay";
import { assertCanWrite, useCurrentRoleQuery } from "@/hooks/useCurrentRole";
import { toast } from "@/hooks/use-toast";
import { useChildren, getAgeInMonths, isAgeCorrected } from "@/hooks/useChildren";
import { useSignProgress, useSetSignStatus, useSetSignFocus, type SignStatus } from "@/hooks/useSignProgress";
import { useSignPractice, useToggleSignPractice } from "@/hooks/useSignPractice";
import {
  SIGN_STAGES,
  SIGN_LIBRARY,
  SIGN_PATH,
  getSignsForStage,
  SIGNS_WHY,
  SIGNS_HOW_TO_TEACH,
  SIGNS_BILINGUAL_NOTE,
  SIGNS_EXPECTATIONS,
  SIGNS_RED_FLAG,
  SIGNS_SPEECH_VS_LANGUAGE,
  type Sign,
} from "@/data/signLibrary";

export default function SignsPage() {
  const { activeChild } = useChildren();
  const { data: progress, isLoading: progressLoading } = useSignProgress(activeChild?.id);
  const setStatus = useSetSignStatus();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const setFocus = useSetSignFocus();
  const [focusBusy, setFocusBusy] = useState(false);
  const { role, isResolved: roleResolved } = useCurrentRoleQuery(activeChild?.id);
  const schedule = resolveTrackingSchedule(activeChild);
  const { data: practiceRows, isLoading: practiceLoading } = useSignPractice(activeChild?.id, schedule);
  const togglePractice = useToggleSignPractice();

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

  const canEditFocus = roleResolved && role !== "viewer";
  const showViewerHelp = roleResolved && role === "viewer";
  const focusSlugs = SIGN_PATH.flatMap((set) => set.signSlugs).filter((slug) => !!progress?.[slug]?.focus_since);
  const focusSigns = focusSlugs
    .map((slug) => SIGN_LIBRARY.find((s) => s.slug === slug))
    .filter((s): s is Sign => !!s);
  const gloss = (slugs: string[]) =>
    slugs.map((slug) => SIGN_LIBRARY.find((s) => s.slug === slug)?.label.toUpperCase() ?? slug).join(", ");

  const runFocusSteps = async (steps: { slug: string; focus: boolean }[], successTitle: string) => {
    try {
      assertCanWrite(roleResolved, role);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Try again in a moment." });
      return;
    }
    setFocusBusy(true);
    try {
      for (const [index, step] of steps.entries()) {
        // A failed first step has already toasted via the hook's onError. Once
        // an earlier step has landed, the hook stays quiet and we say the
        // change only partly saved.
        const partial = index > 0;
        const ok = await setFocus
          .mutateAsync({
            childId: activeChild.id,
            childOwnerId: activeChild.parent_id,
            signSlug: step.slug,
            focus: step.focus,
            schedule,
            quiet: partial,
          })
          .then(
            () => true,
            () => false,
          );
        if (!ok) {
          if (partial) {
            toast({
              title: "Some of this week's signs didn't save.",
              description: "Their progress is safe — pick your signs again from All signs.",
              variant: "destructive",
            });
          }
          return;
        }
      }
      toast({ title: successTitle });
    } finally {
      setFocusBusy(false);
    }
  };

  const startFocus = (slugs: string[]) =>
    runFocusSteps(
      slugs.map((slug) => ({ slug, focus: true })),
      `This week's signs: ${gloss(slugs)}`,
    );

  const advanceFocus = (unfocusSlugs: string[], focusSlugsNext: string[]) =>
    runFocusSteps(
      [
        ...unfocusSlugs.map((slug) => ({ slug, focus: false })),
        ...focusSlugsNext.map((slug) => ({ slug, focus: true })),
      ],
      `This week's signs: ${gloss(focusSlugsNext)}`,
    );

  const focusSign = (sign: Sign) =>
    runFocusSteps([{ slug: sign.slug, focus: true }], `${sign.label.toUpperCase()} is a focus sign this week.`);

  const unfocusSign = (sign: Sign) =>
    runFocusSteps(
      [{ slug: sign.slug, focus: false }],
      `${sign.label.toUpperCase()} is off this week's list — its progress stays.`,
    );

  const swapFocus = (out: Sign, into: Sign) =>
    runFocusSteps(
      [
        { slug: out.slug, focus: false },
        { slug: into.slug, focus: true },
      ],
      `Swapped ${out.label.toUpperCase()} for ${into.label.toUpperCase()}.`,
    );

  const toggleModeled = (sign: Sign, practiced: boolean) => {
    try {
      assertCanWrite(roleResolved, role);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Try again in a moment." });
      return;
    }
    const practicedOn = trackingDayKey(new Date(), schedule);
    if (!practicedOn) return;
    togglePractice.mutate({
      childId: activeChild.id,
      childOwnerId: activeChild.parent_id,
      signSlug: sign.slug,
      practicedOn,
      practiced,
    });
  };

  const openSign = (sign: Sign) => {
    setSelectedSlug(sign.slug);
    setSheetOpen(true);
  };

  const selectedSign = SIGN_LIBRARY.find((s) => s.slug === selectedSlug) ?? null;

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
          {activeChild.name} • {ageMonths}mo {isAgeCorrected(activeChild.date_of_birth, activeChild.is_premature, activeChild.due_date) ? "(adjusted)" : ""}
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
          <ThisWeekFocus
            progress={progress}
            focusSlugs={focusSlugs}
            loading={progressLoading}
            ageMonths={ageMonths}
            firstName={firstName}
            schedule={schedule}
            canEdit={canEditFocus}
            showViewerHelp={showViewerHelp}
            busy={focusBusy}
            practiceRows={practiceRows}
            practiceLoading={practiceLoading}
            pendingPracticeSlug={togglePractice.isPending ? (togglePractice.variables?.signSlug ?? null) : null}
            onOpen={openSign}
            onStart={startFocus}
            onAdvance={advanceFocus}
            onTogglePractice={toggleModeled}
          />

          <h2 className="font-display font-bold text-xl pt-2">All signs</h2>

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
                <h3 className="font-display font-bold text-lg">{stage.title}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-milestones/15 text-milestones">
                  from ~{stage.fromMonths}mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{stage.subtitle}</p>
              <div className="space-y-2">
                {getSignsForStage(stage.id).map((sign) => (
                  <SignRow
                    key={sign.slug}
                    sign={sign}
                    row={progress?.[sign.slug]}
                    onOpen={openSign}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <SignDetailSheet
          sign={selectedSign}
          row={selectedSlug ? progress?.[selectedSlug] : undefined}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          disabled={progressLoading || setStatus.isPending}
          onSetStatus={handleSetStatus}
          focusSigns={focusSigns}
          canEdit={canEditFocus}
          showViewerHelp={showViewerHelp}
          focusBusy={focusBusy || progressLoading}
          onFocus={focusSign}
          onUnfocus={unfocusSign}
          onSwap={swapFocus}
        />
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
