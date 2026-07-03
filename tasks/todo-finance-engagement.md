# Finance tab engagement rework — 2026-07-03

Branch: `claude/finance-tab-engagement-x84xns`

Design inputs: UX audit + financial-domain brief (specialist agents, this session).
Both converged on: age-relevance filtering, honest momentum (age unlocks + real
money dates, NO streaks), celebration payoff, surfacing the calculator hook.

## Plan

- [ ] 1. New pure lib `src/lib/financeStages.ts` + tests: item → stage mapping
      (UUID map for the 16 pinned seed IDs, `recommended_timing`-string fallback,
      default anytime), grouping into Right now / Coming up / Done for a given
      age, and next-step selection (hard deadline first → CATEGORY_ORDER →
      sort_order, sponsored items excluded).
- [ ] 2. FinancialTab rework:
      - Merge AgePromptBanner + UpcomingMoneyDates into one "This month for
        {baby}" card (single insurance-window source). Gate on `is_expected`
        (fixes pre-birth negative-age countdown bug).
      - Next Step card: age-relevant + deadline-aware, tappable (scroll+expand
        target item), inline mark-done, never sponsored.
      - "Financial firsts" chip strip (Covered / Safety net / Protected /
        Growing) replaces flat % bar.
      - Celebration on chip completion (reuse MilestonesPage PartyPopper
        pattern, finance color) — EXCEPT Protected (estate planning) which
        fills quietly with calm copy. Never on sponsored items.
      - Growth teaser strip (contributed vs. total pair from `project()`,
        "hypothetical illustration" inline, anchors to calculator).
      - Checklist re-grouped by stage: Right now (open) / Coming up (collapsed,
        unlock ages / conditions) / Done (collapsed). Category demoted to
        eyebrow label. Item cards progressively disclosed (collapsed = checkbox
        + title + timing badge; sponsor "Ad" label stays visible even collapsed).
      - Item-keyed completion copy instead of generic toast.
- [ ] 3. Copy/correctness fixes: insurance window "typically 30–60 days — act
      within 30 to be safe"; tax season "file by ~Apr 15" not "open now"; state
      marketplace hedge on open enrollment; calculator gets consult-a-licensed-
      advisor disclaimer + "before inflation" framing fix.
- [ ] 4. QA agent pass.
- [ ] 5. Commit, push, draft PR.

## Deliberately out of scope (follow-ups)

- Migration adding `relevant_from_months`/`relevant_to_months` columns (client
  map over pinned UUIDs is the one-PR fallback; revisit if items churn).
- Refresh stale 2024 DCFSA dollar figure in seed data (needs verified 2026
  numbers — "never quote dollar figures from memory"; separate deliberate
  migration per the reconcile migration's own header).
- Cut/rewrite "Trump-era Roth" + "Opportunity Zones" seed rows (content
  decision for the user; they inflate the homework feeling).
- New financeCalendar event types (529 Day, new-year limits reset, FSA
  use-it-or-lose-it, birthday money check-up).
- Instrument calculator/wizard interaction rate before shipping (baseline KPI).

## Review

(filled in after implementation)
