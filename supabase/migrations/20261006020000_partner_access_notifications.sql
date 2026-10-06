-- Tell partners when their shared access changes.
--
-- Founder decision 2026-10-06 (docs/legal-review-log.md): a partner gets an
-- in-app notification (public.notifications, type 'partner_access') when the
-- owner pauses, restores or removes them, and when their access goes on hold
-- or comes back because the owner's Flare+ ended or restarted.
--
-- Both triggers are SECURITY DEFINER so they can write a row for another user
-- (the notifications INSERT policy only allows auth.uid() = user_id). They
-- never block the underlying write: any error is swallowed with a WARNING.
-- No email yet — Resend secrets aren't set (see CLAUDE.md, remaining manual
-- steps); notifications show in the bell the next time the partner opens the app.

CREATE OR REPLACE FUNCTION public._partner_owner_label(_owner_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT nullif(trim(full_name), '') FROM public.profiles WHERE id = _owner_id),
    'The parent who invited you'
  );
$$;
REVOKE ALL ON FUNCTION public._partner_owner_label(uuid) FROM PUBLIC, anon, authenticated;

-- ── Owner pauses / restores / removes a partner ─────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_partner_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _who text;
  _msg text;
  _old_rank bigint;
  _limit integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  -- A partner leaving on their own doesn't need telling.
  IF auth.uid() IS NOT DISTINCT FROM NEW.partner_id THEN
    RETURN NEW;
  END IF;

  _who := public._partner_owner_label(NEW.owner_id);
  _msg := CASE
    WHEN OLD.status = 'active' AND NEW.status = 'paused' THEN
      _who || ' paused your shared access. Nothing was deleted, and they can turn it back on anytime.'
    -- Restored, but past the free seat while the owner has no Flare+: the
    -- partner is still on hold, so say that rather than "back on".
    WHEN OLD.status = 'paused' AND NEW.status = 'active'
         AND NOT public.partner_within_entitlement(NEW.owner_id, NEW.partner_id) THEN
      _who || ' turned your shared access back on, but it''s on hold until they restart Flare+. Nothing was deleted.'
    WHEN OLD.status = 'paused' AND NEW.status = 'active' THEN
      _who || ' turned your shared access back on.'
    WHEN NEW.status = 'revoked' AND OLD.status IN ('active', 'paused') THEN
      _who || ' removed your shared access. You can no longer see their child''s records.'
    ELSE NULL
  END;

  IF _msg IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, child_id, message, type)
    VALUES (NEW.partner_id, NULL, _msg, 'partner_access');
  END IF;

  -- Removing someone who held a seat moves everyone behind them up one. The
  -- partner who now fills the last seat came off hold, so tell them.
  IF NEW.status = 'revoked' AND OLD.status IN ('active', 'paused') THEN
    SELECT count(*) + 1 INTO _old_rank
    FROM public.partner_access pa
    WHERE pa.owner_id = NEW.owner_id AND pa.status IN ('active', 'paused')
      AND (pa.created_at, pa.id) < (OLD.created_at, OLD.id);
    _limit := public.partner_seat_limit(NEW.owner_id);

    IF _old_rank <= _limit THEN
      INSERT INTO public.notifications (user_id, child_id, message, type)
      SELECT ranked.partner_id, NULL,
             'Your shared access with ' || _who || ' is back on.', 'partner_access'
      FROM (
        SELECT pa.partner_id, pa.status,
               row_number() OVER (ORDER BY pa.created_at, pa.id) AS seat_rank
        FROM public.partner_access pa
        WHERE pa.owner_id = NEW.owner_id AND pa.status IN ('active', 'paused')
      ) ranked
      WHERE ranked.status = 'active' AND ranked.seat_rank = _limit;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_partner_access_change failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_partner_access_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS partner_access_notify_change ON public.partner_access;
CREATE TRIGGER partner_access_notify_change
  AFTER UPDATE OF status ON public.partner_access
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_access_change();

-- ── Owner's Flare+ ends or restarts → partners beyond the free seat ─────────
-- Free = 1 partner seat, Flare+ = 2 (partner_seat_limit). When Flare+ ends,
-- active partners ranked past the free seat go on hold; when it restarts they
-- come back. Paused partners aren't told: their access is already off.
CREATE OR REPLACE FUNCTION public.notify_partners_on_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := NEW.user_id;
  _was_plus boolean := TG_OP = 'UPDATE'
    AND OLD.tier = 'plus' AND OLD.status IN ('active', 'trialing');
  _is_plus boolean := NEW.tier = 'plus' AND NEW.status IN ('active', 'trialing');
  _who text;
  _msg text;
BEGIN
  -- No DELETE trigger on purpose: a subscriptions row is only deleted when the
  -- account is being purged (_purge_user_data deletes it before
  -- partner_access), and "on hold, it comes back" would be false then. Real
  -- lapses arrive as UPDATEs from billing.
  IF _was_plus = _is_plus THEN
    RETURN NEW;
  END IF;

  _who := public._partner_owner_label(_owner);
  _msg := CASE WHEN _is_plus
    THEN 'Your shared access with ' || _who || ' is back on.'
    ELSE 'Your shared access with ' || _who || ' is on hold because their plan changed. Nothing was deleted. It comes back if they restart Flare+.'
  END;

  -- Active partners whose seat is past the free limit but within Flare+'s,
  -- ranked the same way partner_within_entitlement ranks them. Limits come
  -- from partner_seat_limit, evaluated now that the plan has changed.
  INSERT INTO public.notifications (user_id, child_id, message, type)
  SELECT ranked.partner_id, NULL, _msg, 'partner_access'
  FROM (
    SELECT pa.partner_id, pa.status,
           row_number() OVER (ORDER BY pa.created_at, pa.id) AS seat_rank
    FROM public.partner_access pa
    WHERE pa.owner_id = _owner AND pa.status IN ('active', 'paused')
  ) ranked
  WHERE ranked.status = 'active'
    AND CASE WHEN _is_plus
          -- back on: seats now inside the Flare+ limit that the free limit excluded
          THEN ranked.seat_rank > 1 AND ranked.seat_rank <= public.partner_seat_limit(_owner)
          -- on hold: seats now past the free limit
          ELSE ranked.seat_rank > public.partner_seat_limit(_owner)
        END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_partners_on_plan_change failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_partners_on_plan_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subscriptions_notify_partners ON public.subscriptions;
CREATE TRIGGER subscriptions_notify_partners
  AFTER INSERT OR UPDATE OF tier, status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_partners_on_plan_change();
