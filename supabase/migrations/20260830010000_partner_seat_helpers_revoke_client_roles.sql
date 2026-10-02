-- Follow-up to 20260828100000_partner_seats_flare_plus.sql.
--
-- That migration did `REVOKE EXECUTE ... FROM PUBLIC` on the three seat
-- helpers, but Supabase's default privileges grant EXECUTE on new public
-- functions to anon/authenticated DIRECTLY (not via PUBLIC), so the revoke was
-- a no-op on hosted: verified 2026-10-01, owner_has_plus proacl still listed
-- anon=X and authenticated=X. Any signed-in (or anon) caller could probe a
-- stranger's subscription state / caregiver count. RLS helpers call these from
-- SECURITY DEFINER bodies, so the client roles never need EXECUTE.
-- service_role keeps owner_has_plus (check-notifications uses it).
--
-- Idempotent: REVOKE of an absent grant is a no-op.

REVOKE EXECUTE ON FUNCTION public.owner_has_plus(uuid)      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_seat_limit(uuid)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_seats_used(uuid)  FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.owner_has_plus(uuid)      TO service_role;
