import { getFinanceCalendarEvents } from "@/lib/financeCalendar";

// Pure staging logic for the financial checklist: which items are timely for a
// child's age today, which unlock later, and which "financial firsts" a family
// has reached. No React, no Supabase — the component supplies items + completion
// state and formats the labels.

export type FinanceSeason = "tax" | "open-enrollment";

export type ItemStage =
  | { kind: "age"; fromDays: number; hardDeadlineDays?: number }
  | { kind: "date-driven"; season: FinanceSeason }
  | { kind: "conditional"; condition: string }
  | { kind: "anytime" };

// Pinned live UUIDs from the canonical seed (20260619180000 reconcile +
// 20260620010000 protect-first ladder). The legacy Roth / kiddie-tax /
// Opportunity Zone ids are deleted by the ladder migration but kept mapped
// defensively in case a database predates it.
export const FINANCE_ITEM_IDS = {
  healthInsurance: "0e5308b3-fc91-418b-89da-fe3606f0ab4d",
  lifeInsurance: "a57ac9a4-282b-4f3f-bb32-2fc354fe50ed",
  beneficiaries: "c94f2acc-6961-45fc-9e7d-f6a2f5f7f4f1",
  emergencyFund: "9ec05ab1-361b-4e03-a900-8d4311ce3925",
  will: "67b94e82-5d71-424b-9d27-b1b4e0eea6af",
  guardian: "8058e21a-05d9-4550-8e3e-69cd4fa58325",
  plan529: "fc3b5898-84c8-4451-924a-de5841181b2e",
  beneficiary529: "08ae0699-d90e-4251-bc02-d850e49b345f",
  utmaUgma: "cbb52592-5285-4681-93b1-295b6cc4aec3",
  disability: "2e11d795-00c3-4cc3-a7d7-681883660138",
  childTaxCredit: "77815235-2084-454d-8a23-d98f3cdd7dfa",
  stateTaxBenefits: "29b66bc4-e732-4519-9909-aa4c02d41bb0",
  dcfsa: "60e46382-8123-4b5b-b54c-ccba66b9cf43",
  custodialRoth: "b1f0a3c2-1d4e-4a6b-9c8d-0e1f2a3b4c5d",
  custodialRothLegacy: "0abe709b-641a-4fd9-904c-04a486436764",
  kiddieTax: "4345e226-5a6d-4deb-bd51-2d86edd9926f",
  opportunityZones: "f1e54976-9911-4bd0-903a-89bd99ad2f77",
} as const;

const EARNED_INCOME_CONDITION = "When your child has earned income";

const STAGE_BY_ID: Record<string, ItemStage> = {
  [FINANCE_ITEM_IDS.healthInsurance]: { kind: "age", fromDays: 0, hardDeadlineDays: 30 },
  [FINANCE_ITEM_IDS.lifeInsurance]: { kind: "age", fromDays: 0 },
  [FINANCE_ITEM_IDS.beneficiaries]: { kind: "age", fromDays: 0 },
  [FINANCE_ITEM_IDS.emergencyFund]: { kind: "age", fromDays: 0 },
  [FINANCE_ITEM_IDS.will]: { kind: "age", fromDays: 90 },
  [FINANCE_ITEM_IDS.guardian]: { kind: "age", fromDays: 90 },
  [FINANCE_ITEM_IDS.plan529]: { kind: "age", fromDays: 90 },
  [FINANCE_ITEM_IDS.beneficiary529]: { kind: "age", fromDays: 90 },
  [FINANCE_ITEM_IDS.utmaUgma]: { kind: "age", fromDays: 90 },
  [FINANCE_ITEM_IDS.disability]: { kind: "age", fromDays: 180 },
  [FINANCE_ITEM_IDS.childTaxCredit]: { kind: "date-driven", season: "tax" },
  [FINANCE_ITEM_IDS.stateTaxBenefits]: { kind: "date-driven", season: "tax" },
  [FINANCE_ITEM_IDS.dcfsa]: { kind: "date-driven", season: "open-enrollment" },
  [FINANCE_ITEM_IDS.custodialRoth]: { kind: "conditional", condition: EARNED_INCOME_CONDITION },
  [FINANCE_ITEM_IDS.custodialRothLegacy]: { kind: "conditional", condition: EARNED_INCOME_CONDITION },
  [FINANCE_ITEM_IDS.kiddieTax]: { kind: "conditional", condition: "Before investing in custodial accounts" },
  [FINANCE_ITEM_IDS.opportunityZones]: { kind: "conditional", condition: "When you have capital gains to reinvest" },
};

const STAGE_BY_TIMING: Record<string, ItemStage> = {
  "Immediately — within 30 days of birth": { kind: "age", fromDays: 0, hardDeadlineDays: 30 },
  "Within the first 3 months": { kind: "age", fromDays: 0 },
  "Within the first 6 months": { kind: "age", fromDays: 90 },
  "First 6 months": { kind: "age", fromDays: 90 },
  "When opening the 529 account": { kind: "age", fromDays: 90 },
  "Within the first year": { kind: "age", fromDays: 180 },
  "Ongoing — prioritize in first year": { kind: "age", fromDays: 0 },
  "As soon as eligible — check status": { kind: "age", fromDays: 0 },
  "At tax time (first year with child)": { kind: "date-driven", season: "tax" },
  "When child has earned income": { kind: "conditional", condition: EARNED_INCOME_CONDITION },
  "When your child has earned income": { kind: "conditional", condition: EARNED_INCOME_CONDITION },
  // Plan-AHEAD task (compare DCFSA vs. the tax credit): always visible, unlike
  // "During (next) open enrollment" rows which are season-gated below.
  "Plan before open enrollment": { kind: "anytime" },
};

export function getItemStage(item: {
  id: string;
  recommended_timing: string | null;
  category: string;
}): ItemStage {
  const byId = STAGE_BY_ID[item.id];
  if (byId) return byId;
  if (item.recommended_timing) {
    const byTiming = STAGE_BY_TIMING[item.recommended_timing];
    if (byTiming) return byTiming;
    if (item.recommended_timing.toLowerCase().includes("open enrollment")) {
      return { kind: "date-driven", season: "open-enrollment" };
    }
  }
  return { kind: "anytime" };
}

// Category display order — protect first, then invest. Must match the live
// financial_checklist_items category strings exactly so nothing falls into the
// unknown=99 bucket.
export const CATEGORY_ORDER = [
  "Insurance",
  "Emergency Fund",
  "Estate Planning",
  "College Savings",
  "Investing for Kids",
  "Government Programs",
  "Childcare & Benefits",
];

export interface FinanceItemLike {
  id: string;
  category: string;
  recommended_timing: string | null;
  sort_order: number | null;
}

// Protect-first ordering: hard-deadline items lead, then CATEGORY_ORDER,
// then the seed's sort_order.
function compareProtectFirst(a: FinanceItemLike, b: FinanceItemLike): number {
  const stageA = getItemStage(a);
  const stageB = getItemStage(b);
  const deadlineA = stageA.kind === "age" && stageA.hardDeadlineDays != null ? 0 : 1;
  const deadlineB = stageB.kind === "age" && stageB.hardDeadlineDays != null ? 0 : 1;
  if (deadlineA !== deadlineB) return deadlineA - deadlineB;
  const catA = CATEGORY_ORDER.indexOf(a.category);
  const catB = CATEGORY_ORDER.indexOf(b.category);
  const catRankA = catA === -1 ? 99 : catA;
  const catRankB = catB === -1 ? 99 : catB;
  if (catRankA !== catRankB) return catRankA - catRankB;
  return (a.sort_order ?? 999) - (b.sort_order ?? 999);
}

export type ComingUpUnlock =
  | { kind: "age"; atDays: number }
  | { kind: "birth" }
  | { kind: "season"; season: FinanceSeason }
  | { kind: "condition"; condition: string };

export interface GroupedFinanceItems<T> {
  rightNow: T[];
  comingUp: Array<{ item: T; unlock: ComingUpUnlock }>;
  done: T[];
}

export function groupItemsByRelevance<T extends FinanceItemLike>({
  items,
  ageDays,
  isExpected,
  now,
  dateOfBirth,
  isCompleted,
}: {
  items: T[];
  ageDays: number;
  isExpected: boolean;
  now: Date;
  dateOfBirth: string | null;
  isCompleted: (itemId: string) => boolean;
}): GroupedFinanceItems<T> {
  // An expected (or future-dated) child has no elapsed age — clamping avoids
  // negative countdowns pre-birth.
  const effectiveAgeDays = isExpected ? 0 : Math.max(0, ageDays);

  const events = getFinanceCalendarEvents(now, dateOfBirth);
  const taxOpen = events.some((e) => e.type === "tax-season");
  const enrollmentOpen = events.some((e) => e.type === "open-enrollment");
  const seasonOpen = (season: FinanceSeason) =>
    season === "tax" ? taxOpen : enrollmentOpen;

  const rightNow: T[] = [];
  const comingUp: Array<{ item: T; unlock: ComingUpUnlock }> = [];
  const done: T[] = [];

  for (const item of [...items].sort(compareProtectFirst)) {
    if (isCompleted(item.id)) {
      done.push(item);
      continue;
    }
    const stage = getItemStage(item);
    switch (stage.kind) {
      case "age":
        if (isExpected && stage.fromDays === 0) {
          comingUp.push({ item, unlock: { kind: "birth" } });
        } else if (effectiveAgeDays >= stage.fromDays) {
          // Deliberately no upper bound: a missed hard deadline stays visible
          // in rightNow — the UI softens the copy instead of hiding the item.
          rightNow.push(item);
        } else {
          comingUp.push({ item, unlock: { kind: "age", atDays: stage.fromDays } });
        }
        break;
      case "date-driven":
        if (seasonOpen(stage.season)) {
          rightNow.push(item);
        } else {
          comingUp.push({ item, unlock: { kind: "season", season: stage.season } });
        }
        break;
      case "conditional":
        comingUp.push({ item, unlock: { kind: "condition", condition: stage.condition } });
        break;
      default:
        rightNow.push(item);
    }
  }

  return { rightNow, comingUp, done };
}

// Sponsored items are never the next step (unlabeled-ad exposure).
export function pickNextStep<T extends FinanceItemLike>(
  rightNow: T[],
  isSponsored: (item: T) => boolean,
): T | null {
  return rightNow.find((item) => !isSponsored(item)) ?? null;
}

export type FinancialFirstKey = "covered" | "safety-net" | "protected" | "growing";

export interface FinancialFirstDef {
  key: FinancialFirstKey;
  label: string;
  // Protected (estate planning) deliberately does NOT celebrate — quiet, calm
  // acknowledgement instead of confetti.
  celebrate: boolean;
  mode: "all" | "any";
  itemIds: readonly string[];
  // Extra matcher for rows without a pinned UUID (the government baby-account
  // seed row was inserted without one).
  matchesItem?: (item: { id: string; title: string; category: string }) => boolean;
}

export const FINANCIAL_FIRSTS: readonly FinancialFirstDef[] = [
  {
    key: "covered",
    label: "Covered",
    celebrate: true,
    mode: "all",
    itemIds: [FINANCE_ITEM_IDS.healthInsurance],
  },
  {
    key: "safety-net",
    label: "Safety net",
    celebrate: true,
    mode: "all",
    itemIds: [FINANCE_ITEM_IDS.emergencyFund, FINANCE_ITEM_IDS.lifeInsurance],
  },
  {
    key: "protected",
    label: "Protected",
    celebrate: false,
    mode: "all",
    itemIds: [FINANCE_ITEM_IDS.will, FINANCE_ITEM_IDS.guardian, FINANCE_ITEM_IDS.beneficiaries],
  },
  {
    key: "growing",
    label: "Growing",
    celebrate: true,
    mode: "any",
    itemIds: [
      FINANCE_ITEM_IDS.plan529,
      FINANCE_ITEM_IDS.utmaUgma,
      FINANCE_ITEM_IDS.custodialRoth,
      FINANCE_ITEM_IDS.custodialRothLegacy,
    ],
    matchesItem: (item) =>
      item.category === "Government Programs" && item.title.includes("Savings Account"),
  },
];

export function firstMatchesItem(
  first: FinancialFirstDef,
  item: { id: string; title: string; category: string },
): boolean {
  return first.itemIds.includes(item.id) || (first.matchesItem?.(item) ?? false);
}

// A first with a missing item (deleted from live) counts using the items that
// exist; a first with NO matching items at all can never be achieved.
export function isFirstAchieved(
  first: FinancialFirstDef,
  items: Array<{ id: string; title: string; category: string }>,
  isCompleted: (itemId: string) => boolean,
): boolean {
  const relevant = items.filter((item) => firstMatchesItem(first, item));
  if (relevant.length === 0) return false;
  return first.mode === "all"
    ? relevant.every((item) => isCompleted(item.id))
    : relevant.some((item) => isCompleted(item.id));
}
