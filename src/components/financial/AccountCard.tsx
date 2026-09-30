import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AccountOption } from "@/lib/accountOptions";
import type { FinanceSponsor } from "@/hooks/useFinanceAccounts";

export const NOT_ADVICE = "Educational, not financial or tax advice.";

interface AccountCardProps {
  option: AccountOption;
  opened: boolean;
  /** False until the opened-status query has loaded, so the toggle never flips under the parent's thumb. */
  statusReady: boolean;
  busy: boolean;
  onMarkOpened: () => void;
  onUndo: () => void;
  sponsor: FinanceSponsor | undefined;
  sponsorsSettled: boolean;
  /** A short callout under the name, e.g. the $1,000 claim for an eligible child. */
  highlight?: string;
  /** Present when this card is a finder recommendation. */
  recommendation?: { why: string; showFamilyLine: boolean };
}

export function AccountCard({
  option,
  opened,
  statusReady,
  busy,
  onMarkOpened,
  onUndo,
  sponsor,
  sponsorsSettled,
  highlight,
  recommendation,
}: AccountCardProps) {
  const [explainerOpen, setExplainerOpen] = useState(false);
  const Icon = option.icon;

  return (
    <Card className={cn("border-0", recommendation ? "bg-finance-bg" : "bg-card")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-finance/15 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-finance" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm flex flex-wrap items-center gap-x-2">
              {option.name}
              {opened && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-finance">
                  <CheckCircle2 className="w-4 h-4" /> Opened
                </span>
              )}
            </p>
            {highlight && <p className="text-sm font-semibold text-finance mt-0.5">{highlight}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">{option.summary}</p>
          </div>
        </div>

        {recommendation && (
          <div className="space-y-2 text-sm">
            <p className="leading-relaxed">{recommendation.why}</p>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">What you'll need</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {option.whatYouNeed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p>
              <span className="text-xs font-semibold text-muted-foreground">Time to open: </span>
              {option.timeToOpen}
            </p>
            {recommendation.showFamilyLine && (
              <p>
                <span className="text-xs font-semibold text-muted-foreground">Family can help: </span>
                {option.familyLine}
              </p>
            )}
          </div>
        )}

        {/* The neutral link always shows (FR-017); the sponsor only on list cards, before the account is opened (FR-017a). */}
        <OpenAction option={option} sponsor={!recommendation && !opened && sponsorsSettled ? sponsor : undefined} />

        {opened ? (
          <Button
            variant="ghost"
            className="w-full touch-target"
            disabled={busy || !statusReady}
            onClick={onUndo}
          >
            Undo
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full touch-target"
            disabled={busy || !statusReady}
            onClick={onMarkOpened}
          >
            I opened this
          </Button>
        )}

        <Collapsible open={explainerOpen} onOpenChange={setExplainerOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full touch-target text-sm font-semibold text-finance">
            How it works
            <ChevronDown
              className={cn("w-4 h-4 transition-transform duration-200", explainerOpen && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-1 text-sm">
            <ExplainerRow label="What it's for">{option.explainer.whatItsFor}</ExplainerRow>
            <ExplainerRow label="Key 2026 figures">
              <ul className="list-disc pl-5 space-y-0.5">
                {option.explainer.figures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </ExplainerRow>
            <ExplainerRow label="Who controls the money">{option.explainer.control}</ExplainerRow>
            <ExplainerRow label="Keep in mind">{option.explainer.keepInMind}</ExplainerRow>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Sources</p>
              <ul className="space-y-0.5">
                {option.sources.map((s) => (
                  <li key={s.url + s.label}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 min-h-[48px] text-sm font-semibold text-primary hover:underline"
                    >
                      {s.label} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">{NOT_ADVICE}</p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function ExplainerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

// The sponsor URL is used verbatim: nothing about the child, the account or the
// device is appended (spec FR-016). The Trump Account never carries a sponsor:
// the deposit is free to claim from the government.
function OpenAction({ option, sponsor }: { option: AccountOption; sponsor: FinanceSponsor | undefined }) {
  const howToOpen = (
    <Button asChild variant="secondary" className="w-full touch-target">
      <a href={option.howToOpen.url} target="_blank" rel="noopener noreferrer">
        How to open <ExternalLink />
      </a>
    </Button>
  );
  if (!sponsor || option.key === "trump") return howToOpen;

  const firm = sponsor.firm_name;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" className="flex-1 min-w-0 touch-target">
          <a
            href={sponsor.cta_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            aria-label={`${sponsor.cta_label}, ad, opens ${firm} website`}
          >
            <span className="truncate">{sponsor.cta_label}</span> <ExternalLink />
          </a>
        </Button>
        <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground">
          Ad
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        {`Paid ad from ${firm}. Grace Flare is paid for this placement and hasn't reviewed ${firm} or its products. Investing involves risk, including possible loss of money. Ads never change which accounts we suggest.` +
          (sponsor.disclosure ? " " + sponsor.disclosure : "")}
      </p>
      {howToOpen}
    </div>
  );
}
