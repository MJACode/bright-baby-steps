# Baby Signs — Flare+ sign language program

Premium (Flare+) baby sign language program, built to pair with the founder's
SLP content Instagram (app-in-bio funnel). Deterministic curated content — no
AI calls. ASL-based signs with SLP-grounded framing: signing *supports* spoken
language development, always say the word while signing.

## Design

- **Content**: `src/data/signLibrary.ts` — ~20 signs in 5 stages
  (First signs / Daily routines / Connection / Out in the world / Feelings &
  manners), each with slug, label, emoji, howTo, whenToUse, tip. Program-level
  copy: why signing works, how to teach (1–3 signs at a time, natural
  moments), when sign-backs typically appear (~8–12 mo), SLP escalation note.
- **Progress**: `child_signs` table — one row per (child, sign_slug),
  status `introduced | emerging | signing`, `first_signed_at` stamped when a
  sign first reaches `signing`. Bounded slugs only (COPPA data minimization,
  same pattern as `child_activities`). RLS mirrors `child_activities`.
- **Gating**: client-side via `PremiumGate` feature `baby-signs`
  (same posture as `activity-library` — static content, no server enforcement
  needed).

## Where it's included

- New page `/dashboard/signs` (`SignsPage.tsx`), gated body + free-tier teaser
- Milestones page (Development tab): entry card linking to the program
- Home Quick Tiles: "Baby Signs" tile
- `PREMIUM_FEATURES` + `UpgradeSheet` `FEATURE_HOOK` + `MilestonesPremiumCard`
  perk

## Plan

- [x] Backend: migration `20260828000000_child_signs.sql` + types.ts entry
      (types hand-patched; replace with a real `generate_typescript_types`
      regen when the Supabase MCP is available)
- [x] Frontend: signLibrary.ts, useSignProgress hook, SignsPage, route,
      quick tile, premium-surface entries, Milestones entry card
- [x] QA pass (qa agent) → Fix-required → all 4 findings fixed
      (owner-keyed parent_id per the sleep_day_todos precedent;
      CoppaDirectNotice enumeration + legal-review-log entry;
      server-authoritative first_signed_at; guarded deletes)
- [x] Draft PR #203 opened (watched)

## SLP review outcomes (folded into content spec)

- Claims softened: signing *doesn't delay* talking / reduces frustration —
  no "accelerates speech" claim (evidence doesn't support it)
- Sign-back window 8–14 mo (+ "weeks of consistent modeling" expectation;
  not signing back is not by itself a concern)
- Red-flag copy keyed to real cutoffs: no gestures by 12 mo, no words by
  16 mo, regression → free Early Intervention evaluation
- MORE (duck-beak flattened-O) and HURT (twist) descriptions corrected;
  "ASL-based" labeling everywhere (GENTLE is a baby-sign adaptation)
- Bilingual copy: signs bridge both languages; independent sign counts as
  a word in total vocabulary
- MORE overgeneralization tip: pair with the specific sign

## Follow-ups (out of v1 scope)

- [ ] Custom sign slot (baby's own high-motivation word) — needs a design
      decision vs. the bounded-slug COPPA posture (`custom_milestones` is
      precedent for free text)
- [ ] Auto-feed "Signs it" entries into the Word & Sound Journal /
      expressive-vocabulary count (v1 nudges via toast instead)

## Post-merge (manual)

- [ ] Apply the migration to live (Supabase MCP unavailable this session):
      `supabase db push` or MCP `apply_migration`

## Review

Shipped on PR #203 (commit 24c93f3). Backend + frontend + QA cycle done:
migration `child_signs` (file-only — **not applied to live**), sign library
(20 signs / 5 stages, SLP-vetted copy), `/dashboard/signs` page with
PremiumGate, entry points (Milestones card, quick tile, upgrade surfaces),
COPPA direct-notice enumeration + legal-review-log entry.

**Merge is held** (auto-merge policy § 5 pause): main auto-deploys to prod,
and `/dashboard/signs` queries `child_signs` — merging before the migration
is applied to live would error for anyone opening the page. Apply
`20260828000000_child_signs.sql` first (`supabase db push` or Supabase MCP
`apply_migration` once reconnected), then regen types
(`generate_typescript_types`) to replace the hand-patched entry, then merge.
