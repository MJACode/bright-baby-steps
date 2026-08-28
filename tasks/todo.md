# Task — Gate additional users behind Flare+ (+ owner shut-off)

## Decisions (confirmed with founder, 2026-08-28)
- **Seats:** free = 0 additional users. Flare+ = up to **2** additional users (2nd + 3rd person on the account).
- **On lapse:** DB-enforced auto-suspend. Partners keep their rows but lose all read/write until the owner resubscribes. Nothing is deleted.
- **Shut-off:** reversible per-partner **pause** toggle *plus* the existing permanent **remove**. A paused seat still occupies a seat; a removed one frees it.

## Backend — `supabase/migrations/20260828100000_partner_seats_flare_plus.sql`
- [x] `owner_has_plus(uuid)` — mirrors `usePremium` (`tier='plus'` AND status in active/trialing)
- [x] `partner_seat_limit(uuid)` → 2 when plus, else 0
- [x] `partner_seats_used(uuid)` → active + paused access rows + pending non-expired invites
- [x] `partner_access.paused_at` column + `'paused'` status
- [x] `has_partner_access` / `partner_can_write` / `can_access_child` require `owner_has_plus` and `status='active'`
- [x] BEFORE INSERT/UPDATE trigger on `partner_access` — seat limit + plus check
- [x] BEFORE INSERT trigger on `partner_invitations` — seat limit + plus check
- [x] `accept_partner_invitation` marks the invite accepted *before* inserting access (so the invite doesn't double-count its own seat) + friendly error messages
- [x] index on `partner_access(owner_id, status)`

## Frontend
- [x] `src/lib/partnerInvite.ts` — `MAX_ADDITIONAL_USERS`, `seatSummary()`, `describePartnerError()`
- [x] `src/hooks/usePremium.tsx` + `UpgradeSheet.tsx` — retune `multi-caregiver` copy to the 2-seat offer
- [x] `src/components/PartnerManagement.tsx` — seat counter, pause/resume switch, remove, free-tier teaser, lapsed banner
- [x] `src/components/OnboardingWizard.tsx` step 7 — invite card opens UpgradeSheet on free tier
- [x] `src/pages/AcceptInvite.tsx` — surface the real RPC error
- [x] `src/hooks/useCurrentRole.tsx` — filter `status='active'`
- [x] `src/integrations/supabase/types.ts` — hand-add `paused_at` + new fn signatures

## Verify
- [x] `npx tsc --noEmit`, `npm run lint`, `npx vitest run`
- [x] new unit test for the seat math

## Review

**Shipped.** One migration + eight touched source files.

**How the gate works.** Three layers, all reading the same rule:
1. `owner_has_plus()` mirrors `usePremium.isPremium` (tier `plus`, status `active`/`trialing`).
2. `has_partner_access` / `partner_can_write` / `can_access_child` require it, so a lapsed
   subscription auto-suspends every additional user at the RLS layer — nothing is deleted,
   and access returns the instant the owner resubscribes.
3. Two BEFORE triggers (`partner_access`, `partner_invitations`) enforce the 2-seat cap on
   the invite, accept, and un-pause paths from one definition of "out of seats".

**Seat accounting.** A seat is held by an active partner, a paused partner, *or* an
outstanding invite. Pausing does not free a seat; Remove and Cancel-invite do.

**One reorder worth knowing about.** `accept_partner_invitation` now marks the invitation
accepted *before* inserting `partner_access`, so the invite's own pending seat isn't counted
twice against the cap. Same transaction — a rejected insert rolls the invitation back to
pending. The consent stamp is untouched.

**Bug found and fixed on the way through.** `useCurrentRole` read `partner_access.role`
without filtering on status, so a revoked (and now paused) partner still resolved as a
co-parent in the UI. RLS blocked their data, but the UI handed them controls that would
silently fail. Now filters `status = 'active'`.

**Also tightened.** `owner_has_plus` / `partner_seat_limit` / `partner_seats_used` take an
arbitrary owner id and Postgres grants EXECUTE to PUBLIC by default — left open, any signed-in
user could probe a stranger's subscription state or caregiver count. Revoked from PUBLIC;
they're only reached from inside SECURITY DEFINER bodies (plus one explicit service_role grant
for `check-notifications`).

**Behaviour change to flag before deploy.** Free-tier accounts that already have an active
partner lose that partner's access on deploy — that's what "DB-enforced auto-suspend" means.
Nothing is deleted, and `PartnerManagement` shows a "Shared access is on hold" banner
explaining it. Worth an out-of-band note to any such owners in production.

**Verification:** `npx tsc --noEmit` clean · `npx vitest run` 373/373 (26 files, 8 new)
· `npm run build` clean · `npm run lint` unchanged at 131 problems, and per-file lint on
every touched file is identical to the pre-change baseline.
