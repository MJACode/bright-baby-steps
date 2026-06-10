// Comparison data for the "Saving & investing for your child" section on
// the Records Financial tab. Hardcoded here (not in Supabase) since contributions, tax
// thresholds, and rules change yearly — easier to keep in source under PR
// review than hot-edit via the DB. Numbers reference 2026 figures; please
// verify current-year limits before shipping.

import type { LucideIcon } from "lucide-react";
import { GraduationCap, TrendingUp, PiggyBank, BookOpen, Wallet } from "lucide-react";

export type SavingsOptionKey = "529" | "ugma_utma" | "custodial_roth" | "esa" | "hysa";

export interface SavingsOption {
  key: SavingsOptionKey;
  name: string;
  tagline: string;
  icon: LucideIcon;
  bestFor: string;
  pros: string[];
  cons: string[];
  facts: {
    contribution: string;
    tax: string;
    control: string;
    use: string;
  };
  resourceUrl: string;
  resourceLabel: string;
}

export const SAVINGS_OPTIONS: SavingsOption[] = [
  {
    key: "529",
    name: "529 College Savings Plan",
    tagline: "The default for college-bound saving",
    icon: GraduationCap,
    bestFor:
      "Parents confident the money will go toward education (K-12, college, apprenticeships, or student loans).",
    pros: [
      "Tax-free growth and tax-free qualified-education withdrawals",
      "Many states give a state income tax deduction for contributions",
      "High lifetime limits ($300K-$500K+ depending on state)",
      "SECURE 2.0: up to $35K can roll to a Roth IRA after 15 years",
      "Parent stays in control of the account",
    ],
    cons: [
      "10% penalty + income tax on earnings if withdrawn for non-qualified expenses",
      "Investment menu is fixed by the state plan",
      "Counts against financial aid (parent asset, ~5.64% impact)",
    ],
    facts: {
      contribution:
        "No federal annual cap; contributions count toward the gift-tax exclusion ($19K/yr per donor in 2026), or $95K via 5-year superfunding.",
      tax: "Tax-free growth, tax-free qualified withdrawals (federal; most states match).",
      control: "Account owner (parent) controls forever — kid is just the beneficiary.",
      use: "K-12 ($10K/yr), college, apprenticeships, up to $10K lifetime for student loans.",
    },
    resourceUrl: "https://www.savingforcollege.com/",
    resourceLabel: "Compare state 529 plans",
  },
  {
    key: "ugma_utma",
    name: "UGMA / UTMA Custodial Brokerage",
    tagline: "Maximum flexibility — kid takes control at majority",
    icon: TrendingUp,
    bestFor:
      "Saving toward any future goal (school, house, car, business), or teaching investing alongside your kid.",
    pros: [
      "Use the money for anything — not just school",
      "Wide investment menu (any brokerage, ETFs, individual stocks)",
      "Easy to open at Fidelity, Schwab, Vanguard, Robinhood, etc.",
      "First ~$1,350 of unearned income is untaxed; next ~$1,350 at kid's rate (2026 kiddie-tax brackets)",
    ],
    cons: [
      "Kid legally owns the money at the age of majority (18-21 depending on state) — they can spend it however they want",
      "Counts heavily against financial aid (student asset, ~20% impact)",
      "Irrevocable gift — once contributed you can't take it back",
      "No special tax-advantaged growth like a 529 or Roth",
    ],
    facts: {
      contribution:
        "No annual cap. Contributions count toward the gift-tax exclusion ($19K/yr per donor in 2026).",
      tax: "Kiddie-tax rules: first ~$1,350 untaxed, next ~$1,350 at kid's rate, above at parent's marginal rate.",
      control: "Custodian (parent) until majority age in your state, then the kid.",
      use: "Anything, anytime — no restrictions.",
    },
    resourceUrl: "https://www.irs.gov/publications/p929",
    resourceLabel: "IRS Publication 929 (kiddie tax)",
  },
  {
    key: "custodial_roth",
    name: "Custodial Roth IRA",
    tagline: "Retirement head-start — only if your kid earns income",
    icon: PiggyBank,
    bestFor:
      "Kids with documented earned income (modeling, family business, summer job, tutoring). 60+ years of tax-free compounding is hard to beat.",
    pros: [
      "Tax-free growth and tax-free withdrawals in retirement",
      "Contributions can always be withdrawn tax- and penalty-free",
      "Up to $10K of earnings can go toward a first home",
      "Kid keeps the account for life — generational head-start",
    ],
    cons: [
      "Requires earned income — allowance, gifts, and investment income don't count",
      "Annual cap is the lesser of earned income or $7,000 (2026 figure — verify)",
      "10% penalty on earnings if withdrawn before 59½ for non-qualified reasons",
      "Need clean documentation (pay stubs / 1099s) to satisfy IRS scrutiny",
    ],
    facts: {
      contribution:
        "Up to the kid's earned income, capped at $7,000/year (2026 — verify current limit).",
      tax: "After-tax contributions, tax-free growth, tax-free qualified retirement withdrawals.",
      control: "Custodian (parent) until majority, then the kid.",
      use: "Retirement; up to $10K toward a first home; college (but loses retirement edge).",
    },
    resourceUrl: "https://www.fidelity.com/retirement-ira/roth-ira-kids",
    resourceLabel: "Fidelity Roth IRA for Kids",
  },
  {
    key: "esa",
    name: "Coverdell ESA",
    tagline: "Niche K-12 + college account with a tight cap",
    icon: BookOpen,
    bestFor:
      "Parents who want tax-free growth specifically for K-12 expenses (private school tuition, books, computers) on top of college.",
    pros: [
      "Tax-free growth and tax-free qualified withdrawals for K-12 and college",
      "Self-directed investments (more options than most 529s)",
      "Covers wider K-12 expenses than 529's $10K/yr tuition limit",
    ],
    cons: [
      "Hard $2,000/year contribution cap (across all ESAs for the kid)",
      "Income phase-out for contributors: $95K-$110K single / $190K-$220K married (verify current brackets)",
      "Beneficiary must be under 18 to receive contributions",
      "Must be used by age 30 or rolled to another family member",
    ],
    facts: {
      contribution:
        "$2,000/year total per beneficiary, regardless of how many ESAs they have.",
      tax: "Tax-free growth, tax-free qualified K-12 + college withdrawals.",
      control: "Custodian until majority; account must be drained or rolled by age 30.",
      use: "K-12 expenses (tuition, books, equipment) + college.",
    },
    resourceUrl: "https://www.irs.gov/publications/p970",
    resourceLabel: "IRS Publication 970 (education tax benefits)",
  },
  {
    key: "hysa",
    name: "High-Yield Savings Account",
    tagline: "Cash-equivalent safety, near-zero long-term growth",
    icon: Wallet,
    bestFor:
      "Short-term goals (≤2 years), parking gift money, or emergency fund for kid expenses. Zero market risk.",
    pros: [
      "FDIC insured up to $250K",
      "No risk of loss; fully liquid",
      "Competitive APY (~4-5% in 2026 — rate-sensitive)",
      "Open in minutes at any online bank",
    ],
    cons: [
      "Won't keep pace with college cost inflation (~5-6%/yr)",
      "Interest is taxed as ordinary income (no tax shelter)",
      "Long-term real return often negative after inflation",
    ],
    facts: {
      contribution: "Unlimited.",
      tax: "Interest taxed as ordinary income; no tax-advantaged growth.",
      control: "Whoever's name is on the account (parent's, or set up as custodial).",
      use: "Anything, anytime.",
    },
    resourceUrl: "https://www.nerdwallet.com/best/banking/high-yield-online-savings-accounts",
    resourceLabel: "NerdWallet HYSA comparison",
  },
];

// Wizard logic — maps a chosen path to a recommendation.
export type WizardGoal = "college" | "retirement" | "flexible" | "safe";
export type WizardEarnedIncome = "yes" | "no";

export function recommendFromWizard(
  goal: WizardGoal,
  hasEarnedIncome?: WizardEarnedIncome,
): { primary: SavingsOptionKey; alsoConsider?: SavingsOptionKey; rationale: string } {
  if (goal === "college") {
    return {
      primary: "529",
      alsoConsider: "esa",
      rationale:
        "529 plans give the strongest tax advantage for education and let parents stay in control. If you also want to cover private K-12, an ESA can complement the 529 (note the $2K/yr cap).",
    };
  }
  if (goal === "retirement") {
    if (hasEarnedIncome === "yes") {
      return {
        primary: "custodial_roth",
        rationale:
          "A Custodial Roth IRA turns your kid's earned income into 60+ years of tax-free compounding. Just keep documentation clean (pay stubs / 1099s).",
      };
    }
    return {
      primary: "ugma_utma",
      alsoConsider: "custodial_roth",
      rationale:
        "Without earned income a Roth isn't an option yet. Start with a UGMA/UTMA and switch to a Custodial Roth IRA as soon as your kid has documented earnings.",
    };
  }
  if (goal === "flexible") {
    return {
      primary: "ugma_utma",
      rationale:
        "UGMA/UTMA gives the most flexibility — money can go toward anything (school, house, business). Just remember the kid takes legal control at the age of majority.",
    };
  }
  // safe
  return {
    primary: "hysa",
    rationale:
      "For short timelines (≤2 years) or risk-averse parents, an HYSA preserves principal. For multi-year savings, consider moving funds into a 529 or UGMA/UTMA so growth keeps up with inflation.",
  };
}
