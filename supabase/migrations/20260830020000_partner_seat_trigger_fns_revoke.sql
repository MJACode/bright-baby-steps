-- Follow-up to 20260828100000_partner_seats_flare_plus.sql — clears the
-- get_advisors findings that migration introduced (2026-10-01):
--
--   * enforce_partner_seat_limit() / enforce_invite_seat_limit() are trigger
--     functions; Supabase's default privileges exposed them at
--     /rest/v1/rpc/* to anon + authenticated. Triggers fire as the table
--     owner regardless of EXECUTE grants, so nobody needs to call these.
--   * set_partner_access_paused(uuid, boolean) is an owner-facing RPC and
--     must stay callable by `authenticated`, but `anon` has no business
--     reaching it (it would just raise, but keep the surface closed).
--
-- Idempotent: REVOKE of an absent grant is a no-op.

REVOKE EXECUTE ON FUNCTION public.enforce_partner_seat_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_invite_seat_limit()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_partner_access_paused(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_partner_access_paused(uuid, boolean) TO authenticated;
