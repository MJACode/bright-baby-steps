import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useChildren } from "@/hooks/useChildren";
import { useCurrentRoleQuery } from "@/hooks/useCurrentRole";
import { useFinanceAccounts } from "@/hooks/useFinanceAccounts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AccountFinder } from "@/components/financial/AccountFinder";
import { AccountCard } from "@/components/financial/AccountCard";
import { ACCOUNT_OPTIONS, getAccountOption, type AccountKey } from "@/lib/accountOptions";
import { eligibilityDate, isTrumpEligible } from "@/lib/accountFinder";
import { cn } from "@/lib/utils";

const MAIN = ACCOUNT_OPTIONS.filter((o) => o.group === "main");
const OTHER = ACCOUNT_OPTIONS.filter((o) => o.group === "other");

export function FinancialTab() {
  const { activeChild } = useChildren();
  const { role, isResolved } = useCurrentRoleQuery(activeChild?.id);
  const finance = useFinanceAccounts(activeChild?.id);
  const [otherOpen, setOtherOpen] = useState(false);

  if (!activeChild) return null;

  if (isResolved && (role === "caregiver" || role === "viewer")) {
    return <p className="text-sm text-muted-foreground">Finance is shared with parents and co-parents only.</p>;
  }

  const eligibleOn = eligibilityDate(activeChild);
  const trumpEligible = isTrumpEligible(eligibleOn);
  const busy = finance.markOpened.isPending || finance.unmarkOpened.isPending;

  const renderCard = (key: AccountKey, recommendation?: { why: string; showFamilyLine: boolean }) => (
    <AccountCard
      key={key}
      option={getAccountOption(key)}
      opened={finance.opened.has(key)}
      statusReady={finance.statusesReady}
      busy={busy}
      onMarkOpened={() => finance.markOpened.mutate(key)}
      onUndo={() => finance.unmarkOpened.mutate(key)}
      sponsor={finance.sponsors.get(key)}
      sponsorsSettled={finance.sponsorsSettled}
      highlight={key === "trump" && trumpEligible ? "U.S.-citizen children may qualify for a $1,000 Treasury deposit" : undefined}
      recommendation={recommendation}
    />
  );

  return (
    <div className="space-y-8">
      <AccountFinder
        key={activeChild.id}
        childName={activeChild.name}
        isExpected={activeChild.is_expected ?? false}
        eligibilityDate={eligibleOn}
        saved={finance.finder}
        isLoading={finance.finderLoading}
        onSave={(answers) => finance.saveFinder.mutate(answers)}
        renderRecommendation={(key, answers) =>
          renderCard(key, { why: getAccountOption(key).why, showFamilyLine: answers.familyContributes })
        }
      />

      <section className="space-y-3">
        <h2 className="font-display font-bold text-lg">Accounts for your kid</h2>
        <div className="space-y-3">{MAIN.map((o) => renderCard(o.key))}</div>

        <Collapsible open={otherOpen} onOpenChange={setOtherOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full touch-target">
            <span className="font-semibold text-sm">Other accounts</span>
            <ChevronDown
              className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", otherOpen && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-1">{OTHER.map((o) => renderCard(o.key))}</CollapsibleContent>
        </Collapsible>
      </section>
    </div>
  );
}
