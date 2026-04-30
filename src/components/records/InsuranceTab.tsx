import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shield, Heart, GraduationCap, ChevronDown, Clock } from "lucide-react";

interface Props {
  childId: string;
  parentId: string;
}

const BENEFICIARY_STEPS = [
  "Identify a primary beneficiary (your child, your spouse, or a trust).",
  "Name a contingent (backup) beneficiary in case the primary cannot accept.",
  "Submit the beneficiary update form to each carrier (life insurance, retirement accounts).",
  "Get written confirmation back from the carrier — phone calls don't count.",
  "Store a copy with your important documents and tell the executor of your will where it is.",
];

function InfoBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-foreground/90">
      <span className="text-muted-foreground select-none">•</span>
      <span>{children}</span>
    </li>
  );
}

function HealthInsuranceSection() {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Health Insurance</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        <Card className="border-orange-200 bg-orange-50/60">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-orange-900">Add baby within 30 days of birth</p>
              <p className="text-xs text-orange-900/80">Most plans give you a 30-day special enrollment window. Miss it and you may wait until the next open enrollment for coverage.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-muted/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to know</p>
            <ul className="space-y-1.5">
              <InfoBullet>You'll need baby's date of birth and (in most cases) the Social Security number — though many carriers will start coverage and let you submit the SSN later.</InfoBullet>
              <InfoBullet>Compare both parents' plans. The "birthday rule" (whichever parent's birthday comes first in the calendar year) usually decides primary coverage if both parents enroll the child.</InfoBullet>
              <InfoBullet>Plan types: <span className="font-semibold">HMO</span> (referral required, lower cost), <span className="font-semibold">PPO</span> (more flexibility, higher cost), <span className="font-semibold">HDHP</span> (high deductible, often paired with HSA).</InfoBullet>
              <InfoBullet>Confirm the pediatrician you choose is in-network before the first visit.</InfoBullet>
              <InfoBullet>Open enrollment is annual — typically Nov–Dec for plan-year-following coverage. Set a reminder to review before each one.</InfoBullet>
            </ul>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LifeInsuranceSection() {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Heart className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Life Insurance</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        <Card className="border-0 bg-muted/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Why parents consider it</p>
            <ul className="space-y-1.5">
              <InfoBullet>Replaces lost income for the surviving parent — typically a multiple of annual income (often 10x is the rule of thumb).</InfoBullet>
              <InfoBullet>Pays off debts (mortgage, student loans) so the surviving parent isn't forced to sell or work more hours.</InfoBullet>
              <InfoBullet>Funds childcare, college, and similar costs the deceased parent would have provided.</InfoBullet>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-0 bg-muted/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Term vs whole</p>
            <ul className="space-y-1.5">
              <InfoBullet><span className="font-semibold">Term</span> covers a fixed period (e.g. 20 years). Cheaper. Most parents use term to cover the years a child is dependent.</InfoBullet>
              <InfoBullet><span className="font-semibold">Whole / permanent</span> covers your whole life and builds cash value. More expensive. Useful for estate planning, niche cases.</InfoBullet>
              <InfoBullet>Compare quotes from at least three carriers — pricing varies a lot for the same coverage.</InfoBullet>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-0 bg-muted/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beneficiary checklist</p>
            <ol className="space-y-1.5 list-decimal pl-5 text-sm">
              {BENEFICIARY_STEPS.map((step) => (
                <li key={step} className="text-foreground/90">{step}</li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground italic pt-1">Beneficiary forms override your will — outdated forms send money to the wrong person.</p>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CollegeSavingsSection() {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <GraduationCap className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">529 College Savings</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-blue-900">Open it early — compounding is the whole point</p>
              <p className="text-xs text-blue-900/80">Even $25/month from birth grows. The first years matter most because they have the longest runway.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-muted/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to know</p>
            <ul className="space-y-1.5">
              <InfoBullet>Most parents start with their <span className="font-semibold">home state's plan</span> for the state-tax deduction. Check your state — a few have no deduction, in which case any plan works.</InfoBullet>
              <InfoBullet>The account owner is the parent; the beneficiary is the child. You stay in control of withdrawals.</InfoBullet>
              <InfoBullet>Confirm the beneficiary on the account is your child — sounds obvious, easy to miss.</InfoBullet>
              <InfoBullet>Funds are tax-free for qualified education expenses (tuition, fees, books, room & board, K-12 tuition up to a limit).</InfoBullet>
              <InfoBullet>Friends and family can contribute directly. Many plans support gift portals for birthdays and holidays.</InfoBullet>
              <InfoBullet>Federal contribution limits are very high (often $400k+ aggregate). Annual gift-tax exclusion is the practical ceiling for most families.</InfoBullet>
            </ul>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function InsuranceTab({ childId: _childId, parentId: _parentId }: Props) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground italic">
        Information only — not financial or insurance advice. Confirm specifics with your carrier, plan administrator, or a licensed advisor.
      </p>
      <HealthInsuranceSection />
      <LifeInsuranceSection />
      <CollegeSavingsSection />
    </div>
  );
}
