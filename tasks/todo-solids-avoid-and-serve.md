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
