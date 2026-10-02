import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignRow } from "@/components/signs/SignRow";
import {
  SIGN_LIBRARY,
  getDefaultFocusSet,
  getNextFocusSet,
  type Sign,
} from "@/data/signLibrary";
import type { ChildSignRow } from "@/hooks/useSignProgress";
import { readyForNewSigns } from "@/lib/signProgress";
import type { TrackingSchedule } from "@/lib/trackingDay";

export const FOCUS_VIEW_ONLY_HELP =
  "Only parents and caregivers who can edit can change this week's signs.";

const glossList = (slugs: string[]) =>
  slugs
    .map((slug) => SIGN_LIBRARY.find((s) => s.slug === slug)?.label.toUpperCase())
    .filter(Boolean)
    .join(", ");

const ctaClass = "min-h-[48px] w-full bg-milestones text-white hover:bg-milestones/90";

export function ThisWeekFocus({
  progress,
  focusSlugs,
  loading,
  ageMonths,
  firstName,
  schedule,
  canEdit,
  showViewerHelp,
  busy,
  onOpen,
  onStart,
  onAdvance,
}: {
  progress: Record<string, ChildSignRow> | undefined;
  /** Current focus slugs, in display order. */
  focusSlugs: string[];
  loading: boolean;
  ageMonths: number;
  firstName: string;
  schedule: TrackingSchedule;
  canEdit: boolean;
  showViewerHelp: boolean;
  busy: boolean;
  onOpen: (sign: Sign) => void;
  onStart: (slugs: string[]) => void;
  onAdvance: (unfocusSlugs: string[], focusSlugs: string[]) => void;
}) {
  const rows = Object.values(progress ?? {});
  const focusRows = focusSlugs.map((slug) => progress?.[slug]).filter((r): r is ChildSignRow => !!r);
  const statusBySlug: Record<string, string | undefined> = Object.fromEntries(
    rows.map((r) => [r.sign_slug, r.status]),
  );
  const allSigning = SIGN_LIBRARY.every((s) => statusBySlug[s.slug] === "signing");
  const ready = readyForNewSigns(focusRows, new Date(), schedule);
  const actionsDisabled = !canEdit || busy || loading;
  const ageGatedLine = `More signs open up as ${firstName} grows — browse All signs anytime.`;

  const renderPrompt = () => {
    if (allSigning) {
      return (
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 space-y-1">
            <p className="text-base font-bold">You've worked through the whole library 🎉</p>
            <p className="text-sm leading-relaxed">
              Keep using every sign together — they're part of {firstName}'s everyday words now.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (focusRows.length === 0) {
      const startSet = getDefaultFocusSet(ageMonths, statusBySlug);
      if (startSet.length === 0) {
        return <p className="text-sm leading-relaxed text-muted-foreground">{ageGatedLine}</p>;
      }
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            Focus on a few signs at a time. Start with {glossList(startSet)}, or open any sign below
            to make it a focus sign.
          </p>
          <Button type="button" className={ctaClass} disabled={actionsDisabled} onClick={() => onStart(startSet)}>
            Start with these signs
          </Button>
        </div>
      );
    }

    if (!ready) return null;
    const next = getNextFocusSet(ageMonths, statusBySlug, focusSlugs);
    if (next.kind === "none") return null;

    return (
      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-base font-bold">Ready for new signs?</p>
            <p className="text-sm leading-relaxed">
              Your current signs keep their progress — keep using them whenever they fit your day.
            </p>
          </div>
          {next.kind === "age-gated" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{ageGatedLine}</p>
          ) : (
            <>
              <p className="text-sm font-semibold">Next up: {glossList(next.signSlugs)}</p>
              <Button
                type="button"
                className={ctaClass}
                disabled={actionsDisabled}
                onClick={() => onAdvance(focusSlugs, next.signSlugs)}
              >
                Start the next signs
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <section className="space-y-3" aria-labelledby="this-week-heading">
      <h2 id="this-week-heading" className="font-display font-bold text-xl">
        This week
      </h2>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <>
          {focusRows.length > 0 && (
            <div className="space-y-2">
              {focusRows.map((row) => {
                const sign = SIGN_LIBRARY.find((s) => s.slug === row.sign_slug);
                return sign ? <SignRow key={row.sign_slug} sign={sign} row={row} onOpen={onOpen} /> : null;
              })}
            </div>
          )}
          {renderPrompt()}
        </>
      )}

      {showViewerHelp && <p className="text-xs text-muted-foreground">{FOCUS_VIEW_ONLY_HELP}</p>}
    </section>
  );
}
