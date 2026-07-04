import {
  FINANCE_ITEM_IDS as IDS,
  FINANCIAL_FIRSTS,
  getItemStage,
  groupItemsByRelevance,
  isFirstAchieved,
  pickNextStep,
  type FinancialFirstKey,
} from "@/lib/financeStages";

function mk(id: string, category: string, recommended_timing: string | null, sort_order: number, title = "item") {
  return { id, category, recommended_timing, sort_order, title };
}

// Mirrors the live post-ladder seed shape (subset).
const ITEMS = [
  mk(IDS.healthInsurance, "Insurance", "Immediately — within 30 days of birth", 10, "Add your child to health insurance"),
  mk(IDS.emergencyFund, "Emergency Fund", "Ongoing — prioritize in first year", 20, "Build a 3–6 month emergency fund"),
  mk(IDS.lifeInsurance, "Insurance", "Within the first 3 months", 30, "Get term life insurance on the income-earning parent(s)"),
  mk(IDS.disability, "Insurance", "Within the first year", 40, "Consider disability insurance"),
  mk(IDS.will, "Estate Planning", "Within the first 6 months", 50, "Create or update your will"),
  mk(IDS.guardian, "Estate Planning", "Within the first 6 months", 51, "Name a guardian for your child"),
  mk(IDS.beneficiaries, "Estate Planning", "Within the first 3 months", 60, "Establish or update beneficiary designations"),
  mk(IDS.plan529, "College Savings", "Within the first 6 months", 70, "Open a 529 college savings plan"),
  mk(IDS.custodialRoth, "Investing for Kids", "When your child has earned income", 73, "Open a custodial Roth IRA"),
  mk(IDS.childTaxCredit, "Government Programs", "At tax time (first year with child)", 80, "Understand your Child Tax Credit eligibility"),
  mk(IDS.dcfsa, "Childcare & Benefits", "During next open enrollment period", 82, "Set up a Dependent Care FSA if available"),
];

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const notCompleted = () => false;

// July 1 2026 — outside both the tax and open-enrollment windows.
const JULY = new Date(2026, 6, 1);
// Feb 1 2026 — inside the tax-season window (Jan 15 – Apr 15).
const FEBRUARY = new Date(2026, 1, 1);

describe("getItemStage — pinned UUID map", () => {
  it("maps every pinned live id to its advisor-signed stage", () => {
    expect(getItemStage(mk(IDS.healthInsurance, "Insurance", null, 0))).toEqual({
      kind: "age",
      fromDays: 0,
      hardDeadlineDays: 30,
    });
    expect(getItemStage(mk(IDS.lifeInsurance, "Insurance", null, 0))).toEqual({ kind: "age", fromDays: 0 });
    expect(getItemStage(mk(IDS.beneficiaries, "Estate Planning", null, 0))).toEqual({ kind: "age", fromDays: 0 });
    expect(getItemStage(mk(IDS.emergencyFund, "Emergency Fund", null, 0))).toEqual({ kind: "age", fromDays: 0 });
    expect(getItemStage(mk(IDS.will, "Estate Planning", null, 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(IDS.guardian, "Estate Planning", null, 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(IDS.plan529, "College Savings", null, 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(IDS.beneficiary529, "College Savings", null, 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(IDS.utmaUgma, "Investing for Kids", null, 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(IDS.disability, "Insurance", null, 0))).toEqual({ kind: "age", fromDays: 180 });
    expect(getItemStage(mk(IDS.childTaxCredit, "Government Programs", null, 0))).toEqual({
      kind: "date-driven",
      season: "tax",
    });
    expect(getItemStage(mk(IDS.stateTaxBenefits, "Government Programs", null, 0))).toEqual({
      kind: "date-driven",
      season: "tax",
    });
    expect(getItemStage(mk(IDS.dcfsa, "Childcare & Benefits", null, 0))).toEqual({
      kind: "date-driven",
      season: "open-enrollment",
    });
    expect(getItemStage(mk(IDS.custodialRoth, "Investing for Kids", null, 0))).toEqual({
      kind: "conditional",
      condition: "When your child has earned income",
    });
    expect(getItemStage(mk(IDS.custodialRothLegacy, "Investing for Kids", null, 0))).toEqual({
      kind: "conditional",
      condition: "When your child has earned income",
    });
    expect(getItemStage(mk(IDS.kiddieTax, "Investing for Kids", null, 0))).toEqual({
      kind: "conditional",
      condition: "Before investing in custodial accounts",
    });
    expect(getItemStage(mk(IDS.opportunityZones, "Investing for Kids", null, 0))).toEqual({
      kind: "conditional",
      condition: "When you have capital gains to reinvest",
    });
  });

  it("the UUID map wins even when the timing string says otherwise", () => {
    expect(getItemStage(mk(IDS.disability, "Insurance", "Within the first 3 months", 0))).toEqual({
      kind: "age",
      fromDays: 180,
    });
  });
});

describe("getItemStage — recommended_timing fallback", () => {
  const unknownId = "00000000-0000-0000-0000-000000000000";

  it("maps the exact timing strings", () => {
    expect(getItemStage(mk(unknownId, "X", "Immediately — within 30 days of birth", 0))).toEqual({
      kind: "age",
      fromDays: 0,
      hardDeadlineDays: 30,
    });
    expect(getItemStage(mk(unknownId, "X", "Within the first 3 months", 0))).toEqual({ kind: "age", fromDays: 0 });
    expect(getItemStage(mk(unknownId, "X", "Within the first 6 months", 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(unknownId, "X", "First 6 months", 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(unknownId, "X", "When opening the 529 account", 0))).toEqual({ kind: "age", fromDays: 90 });
    expect(getItemStage(mk(unknownId, "X", "Within the first year", 0))).toEqual({ kind: "age", fromDays: 180 });
    expect(getItemStage(mk(unknownId, "X", "Ongoing — prioritize in first year", 0))).toEqual({
      kind: "age",
      fromDays: 0,
    });
    expect(getItemStage(mk(unknownId, "X", "As soon as eligible — check status", 0))).toEqual({
      kind: "age",
      fromDays: 0,
    });
    expect(getItemStage(mk(unknownId, "X", "At tax time (first year with child)", 0))).toEqual({
      kind: "date-driven",
      season: "tax",
    });
    expect(getItemStage(mk(unknownId, "X", "When child has earned income", 0))).toEqual({
      kind: "conditional",
      condition: "When your child has earned income",
    });
    expect(getItemStage(mk(unknownId, "X", "When your child has earned income", 0))).toEqual({
      kind: "conditional",
      condition: "When your child has earned income",
    });
  });

  it("maps 'During (next) open enrollment' strings to the open-enrollment season", () => {
    expect(getItemStage(mk(unknownId, "X", "During next open enrollment period", 0))).toEqual({
      kind: "date-driven",
      season: "open-enrollment",
    });
    expect(getItemStage(mk(unknownId, "X", "During Open Enrollment", 0))).toEqual({
      kind: "date-driven",
      season: "open-enrollment",
    });
  });

  it("keeps 'Plan before open enrollment' (DCFSA-vs-credit comparison) always visible, not season-gated", () => {
    expect(getItemStage(mk(unknownId, "X", "Plan before open enrollment", 0))).toEqual({ kind: "anytime" });
  });

  it("defaults unknown ids/timings (and null timing) to anytime", () => {
    expect(getItemStage(mk(unknownId, "X", "Whenever you feel like it", 0))).toEqual({ kind: "anytime" });
    expect(getItemStage(mk(unknownId, "X", null, 0))).toEqual({ kind: "anytime" });
  });
});

describe("groupItemsByRelevance — 10-day-old", () => {
  const grouped = groupItemsByRelevance({
    items: ITEMS,
    ageDays: 10,
    isExpected: false,
    now: JULY,
    dateOfBirth: "2026-06-21",
    isCompleted: notCompleted,
  });

  it("opens the from-birth items and keeps later windows in comingUp", () => {
    expect(ids(grouped.rightNow)).toEqual([
      IDS.healthInsurance,
      IDS.lifeInsurance,
      IDS.emergencyFund,
      IDS.beneficiaries,
    ]);
    const comingUpIds = grouped.comingUp.map((c) => c.item.id);
    expect(comingUpIds).toContain(IDS.will);
    expect(comingUpIds).toContain(IDS.plan529);
    expect(comingUpIds).toContain(IDS.disability);
    expect(grouped.done).toEqual([]);
  });

  it("orders rightNow protect-first: hard deadline, then category order, then sort_order", () => {
    expect(grouped.rightNow[0].id).toBe(IDS.healthInsurance);
  });

  it("returns machine-friendly age unlocks with no negative countdowns", () => {
    const will = grouped.comingUp.find((c) => c.item.id === IDS.will)!;
    expect(will.unlock).toEqual({ kind: "age", atDays: 90 });
    const disability = grouped.comingUp.find((c) => c.item.id === IDS.disability)!;
    expect(disability.unlock).toEqual({ kind: "age", atDays: 180 });
  });

  it("keeps out-of-season date-driven items in comingUp with the season unlock (July)", () => {
    const ctc = grouped.comingUp.find((c) => c.item.id === IDS.childTaxCredit)!;
    expect(ctc.unlock).toEqual({ kind: "season", season: "tax" });
    const dcfsa = grouped.comingUp.find((c) => c.item.id === IDS.dcfsa)!;
    expect(dcfsa.unlock).toEqual({ kind: "season", season: "open-enrollment" });
  });

  it("keeps conditional items in comingUp with the condition as unlock", () => {
    const roth = grouped.comingUp.find((c) => c.item.id === IDS.custodialRoth)!;
    expect(roth.unlock).toEqual({ kind: "condition", condition: "When your child has earned income" });
  });
});

describe("groupItemsByRelevance — 5-month-old", () => {
  const grouped = groupItemsByRelevance({
    items: ITEMS,
    ageDays: 150,
    isExpected: false,
    now: JULY,
    dateOfBirth: "2026-02-01",
    isCompleted: notCompleted,
  });

  it("opens the 3-month items (will, 529) but not the 6-month ones", () => {
    expect(ids(grouped.rightNow)).toContain(IDS.will);
    expect(ids(grouped.rightNow)).toContain(IDS.plan529);
    expect(ids(grouped.rightNow)).not.toContain(IDS.disability);
  });
});

describe("groupItemsByRelevance — missed hard deadline", () => {
  it("never hides the insurance item after day 30", () => {
    const grouped = groupItemsByRelevance({
      items: ITEMS,
      ageDays: 45,
      isExpected: false,
      now: JULY,
      dateOfBirth: "2026-05-17",
      isCompleted: notCompleted,
    });
    expect(ids(grouped.rightNow)).toContain(IDS.healthInsurance);
  });
});

describe("groupItemsByRelevance — expected child", () => {
  const grouped = groupItemsByRelevance({
    items: ITEMS,
    ageDays: -60, // future DOB — the old pre-birth countdown bug
    isExpected: true,
    now: JULY,
    dateOfBirth: "2026-08-30",
    isCompleted: notCompleted,
  });

  it("puts no age items in rightNow", () => {
    for (const item of grouped.rightNow) {
      expect([IDS.healthInsurance, IDS.lifeInsurance, IDS.emergencyFund, IDS.beneficiaries, IDS.will]).not.toContain(
        item.id,
      );
    }
  });

  it("moves from-birth items to comingUp with a birth unlock", () => {
    const insurance = grouped.comingUp.find((c) => c.item.id === IDS.healthInsurance)!;
    expect(insurance.unlock).toEqual({ kind: "birth" });
    const emergency = grouped.comingUp.find((c) => c.item.id === IDS.emergencyFund)!;
    expect(emergency.unlock).toEqual({ kind: "birth" });
  });

  it("keeps later age windows as age unlocks, never negative", () => {
    const will = grouped.comingUp.find((c) => c.item.id === IDS.will)!;
    expect(will.unlock).toEqual({ kind: "age", atDays: 90 });
  });
});

describe("groupItemsByRelevance — date-driven openness", () => {
  it("puts tax items in rightNow during tax season (February)", () => {
    const grouped = groupItemsByRelevance({
      items: ITEMS,
      ageDays: 200,
      isExpected: false,
      now: FEBRUARY,
      dateOfBirth: "2025-07-16",
      isCompleted: notCompleted,
    });
    expect(ids(grouped.rightNow)).toContain(IDS.childTaxCredit);
  });

  it("keeps tax items in comingUp in July", () => {
    const grouped = groupItemsByRelevance({
      items: ITEMS,
      ageDays: 200,
      isExpected: false,
      now: JULY,
      dateOfBirth: "2025-12-13",
      isCompleted: notCompleted,
    });
    expect(grouped.comingUp.map((c) => c.item.id)).toContain(IDS.childTaxCredit);
  });

  it("keeps the plan-ahead DCFSA comparison in rightNow even outside open enrollment", () => {
    const planAhead = mk(
      "c2a1b4d3-2e5f-4b7c-8d9e-1f2a3b4c5d6e",
      "Childcare & Benefits",
      "Plan before open enrollment",
      83,
      "Compare a Dependent Care FSA with the Child & Dependent Care Credit",
    );
    const grouped = groupItemsByRelevance({
      items: [...ITEMS, planAhead],
      ageDays: 200,
      isExpected: false,
      now: JULY,
      dateOfBirth: "2025-12-13",
      isCompleted: notCompleted,
    });
    expect(ids(grouped.rightNow)).toContain(planAhead.id);
    // The season-gated DCFSA setup row stays locked until the window opens.
    expect(grouped.comingUp.map((c) => c.item.id)).toContain(IDS.dcfsa);
  });
});

describe("groupItemsByRelevance — done bucket", () => {
  it("routes completed items to done regardless of stage", () => {
    const grouped = groupItemsByRelevance({
      items: ITEMS,
      ageDays: 10,
      isExpected: false,
      now: JULY,
      dateOfBirth: "2026-06-21",
      isCompleted: (id) => id === IDS.healthInsurance || id === IDS.will,
    });
    expect(ids(grouped.done)).toEqual([IDS.healthInsurance, IDS.will]);
    expect(ids(grouped.rightNow)).not.toContain(IDS.healthInsurance);
    expect(grouped.comingUp.map((c) => c.item.id)).not.toContain(IDS.will);
  });
});

describe("pickNextStep", () => {
  const sponsored = mk("sponsored-id", "Insurance", null, 1);
  const organic = mk("organic-id", "Insurance", null, 2);

  it("skips a sponsored first item", () => {
    const next = pickNextStep([sponsored, organic], (item) => item.id === "sponsored-id");
    expect(next?.id).toBe("organic-id");
  });

  it("returns null when everything is sponsored or the list is empty", () => {
    expect(pickNextStep([sponsored], () => true)).toBeNull();
    expect(pickNextStep([], () => false)).toBeNull();
  });
});

describe("FINANCIAL_FIRSTS", () => {
  const firstByKey = (key: FinancialFirstKey) => FINANCIAL_FIRSTS.find((f) => f.key === key)!;
  const completedSet = (idsDone: string[]) => (id: string) => idsDone.includes(id);

  it("covered: health insurance completes it (and celebrates)", () => {
    const first = firstByKey("covered");
    expect(first.celebrate).toBe(true);
    expect(isFirstAchieved(first, ITEMS, notCompleted)).toBe(false);
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.healthInsurance]))).toBe(true);
  });

  it("safety-net: needs BOTH emergency fund and life insurance", () => {
    const first = firstByKey("safety-net");
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.emergencyFund]))).toBe(false);
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.emergencyFund, IDS.lifeInsurance]))).toBe(true);
  });

  it("protected: needs will AND guardian AND beneficiaries, and is quiet (no celebrate)", () => {
    const first = firstByKey("protected");
    expect(first.celebrate).toBe(false);
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.will, IDS.guardian]))).toBe(false);
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.will, IDS.guardian, IDS.beneficiaries]))).toBe(true);
  });

  it("growing: ANY savings vehicle counts", () => {
    const first = firstByKey("growing");
    expect(isFirstAchieved(first, ITEMS, notCompleted)).toBe(false);
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.plan529]))).toBe(true);
    expect(isFirstAchieved(first, ITEMS, completedSet([IDS.custodialRoth]))).toBe(true);
  });

  it("growing: matches the government baby account by category + title (no pinned UUID)", () => {
    const govAccount = mk(
      "11111111-2222-3333-4444-555555555555",
      "Government Programs",
      "As soon as eligible — check status",
      0,
      "Claim the $1,000 Government Baby Savings Account",
    );
    const first = firstByKey("growing");
    expect(isFirstAchieved(first, [...ITEMS, govAccount], completedSet([govAccount.id]))).toBe(true);
  });

  it("an all-mode first with a missing item counts using the items that exist", () => {
    const first = firstByKey("protected");
    const withoutBeneficiaries = ITEMS.filter((i) => i.id !== IDS.beneficiaries);
    expect(isFirstAchieved(first, withoutBeneficiaries, completedSet([IDS.will, IDS.guardian]))).toBe(true);
  });

  it("a first with no matching items at all can never be achieved", () => {
    const first = firstByKey("covered");
    const withoutInsurance = ITEMS.filter((i) => i.id !== IDS.healthInsurance);
    expect(isFirstAchieved(first, withoutInsurance, () => true)).toBe(false);
  });
});
