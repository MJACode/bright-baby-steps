# Feature Specification: Pregnancy Mode

**Feature Branch**: `claude/brave-johnson-xi0sii`

**Created**: 2026-11-07

**Status**: Draft

**Input**: Founder direction (2026-11-07): "Free pregnancy tracking, Flare+ trial at birth." Pregnancy mode brings families into Grace Flare before the baby arrives, so they are already set up and using the app when Flare+ matters most. That stretches the ~2-year span the app covers by starting it earlier. Pregnancy tracking is free: not Flare+, not a paid add-on. The Flare+ 7-day trial is offered when the parent tells the app the baby has arrived.

## Why (Constitution III — Subtract Before You Add)

**Parent problem:** Expectant parents can already add an expected baby. The app then has almost nothing for them. Most baby surfaces hide for an expected child (Leaps, Growth, maintenance reminders, Baby Signs promos), so the home screen is mostly empty until birth. Parents use a separate pregnancy app for 6–9 months, set up their habits there, and may never come back to Grace Flare after the birth.

**What this replaces or simplifies:**
- Replaces the near-empty expected-baby home screen with one calm "this week" view.
- Replaces the current awkward path at birth, where a parent edits the expected child's birthday by hand, with one "Baby's here" step. That step keeps everything set up during pregnancy: partner, checklist, appointments.
- Adds no new navigation tab. Pregnancy content shows only while the active child is expected, and steps aside at birth.

**What already exists and is reused (not rebuilt):**
- Expected-baby support: the expected flag and a future birth date stored as the due date (since 2026-04-07). Onboarding already treats a future date as "expecting" and skips the child-interests step.
- The "Due in Nw" / "Due soon" labels in onboarding and the child switcher.
- Scheduled visits and their reminders (appointment tracking).
- The new-baby checklist and its deadline engine (pre-birth items join the same list).
- Partner invitations, with the same pattern as in onboarding and Partner Management.
- The Finance account finder's "once your baby is born" copy.
- The existing upgrade sheet and the early-access flag.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See this week of pregnancy at a glance (Priority: P1)

An expectant parent opens Grace Flare. At the top of home they see how far along they are ("Week 24 · about 16 weeks to go") and a short, warm note about this week: roughly how big the baby is, one thing that may be happening, and one thing they might want to do this week.

**Why this priority**: This is the reason to open the app during pregnancy. Without it, nothing else in pregnancy mode gets seen.

**Independent Test**: Create an expected child due 112 days from today. Open home and confirm it shows "Week 24", "about 16 weeks to go", and the week-24 note.

**Acceptance Scenarios**:

1. **Given** an expected child with a due date, **When** the parent opens home, **Then** they see the current pregnancy week (from the due date, counting the due date as week 40) and the approximate weeks remaining.
2. **Given** any pregnancy week from 4 to 42, **When** home loads, **Then** a note for that week is shown, made of a size comparison, one thing that "may" be happening, and one optional suggestion.
3. **Given** the due date has passed and no birth has been recorded, **When** home loads, **Then** the copy says "Any day now" (no countdown, no overdue warning), and the "Baby's here" step is easy to reach.
4. **Given** the due date gives a week before 4, **When** home loads, **Then** the week-4 note is shown and nothing breaks.
5. **Given** the parent changes the due date, **When** home reloads, **Then** the week and note update to match.

---

### User Story 2 - Tell Grace Flare the baby has arrived (Priority: P1)

The baby is born. From the pregnancy card or the child's profile, the parent taps "Baby's here". They confirm or enter the birth date, and optionally the time, name and whether the baby came early. The pregnancy view steps aside and the normal baby app takes over for this child, with everything set up during pregnancy carried over.

**Why this priority**: This is where pregnancy mode pays off. It turns an expectant family into an active user and is where the Flare+ trial is offered (US 3). Without it, pregnancy users fall into today's manual birthday edit.

**Independent Test**: With an expected child due in 3 days, a partner, two checklist items marked done and one appointment, tap "Baby's here" and enter today's date. Confirm the child is no longer expected, the birth date is today, and the partner, checklist status and appointment are all still there.

**Acceptance Scenarios**:

1. **Given** an expected child, **When** the parent completes "Baby's here" with a birth date, **Then** the child is no longer expected, and the birth date and original due date are both kept.
2. **Given** the entered birth date is 3 or more weeks before the due date, **When** the parent completes the step, **Then** the app asks whether the baby came early. If yes, the original due date is used for corrected age without the parent typing it again.
3. **Given** the parent changes the name at birth, **When** they complete the step, **Then** the new name shows everywhere the child appears.
4. **Given** a birth date in the future, **When** the parent tries to save, **Then** the app explains the date can't be in the future and keeps their entry.
5. **Given** saving fails, **When** the parent taps confirm, **Then** they see what happened and that they can try again, and the child stays expected (Constitution VI).
6. **Given** a partner on the account, **When** either parent completes "Baby's here", **Then** both see the baby app for this child, and the other parent gets one calm notification ("Grace Flare is ready for [name]").
7. **Given** a caregiver role on the account, **When** they open the child, **Then** they cannot complete "Baby's here". Only the primary parent and partners can.

---

### User Story 3 - Offer the Flare+ trial at birth (Priority: P1)

After "Baby's here" is saved, the parent sees a short welcome for the new baby. A while after that, the app offers the Flare+ 7-day trial, framed around what newborn life needs (nap and feed predictions, visit prep, more caregivers). It never interrupts the birth confirmation itself.

**Why this priority**: This is the business reason for the feature. Free pregnancy tracking only pays off if it turns into Flare+ trials at the moment the baby arrives.

**Independent Test**: With early access turned off, complete "Baby's here". Confirm the welcome appears first, then the trial offer at the agreed time. Confirm it shows once, and that dismissing it doesn't bring it back the same day.

**Acceptance Scenarios**:

1. **Given** early access is on (today's setting), **When** "Baby's here" is completed, **Then** no price, trial or purchase wording appears anywhere. The parent sees only the welcome and a "See what's included" note about Flare+ features.
2. **Given** early access is off, the parent is not on Flare+, and they have never used a trial, **When** the trial moment is reached, **Then** the upgrade sheet opens once with newborn-focused copy, using the same disclosures as every other trial entry point.
3. **Given** the parent is already on Flare+ or has used a trial before, **When** "Baby's here" is completed, **Then** no trial offer appears.
4. **Given** the parent dismisses the offer, **When** they keep using the app, **Then** it does not reappear automatically. It stays reachable from the normal Flare+ entry points.
5. **Given** the trial offer is shown, **When** the parent reads it, **Then** it never suggests Flare+ makes the baby safer or that the free app is not enough (Constitution I).
6. **Given** the trial timing, **When** it is reached, **Then** it follows the founder's choice on timing: [NEEDS CLARIFICATION: Show the trial right after the welcome screen, or wait until the parent has logged a few times / 2–3 days in, when they've felt newborn chaos and are less overwhelmed?]

---

### User Story 4 - Get ready with a pre-birth checklist (Priority: P2)

During pregnancy, the parent's existing new-baby checklist starts with items for before the birth: pick a pediatrician, add the baby to insurance (with the 30-day window explained), pack a hospital bag, install the car seat, and plan who covers leave. Each item has a calm "why this matters" line and is timed off the due date.

**Why this priority**: Practical, recurring value during pregnancy that leads straight into the existing post-birth checklist. Lower than US 1–3 because it extends a list that already exists.

**Independent Test**: With an expected child due in 10 weeks, open the checklist. Confirm pre-birth items appear first, timed from the due date. Mark "Pick a pediatrician" done, complete "Baby's here", and confirm it is still done.

**Acceptance Scenarios**:

1. **Given** an expected child, **When** the parent opens the checklist, **Then** pre-birth items come first, ordered by how close their suggested time is.
2. **Given** a pre-birth item, **When** the parent marks it done, skips it, or marks it not applicable, **Then** the status is saved for this child and shown on every device and to partners.
3. **Given** the baby has arrived, **When** the parent opens the checklist, **Then** pre-birth items they finished stay visible as done. Unfinished ones move to a collapsed "Before birth" group instead of showing as overdue.
4. **Given** any checklist copy, **When** it is shown, **Then** no item is labeled "overdue" or uses warning colors before birth (Constitution I).

---

### User Story 5 - Track prenatal appointments (Priority: P2)

The parent adds prenatal appointments (OB or midwife visits, ultrasounds, glucose test) in the same place they will later add well-baby visits, and gets the same reminders.

**Why this priority**: Prenatal visits are frequent and tied to dates. Reusing the existing visits feature costs little and teaches the habit the parent will rely on after birth.

**Independent Test**: For an expected child, add an "Ultrasound" appointment next Tuesday at 10:00. Confirm it lists under upcoming visits and the usual reminder arrives.

**Acceptance Scenarios**:

1. **Given** an expected child, **When** the parent adds an appointment, **Then** they can pick a prenatal type (OB/midwife visit, ultrasound, lab test, other) along with the date, time and an optional note.
2. **Given** a saved prenatal appointment, **When** it comes up, **Then** the same reminder rules as well-baby visits apply.
3. **Given** a partner, **When** an appointment is added, **Then** the partner sees it too.
4. **Given** the baby has arrived, **When** the parent views visits, **Then** past prenatal appointments are still in history, and new appointments default to well-baby types.

---

### User Story 6 - Invite a partner during pregnancy (Priority: P3)

During pregnancy, the parent gets one gentle prompt to invite their partner, so both share the same timeline, checklist and appointments, and both are already set up on day one.

**Why this priority**: Partners are most involved during pregnancy, and two parents who both use the app are less likely to leave. It reuses the existing invite flow, so the cost is low, but it isn't needed for the core loop.

**Independent Test**: As an expectant parent with no partner, confirm the prompt appears once on the pregnancy card. Send an invite, accept it on a second account, and confirm the partner sees the same week and checklist.

**Acceptance Scenarios**:

1. **Given** an expectant parent with no partner and no pending invite, **When** they view the pregnancy card, **Then** one dismissible prompt offers to invite a partner.
2. **Given** the parent sends an invite, **When** the partner accepts, **Then** the partner goes through the existing consent step and sees the expected child.
3. **Given** the parent dismissed the prompt, **When** they return, **Then** it does not reappear. Inviting stays available from Partner Management.

---

### User Story 7 - Kick counter and contraction timer (Priority: P3, gated)

[NEEDS CLARIFICATION: Include a kick counter and/or contraction timer in v1? Both log the pregnant parent's own health data, which is a new data category (Constitution II), and both sit near urgent-care situations (reduced movement, labor). Options: (A) leave both out of v1; (B) ship the contraction timer only, with a fixed "call your provider" line and no interpretation; (C) ship both after legal review.]

**Why this priority**: Pregnancy apps commonly have these and parents look for them. They also add the most legal and safety risk, so they must not block the P1 stories.

### Edge Cases

- **Pregnancy loss.** The parent can remove an expected child at any time through a quiet "Remove this pregnancy" option. It asks for no reason, shows no celebratory copy, stops every pregnancy notification and prompt right away, and deletes the related data without leaving traces on home. This copy needs UX and advisor review before launch.
- **Twins or multiples.** Each baby is its own expected child with the same due date. The pregnancy card shows once, not once per baby. "Baby's here" can be completed for all of them in one step.
- **Due date changes** (common after the first ultrasound). Editing the due date recalculates the week and checklist timing. Nothing completed is lost.
- **Very early birth** (before week 37). "Baby's here" works from week 20 on, defaults to "came early", and the welcome copy stays warm, with no mention of risk.
- **Late birth** (past week 42). The card keeps saying "Any day now". No week-43 note and no warnings.
- **Another child already on the account.** Pregnancy mode applies only while the expected child is active in the child switcher. The older sibling's app is unchanged.
- **Invited caregiver** (not a partner). Can view the pregnancy week but cannot edit the checklist or complete "Baby's here" (US 2.7).
- **Offline.** The week and note work offline from data already loaded. "Baby's here" waits until the connection is back, or shows a clear "we'll save this when you're back online" message.
- **Parents who added an expected child before this feature.** They see pregnancy mode automatically with no data migration step.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show pregnancy mode only while the active child is marked as expected, and MUST stop showing it once the birth is recorded.
- **FR-002**: The system MUST calculate the pregnancy week from the due date in one place (Constitution V). Every surface that shows the week, weeks remaining or "Due in" uses that one calculation, including the existing onboarding and child-switcher labels.
- **FR-003**: The system MUST provide written week-by-week content for weeks 4–42, covering a size comparison, what may be happening, and one optional suggestion. All content is fixed in the app and contains no AI.
- **FR-004**: All pregnancy copy MUST be warm, second-person and non-diagnostic, use "may" rather than "should", contain no warnings or countdown pressure, and say it is general information, not medical advice. A pediatrician or OB-informed advisor review of the content is a launch requirement.
- **FR-005**: The system MUST offer a "Baby's here" action to primary parents and partners that records the birth date (required), birth time (optional), name change (optional) and came-early (asked automatically when the birth date is 3 or more weeks before the due date).
- **FR-006**: Completing "Baby's here" MUST keep the original due date, partners, caregivers, checklist status, appointments and finance-finder answers for the child.
- **FR-007**: Completing "Baby's here" MUST check that the save succeeded and keep the child expected if it failed, with a message explaining what happened and how to retry (Constitution VI).
- **FR-008**: Only primary parents and partners MAY complete "Baby's here" or remove a pregnancy, and this MUST be enforced in the database, not only hidden in the UI (Constitution VII).
- **FR-009**: The system MUST offer the Flare+ 7-day trial after "Baby's here" only when early access is off, the parent is not on Flare+, and they have never had a trial. It is shown once and uses the same consent and disclosures as every other trial entry point.
- **FR-010**: While early access is on, no pregnancy or birth surface MAY show a price, trial or purchase button.
- **FR-011**: Pregnancy mode MUST be fully free. No pregnancy feature MAY be behind Flare+.
- **FR-012**: The system MUST add pre-birth items to the existing new-baby checklist, timed from the due date, with no "overdue" state before birth.
- **FR-013**: The system MUST let parents add prenatal appointment types to the existing visits feature, with the same reminders.
- **FR-014**: The system MUST show at most one dismissible partner-invite prompt during pregnancy, using the existing invite and consent flow.
- **FR-015**: The system MUST provide a "Remove this pregnancy" action that stops every pregnancy notification right away and deletes the expected child's data, with no celebratory or upbeat copy along the way.
- **FR-016**: Pregnancy mode MUST NOT add a chat surface, a free-text "ask" box, or any AI call (Constitution III; CLAUDE.md).
- **FR-017**: Any new data collected about the pregnancy or the pregnant parent MUST ship with its Privacy Policy, FAQ, subprocessor and legal-review-log updates in the same release (Constitution II).
- **FR-018**: Onboarding MUST keep working for expectant parents with no new wizard steps and no AI. A future date still leads to pregnancy mode.

### Key Entities

- **Expected child** (existing child record): a child marked as expected, with a due date. Gains a recorded birth date and time when the parent completes "Baby's here". Keeps its original due date after birth.
- **Pregnancy week content** (new, fixed in the app): one entry per week 4–42, holding a size comparison, what may be happening, and one suggestion. The same for everyone and personalized only by week.
- **Pre-birth checklist items** (extends the existing checklist): new item types with a due-date-based time window and a "before birth" group.
- **Prenatal appointment** (extends existing scheduled visits): new visit types for OB/midwife visits, ultrasounds, lab tests and other.
- **Birth trial offer state** (per parent): whether the birth trial offer was shown and dismissed, so it shows only once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Among expectant parents, at least 40% open the app in at least 3 different weeks of their pregnancy (baseline: today's expected-baby home has almost nothing to open for).
- **SC-002**: At least 70% of expected children reach "Baby's here" within 14 days of the actual birth date, rather than going quiet or being edited by hand.
- **SC-003**: The parent completes "Baby's here" in under 30 seconds, one-handed, in 3 taps or fewer when the name stays the same.
- **SC-004**: Once paid billing is live, the birth-moment trial start rate is at least 1.5× the rate from all other trial entry points combined.
- **SC-005**: At least 30% of expectant accounts have an accepted partner before "Baby's here".
- **SC-006**: Zero pregnancy notifications reach a parent after they remove a pregnancy.
- **SC-007**: Zero app-store reviews or support tickets cite pregnancy copy as alarming, judgmental or medical advice in the first 90 days.

## Assumptions

- Expectant parents add the baby the same way they do today: a future date in onboarding or Add Child marks the child as expected and is used as the due date. No new onboarding step is needed.
- Week numbers count the due date as week 40 (standard). Parents are not asked for a last-period date.
- The pregnancy card is home's top card for an expected child. No new tab.
- Pregnancy content covers the pregnancy and getting ready for the baby. It does not track the pregnant parent's symptoms, weight, blood pressure or medications in v1, which keeps pregnancy-related health data of the parent out of v1 apart from US 7 (pending).
- The "Baby's here" step goes through the existing parental-consent gate unchanged. Consent was already handled when the expected child was added.
- Notifications follow the existing quiet-hours and push settings. Pregnancy mode adds at most one weekly "new week" notification, which the parent can turn off.
- Today, Add Child stores an expected baby's due date only as its future birth date, while the Finance finder looks for a separate due-date field. The plan must reconcile these into one source (Constitution V) before "Baby's here" keeps the original due date.
- Pregnancy-loss copy and week content need advisor review (`pediatrician` / `general` agents, and an OB-informed reviewer before launch). This is a launch gate, not a spec gap.
- The US-only geo-block and existing Privacy/Terms apply unchanged unless US 7 adds pregnant-parent health data.
