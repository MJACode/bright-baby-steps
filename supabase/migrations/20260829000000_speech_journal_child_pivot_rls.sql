-- Bring `speech_journal` onto the child_id access pivot.
--
-- `20260820000000_child_pivot_log_rls.sql` moved 17 log tables from the
-- client-supplied `parent_id` pivot to the server-verifiable `child_id` pivot.
-- `speech_journal` was not in any of its three groups and was never in the
-- `20260501010000` harden list either, so it is the last table still running
-- the original 2026-03 policy:
--
--   CREATE POLICY "Parents can manage own journal entries"
--   ON public.speech_journal FOR ALL
--   USING ((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id));
--
-- That carries both bugs the pivot migration documents at its lines 14-29:
--
--   1. Partner-written rows are invisible to the child's owner.
--      `has_partner_access` is strictly directional — it matches
--      `partner_id = _user_id AND owner_id = _owner_id` — and
--      `accept_partner_invitation` inserts exactly one (owner_id, partner_id)
--      row. Owner -> partner resolves; partner -> owner does not. A word the
--      co-parent logs carries parent_id = partner uid, and the owner cannot
--      see it.
--
--   2. Read-only viewers can write. A FOR ALL policy with no WITH CHECK reuses
--      USING as the check, and every client insert stamps `parent_id: user.id`,
--      so `auth.uid() = parent_id` is always true and the `partner_can_write`
--      role gate never runs.
--
-- Bug (1) is what makes this urgent rather than cosmetic. The pediatrician
-- report now prints a Word Journal vocabulary count directly above an
-- age-benchmark line. In a two-parent household the owner's export silently
-- drops every word the co-parent logged, so a clinician reads an undercounted
-- expressive-vocabulary figure against a screening benchmark.
--
-- Same four-policy shape and naming as the 17 tables in 20260820000000, so the
-- whole log surface is one pattern. `parent_id` is kept and constrained to the
-- caller's own uid on INSERT — it doubles as authorship.

DROP POLICY IF EXISTS "Parents can manage own journal entries" ON public.speech_journal;

-- Re-run safety: drop the new names too, so this migration is idempotent.
DROP POLICY IF EXISTS select_child_access_speech_journal ON public.speech_journal;
DROP POLICY IF EXISTS insert_child_write_speech_journal  ON public.speech_journal;
DROP POLICY IF EXISTS update_child_write_speech_journal  ON public.speech_journal;
DROP POLICY IF EXISTS delete_child_write_speech_journal  ON public.speech_journal;

CREATE POLICY select_child_access_speech_journal ON public.speech_journal
  FOR SELECT
  USING (public.can_access_child(auth.uid(), child_id));

CREATE POLICY insert_child_write_speech_journal ON public.speech_journal
  FOR INSERT
  WITH CHECK (public.can_write_child(auth.uid(), child_id) AND parent_id = auth.uid());

CREATE POLICY update_child_write_speech_journal ON public.speech_journal
  FOR UPDATE
  USING (public.can_write_child(auth.uid(), child_id))
  WITH CHECK (public.can_write_child(auth.uid(), child_id));

CREATE POLICY delete_child_write_speech_journal ON public.speech_journal
  FOR DELETE
  USING (public.can_write_child(auth.uid(), child_id));

ALTER TABLE public.speech_journal ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Assertion — same backstop as 20260820000000 section 4.
-- ---------------------------------------------------------------------------
-- Postgres ORs permissive policies, so one surviving FOR ALL defeats the four
-- above. A silent partial apply here is a security regression, so fail loudly.
DO $$
DECLARE
  leftovers text;
  policy_count int;
BEGIN
  SELECT string_agg(policyname, ', ') INTO leftovers
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'speech_journal' AND cmd = 'ALL';

  IF leftovers IS NOT NULL THEN
    RAISE EXCEPTION
      'speech_journal RLS migration aborted: leftover FOR ALL policies remain: %',
      leftovers;
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'speech_journal';

  IF policy_count <> 4 THEN
    RAISE EXCEPTION
      'speech_journal RLS migration aborted: expected 4 policies, found %',
      policy_count;
  END IF;
END$$;
