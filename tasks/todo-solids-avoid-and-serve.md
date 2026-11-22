# Solids: avoid list, smarter Log solids, "How to serve" sheet

Founder-approved 2026-11-22. All three phases ship together in one PR. The PR adds a migration, so the founder must OK it before merge.

## Founder decisions
- All three phases.
- Pictures: about 8 reusable **shape illustrations** (in-house SVG line art, brand tokens), tagged onto catalog foods. No AI-generated food photos.
- When a reaction names a top-9 allergen: **suggest** marking it in the allergen tracker, and the parent confirms or changes it. Never automatic.
- Free-text "Other" reactions (food not in the catalog): **record only**. Kept in the avoid list and the pediatrician report. They do not filter the plan.
- "Don't like it" (preference) avoids: after 4 weeks, a gentle "Try again?" suggestion the parent can dismiss. Reactions never expire.
- Inference stays at exact catalog slug plus declared allergens. No guessing ingredient families.

## Phase 1: avoid list (backend + frontend)
- [ ] Migration: `child_food_avoidances` (child_id, food_slug XOR custom_food, reason reaction|preference, note, source_feeding_log_id, retry_dismissed_at, created_by, timestamps). RLS mirrors feeding_logs (partner access; viewer read-only). Unique per child + slug.
- [ ] Migration: `feeding_logs.food_slug text null` (catalog link, phase 2).
- [ ] Purge/delete RPC coverage, data export, pediatrician report, MCP get-child-data where allergens are exposed.
- [ ] generate-meal-plan: server-side exclusion of avoided slugs from `eligibleFoods`. No new data to Anthropic.
- [ ] Meal plan: "Not for us" on each food → preference avoid; hide avoided foods from the cached plan right away.
- [ ] Log solids: "Reaction noted" → "Which food?" (catalog picker + Other free text) → reaction avoid row.
- [ ] Reaction to a food that contains a top-9 allergen → suggest an allergen-tracker reaction, parent confirms or edits the chips.
- [ ] Avoid list management (view, remove, change reason) on the Solids tab; 4-week "Try again?" for preferences, dismissible.

## Phase 2: Log solids knows food
- [ ] Food Description autocomplete from the catalog → sets food group, food_slug, suggested allergen chips (editable).
- [ ] Contained allergens that aren't introduced yet: suggest logging an exposure; the parent confirms.
- [ ] Free text still allowed.

## Phase 3: How to serve
- [ ] Catalog: `shapes` per method × age band, from a fixed set of ~8 shapes, derived from prep text, locked by a test, nutrition review.
- [ ] 8 SVG illustrations (theme-aware, currentColor).
- [ ] "How to serve" sheet from each meal-plan food: illustration, age-band prep, gagging-vs-choking note.

## Process
backend → QA → frontend (Mobbin refs first) → QA → nutrition review of shapes + copy → legal log entry → PR (hold for founder OK: migration).

## Approved-for-build copy (nutrition advisor, 2026-11-22)
Frontend: put these in constants keyed by id. Reaction wording reuses src/services/allergenService.ts (REACTION_SAVED_TOAST, CALL_911, startIntroToast, exposureLoggedToast, REACTION_NOTED_DESCRIPTION) unchanged.

- SERVE_GAG_NOTE_TITLE: Gagging or choking?
- SERVE_GAG_NOTE: Gagging is normal and often noisy: your baby may cough, sputter or push food forward with their tongue while they learn to eat. Choking is usually silent: your baby can't cry, cough or breathe, and their skin may turn bluish. Choking needs help right away, so call 911, and an infant first aid and CPR class will show you what to do.
- SERVE_SAFETY_FOOTER: Always serve with your baby sitting upright, and stay with them while they eat.
- SERVE_SHAPE_SPEAR: Soft-cooked strips about the length and width of two adult fingers, easy to grip in a fist and soft enough to squish.
- SERVE_SHAPE_MASH: Mashed or puréed smooth, offered on a spoon or for your baby to scoop with their hands.
- SERVE_SHAPE_PRE_LOADED_SPOON: Fill the spoon, then hold it out so your baby can grab it and bring it to their mouth.
- SERVE_SHAPE_GROUND: Ground, crumbled or flaked small and kept moist, with bones and tough bits removed.
- SERVE_SHAPE_THIN_SPREAD: Spread in a thin, even layer with no thick globs, or grated fine.
- SERVE_SHAPE_FLATTENED: Round foods pressed flat with your finger or a fork so they're no longer round.
- SERVE_SHAPE_QUARTERED: Round foods cut lengthwise into quarters, so no piece stays round.
- SERVE_SHAPE_BITE_SIZE: Small, soft pieces about the size of a chickpea that squish easily between your fingers.
- AVOID_SECTION_TITLE: Foods you're leaving out
- AVOID_SECTION_HELPER: These stay out of your meal ideas until you remove them.
- AVOID_EMPTY: Every food is in the mix. Tap "Not for us" on a meal idea, or note a reaction when you log solids, and it shows up here.
- AVOID_REASON_REACTION: Reaction / helper: Stays out until you remove it.
- AVOID_REASON_PREFERENCE: Not a fan yet / helper: We'll suggest another try in 4 weeks.
- MEAL_NOT_FOR_US: Not for us
- MEAL_NOT_FOR_US_TOAST_TITLE: {food} is off the menu for now
- MEAL_NOT_FOR_US_TOAST_DESCRIPTION: We'll leave it out of your meal ideas. You can bring it back from Foods you're leaving out.
- MEAL_NOT_FOR_US_UNDO: Undo
- AVOID_RETRY_TITLE: Ready to try {food} again?
- AVOID_RETRY_BODY: Babies often need many tries before a new food clicks. Offer a little next to a food they already enjoy, with no pressure to eat it.
- AVOID_RETRY_CONFIRM: Try again / AVOID_RETRY_DISMISS: Not yet
- AVOID_RETRY_CONFIRM_TOAST: {food} is back in your meal ideas.
- AVOID_OTHER_LABEL: Something else
- AVOID_OTHER_PLACEHOLDER: What did your baby eat?
- AVOID_OTHER_HELPER: If it's on our food list, pick it above so we leave it out of meal ideas.
- AVOID_OTHER_SAVED_NOTE: Saved for your pediatrician report. Your meal ideas stay as they are.
- AVOID_OTHER_ROW_TAG: Saved for your pediatrician
- LOG_REACTION_FOOD_LABEL: Which food?
- LOG_REACTION_FOOD_HELPER: Pick the food your baby had before you noticed it. We'll leave it out of meal ideas until you remove it.
- LOG_REACTION_FOOD_SEARCH_PLACEHOLDER: Search foods
- LOG_REACTION_ALLERGEN_TITLE: {food} can contain {allergenList}
- LOG_REACTION_ALLERGEN_BODY: This reaction may be linked to one of these. You might want to add it to the allergen tracker so it's in your pediatrician report. Keep only the allergens that were in what your baby ate.
- LOG_REACTION_ALLERGEN_EFFECT: Adding it marks {allergen} as Review with Pediatrician in the tracker.
- LOG_REACTION_ALLERGEN_CONFIRM: Add to allergen tracker / SKIP: Not now
- LOG_REACTION_PEDIATRICIAN_NUDGE: Tell your pediatrician what you saw. It's saved in your pediatrician report.
- LOG_CONTAINS_TITLE: {food} contains {allergen}
- LOG_CONTAINS_BODY: Want to log this as a taste of {allergen} in the allergen tracker? It starts the 2-hour watch from the time you logged it.
- LOG_CONTAINS_BODY_MULTI: Want to log this in the allergen tracker? Keep only the allergens that were in what your baby ate.
- LOG_CONTAINS_CONFIRM: Log {allergen} exposure (multi: Log exposures) / DISMISS: Not now

### Build rules from the clinical caveats
- Allergen chips are editable suggestions. Nothing is pre-confirmed. The existing one-new-allergen spacing note (recentOtherFirstExposure) still fires.
- Allergen with a reaction on record → no "log exposure" offer; show REACTION_NOTED_DESCRIPTION. Allergen partway through → offer the next exposure number via the existing same-day confirm.
- Food with no allergen → nudge only (no ACTION_PLAN wording). Show CALL_911 on the reaction step unchanged.
- Shapes: no blw "6-8" = bite-size. Quartered drawing must show lengthwise quarters. Spear must read soft-cooked.
- "Something else" text: fuzzy-match against catalog names and suggest the match.

## Founder decisions, round 2 (2026-11-22, delegated to PM)
1. Cough wording A: Log solids reaction step only → "a repeated cough that starts after eating and doesn't clear". CALL_911 elsewhere unchanged.
2. Add a 9th shape, palm-chunk (soft palm-sized pieces that aren't strips). Caption nutrition-approved 2026-11-22.
3. Privacy § 2 line + COPPA "What we collect" line + legal-review-log entry, in this PR.
4. Existing MCP grants get get_food_avoidances without re-consent. Logged as an accepted risk.
5. Reactions confirmed from Log solids need a parent-picked severity (the tracker's picker). Never default to Mild.
