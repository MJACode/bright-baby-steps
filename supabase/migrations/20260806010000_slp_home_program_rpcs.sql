-- Grace Flare Pro — anonymous home-program access RPCs.
--
-- Families receive a share link containing slp_home_programs.share_token and
-- do NOT have Grace Flare accounts. The table itself has owner-only RLS and
-- no anon policies (see 20260806000000_slp_pro_core.sql); these two
-- SECURITY DEFINER RPCs are the ONLY anonymous surface, and they expose the
-- minimal field set required by the shared page.
--
-- Enumeration hardening: get_home_program returns NULL (not an error) for an
-- unknown/revoked/expired token, so probing gives no signal beyond "no
-- program here". The token itself is 32 random bytes hex (same entropy as
-- partner_invitations.invite_code) — unguessable.
--
-- Grant convention mirrors complete_vpc_second_confirmation
-- (20260508010000): explicit GRANT to anon + authenticated, no REVOKE FROM
-- PUBLIC needed since anon/authenticated are the callers we want anyway.

-- ── get_home_program(_token) — read the shared program. ─────────────────────
create or replace function public.get_home_program(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _result jsonb;
begin
  select jsonb_build_object(
    'clientName', c.display_name,
    'weekStart', hp.week_start,
    'plan', hp.plan,
    -- to_jsonb so the smallint[] serializes as a JSON array, not a
    -- Postgres array literal string.
    'completedDays', to_jsonb(hp.completed_days),
    'slp', jsonb_build_object(
      'name', p.full_name,
      'credentials', p.credentials,
      'practice', p.practice_name
    )
  )
  into _result
  from public.slp_home_programs hp
  join public.slp_clients c on c.id = hp.client_id
  join public.slp_profiles p on p.user_id = hp.slp_id
  where hp.share_token = _token
    and hp.status = 'active'
    and hp.expires_at > now();

  -- NULL when not found / revoked / expired — no error, no enumeration
  -- signal.
  return _result;
end;
$$;

grant execute on function public.get_home_program(text) to anon, authenticated;

comment on function public.get_home_program(text) is
  'Anonymous read of a shared SLP home program by share_token. SECURITY '
  'DEFINER because slp_home_programs has owner-only RLS and families have no '
  'account. Returns the minimal {clientName, weekStart, plan, completedDays, '
  'slp{name,credentials,practice}} shape, or NULL for unknown/revoked/expired '
  'tokens.';

-- ── toggle_home_program_day(_token, _day) — family check-off. ───────────────
create or replace function public.toggle_home_program_day(_token text, _day smallint)
returns smallint[]
language plpgsql
security definer
set search_path = public
as $$
declare
  _next smallint[];
begin
  if _day is null or _day < 1 or _day > 7 then
    raise exception 'invalid day';
  end if;

  -- Single atomic UPDATE: toggle membership of _day in completed_days.
  -- Concurrent toggles serialize on the row lock, so the read-modify-write
  -- inside the CASE is race-free.
  update public.slp_home_programs
  set completed_days = case
        when _day = any(completed_days) then array_remove(completed_days, _day)
        else array_append(completed_days, _day)
      end,
      updated_at = now()
  where share_token = _token
    and status = 'active'
    and expires_at > now()
  returning completed_days into _next;

  if not found then
    raise exception 'not found';
  end if;

  return _next;
end;
$$;

grant execute on function public.toggle_home_program_day(text, smallint) to anon, authenticated;

comment on function public.toggle_home_program_day(text, smallint) is
  'Anonymous per-day check-off on a shared SLP home program, keyed by '
  'share_token. Atomically toggles _day (1..7) in completed_days and returns '
  'the updated array. Raises ''invalid day'' for out-of-range days and '
  '''not found'' for unknown/revoked/expired tokens.';
