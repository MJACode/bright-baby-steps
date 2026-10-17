-- Tell the family when someone leaves a caregiver note.
--
-- Founder decision 2026-10-17 (docs/legal-review-log.md): when a note is
-- written in CaregiverNotePanel (INSERT into public.caregiver_notes), the
-- child's owner and every co-parent who currently has access get an in-app
-- notification (public.notifications, type 'caregiver_note'). The message
-- carries the note text, so tapping the bell shows it in full
-- (NotificationBell renders `message`; the type has no route, so the row
-- isn't a link).
--
-- Recipients, deduplicated, author excluded:
--   * children.parent_id for NEW.child_id (the owner);
--   * partner_access rows for that owner with role 'coparent', status
--     'active', and partner_within_entitlement(owner, partner) — the same
--     "currently has access" definition every partner RLS helper uses, so a
--     paused, revoked or over-seat co-parent is never sent the note text.
--   Caregivers and viewers are not notified (the notes are written FOR the
--   parents). Push: none from here. Push fan-out only runs from the
--   check-notifications cron for rows it inserts; PUSH_COPY.caregiver_note is
--   generic lock-screen copy, ready for when a push path is wired up.
--
-- Author name: partner_access.label the owner set for the author (the name the
-- family actually uses, same as get_family_display_names), else trimmed
-- profiles.full_name, else 'Your caregiver' / 'Your co-parent' by role.
-- Capped at 40 chars. Body: whitespace collapsed, capped at 280 chars with an
-- ellipsis.
--
-- Retention: notifications.caregiver_note_id references the note ON DELETE
-- CASCADE, so the copied note text goes when the note goes — including when
-- the caregiver deletes their account (caregiver_notes.author_id cascades
-- from auth.users) or the child is deleted. A recipient's own rows still go
-- with their account via _purge_user_data (DELETE FROM notifications WHERE
-- user_id = _uid).
--
-- Authorship: the INSERT policy never pinned author_id, so any family writer
-- could insert a note "from" someone else. That was cosmetic in the panel; it
-- isn't once the author's name goes into other people's notifications. The
-- policy is recreated with `author_id = auth.uid()` (the panel already sends
-- user.id). UPDATE is untouched — notifications fire on INSERT only.
--
-- The trigger is SECURITY DEFINER so it can write rows for other users (the
-- notifications INSERT policy is auth.uid() = user_id) and read partner_access
-- / profiles across the family. It never blocks the note: any error becomes a
-- WARNING. No trigger on public.notifications touches this type
-- (notifications_finance_once fires only for the three finance_* types) and
-- notifications.type has no CHECK / enum.
--
-- Idempotent: ADD COLUMN / CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE,
-- DROP ... IF EXISTS + CREATE for the trigger and policy.

-- ── Link each notification copy to its note ────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS caregiver_note_id uuid
  REFERENCES public.caregiver_notes(id) ON DELETE CASCADE;

-- Serves the FK cascade lookup on note delete. Partial: every other type
-- leaves the column NULL.
CREATE INDEX IF NOT EXISTS notifications_caregiver_note_id_idx
  ON public.notifications (caregiver_note_id)
  WHERE caregiver_note_id IS NOT NULL;

COMMENT ON COLUMN public.notifications.caregiver_note_id IS
  'Set only on type ''caregiver_note'' rows: the note whose text the message '
  'copies. ON DELETE CASCADE so the copy never outlives the note.';

-- ── Pin authorship on insert ───────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_writer" ON public.caregiver_notes;
CREATE POLICY "insert_writer" ON public.caregiver_notes
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id
        AND (c.parent_id = auth.uid() OR public.partner_can_write(c.parent_id))
    )
  );

-- ── Fan the note out to the owner + co-parents ─────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_caregiver_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _who text;
  _body text;
  _msg text;
BEGIN
  SELECT c.parent_id INTO _owner FROM public.children c WHERE c.id = NEW.child_id;
  IF _owner IS NULL THEN
    RETURN NEW;
  END IF;

  _who := coalesce(
    (SELECT nullif(btrim(pa.label), '') FROM public.partner_access pa
      WHERE pa.owner_id = _owner AND pa.partner_id = NEW.author_id
      ORDER BY pa.created_at DESC LIMIT 1),
    (SELECT nullif(btrim(p.full_name), '') FROM public.profiles p WHERE p.id = NEW.author_id),
    CASE
      WHEN NEW.author_id = _owner OR EXISTS (
        SELECT 1 FROM public.partner_access pa
        WHERE pa.owner_id = _owner AND pa.partner_id = NEW.author_id AND pa.role = 'coparent'
      ) THEN 'Your co-parent'
      ELSE 'Your caregiver'
    END
  );
  _who := left(_who, 40);

  _body := regexp_replace(btrim(NEW.body), '\s+', ' ', 'g');
  IF _body = '' THEN
    RETURN NEW;
  END IF;
  IF char_length(_body) > 280 THEN
    _body := rtrim(left(_body, 279)) || '…';
  END IF;
  _msg := _who || ' left a note: “' || _body || '”';

  INSERT INTO public.notifications (user_id, child_id, message, type, caregiver_note_id)
  SELECT r.user_id, NEW.child_id, _msg, 'caregiver_note', NEW.id
  FROM (
    SELECT _owner AS user_id
    UNION
    SELECT pa.partner_id
    FROM public.partner_access pa
    WHERE pa.owner_id = _owner
      AND pa.role = 'coparent'
      AND pa.status = 'active'
      AND public.partner_within_entitlement(_owner, pa.partner_id)
  ) r
  WHERE r.user_id IS DISTINCT FROM NEW.author_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_caregiver_note failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_caregiver_note() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS caregiver_notes_notify ON public.caregiver_notes;
CREATE TRIGGER caregiver_notes_notify
  AFTER INSERT ON public.caregiver_notes
  FOR EACH ROW EXECUTE FUNCTION public.notify_caregiver_note();
