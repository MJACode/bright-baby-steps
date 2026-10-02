-- Baby Signs v2 (PR-B): "focus signs" on child_signs.
--
-- Spec: specs/001-baby-signs-v2 (research.md R2, data-model.md child_signs).
-- Reuse-first: focus is a property of the existing (child, sign)
-- relationship, so it is a nullable column on child_signs rather than a
-- new table. A sign is a focus sign when `focus_since IS NOT NULL`; the
-- value is the tracking-day date it became a focus sign.
--
-- State transitions (client-driven, via the existing upsert):
--   (no row) --focus-->   row inserted, status 'introduced', focus_since = today
--   any      --unfocus--> same status, focus_since = NULL (row is NEVER deleted)
--   any      --clear status (v1 re-tap)--> row deleted (UI confirms first
--            when focus_since is set)
--
-- Limit: at most 3 focus signs per child, enforced by the BEFORE INSERT OR
-- UPDATE OF focus_since trigger below. It raises
--   RAISE EXCEPTION 'focus_limit_reached' USING ERRCODE = 'P0001'
-- which the client maps to "You have 3 focus signs — swap one out first."
-- The count excludes NEW.id AND NEW.sign_slug, so re-stamping an
-- already-focused row (or an unfocus -> refocus of the same row) never
-- counts itself. The sign_slug exclusion is load-bearing for the client's
-- upsert on (child_id, sign_slug): INSERT ... ON CONFLICT fires the BEFORE
-- INSERT trigger with a freshly generated id BEFORE the conflict is
-- detected, so an id-only exclusion would count the existing row for the
-- same sign and falsely raise when the child has exactly 3 focus signs.
-- UNIQUE (child_id, sign_slug) makes "same slug" == "same logical row".
--
-- Concurrency: two caregivers focusing different signs at the same moment
-- could both pass a plain count under READ COMMITTED. The trigger takes a
-- transaction-scoped advisory lock keyed on child_id before counting, so
-- focus writes for the same child serialize; the count statement then takes
-- a fresh READ COMMITTED snapshot that sees the other writer's commit.
-- An advisory lock was chosen over `SELECT ... FROM children FOR UPDATE`
-- because row locks are subject to RLS (FOR UPDATE requires the UPDATE
-- policy to pass): a PERFORM that RLS filters to zero rows takes NO lock and
-- raises no error, so the guard would silently vanish for any writer whose
-- children-UPDATE visibility ever diverges from their child_signs-write
-- rights. It would also block unrelated children updates and FK KEY SHARE
-- checks from every child_id-referencing table. The advisory lock touches
-- no table, is released at commit/rollback, and only ever contends with
-- other focus writes for the same child.
--
-- Security: SECURITY DEFINER, search_path pinned to public (Supabase
-- function_search_path_mutable advisor; same pattern as the
-- 20260516010000 dedupe trigger). DEFINER is deliberate: the limit is an
-- invariant over ALL rows for the child, and an INVOKER count only sees
-- rows the writer's SELECT policy exposes. child_signs RLS is keyed on the
-- row's own parent_id and has_partner_access is directional, so rows
-- written by different caregivers can be invisible to each other and an
-- INVOKER count would undercount (limit bypass). The function only returns
-- NEW or raises; the sole information it reveals is "this child already
-- has 3 focus signs", to a writer who already passed the table's write
-- policy. EXECUTE is revoked from PUBLIC/anon/authenticated (see below).
--
-- RLS unchanged: the existing child_signs_* policies from
-- 20260828000000_child_signs.sql cover the new column. Deletion path
-- unchanged (column rides the existing child/auth.users cascades).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER.

ALTER TABLE public.child_signs
  ADD COLUMN IF NOT EXISTS focus_since date NULL;

-- Partial index: "this child's focus signs" (<= 3 rows) for the trigger
-- count and the This Week focus card.
CREATE INDEX IF NOT EXISTS idx_child_signs_focus
  ON public.child_signs (child_id)
  WHERE focus_since IS NOT NULL;

CREATE OR REPLACE FUNCTION public.child_signs_focus_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _other_focus integer;
BEGIN
  IF NEW.focus_since IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize focus writes per child (see header: advisory, not FOR UPDATE).
  PERFORM pg_advisory_xact_lock(hashtextextended('child_signs_focus:' || NEW.child_id::text, 0));

  SELECT count(*)
    INTO _other_focus
    FROM public.child_signs
   WHERE child_id = NEW.child_id
     AND focus_since IS NOT NULL
     AND id <> NEW.id
     AND sign_slug <> NEW.sign_slug;  -- upsert path: see header

  IF _other_focus >= 3 THEN
    RAISE EXCEPTION 'focus_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only function: no role needs EXECUTE (Postgres checks it at
-- CREATE TRIGGER time, not when the trigger fires — verified on live as
-- `authenticated` under RLS). Revoking clears Supabase advisor lints
-- 0028/0029 (anon/authenticated can execute SECURITY DEFINER function).
-- REVOKE is idempotent.
REVOKE EXECUTE ON FUNCTION public.child_signs_focus_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS child_signs_focus_limit ON public.child_signs;
CREATE TRIGGER child_signs_focus_limit
  BEFORE INSERT OR UPDATE OF focus_since ON public.child_signs
  FOR EACH ROW
  EXECUTE FUNCTION public.child_signs_focus_limit();

COMMENT ON COLUMN public.child_signs.focus_since IS
  'Non-null = this sign is a focus sign for the child; value is the '
  'tracking-day date it became a focus sign. Unfocus sets NULL and never '
  'deletes the row. Max 3 focus signs per child, enforced by the '
  'child_signs_focus_limit trigger (raises P0001 focus_limit_reached).';
