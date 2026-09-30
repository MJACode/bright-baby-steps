// The one place account content and 2026 figures live (Constitution V).
// Rules change yearly — update here by PR, and keep every figure next to the
// source it came from. Sources are official or non-commercial; paid "Open
// with" links come only from finance_account_sponsors, never from this file.

import type { LucideIcon } from "lucide-react";
import { BookOpen, GraduationCap, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";

export const ACCOUNT_KEYS = ["trump", "529", "ugma_utma", "hysa", "esa", "custodial_roth"] as const;
export type AccountKey = (typeof ACCOUNT_KEYS)[number];

export function isAccountKey(value: string): value is AccountKey {
  return (ACCOUNT_KEYS as readonly string[]).includes(value);
}

export interface SourceLink {
  label: string;
  url: string;
}

export interface AccountOption {
  key: AccountKey;
  name: string;
  icon: LucideIcon;
  /** One line under the name in the account list. */
  summary: string;
  /** Why the finder suggests it — shown on a recommendation. */
  why: string;
  explainer: {
    whatItsFor: string;
    figures: string[];
    control: string;
    keepInMind: string;
  };
  whatYouNeed: string[];
  timeToOpen: string;
  familyLine: string;
  howToOpen: SourceLink;
  sources: SourceLink[];
  group: "main" | "other";
}

const IRS_GIFT_TAX_FAQ: SourceLink = {
  label: "IRS: gift tax FAQs",
  url: "https://www.irs.gov/businesses/small-businesses-self-employed/frequently-asked-questions-on-gift-taxes",
};

export const ACCOUNT_OPTIONS: AccountOption[] = [
  {
    key: "trump",
    name: "Trump Account",
    icon: Landmark,
    summary: "A long-term investment account for children under 18 with a Social Security number.",
    why: "U.S.-citizen children born 2025 through 2028 may qualify for a one-time $1,000 deposit from the U.S. Treasury. A parent claims it once the baby has a Social Security number.",
    explainer: {
      whatItsFor: "Long-term savings that grow with the market until your child is an adult.",
      figures: [
        "$1,000 Treasury deposit for U.S.-citizen children with a Social Security number, born January 1, 2025 through December 31, 2028.",
        "Claim it with IRS Form 4547 or at trumpaccounts.gov.",
        "Family can add up to $5,000 a year in total (a parent's employer can give up to $2,500 of that per employee).",
        "Family contributions have been allowed since July 4, 2026.",
      ],
      control: "You manage the account until your child turns 18. The money is theirs.",
      keepInMind:
        "The money generally stays invested until your child turns 18. For now, a parent claims the $1,000 using IRS Form 4547 or trumpaccounts.gov. You don't need to pay anyone or use a particular firm to claim it. Treasury has proposed changes, so these rules may change.",
    },
    whatYouNeed: [
      "Your baby's Social Security number",
      "Your own Social Security number and ID",
      "IRS Form 4547, or a few minutes on trumpaccounts.gov",
    ],
    timeToOpen: "About 15 minutes",
    familyLine: "Once it's open, family can add up to $5,000 a year in total (a parent's employer can give up to $2,500 of that per employee).",
    howToOpen: { label: "trumpaccounts.gov", url: "https://trumpaccounts.gov/" },
    sources: [
      { label: "IRS: About Form 4547", url: "https://www.irs.gov/forms-pubs/about-form-4547" },
      { label: "trumpaccounts.gov", url: "https://trumpaccounts.gov/" },
      { label: "IRS: Trump Accounts", url: "https://www.irs.gov/trumpaccounts" },
    ],
    group: "main",
  },
  {
    key: "529",
    name: "529 education savings",
    icon: GraduationCap,
    summary: "Grows tax-free when spent on school, from kindergarten to college. You stay in control.",
    why: "Earnings grow tax-free when spent on qualified education costs, and the money stays yours to direct. If school plans change, some of it may later move to your child's Roth IRA, within limits.",
    explainer: {
      whatItsFor: "School costs — K-12 tuition, college, trade school, apprenticeships and some credentialing programs.",
      figures: [
        "From 2026, up to $20,000 a year can go to K-12 tuition under federal rules. Some states tax K-12 withdrawals differently.",
        "Each person can give up to $19,000 a year without filing a gift-tax return. You can also put in up to $95,000 at once and spread it over five years, but that requires filing IRS Form 709.",
        "Once the 529 has been open 15 years, up to $35,000 (lifetime) can roll into your child's Roth IRA, subject to yearly Roth limits, your child's earned income, and a 5-year rule on recent contributions.",
        "Many states give a state tax deduction for contributions.",
      ],
      control: "You own the account; your child is the beneficiary. You can change the beneficiary to another family member.",
      keepInMind:
        "Earnings taken out for non-education costs are taxed, plus a 10% penalty. Investment choices are set by the plan you pick. You can use any state's plan, but your state's tax break may only apply to its own.",
    },
    whatYouNeed: [
      "Your baby's Social Security number and date of birth",
      "Your own Social Security number and ID",
      "A bank account to make the first deposit",
    ],
    timeToOpen: "About 15 to 20 minutes online",
    familyLine: "Family can gift straight into it — most plans give you a link to share. Up to $19,000 per person a year stays under the gift-tax exclusion.",
    howToOpen: { label: "Compare state 529 plans (College Savings Plans Network)", url: "https://www.collegesavings.org/" },
    sources: [
      { label: "IRS Publication 970", url: "https://www.irs.gov/publications/p970" },
      IRS_GIFT_TAX_FAQ,
      { label: "Compare state 529 plans (College Savings Plans Network)", url: "https://www.collegesavings.org/" },
    ],
    group: "main",
  },
  {
    key: "ugma_utma",
    name: "Custodial account (UGMA/UTMA)",
    icon: TrendingUp,
    summary: "An investment account for anything your child needs. It becomes theirs at 18 to 21 in most states (up to 25 in a few).",
    why: "The money can go toward anything — school, a first car, a first home. You invest it for your child until they come of age.",
    explainer: {
      whatItsFor: "Any goal that benefits your child, with a wide choice of investments.",
      figures: [
        "No yearly limit. Each person can give up to $19,000 a year without filing a gift-tax return.",
        "Investment earnings above a small yearly amount are taxed under the IRS \"kiddie tax\" rules.",
      ],
      control: "You manage it as custodian. Your child takes full control between 18 and 25, depending on your state and how the account is set up.",
      keepInMind:
        "Money you put in is a permanent gift to your child. It also counts more heavily on college aid forms than a 529.",
    },
    whatYouNeed: [
      "Your baby's Social Security number and date of birth",
      "Your own Social Security number and ID",
      "A bank account to fund it",
    ],
    timeToOpen: "About 15 minutes online",
    familyLine: "Family can transfer money in any time. Up to $19,000 per person a year stays under the gift-tax exclusion.",
    howToOpen: { label: "FINRA: Ways to invest for children", url: "https://www.finra.org/investors/insights/investing-children" },
    sources: [
      { label: "IRS Publication 929 (kiddie tax)", url: "https://www.irs.gov/publications/p929" },
      IRS_GIFT_TAX_FAQ,
    ],
    group: "main",
  },
  {
    key: "hysa",
    name: "High-yield savings",
    icon: Wallet,
    summary: "Insured, easy-to-reach cash for gifts and short-term costs.",
    why: "A simple, insured place for cash you'll use in the next couple of years.",
    explainer: {
      whatItsFor: "Birthday money, short-term costs, and an emergency cushion for your child.",
      figures: [
        "FDIC insurance covers up to $250,000 per depositor, per insured bank, per ownership category, but only for money held at an FDIC-insured bank. Some savings apps aren't banks. Check that yours names its partner bank.",
        "Interest rates change with the market.",
      ],
      control: "Whoever's name is on the account. It can be in your name or set up for your child.",
      keepInMind: "Interest is taxed as income and usually grows slower than long-term investments.",
    },
    whatYouNeed: [
      "Your Social Security number and ID",
      "Your baby's Social Security number, if the account is in their name",
      "A bank account to transfer from",
    ],
    timeToOpen: "About 10 minutes online",
    familyLine: "Family can send money to it like any bank transfer.",
    howToOpen: { label: "FDIC: deposit insurance", url: "https://www.fdic.gov/resources/deposit-insurance/understanding-deposit-insurance" },
    sources: [{ label: "FDIC: deposit insurance", url: "https://www.fdic.gov/resources/deposit-insurance/understanding-deposit-insurance" }],
    group: "main",
  },
  {
    key: "esa",
    name: "Coverdell ESA",
    icon: BookOpen,
    summary: "A small education account that covers a wide range of K-12 costs.",
    why: "Tax-free growth for K-12 and college costs, with more investment choice than most 529s.",
    explainer: {
      whatItsFor: "K-12 costs like tuition, books and computers, plus college.",
      figures: [
        "Up to $2,000 a year in total for your child, across everyone who contributes.",
        "Contributors must be under an income limit.",
      ],
      control: "You manage it until your child comes of age. It must be used or moved to another family member by age 30.",
      keepInMind: "The $2,000 yearly cap is low, so it's often paired with a 529.",
    },
    whatYouNeed: [
      "Your baby's Social Security number",
      "Your own Social Security number and ID",
      "A bank or brokerage that offers Coverdell ESAs",
    ],
    timeToOpen: "About 20 minutes",
    familyLine: "Anyone can contribute, up to $2,000 a year in total for your child.",
    howToOpen: { label: "IRS Publication 970", url: "https://www.irs.gov/publications/p970" },
    sources: [{ label: "IRS Publication 970", url: "https://www.irs.gov/publications/p970" }],
    group: "other",
  },
  {
    key: "custodial_roth",
    name: "Custodial Roth IRA",
    icon: PiggyBank,
    summary: "A retirement head start, once your child earns income.",
    why: "Decades of tax-free growth, available once your child has earned income.",
    explainer: {
      whatItsFor: "Retirement, with some flexibility for a first home.",
      figures: [
        "Contributions can match what your child earned that year, up to the annual IRA limit.",
        "Money comes out tax-free in retirement.",
      ],
      control: "You manage it until your child comes of age, then it's theirs.",
      keepInMind:
        "Your child needs earned income, like a job or modeling work, with records to show it. Gifts and allowance don't count.",
    },
    whatYouNeed: [
      "Records of your child's earnings (pay stubs, W-2 or 1099)",
      "Your child's Social Security number",
      "Your own ID",
    ],
    timeToOpen: "About 20 minutes, plus gathering income records",
    familyLine: "Family can fund it up to what your child earned that year — the money doesn't have to come from their paycheck.",
    howToOpen: { label: "FINRA: Ways to invest for children", url: "https://www.finra.org/investors/insights/investing-children" },
    sources: [{ label: "IRS Publication 590-A", url: "https://www.irs.gov/publications/p590a" }],
    group: "other",
  },
];

export function getAccountOption(key: AccountKey): AccountOption {
  const option = ACCOUNT_OPTIONS.find((o) => o.key === key);
  if (!option) throw new Error(`Unknown account key: ${key}`);
  return option;
}
