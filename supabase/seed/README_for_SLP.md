# Milestone Seed Data — Instructions for SLP Review

## What this file does

`milestone_flags_seed.csv` defines every developmental milestone the app tracks, 
plus the clinical thresholds that trigger flags to parents. This file is the most 
important input before the flagging engine is built — engineering waits on your approval.

Open it in Google Sheets or Excel. Edit freely.

---

## Column Guide

| Column | Required | What to put here |
|---|---|---|
| `category_name` | Yes | The domain group shown in the app (Receptive Language, Expressive Language, Social Communication, Speech Sounds, etc.) |
| `sort_order` | Yes | Order within the category (1, 2, 3...) |
| `milestone_name` | Yes | Short name shown to parents in the milestone list |
| `description` | No | Optional 1-sentence clarification shown under the name |
| `typical_start_months` | Yes | Age (in months) when most children begin showing this skill |
| `typical_end_months` | Yes | Age (in months) by which most children have this skill |
| `flag_at_months` | No | **Leave blank for tracking-only milestones.** For clinical flags: the age at which absence of this skill should prompt parental action |
| `flag_severity` | No | One of: `watch` / `concern` / `act`. Required if flag_at_months is set |
| `flag_message` | No | **Your most important column.** What the parent sees when flagged. Should be warm, specific, and actionable — not alarming. Required if flag_at_months is set |
| `source` | No | Clinical source abbreviation: ASHA, CDC, ASQ-3 |
| `source_url` | No | URL to the clinical reference |
| `slp_notes` | No | Internal notes — NOT shown to parents. Use for clinical context, sensitivities, referral triggers |

---

## Severity levels

**Watch** — "Keep an eye on this, bring it up at the next visit." Low urgency. 
Parent sees a yellow indicator. No EI push.

**Concern** — "This is past the typical window; an evaluation is recommended." 
Parent sees an orange indicator. App offers to help find a local SLP.

**Act** — "This needs attention now." Reserved for significant delays only. 
Parent sees a red indicator. App walks them through requesting an EI evaluation.

---

## What to review

1. **Do the typical ranges match your clinical experience?** Edit freely — the ranges 
   from ASHA/CDC are population-level; you know where they under- or overstate.

2. **Are the flag thresholds right?** `flag_at_months` should be the point where you'd 
   say "yes, this child warrants a referral." Not the first day typical_end passes — 
   give a reasonable buffer.

3. **Are the flag messages parent-appropriate?** These are the most important words in 
   the product. They should be warm, concrete, and not panic-inducing. Edit every one.

4. **Are we missing domains?** We currently cover: Receptive Language, Expressive Language, 
   Social Communication, Speech Sounds. Should we add Motor, Feeding/Oral Motor, or 
   Cognitive milestones? Flag which ones are in scope for your clinical review.

5. **Are any milestones too close to autism screening items?** (e.g., eye contact, 
   joint attention, pointing, imitating) We've flagged these in `slp_notes`. If the 
   messaging needs to be handled differently for those, note it.

6. **Are there milestones that should NOT have flags?** Some skills are positive-tracking 
   only (fun to log, not clinically meaningful if delayed). Leave `flag_at_months` blank 
   for those.

---

## What happens after you approve

1. Engineering loads your approved CSV into the database
2. The flagging engine checks: for each milestone where `flag_at_months` is set, 
   if the child's age ≥ `flag_at_months` AND the milestone is not marked Achieved, 
   a flag is created
3. The flag shows in the app with your message, your severity level, and a path to 
   find an SLP or request an EI evaluation
4. Parents can dismiss a flag with a reason ("I'm already working with a therapist", 
   "My pediatrician knows", etc.) — that's tracked so we can follow up

---

## Questions?

Reach Matt at matt.alksninis@gmail.com with any questions about what's technically 
possible or how the app currently works.
