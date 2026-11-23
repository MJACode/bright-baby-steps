-- Solids avoid list (Phase 1) + feeding_logs.food_slug (Phase 2 catalog link).
--
-- Plan: tasks/todo-solids-avoid-and-serve.md (founder-approved 2026-11-22).
--
-- 1. public.child_food_avoidances — foods a family avoids for one child.
--   * Exactly one of food_slug (a curated catalog slug from
--     supabase/functions/_shared/foodCatalog.ts) or custom_food (free text,
--     "Other", trimmed, 1–80 chars). CHECK child_food_avoidances_one_food.
--     The DB can't see the TS catalog, so food_slug is only format-checked;
--     unknown slugs are ignored by every reader (deriveAvoidSlugs).
--   * reason: 'reaction' (from Log solids "Reaction noted"; never expires) or
--     'preference' ("Not for us" on a meal-plan food; the client offers a
--     dismissible "Try again?" after 4 weeks and stamps retry_dismissed_at).
--   * One row per child + catalog slug (UNIQUE
--     child_food_avoidances_child_slug_key; NULL food_slug rows are distinct,
--     so it acts as the partial index on food_slug IS NOT NULL), so the client
--     upserts / changes reason instead of stacking rows. custom_food
--     rows are not deduplicated (free text; the UI owns that).
--   * source_feeding_log_id: the solids log the reaction was noted on.
--     ON DELETE SET NULL: deleting the log keeps the avoidance (a reaction is
--     still a reaction). The guard trigger requires the log to belong to the
--     same child and be visible to the writer (SECURITY INVOKER EXISTS), so an
--     id from another family can't be linked (or probed via the FK check).
--   * created_by: the writer (owner or partner), DEFAULT auth.uid(), pinned to
--     auth.uid() on INSERT by the policy and immutable on UPDATE by the guard
--     trigger (lessons-backend 2026-10-17: author columns must be unforgeable).
--     FK to auth.users ON DELETE SET NULL so a partner's account deletion
--     doesn't block on, or delete, the family's record.
--   * Who reads it: generate-meal-plan (food_slug rows, any reason, under the
--     caller's RLS; excluded from the eligible list, never sent to Anthropic),
--     the data export, the pediatrician report, and get_food_avoidances() for
--     the parent's own Claude via the mcp function. custom_food rows are
--     record-only (founder decision): they never filter the plan.
--
-- 2. feeding_logs.food_slug — nullable catalog link set by the Log solids
--    autocomplete (Phase 2). Free text in food_description stays allowed.
--    Format CHECK only. No policy change: feeding_logs' live policies are
--    child-pivot (can_access_child / can_write_child) and cover new columns.
--    get_recent_feeds() returns SETOF feeding_logs via SELECT *, so the MCP
--    feeds tool picks the column up with no redefinition.
--
-- RLS — copied from the LIVE feeding_logs / allergen_introductions policies
-- (pg_policies, read 2026-11-22), the child-pivot shape from
-- 20260820000000_child_pivot_log_rls.sql as later re-gated by
-- 20261001000000 / 20261005000000 (can_write_child requires an active
-- partner_access row with role coparent|caregiver AND
-- partner_within_entitlement; can_access_child also requires the
-- entitlement). Viewer-role partners can read but not write, the same as
-- 20260501010000_harden_partner_role_rls.sql intended.
--   SELECT  can_access_child(auth.uid(), child_id)
--   INSERT  can_write_child(auth.uid(), child_id) AND created_by = auth.uid()
--           (the live tables pin parent_id = auth.uid(); this table's author
--           column is created_by)
--   UPDATE  USING / WITH CHECK can_write_child(auth.uid(), child_id) — WITH
--           CHECK written out, not left to the USING default, so a writer
--           can't move a row onto a child they can't write.
--   DELETE  can_write_child(auth.uid(), child_id) (remove from the list).
-- Both helpers are SECURITY DEFINER and already GRANTed to authenticated.
--
-- Deletion / purge coverage (verified on live 2026-11-22):
--   * child_id REFERENCES children ON DELETE CASCADE, like the other 50
--     child-scoped tables.
--   * delete_user_account() -> _purge_user_data(_uid) runs
--     DELETE FROM public.children WHERE parent_id = _uid, which cascades here
--     (partner-written rows on the owner's child included), then
--     DELETE FROM auth.users, which nulls created_by on any rows this user
--     wrote for another family's child. No parent_id column, so no purge-order
--     edit — and per lessons-backend 2026-05-24, delete_user_account() is NOT
--     redefined here.
--
-- Grants: none for the table (20261009000000_default_table_privileges gives a
-- new public table S/I/U/D to authenticated, nothing to anon; RLS is the
-- gate). get_food_avoidances() needs an explicit GRANT to authenticated
-- (default EXECUTE is off since 20261008020000). The guard trigger function
-- has EXECUTE revoked from client roles (trigger firing doesn't check it).
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- guarded ADD CONSTRAINT, CREATE OR REPLACE FUNCTION, DROP TRIGGER/POLICY IF
-- EXISTS + CREATE, COMMENT is a replace. A re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. public.child_food_avoidances
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.child_food_avoidances (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id              uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  food_slug             text,
  custom_food           text,
  reason                text        NOT NULL,
  note                  text,
  source_feeding_log_id uuid        REFERENCES public.feeding_logs(id) ON DELETE SET NULL,
  retry_dismissed_at    timestamptz,
  created_by            uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Named CHECKs, added guarded so a table created by an earlier draft
-- converges (CREATE TABLE IF NOT EXISTS skips inline constraints).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.child_food_avoidances'::regclass
                    AND conname = 'child_food_avoidances_one_food') THEN
    ALTER TABLE public.child_food_avoidances
      ADD CONSTRAINT child_food_avoidances_one_food
      CHECK ((food_slug IS NULL) <> (custom_food IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.child_food_avoidances'::regclass
                    AND conname = 'child_food_avoidances_food_slug_format') THEN
    ALTER TABLE public.child_food_avoidances
      ADD CONSTRAINT child_food_avoidances_food_slug_format
      CHECK (food_slug IS NULL
             OR (char_length(food_slug) <= 64 AND food_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.child_food_avoidances'::regclass
                    AND conname = 'child_food_avoidances_custom_food_valid') THEN
    -- The guard trigger trims first; this rejects what's left if empty / long.
    ALTER TABLE public.child_food_avoidances
      ADD CONSTRAINT child_food_avoidances_custom_food_valid
      CHECK (custom_food IS NULL
             OR (custom_food = btrim(custom_food) AND char_length(custom_food) BETWEEN 1 AND 80));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.child_food_avoidances'::regclass
                    AND conname = 'child_food_avoidances_reason_valid') THEN
    ALTER TABLE public.child_food_avoidances
      ADD CONSTRAINT child_food_avoidances_reason_valid
      CHECK (reason IN ('reaction', 'preference'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.child_food_avoidances'::regclass
                    AND conname = 'child_food_avoidances_note_length') THEN
    ALTER TABLE public.child_food_avoidances
      ADD CONSTRAINT child_food_avoidances_note_length
      CHECK (note IS NULL OR char_length(note) <= 500);
  END IF;
END $$;

-- One row per child + catalog food. A full UNIQUE constraint rather than a
-- partial index WHERE food_slug IS NOT NULL: Postgres treats NULLs as
-- distinct (NULLS DISTINCT is the default), so custom_food rows (food_slug
-- NULL) never collide — the same semantics as the partial index — but a
-- constraint is what PostgREST's upsert needs
-- (.upsert(row, { onConflict: "child_id,food_slug" })); ON CONFLICT can't
-- infer a partial index without its WHERE clause, which PostgREST doesn't
-- send. Also serves the meal-plan read (child_id = ? AND food_slug IS NOT NULL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.child_food_avoidances'::regclass
                    AND conname = 'child_food_avoidances_child_slug_key') THEN
    ALTER TABLE public.child_food_avoidances
      ADD CONSTRAINT child_food_avoidances_child_slug_key UNIQUE (child_id, food_slug);
  END IF;
END $$;

-- No separate child_id index: the UNIQUE above leads with child_id, so it
-- already serves the RLS filter, list reads (custom_food rows included) and
-- the children FK cascade.

-- FK ON DELETE SET NULL targets: keep feeding_logs / auth.users deletes off a seq scan.
CREATE INDEX IF NOT EXISTS idx_child_food_avoidances_source_log
  ON public.child_food_avoidances (source_feeding_log_id)
  WHERE source_feeding_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_child_food_avoidances_created_by
  ON public.child_food_avoidances (created_by)
  WHERE created_by IS NOT NULL;

-- Same trigger name + helper as allergen_introductions on live
-- (set_updated_at -> public.update_updated_at()). Don't redefine the helper.
DROP TRIGGER IF EXISTS set_updated_at ON public.child_food_avoidances;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.child_food_avoidances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Write guard:
--   * trims custom_food (blank -> NULL, so the one-food CHECK reports it);
--   * created_by immutable on UPDATE (INSERT is pinned by the policy),
--     except the FK's own ON DELETE SET NULL when the author's account is
--     deleted (otherwise this trigger would block account deletion);
--   * child_id immutable on UPDATE (move = delete + insert, both policied);
--   * source_feeding_log_id must be a log for the same child that the writer
--     can see. SECURITY INVOKER on purpose: the EXISTS runs under the
--     writer's feeding_logs RLS, so another family's log id reads as absent.
--     It only re-checks when the link changes, so an owner editing a
--     partner-linked row isn't blocked.
-- Errors are check_violation (23514 -> PostgREST 400) with stable messages.
CREATE OR REPLACE FUNCTION public.child_food_avoidances_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.custom_food IS NOT NULL THEN
    NEW.custom_food := NULLIF(btrim(NEW.custom_food), '');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The one legitimate change is the auth.users FK's ON DELETE SET NULL,
    -- which runs as a nested (RI) trigger: pg_trigger_depth() > 1. A client
    -- UPDATE is depth 1 and can't touch created_by at all.
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (NEW.created_by IS NULL AND pg_trigger_depth() > 1) THEN
      RAISE EXCEPTION 'food_avoidance_author_immutable'
        USING ERRCODE = 'check_violation',
              DETAIL = 'created_by is set once, on insert.';
    END IF;
    IF NEW.child_id IS DISTINCT FROM OLD.child_id THEN
      RAISE EXCEPTION 'food_avoidance_child_immutable'
        USING ERRCODE = 'check_violation',
              DETAIL = 'child_id cannot change on a food avoidance.';
    END IF;
  END IF;

  IF NEW.source_feeding_log_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.source_feeding_log_id IS DISTINCT FROM OLD.source_feeding_log_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.feeding_logs fl
        WHERE fl.id = NEW.source_feeding_log_id
          AND fl.child_id = NEW.child_id
     ) THEN
    RAISE EXCEPTION 'food_avoidance_source_log_mismatch'
      USING ERRCODE = 'check_violation',
            DETAIL = 'source_feeding_log_id must be a feeding log for the same child.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.child_food_avoidances_guard_write() FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire in name order: child_food_avoidances_guard_write
-- before set_updated_at.
DROP TRIGGER IF EXISTS child_food_avoidances_guard_write ON public.child_food_avoidances;
CREATE TRIGGER child_food_avoidances_guard_write
  BEFORE INSERT OR UPDATE ON public.child_food_avoidances
  FOR EACH ROW
  EXECUTE FUNCTION public.child_food_avoidances_guard_write();

ALTER TABLE public.child_food_avoidances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_child_access_child_food_avoidances ON public.child_food_avoidances;
CREATE POLICY select_child_access_child_food_avoidances
  ON public.child_food_avoidances
  FOR SELECT
  USING (public.can_access_child(auth.uid(), child_id));

DROP POLICY IF EXISTS insert_child_write_child_food_avoidances ON public.child_food_avoidances;
CREATE POLICY insert_child_write_child_food_avoidances
  ON public.child_food_avoidances
  FOR INSERT
  WITH CHECK (public.can_write_child(auth.uid(), child_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS update_child_write_child_food_avoidances ON public.child_food_avoidances;
CREATE POLICY update_child_write_child_food_avoidances
  ON public.child_food_avoidances
  FOR UPDATE
  USING (public.can_write_child(auth.uid(), child_id))
  WITH CHECK (public.can_write_child(auth.uid(), child_id));

DROP POLICY IF EXISTS delete_child_write_child_food_avoidances ON public.child_food_avoidances;
CREATE POLICY delete_child_write_child_food_avoidances
  ON public.child_food_avoidances
  FOR DELETE
  USING (public.can_write_child(auth.uid(), child_id));

-- Hard assertion (lessons-backend 2026-07-29): exactly these 4 policies, no
-- FOR ALL, RLS on, anon has no table privilege.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'child_food_avoidances';
  IF n <> 4 THEN
    RAISE EXCEPTION 'child_food_avoidances: expected 4 policies, found %', n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'child_food_avoidances' AND cmd = 'ALL') THEN
    RAISE EXCEPTION 'child_food_avoidances: unexpected FOR ALL policy';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.child_food_avoidances'::regclass) THEN
    RAISE EXCEPTION 'child_food_avoidances: RLS is not enabled';
  END IF;
  IF has_table_privilege('anon', 'public.child_food_avoidances', 'SELECT') THEN
    RAISE EXCEPTION 'child_food_avoidances: anon must not have SELECT';
  END IF;
END $$;

COMMENT ON TABLE public.child_food_avoidances IS
  'Foods a family avoids for one child (Solids avoid list). Exactly one of '
  'food_slug (catalog slug, supabase/functions/_shared/foodCatalog.ts) or '
  'custom_food (free text, record-only). reason reaction|preference. '
  'generate-meal-plan excludes food_slug rows (any reason) from the eligible '
  'list server-side; the avoid list is never sent to Anthropic. Child-pivot '
  'RLS (can_access_child / can_write_child), created_by pinned to the writer. '
  'Cascade-deleted with children.';

-- ---------------------------------------------------------------------------
-- 2. feeding_logs.food_slug
-- ---------------------------------------------------------------------------

ALTER TABLE public.feeding_logs
  ADD COLUMN IF NOT EXISTS food_slug text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.feeding_logs'::regclass
                    AND conname = 'feeding_logs_food_slug_format') THEN
    ALTER TABLE public.feeding_logs
      ADD CONSTRAINT feeding_logs_food_slug_format
      CHECK (food_slug IS NULL
             OR (char_length(food_slug) <= 64 AND food_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
  END IF;
END $$;

COMMENT ON COLUMN public.feeding_logs.food_slug IS
  'Catalog slug (supabase/functions/_shared/foodCatalog.ts) chosen in the Log '
  'solids autocomplete. NULL for free-text foods and non-solid feeds. '
  'food_description stays the parent-visible text.';

-- ---------------------------------------------------------------------------
-- 3. get_food_avoidances(_child_id) — MCP read RPC
-- ---------------------------------------------------------------------------
-- Same pattern as get_allergens (20260528000000_child_data_query_rpcs.sql):
-- SECURITY INVOKER, STABLE, RLS does the filtering, a caller without access
-- gets '[]'. Exposed to the parent's own Claude as the get_food_avoidances
-- tool (supabase/functions/_shared/childDataTools.ts). created_by is left out
-- (a uid is meaningless to the reader).

CREATE OR REPLACE FUNCTION public.get_food_avoidances(_child_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', fa.id,
    'food_slug', fa.food_slug,
    'custom_food', fa.custom_food,
    'reason', fa.reason,
    'note', fa.note,
    'source_feeding_log_id', fa.source_feeding_log_id,
    'retry_dismissed_at', fa.retry_dismissed_at,
    'created_at', fa.created_at,
    'updated_at', fa.updated_at
  ) ORDER BY fa.created_at DESC), '[]'::jsonb)
  FROM public.child_food_avoidances fa
  WHERE fa.child_id = _child_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_food_avoidances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_food_avoidances(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_food_avoidances(uuid) IS
  'The child''s Solids avoid list as a jsonb array (newest first): food_slug '
  'or custom_food, reason (reaction|preference), note, dates. RLS-bound '
  '(SECURITY INVOKER); [] when the caller cannot see the child.';
