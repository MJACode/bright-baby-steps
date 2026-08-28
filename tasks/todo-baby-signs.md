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

- [~] Backend: migration `20260828000000_child_signs.sql` + types.ts entry
- [ ] Frontend: signLibrary.ts, useSignProgress hook, SignsPage, route,
      quick tile, premium-surface entries, Milestones entry card
- [ ] QA pass (qa agent) → fixes if required
- [ ] Commit, push, draft PR

## Post-merge (manual)

- [ ] Apply the migration to live (Supabase MCP unavailable this session):
      `supabase db push` or MCP `apply_migration`

## Review

_(filled in when done)_
