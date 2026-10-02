# Feature Specification: Finance Account Finder

**Feature Branch**: `feature/finance-account-finder`

**Created**: 2026-09-30

**Status**: Draft

**Input**: Founder direction (2026-09-30): "The solution should be easy for parents and really just a way to help them decide the right accounts to open for their kids." Remove the current Finance setup and replace it with an account finder. No Flare+ gating, no contribution log, reminders only for opening accounts, ads from financial firms accepted.

## Why (Constitution III — Subtract Before You Add)

**Parent problem:** New parents don't know which accounts to open for their child, and the one with a real deadline and free money (the Trump Account $1,000 Treasury deposit for children born 2025–2028) must be claimed by a parent. Today's Finance page makes them work through a 16-item checklist, three calculators, a comparison table, and a calendar to find that answer.

**What this replaces:** the whole current Finance page — the protect-first checklist (Right now / Coming up / Done), the "This month" card, the financial-firsts chips, the celebration overlay, the next-step card, the savings growth calculator, the protect-first card, the account comparison, and the finance calendar. The page goes from ~8 stacked surfaces to 2: the finder and a short list of accounts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find accounts to look into in a few taps (Priority: P1)

A parent opens Finance. Their child's birthdate is already known. They answer at most two quick questions (what the money is for; whether family will chip in) and see "Accounts to look into" — one or two account types, each with a plain reason why, what they'll need to open it, and about how long it takes.

**Why this priority**: This is the whole point of the section. Without it nothing else matters.

**Independent Test**: With a child born 2026-03-01, open Finance, answer "Education", "Yes", and confirm the result shows Trump Account and 529 with why / what you'll need / time to open.

**Acceptance Scenarios**:

1. **Given** a child born between 2025-01-01 and 2028-12-31, **When** the parent completes the finder with any answers, **Then** the Trump Account ("claim your $1,000") is the first recommendation.
2. **Given** an eligible child and goal "Education" or "Not sure", **When** the finder completes, **Then** the second recommendation is a 529.
3. **Given** an eligible child and goal "Anything", **When** the finder completes, **Then** the second recommendation is a custodial (UGMA/UTMA) account.
4. **Given** a child born before 2025-01-01 or after 2028-12-31, **When** the finder completes, **Then** exactly one account is recommended (529 for Education / Not sure; custodial for Anything), and the Trump Account is still available in the account list without the $1,000 claim.
5. **Given** the parent answered "Yes, family will chip in", **When** results show, **Then** each recommendation includes one line on how family can contribute to it.
6. **Given** the parent has completed the finder before, **When** they return, **Then** they see their last result for that child, with a way to change answers.
7. **Given** the child is still expected, **When** the parent opens the finder, **Then** eligibility uses the due date and copy says "once your baby is born".

---

### User Story 2 - Mark an account as opened (Priority: P1)

After opening an account, the parent taps "I opened this" on it. It shows as opened for that child from then on, on any device, and reminders about it stop.

**Why this priority**: It closes the loop and is what stops reminders; without it, reminders would nag (Constitution I).

**Independent Test**: Tap "I opened this" on the 529 for child A; reload on another device; confirm it shows opened for child A and not for child B.

**Acceptance Scenarios**:

1. **Given** a recommended account, **When** the parent taps "I opened this", **Then** it shows as opened and a calm confirmation appears.
2. **Given** an account marked opened by mistake, **When** the parent taps "Undo", **Then** it returns to not-opened.
3. **Given** two children, **When** an account is marked opened for one, **Then** the other child's status is unchanged.
4. **Given** saving fails, **When** the parent taps "I opened this", **Then** they see what happened and that they can try again, and the account is not shown as opened (Constitution VI).

---

### User Story 3 - Learn about each account (Priority: P2)

Below the finder, the parent can browse a short list — Trump Account, 529, custodial (UGMA/UTMA), high-yield savings — each with a one-line summary and an expandable plain-language explainer (what it's for, key 2026 limits, who controls the money, the catch). Coverdell ESA and custodial Roth IRA sit in a collapsed "Other accounts" group.

**Why this priority**: Parents who want to double-check the recommendation need somewhere to read; it is secondary to the answer itself.

**Independent Test**: Expand each account; confirm figures match the 2026 figures in FR-010 and every explainer links to an official or neutral source.

**Acceptance Scenarios**:

1. **Given** the Finance page, **When** it loads, **Then** "Other accounts" is collapsed by default.
2. **Given** any account explainer, **When** expanded, **Then** it shows an "Educational, not financial or tax advice" note and a source link.

---

### User Story 4 - Sponsored "Open with" links (Priority: P2)

An account may show an "Open with [Firm]" button from a paying financial firm. It is labeled "Ad" right next to the button and opens the firm's site.

**Why this priority**: The section's revenue model; not required for the parent to get value.

**Independent Test**: Configure a sponsor for the 529; confirm the button shows with an adjacent "Ad" label, the outbound URL contains no account, child or device identifier added by us, and the finder's recommendation is identical with and without the sponsor configured.

**Acceptance Scenarios**:

1. **Given** a sponsor is configured for an account type, **When** that account shows (in results or the list), **Then** an "Open with [Firm]" button appears with an "Ad" label adjacent, not behind a tap.
2. **Given** no sponsor is configured, **When** the account shows, **Then** a neutral "How to open" link to a non-commercial source shows instead.
3. **Given** any finder answers, **When** sponsors are added, removed, or changed, **Then** which account types are recommended, and their order, does not change.
4. **Given** the parent taps a sponsored button, **When** the link opens, **Then** no child data, account ID, or tracking identifier from Grace Flare is sent.

---

### User Story 5 - A calm reminder to open an account (Priority: P3)

A parent who hasn't opened a key account gets a single, calm in-app reminder at the right moment — e.g. "Once your baby's Social Security card arrives, you can claim their $1,000 Trump Account deposit." Tapping it opens Finance.

**Why this priority**: Helps parents hit the moment that matters, but the page works without it.

**Independent Test**: For a child born 2026-09-01 with no Trump Account marked opened, run the reminder job on 2026-09-29; confirm one reminder is created, then confirm no second one on later runs, and none after marking the account opened.

**Acceptance Scenarios**:

1. **Given** an eligible child at least 21 days old with the Trump Account not marked opened, **When** reminders run, **Then** the primary parent gets one Trump Account reminder, ever, per child.
2. **Given** a child at least 30 days old with no 529 marked opened, **When** reminders run, **Then** one 529 reminder is sent, once per child.
3. **Given** a child turning 1 with no 529 marked opened, **When** reminders run on or after the birthday, **Then** one birthday 529 reminder is sent, once per child.
4. **Given** the parent muted the finance reminder category, is in quiet hours, or has hit the daily cap, **Then** the reminder follows the existing rules for mutes, quiet hours and cap.
5. **Given** the account is already marked opened, **Then** no reminder about it is sent.
6. **Given** any reminder, **Then** it never mentions a missed deadline, never repeats, and never says "you haven't".

### Edge Cases

- **Child older than 3 or much older siblings**: finder still works; Trump $1,000 only shows for 2025–2028 births.
- **Unborn / due date only**: the finder uses the due date's year for eligibility and says "once your baby is born".
- **Birthday on the eligibility boundary** (e.g. 2024-12-31 vs 2025-01-01): eligibility uses the calendar date in the child's recorded birthdate, no timezone shift.
- **Non-US-citizen child**: explainer states the Trump Account $1,000 is for U.S.-citizen children with a Social Security number; we do not ask citizenship.
- **Multiple children**: finder answers and opened status are per child; the page uses the app's current child selection.
- **Partner or caregiver opens Finance**: co-parents (full access) can use the finder and mark accounts for shared children; caregivers and view-only partners do not see Finance, matching the role description "not finance".
- **Parents who previously used the old checklist**: their old progress stays stored and untouched but is not shown.
- **Rules change** (e.g. Trump Account auto-enrollment finalized): content is in one place and updated by PR.

## Requirements *(mandatory)*

### Functional Requirements

**Removal**

- **FR-001**: The Finance page MUST no longer show the protect-first checklist, the "This month" card, financial-firsts chips, celebration overlay, next-step card, savings growth calculator, protect-first card, account comparison table, or finance calendar.
- **FR-002**: Removal MUST NOT delete any stored user data or drop existing finance tables (Constitution IV). Existing checklist progress and the unused insurance / college-savings tables stay in place, unread by the app.
- **FR-003**: Entry points MUST be updated to match: home tile hint, More page entry, and the onboarding "Financial planning" interest description and route label.

**Finder**

- **FR-004**: The finder MUST ask no more than two questions: (a) what the money is for — Education / Anything / Not sure; (b) will family chip in — Yes / No. The child's birthdate (or due date, for an expected child) comes from the child profile.
- **FR-005**: The finder MUST recommend one or two account types using only the child's birth date and the answers, per this rule:
  - Born 2025-01-01 through 2028-12-31 → Trump Account first.
  - Goal Education or Not sure → 529; goal Anything → custodial UGMA/UTMA.
  - Maximum two recommendations.
- **FR-006**: Each recommendation MUST show: why (one or two sentences), what you'll need, roughly how long opening takes, and — if family will chip in — how family can contribute.
- **FR-007**: The finder's answers MUST be remembered per child so a returning parent sees their last result and can change answers.
- **FR-008**: Recommendation logic MUST be independent of sponsor configuration; there MUST be an automated test proving identical output with and without sponsors.

**Accounts**

- **FR-009**: The account list MUST show Trump Account, 529, custodial UGMA/UTMA and high-yield savings; Coverdell ESA and custodial Roth IRA MUST be in a collapsed "Other accounts" group.
- **FR-010**: Figures MUST reflect 2026 rules: 529 K-12 tuition withdrawals up to $20,000/yr; gift-tax annual exclusion $19,000 per donor; Trump Account $1,000 Treasury deposit for U.S.-citizen children with an SSN born 2025–2028, claimed via IRS Form 4547 or trumpaccounts.gov, with family contributions up to $5,000/yr. Each figure MUST cite a source.
- **FR-011**: Every account explainer and the finder result MUST carry "Educational, not financial or tax advice."

**Opened status**

- **FR-012**: Parents MUST be able to mark any account type as opened, and undo it, per child.
- **FR-013**: Finder answers and opened status MUST be shared by the child's owner and active co-parents, on any device, and hidden from caregivers and view-only partners; access MUST be enforced by the database, keyed on the child (Constitution VII).
- **FR-014**: Every save MUST confirm success or explain the failure and next step (Constitution VI).

**Sponsors**

- **FR-015**: An account type MAY carry one sponsor with firm name, button label, destination URL and disclosure text, managed without an app release.
- **FR-016**: Sponsored buttons MUST show an "Ad" label adjacent to the button and MUST NOT add any child, user, or device identifier to the destination.
- **FR-017**: A neutral "How to open" link MUST always be shown; a sponsor button, when set, is shown in addition.
- **FR-017a**: Sponsored buttons MUST NOT appear on finder result cards or on the Trump Account; they appear only in the account list.

**Reminders**

- **FR-018**: Reminders MUST only concern opening accounts: (a) Trump Account claim for eligible children, first eligible at 21 days old; (b) 529 at 30 days old; (c) 529 at first birthday.
- **FR-019**: Each reminder MUST be sent at most once per child, only to the primary parent, and never when the account is marked opened.
- **FR-020**: Reminders MUST belong to a new "Finance" notification category parents can mute, and MUST respect existing quiet hours and daily cap.
- **FR-021**: Reminder copy MUST be calm and non-judgmental (Constitution I): no "you haven't", no urgency language, no repetition.
- **FR-022**: The app MUST NOT collect or store a child's Social Security number.

**Legal**

- **FR-023**: The same change MUST add a `docs/legal-review-log.md` entry covering the new per-child opened status, remembered finder answers, the Finance reminder category, and the sponsored links; Privacy/Terms copy MUST be checked and updated if it no longer matches (Constitution II).

### Key Entities

- **Account type**: one of Trump Account, 529, custodial UGMA/UTMA, high-yield savings, Coverdell ESA, custodial Roth IRA. Content (summary, explainer, figures, sources, what you'll need, time to open) is maintained in one place (Constitution V).
- **Finder answers (per child)**: goal, family-will-chip-in, last updated.
- **Account status (per child)**: account type, opened yes/no, when marked.
- **Sponsor (per account type)**: firm name, button label, destination URL, disclosure text, active flag.
- **Finance reminder**: type (Trump claim, 529 at 30 days, 529 at first birthday), child, sent once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A parent sees their recommendation in 3 taps or fewer and under 30 seconds.
- **SC-002**: At least 50% of parents who open Finance complete the finder.
- **SC-003**: At least 30% of parents who complete the finder mark at least one account opened within 30 days.
- **SC-004**: Among parents of 2025–2028 births who complete the finder, at least 40% mark the Trump Account opened within 60 days.
- **SC-005**: Finance reminder mute rate stays under 10% of recipients.
- **SC-006**: Zero reminders sent for an account already marked opened; zero reminders sent twice for the same child and type.
- **SC-007**: The Finance page shows 2 primary surfaces (finder + account list), down from ~8.

## Assumptions

- Access: owner and active co-parents use Finance for a shared child; caregivers and view-only partners do not (matches the existing role copy "not finance"). Today this is not enforced; this feature enforces it for the new data.
- Reminders use the existing in-app notification pipeline. Email reminders are out of scope for v1.
- The 21-day timing for the Trump Account reminder reflects typical Social Security card arrival (2–6 weeks); copy says "once your baby's Social Security card arrives."
- Reminders go to all primary parents with an eligible child (not only those who used the finder), because the $1,000 is valuable to everyone and the category is mutable.
- We do not ask about citizenship; eligibility copy states the requirement.
- Trump Account auto-enrollment is a proposed rule as of 2026-09-29; copy says the $1,000 must be claimed and will be revised if the final rule changes that.
- Sponsor ads are first-party: already covered by Privacy § 6 and Terms § 4.
- No AI is used anywhere in this feature.
