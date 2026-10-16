-- =============================================================================
-- get_family_display_names(_ids uuid[]) — "Logged by" attribution names
-- =============================================================================
-- Why this exists
-- ---------------
-- "Logged by" attribution (useLoggedByNames, FamilyMomentsCard,
-- usePartnerLogToast) always rendered "Partner". Those surfaces read
-- profiles.full_name for OTHER family members, but profiles RLS is own-row
-- only (auth.uid() = id), so every cross-user read returned zero rows.
-- full_name is also NULL for most accounts; the name a family actually uses
-- is the nickname the owner sets in partner_access.label ("Matt", "Barbara").
--
-- This SECURITY DEFINER RPC returns a display name + role for the requested
-- user ids, but ONLY for people who share a family with the caller. It never
-- returns email or any other profile column.
--
-- Family relation
-- ---------------
-- The caller's owners O are:
--   * the caller themself, if they actually own a family (have a child or
--     have issued partner_access) — so a partner with no children of their
--     own is attributed by their partner role, not as an "owner" of nothing;
--   * every owner the caller holds partner_access to with status 'active' or
--     'paused' (revoked callers see nothing).
-- A target id qualifies if it is O, or has ANY partner_access row to O (any
-- status, so a revoked caregiver's past logs still attribute).
--
-- role:         'owner' when target = O, else partner_access.role::text
--               ('coparent' | 'caregiver' | 'viewer').
-- display_name: trimmed partner_access.label (partners only), else first word
--               of trimmed profiles.full_name, else NULL (client falls back to
--               the role title). Capped at 40 chars.
-- Tie-break when a target qualifies through several owners: owner role first,
-- then the caller's own family (pri 0) before families they're a partner in,
-- then owner_id — deterministic.
--
-- auth.uid() NULL (anon / no session) => empty result.
--
-- Grants: client_rpc tier (see 20260930100000_free_partner_seat.sql § 7 and
-- 20261008020000_security_hardening_anon_rpc.sql). anon revoked, authenticated
-- granted, asserted with has_function_privilege below.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT are no-ops on re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_family_display_names(_ids uuid[])
RETURNS TABLE (id uuid, display_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT auth.uid() AS uid
  ),
  owners AS (
    -- The caller's own family (only if they actually own one).
    SELECT c.uid AS owner_id, 0 AS pri
    FROM caller c
    WHERE c.uid IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM public.children ch WHERE ch.parent_id = c.uid)
        OR EXISTS (SELECT 1 FROM public.partner_access pa WHERE pa.owner_id = c.uid)
      )
    UNION
    -- Families the caller currently belongs to as a partner.
    SELECT pa.owner_id, 1 AS pri
    FROM caller c
    JOIN public.partner_access pa ON pa.partner_id = c.uid
    WHERE c.uid IS NOT NULL
      AND pa.status IN ('active', 'paused')
  ),
  candidates AS (
    -- Target is the owner of one of the caller's families.
    SELECT o.owner_id AS id, o.owner_id, 'owner'::text AS role,
           NULL::text AS label, 0 AS kind, o.pri
    FROM owners o
    WHERE o.owner_id = ANY (_ids)
    UNION ALL
    -- Target is (or was) a partner in one of the caller's families.
    SELECT pa.partner_id AS id, o.owner_id, pa.role::text AS role,
           pa.label, 1 AS kind, o.pri
    FROM owners o
    JOIN public.partner_access pa ON pa.owner_id = o.owner_id
    WHERE pa.partner_id = ANY (_ids)
  )
  SELECT DISTINCT ON (c.id)
    c.id,
    left(
      coalesce(
        nullif(btrim(c.label), ''),
        nullif((regexp_split_to_array(btrim(p.full_name), '\s+'))[1], '')
      ),
      40
    ) AS display_name,
    c.role
  FROM candidates c
  LEFT JOIN public.profiles p ON p.id = c.id
  ORDER BY c.id, c.kind, c.pri, c.owner_id;
$$;

COMMENT ON FUNCTION public.get_family_display_names(uuid[]) IS
  'Display name + role for ids that share a family with auth.uid(). Bypasses own-row profiles RLS for attribution only; never returns email. See 20261016100000_family_display_names.sql.';

-- EXECUTE lock-down (client_rpc tier) + hard assertion.
DO $$
DECLARE
  _fn regprocedure := 'public.get_family_display_names(uuid[])'::regprocedure;
BEGIN
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', _fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _fn);

  IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'family_display_names: anon can still EXECUTE %', _fn;
  END IF;
  IF NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'family_display_names: authenticated cannot EXECUTE %', _fn;
  END IF;
END
$$;
