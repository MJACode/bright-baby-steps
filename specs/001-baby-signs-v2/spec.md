# Feature Specification: Baby Signs v2 — Guided Sign Program with Weekly Coach

**Feature Branch**: `001-baby-signs-v2`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Baby Signs v2 — a more robust, guided sign-language program that upgrades the shipped Baby Signs v1 (/dashboard/signs, sign library, per-child sign progress, Flare+ gated). Founder decisions: (1) illustrations now, video later; (2) guided weeks + free library; (3) daily 'modeled today' check marks plus the existing 3-stage status, weekly totals only, no streaks; (4) a weekly one-shot AI sign plan. No chat. Disclosures ship in the same PR. Keep SLP-vetted claims intact. Out of scope: camera capture of the child, sign recognition, custom free-text signs."

## Problem & What This Replaces *(Constitution Principle III)*

**Parent problem.** Baby Signs v1 gives parents a flat list of 20 signs with a text description of each. Parents tell us two things are missing: (1) they can't tell what a sign *looks like* from a paragraph of text, and (2) they don't know *what to do next* — which signs to start with, how often to model them, and what to try when a sign isn't catching on. The result is that a parent opens the page, reads a few cards, and has no plan to carry into mealtime or bath.

**What this replaces or simplifies.**

- The flat 20-card accordion stops being the main experience. It becomes a secondary "All signs" library behind the guided view.
- The single "How to teach signs" paragraph is replaced by concrete per-sign steps (model → prompt → celebrate) and a week-by-week path, so the teaching advice sits beside the sign it applies to.
- Nothing is added to the home screen, briefings, or notifications. The existing entry points (Milestones card, Baby Signs quick tile) stay as they are.

**What it does not change.** The 3-stage status (Using it / Trying it / Signs it!), the SLP-vetted program copy, the red-flag cutoffs, the Early Intervention link, and Flare+ gating all carry over unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how to make each sign (Priority: P1)

A parent opens a sign and sees a step-by-step illustration of the handshape and movement, next to the existing how-to text, so they can copy it confidently the first time.

**Why this priority**: This is the most basic gap. A parent who can't make the sign can't teach it, and every other story depends on the parent knowing the sign. It also delivers value alone, with no new tracking or AI.

**Independent Test**: Open any of the 20 signs in the library and confirm an illustration appears showing the start position, the movement, and the end position, with a text alternative that a screen reader can announce.

**Acceptance Scenarios**:

1. **Given** a Flare+ parent on the Baby Signs page, **When** they open the MORE sign, **Then** they see an illustration showing the handshape and the movement, plus the existing how-to text.
2. **Given** a sign that later gets a short looping video, **When** the parent opens it, **Then** the video plays in the same spot the illustration used, with the illustration as the fallback if the video can't load. No other part of the screen changes.
3. **Given** a parent using a screen reader, **When** they reach a sign's illustration, **Then** the screen reader announces a description of how to make the sign.
4. **Given** a slow or offline connection, **When** the parent opens a sign, **Then** the how-to text is always readable, even if the illustration hasn't loaded.

---

### User Story 2 - Follow a guided week-by-week path (Priority: P1)

A parent sees "This week" at the top of Baby Signs: 2–3 focus signs chosen for their baby's age and progress. Each focus sign shows three short steps for introducing and reinforcing it (model it, prompt for it, celebrate any attempt), and when to use it in the day. When the parent is ready, they move to the next set. They can also browse the full library and swap in any sign they prefer.

**Why this priority**: This answers "what do I do next?", the second half of the parent problem. It works without the AI coach, using a default path built from the curated library.

**Independent Test**: With no AI plan generated, a new Flare+ parent of a 7-month-old sees 2–3 age-appropriate focus signs with introduce/reinforce steps. They can swap one for a library sign and move to the next set.

**Acceptance Scenarios**:

1. **Given** a parent who has never used Baby Signs, **When** they open the page, **Then** they see "This week" with 2–3 focus signs from the default path, suitable for the child's corrected age.
2. **Given** a focus sign, **When** the parent opens it, **Then** they see the illustration, the three teaching steps (model, prompt, celebrate), natural moments to use it, and a short "if it isn't catching on" tip.
3. **Given** the parent wants a different sign, **When** they choose "Make this a focus sign" from the full library, **Then** it joins this week's focus set, up to a maximum of 3 focus signs.
4. **Given** the focus signs have reached "Trying it" or "Signs it!", or the parent has used them for about two weeks, **When** they open the page, **Then** they see a gentle "Ready for new signs?" option. Nothing moves on automatically.
5. **Given** a partner or caregiver with write access to this child, **When** they open Baby Signs, **Then** they see the same focus signs as the primary parent.

---

### User Story 3 - Tick off practice with a light touch (Priority: P2)

Each focus sign has a "Modeled today" check mark. A parent taps it after using the sign at breakfast. The page shows a calm weekly total ("You modeled signs on 4 days this week"). It never shows a streak, a missed day, or a reminder to log.

**Why this priority**: Practice ticks make the plan feel real and give the AI coach its best signal. They depend on Story 2 (focus signs) and are optional for parents, so they come after the core guidance.

**Independent Test**: Tick "Modeled today" on two focus signs, reload, and see both ticked and the weekly total updated. Skip a day and confirm no copy mentions it.

**Acceptance Scenarios**:

1. **Given** a focus sign, **When** the parent taps "Modeled today", **Then** it shows as ticked for today and the weekly total updates.
2. **Given** a sign already ticked today, **When** the parent taps it again, **Then** the tick is removed. This is a toggle, not a counter.
3. **Given** the co-parent already ticked MILK today on their phone, **When** the other parent opens the page, **Then** MILK already shows as ticked for today.
4. **Given** a parent who didn't tick anything for three days, **When** they return, **Then** the page shows only the positive weekly total (or nothing), with no mention of missed days and no streak.
5. **Given** a tick fails to save (for example, a read-only viewer or no connection), **When** it fails, **Then** the parent sees what happened and what to do next, and the tick doesn't appear saved.

---

### User Story 4 - Get a personalized weekly sign plan (Priority: P3)

Once a week, a Flare+ parent taps "Build this week's sign plan". The coach looks at the baby's age, which signs are introduced, emerging, or signed, and how often each focus sign was modeled. It returns a short one-shot plan: which 2–3 signs to focus on and why, natural moments to use each one, and what to try for any sign that has stalled. The parent can accept the suggested focus signs in one tap.

**Why this priority**: This adds personalization on top of the default path. The page is complete without it (Stories 1–3), and it is the only story that adds a new AI flow and disclosure work, so it ships last and can slip without blocking the rest.

**Independent Test**: For a child with MILK at "Signs it!", MORE at "Trying it" (modeled 5 of 7 days), and EAT at "Using it" (modeled 1 day), generate a plan. Confirm it moves past MILK, keeps or adjusts MORE, offers a stall tip for EAT, and uses calm, non-diagnostic copy.

**Acceptance Scenarios**:

1. **Given** a Flare+ parent with some sign progress, **When** they tap "Build this week's sign plan", **Then** within about 20 seconds they see 2–3 recommended focus signs (at least 1 if the coach's output is partly discarded), one line on why each was chosen, 1–2 routine moments for each, and a stall tip for any stalled sign (a focus sign for 2+ weeks, still at the first stage, modeled on at least 1 day).
2. **Given** a plan has been generated, **When** the parent taps "Use these signs", **Then** the recommended signs become this week's focus signs.
3. **Given** a plan already exists for this child this week, **When** the parent opens the page, **Then** they see that plan. They cannot generate another one until next week.
4. **Given** the coach recommends a sign, **Then** it is always a sign from the curated library, never a sign the app doesn't have.
5. **Given** the coach can't respond (error or timeout), **When** the parent tries, **Then** they see a clear message and the default path stays fully usable.
6. **Given** a free-tier parent, **When** they call the plan generator directly, **Then** it is refused on the server, not only hidden in the UI.
7. **Given** any generated plan, **Then** its copy celebrates effort, never diagnoses, never warns about delays, and never implies the child is behind. The v1 red-flag note stays in the static page copy only.

---

### Edge Cases

- **Child younger than 6 months**: Show the existing "You can start modeling signs anytime" note. The default path still offers first signs (MILK, MORE, ALL DONE) with no pressure copy.
- **Child older than the library** (e.g. 24+ months with all signs at "Signs it!"): Show a celebratory "You've worked through the whole library" state instead of empty focus slots. The coach doesn't invent new signs.
- **All focus slots full**: "Make this a focus sign" explains that there are 3 focus signs already and offers to swap one out.
- **Sign removed from focus**: Past ticks for that sign are kept and still count toward history, and the sign's 3-stage status is unchanged.
- **Timezone and "today"**: A tick counts for the family's tracking day, the same "today" the rest of the app uses (it honors the child's day-start setting, which defaults to midnight). The weekly total uses the same Monday week boundary as the other weekly plans.
- **Two caregivers tick the same sign on the same day**: It counts as one tick for that child and day, not two.
- **Read-only viewer role**: Can see focus signs, ticks, and plans, but can't tick or generate. The controls are disabled with a short explanation.
- **Flare+ lapses**: Existing progress, ticks, and past plans are kept (Principle IV). The guided view falls back to the free-tier teaser, and resubscribing restores everything.
- **Child deleted or account deleted**: All sign progress, focus signs, ticks, and plans for that child are removed with it.
- **Illustration asset missing for a sign**: The sign's emoji and how-to text show in its place, and the rest of the screen works normally.

## Requirements *(mandatory)*

### Functional Requirements

**Sign media**

- **FR-001**: Every sign in the curated library MUST have a step-by-step illustration showing the handshape and movement (start → motion → end).
- **FR-002**: Every illustration MUST have a text alternative that describes how to make the sign.
- **FR-003**: The sign content model MUST allow an optional short looping video per sign, added later without changing the stored progress data or the screen layout. When a video exists it takes the illustration's place, and the illustration is the fallback.
- **FR-004**: A sign's how-to text MUST always be available, whether or not its media loads.
- **FR-005**: Any video added later MUST be muted by default, loop, and not autoplay with sound.

**Teaching content**

- **FR-006**: Every sign MUST have three teaching steps: **Model** (how to show it, always saying the word out loud), **Prompt** (how to invite the baby to try, without withholding the item), and **Celebrate** (how to respond to any attempt, approximations included).
- **FR-007**: Every sign MUST have a short "if it isn't catching on" tip. All of this copy is reviewed by the SLP agent before release, like v1.
- **FR-008**: All v1 program copy (why signing works, bilingual note, expectations, red-flag cutoffs, speech-vs-language note, Early Intervention link) MUST remain on the page with its wording unchanged.

**Guided path**

- **FR-009**: The system MUST provide a default ordered path through the library in sets of 2–3 focus signs, grouped by the existing stages and filtered by the child's corrected age.
- **FR-010**: Each child MUST have at most 3 focus signs at a time, shared across every caregiver with access to that child.
- **FR-011**: Parents MUST be able to add any library sign as a focus sign and remove any focus sign.
- **FR-012**: The system MUST offer "Ready for new signs?" when all current focus signs are at "Trying it" or better, or have been focus signs for 14+ days. The path MUST NOT advance without the parent choosing to.
- **FR-013**: The full library of all signs MUST stay browsable from the Baby Signs page, with the existing 3-stage status controls on each sign.

**Practice tracking**

- **FR-014**: Each focus sign MUST have a "Modeled today" toggle that records whether the sign was modeled with the child on the current local day, with at most one record per child, sign, and day.
- **FR-015**: The page MUST show a gentle weekly summary (e.g., days with any sign modeled this week), phrased positively.
- **FR-016**: The system MUST NOT show streaks, consecutive-day counts, missed-day indicators, "you haven't…" copy, or reminders or notifications about ticking (Principle I).
- **FR-017**: Every tick, un-tick, focus change, and status change MUST confirm success, or tell the parent what went wrong and what to do next (Principle VI).
- **FR-018**: Who can view and change focus signs and ticks MUST follow the existing partner-access roles for that child and be enforced on the server. Read-only viewers can view but not change (Principle VII).
- **FR-019**: Practice data MUST be limited to which curated sign was modeled and on which day. No free text, notes, photos, audio, or video of the child (COPPA data minimization, same posture as v1).

**Weekly coach**

- **FR-020**: Flare+ parents MUST be able to generate one personalized sign plan per child per week by tapping a button. It is never generated automatically.
- **FR-021**: The coach's input MUST be limited to: the child's corrected age in months, the 3-stage status of each sign, current focus signs, and per-sign practice-day counts for the past 4 weeks. It MUST NOT receive the child's name, date of birth, health records, journal text, or any free text.
- **FR-022**: The plan MUST contain 1–3 recommended focus signs (the coach is asked for 2–3; at least 1 must survive sanitization) chosen only from the curated library, a one-line reason for each, 1–2 natural routine moments for each, and a stall tip offered only for stalled signs. A sign is stalled when it has been a focus sign for 14+ days, its status is still "introduced", and it was modeled on at least 1 day in the last 4 weeks (`stalled()` in `src/lib/signProgress.ts`).
- **FR-023**: Parents MUST be able to apply the recommended focus signs in one action, or ignore the plan.
- **FR-024**: The plan is one-shot. There MUST be no follow-up question box, chat thread, or free-text input (Principle III).
- **FR-025**: Plan copy MUST follow the same calm, non-diagnostic rules as the static copy (Principle I). If the coach returns an unknown sign or output that can't be used, the system MUST discard it and show an error. The default path stays available.
- **FR-026**: Flare+ entitlement for plan generation MUST be checked on the server.
- **FR-027**: The latest plan for the current week MUST be visible to every caregiver with access to the child.

**Legal and disclosure (Principle II)**

- **FR-028**: The same release MUST update the Privacy Policy's AI-processing section, the FAQ if it lists AI features, and the COPPA direct-notice enumeration if needed, to reflect that sign progress and practice counts are sent to the AI provider for the weekly sign plan. It MUST add a `docs/legal-review-log.md` entry. No new subprocessor is introduced.
- **FR-029**: Removing a focus sign, letting Flare+ lapse, or retiring a sign from the library MUST NOT delete a child's existing status or practice history (Principle IV).

### Key Entities

- **Sign (curated content)**: One sign in the library: slug, label, stage, how-to text, when-to-use text, tip, and new in v2: illustration with text alternative, optional video, model/prompt/celebrate steps, and "if it isn't catching on" tip. Static content, not user data.
- **Sign path**: The default ordered sequence of focus-sign sets through the library, with age suitability. Static content.
- **Sign progress (existing)**: Per child and sign, the 3-stage status and first-signed date. Unchanged from v1.
- **Focus sign**: Per child, which curated signs (at most 3) are the current focus and since when. Shared across caregivers.
- **Practice tick**: Per child, sign, and local calendar day, a record that the sign was modeled. At most one per child/sign/day.
- **Weekly sign plan**: Per child and week, the coach's structured output (recommended signs, reasons, routine moments, stall tips) and when it was generated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of library signs have an illustration and a text alternative at launch.
- **SC-002**: A first-time Flare+ parent can go from opening Baby Signs to seeing this week's focus signs and their teaching steps in under 30 seconds, with no setup.
- **SC-003**: A parent can record "Modeled today" for a focus sign in one tap, in under 3 seconds, one-handed on a phone.
- **SC-004**: Within 60 days of launch, at least 40% of Flare+ parents who open Baby Signs return to it in a later week (v1 baseline to be captured before launch).
- **SC-005**: Within 60 days, at least 30% of active Baby Signs users record at least one practice tick in a week.
- **SC-006**: 95% of weekly plan requests return a usable plan within 20 seconds. Failures leave the guided path fully usable.
- **SC-007**: In a pre-release review of 20 generated plans across varied progress profiles, zero plans contain diagnostic, delay-warning, or guilt copy, and zero recommend a sign outside the library.
- **SC-008**: No release ships without the Privacy, FAQ, and legal-review-log updates in the same change.

## Assumptions

- **Library size**: The existing 20 signs are enough for v2 (about 7–10 weeks of guided path). Expanding the library is a separate content decision.
- **Illustration production** *(confirmed by founder 2026-09-30)*: The founder's designer produces all 20 illustrations in the brand's style, to a spec (format, dimensions, frames, alt text) delivered with the plan. Launch of Story 1 is gated on SC-001. Engineering builds against placeholder assets until delivery. Video is filmed and added later with no code change beyond attaching the media.
- **Plan cadence**: One plan per child per calendar week, using the same week boundary as the existing Weekly Play Plan, generated only when the parent taps.
- **Coach model and provider**: Same provider (Anthropic) and one-shot pattern as the Weekly Play Plan, under the existing DPA. No new subprocessor.
- **Focus signs are per child, not per caregiver**: Everyone caring for the child works on the same signs, which is also the SLP-recommended practice (consistency across caregivers).
- **Practice ticks count per child, not per caregiver**: No caregiver attribution in v2.
- **v1 table is live**: The v1 sign-progress table was applied to production after PR #203. This must be confirmed against the live database during planning (Principle VIII).
- **Free tier**: Free users keep the v1 teaser experience. Illustrations for the first 3 signs may be shown as a preview, a pricing decision for the plan stage.
- **No new surfaces**: Ticks and plans do not feed briefings, weekly insights, notifications, or the home screen in v2.

## Out of Scope

- Camera or video capture of the child, and any sign recognition or feedback on the child's or parent's signing.
- Custom or free-text signs.
- Conversational follow-up with the coach, or any free-text "ask" input.
- Streaks, badges, reminders, or push notifications about practice.
- Feeding ticks or plans into briefings, weekly insights, or the Word & Sound Journal (the v1 toast nudge remains).
- Expanding the library beyond the current 20 signs.
