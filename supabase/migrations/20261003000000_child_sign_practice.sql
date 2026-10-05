-- Baby Signs v2 (PR-C): practice ticks.
--
-- Spec: specs/001-baby-signs-v2 (data-model.md child_sign_practice, FR-014,
-- FR-019, FR-029; research R4 for the tracking-day key).
--
-- Design:
--   * One row per (child, sign, tracking day). Insert = tick, delete =
--     un-tick. There is no UPDATE path (no UPDATE policy), so a row is never
--     rewritten; the client inserts with ON CONFLICT DO NOTHING so a double
--     tap (or two caregivers ticking the same sign the same day) is a no-op.
--   * No FK to child_signs: practice history survives a cleared status
--     (the v1 re-tap that deletes the child_signs row). FR-029.
--   * sign_slug is a bounded slug referencing client-side static content
--     (src/data/signLibrary.ts). There is NO free-text column — COPPA data
--     minimization (FR-019). Do not add one. The slug is also bounded at
--     the DB by CHECK child_sign_practice_slug_format
--     (^[a-z][a-z0-9-]{0,39}$), so the column can't carry free text either.
--   * Deletion: child_id ON DELETE CASCADE (child removed) and parent_id ON
--     DELETE CASCADE from auth.users. delete_user_account() /
--     _purge_user_data(_uid) ends with DELETE FROM auth.users, which
--     cascades here (and via children), so no purge-order edit is needed —
--     per the 2026-05-24 lesson, do NOT redefine delete_user_account() here.
--
-- RLS: owner-keyed (parent_id = the child's OWNER, never the writer), same
-- as child_signs after 20260930010000_child_signs_rls_bind_child.sql:
--   SELECT  auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)
--   INSERT  partner_can_write(parent_id) AND child_id belongs to parent_id
--           (the EXISTS binding stops a stranger stamping their own uid as
--           parent_id for another family's child)
--   DELETE  partner_can_write(parent_id)
--   UPDATE  no policy -> denied
-- Plain auth.uid() (not the `(select auth.uid())` initplan form) for parity
-- with child_signs; no migration in this repo uses the select form yet.
--
-- Grants: none added. Recent table migrations (child_signs) rely on the
-- project's pg_default_acl for anon/authenticated/service_role table
-- privileges; RLS is the gate (anon fails every policy: auth.uid() is NULL).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE POLICY, COMMENT is a replace.

CREATE TABLE IF NOT EXISTS public.child_sign_practice (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sign_slug     text        NOT NULL,
  practiced_on  date        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_sign_practice_once UNIQUE (child_id, sign_slug, practiced_on),
  -- Bounded kebab-case slug, <= 40 chars: the DB-level backing for "no free
  -- text" (all 20 slugs in src/data/signLibrary.ts match).
  CONSTRAINT child_sign_practice_slug_format CHECK (sign_slug ~ '^[a-z][a-z0-9-]{0,39}$')
);

-- Guard for a table created without the slug CHECK (CREATE TABLE IF NOT
-- EXISTS would skip the inline constraint). No-op once present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.child_sign_practice'::regclass
       AND conname = 'child_sign_practice_slug_format'
  ) THEN
    ALTER TABLE public.child_sign_practice
      ADD CONSTRAINT child_sign_practice_slug_format
      CHECK (sign_slug ~ '^[a-z][a-z0-9-]{0,39}$');
  END IF;
END $$;

-- Weekly / 4-week range reads per child.
CREATE INDEX IF NOT EXISTS idx_child_sign_practice_child_day
  ON public.child_sign_practice (child_id, practiced_on);

-- Covers the parent_id FK (auth.users cascade) and the RLS parent_id filter.
CREATE INDEX IF NOT EXISTS idx_child_sign_practice_parent
  ON public.child_sign_practice (parent_id);

ALTER TABLE public.child_sign_practice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_sign_practice_select ON public.child_sign_practice;
CREATE POLICY child_sign_practice_select
  ON public.child_sign_practice
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS child_sign_practice_insert ON public.child_sign_practice;
CREATE POLICY child_sign_practice_insert
  ON public.child_sign_practice
  FOR INSERT
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = child_sign_practice.child_id
         AND c.parent_id = child_sign_practice.parent_id
    )
  );

DROP POLICY IF EXISTS child_sign_practice_delete ON public.child_sign_practice;
CREATE POLICY child_sign_practice_delete
  ON public.child_sign_practice
  FOR DELETE
  USING (public.partner_can_write(parent_id));

-- Intentionally NO UPDATE policy: ticks are insert/delete only.

COMMENT ON TABLE public.child_sign_practice IS
  'Baby Signs practice ticks: one row per (child_id, sign_slug, practiced_on '
  'tracking day). Insert = tick (ON CONFLICT DO NOTHING), delete = un-tick; '
  'no UPDATE policy. sign_slug is a bounded slug referencing client-side '
  'static content (src/data/signLibrary.ts) — Do NOT widen to free text '
  '(COPPA data minimization). No FK to child_signs so history survives a '
  'cleared status. parent_id is the child OWNER. Cascade-deleted with '
  'children or auth.users.';
