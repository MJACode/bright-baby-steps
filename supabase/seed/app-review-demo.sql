-- App Review demo account: appreview@graceflare.com
--
-- WHAT: makes the App Review login a fully onboarded, consented parent with
-- one sample child ("Sunny", about 4 months old), the last 7 days of sleep,
-- feeding and diaper logs, and a few milestones, so Apple's reviewer lands on
-- a populated Home screen and can use every feature.
--
-- THIS IS NOT A MIGRATION. It is never applied by CI. Run it by hand:
--   1. Supabase dashboard -> Authentication -> Users -> Add user -> Create new
--      user. Email: appreview@graceflare.com, choose a strong password, tick
--      "Auto Confirm User".
--   2. Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
--   3. Put the email + password in App Store Connect -> App Review
--      Information -> Sign-in required. The password goes ONLY there (and your
--      password manager). Never commit it to git, a PR, an issue or Slack.
--
-- Re-running is safe. It refreshes the 7-day log window to end "now" (handy
-- if review happens weeks after the first run), so Home never shows "last fed
-- 3 weeks ago". Seeded logs are tagged source = 'import'; a re-run deletes and
-- re-creates only those rows for Sunny, and leaves anything the reviewer logged
-- by hand alone. The child and milestones are created once and kept.
--
-- Consent: this account skips the COPPA email-plus flow (it is our own test
-- login, there is no real child). It is marked honestly with
-- vpc_method = 'app_review_demo' (profiles.vpc_method has no check
-- constraint), so it can be excluded from any consent reporting.
--
-- Flare+: comes from migration 20261103000000_flare_plus_early_access (every
-- account, including ones created later). If that migration isn't on live yet
-- this script still works, but prints a NOTICE that the account isn't Flare+.
--
-- Times are written in America/Los_Angeles (App Review is in Cupertino).
-- Runs as `postgres` in the SQL editor: RLS doesn't apply and the
-- protect_profile_server_columns trigger lets postgres write the vpc_* columns.

DO $$
DECLARE
  _email   constant text := 'appreview@graceflare.com';
  _tz      constant text := 'America/Los_Angeles';
  _uid     uuid;
  _child   uuid;
  _dob     date;
  _today   date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  _d       integer;
  _day     date;
  _j       integer;   -- per-day jitter in minutes, deterministic
  _s       timestamptz;
  _e       timestamptz;
  _nap     record;
  _feed    record;
  _diaper  record;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = _email;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'App Review demo user % does not exist. Create it first: Supabase dashboard -> Authentication -> Users -> Add user (Auto Confirm User on), then re-run this script.', _email;
  END IF;

  -- ── Profile: onboarded + consented ─────────────────────────────────────────
  -- Name shown in the Home greeting comes from auth user_metadata.full_name.
  UPDATE auth.users
     SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('full_name', 'Alex Rivera')
   WHERE id = _uid;

  -- handle_new_user() normally creates this row; cover the case where it didn't.
  INSERT INTO public.profiles (id, email)
  VALUES (_uid, _email)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET
    full_name                           = coalesce(nullif(btrim(full_name), ''), 'Alex Rivera'),
    data_consent_version                = coalesce(data_consent_version, '1.0'),
    data_consent_given_at               = coalesce(data_consent_given_at, now()),
    coppa_direct_notice_acknowledged_at = coalesce(coppa_direct_notice_acknowledged_at, now()),
    coppa_attestation_signed_name       = coalesce(coppa_attestation_signed_name, 'App Review demo account (Grace Flare LLC)'),
    coppa_attestation_signed_at         = coalesce(coppa_attestation_signed_at, now()),
    vpc_method                          = 'app_review_demo',
    vpc_first_confirmation_at           = coalesce(vpc_first_confirmation_at, now()),
    vpc_second_confirmation_at          = coalesce(vpc_second_confirmation_at, now()),
    vpc_completed_at                    = coalesce(vpc_completed_at, now()),
    vpc_second_token                    = NULL,
    vpc_second_token_expires_at         = NULL,
    primary_interest                    = coalesce(primary_interest, 'sleep_feeding'),
    has_partner                         = coalesce(has_partner, false),
    onboarding_completed_at             = coalesce(onboarding_completed_at, now())
  WHERE id = _uid;

  -- ── Child ──────────────────────────────────────────────────────────────────
  SELECT id, date_of_birth INTO _child, _dob
  FROM public.children
  WHERE parent_id = _uid AND name = 'Sunny' AND archived_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF _child IS NULL THEN
    _dob := (_today - interval '4 months')::date;
    INSERT INTO public.children
      (parent_id, name, date_of_birth, gender, is_premature, is_expected,
       interests, temperament, retroactive_setup_completed_at)
    VALUES
      (_uid, 'Sunny', _dob, 'female', false, false,
       ARRAY['music', 'books', 'animals'], 'easygoing', now())
    RETURNING id INTO _child;
  ELSE
    -- Keep Sunny 4 months old on every re-run. Otherwise a review that slips
    -- a month ages her past the 5-month concern flags the milestones below
    -- are meant to avoid.
    _dob := (_today - interval '4 months')::date;
    UPDATE public.children SET date_of_birth = _dob WHERE id = _child;
  END IF;

  -- ── Milestones (created once; ON CONFLICT keeps reviewer edits) ────────────
  -- Every catalogue milestone whose typical window has closed by 4 months is
  -- achieved, so the reviewer isn't shown "talk to your pediatrician" flags
  -- for a made-up baby. Looked up by age, not by id.
  INSERT INTO public.child_speech (child_id, parent_id, milestone_id, status, achieved_at)
  SELECT _child, _uid, s.id, 'achieved',
         least(_today, (_dob + make_interval(months => greatest(s.age_months_typical_end, 1)))::date - 5)
  FROM public.speech s
  WHERE s.age_months_typical_end <= 4
  ON CONFLICT (child_id, milestone_id) DO NOTHING;

  INSERT INTO public.child_speech (child_id, parent_id, milestone_id, status)
  SELECT _child, _uid, s.id, 'emerging'
  FROM public.speech s
  WHERE s.name IN ('Laughs and squeals', 'Reaches and grabs objects')
  ON CONFLICT (child_id, milestone_id) DO NOTHING;

  INSERT INTO public.custom_milestones (child_id, parent_id, name, achieved_at, notes, source)
  SELECT _child, _uid, 'First big belly laugh', _today - 3, 'During bath time, at the rubber duck.', 'import'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.custom_milestones
    WHERE child_id = _child AND name = 'First big belly laugh'
  );

  -- ── Logs: refresh the seeded 7-day window ──────────────────────────────────
  DELETE FROM public.sleep_logs   WHERE child_id = _child AND source = 'import';
  DELETE FROM public.feeding_logs WHERE child_id = _child AND source = 'import';
  DELETE FROM public.diaper_logs  WHERE child_id = _child AND source = 'import';

  FOR _d IN 0..6 LOOP
    _day := _today - (6 - _d);
    _j := (_d * 7) % 20 - 10;   -- -10..+9 min, varies by day

    -- Night sleep ending this morning, split by one night feed.
    FOR _nap IN
      SELECT * FROM (VALUES
        ((_day - 1) + time '19:30', _day + time '01:20', 'night', 'deep'),
        (_day + time '01:55',       _day + time '06:25', 'night', 'normal'),
        (_day + time '08:40',       _day + time '09:55', 'nap',   'normal'),
        (_day + time '12:15',       _day + time '13:45', 'nap',   'deep'),
        (_day + time '16:05',       _day + time '16:45', 'nap',   'restless')
      ) AS v(s_local, e_local, sleep_type, quality)
    LOOP
      _s := (_nap.s_local + make_interval(mins => _j)) AT TIME ZONE _tz;
      _e := (_nap.e_local + make_interval(mins => _j)) AT TIME ZONE _tz;
      CONTINUE WHEN _e > now();
      -- Skip anything that would overlap a sleep the reviewer logged by hand
      -- (sleep_logs has an exclusion constraint on overlapping ranges).
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.sleep_logs x
        WHERE x.child_id = _child
          AND tstzrange(x.started_at, coalesce(x.ended_at, 'infinity')) && tstzrange(_s, _e)
      );
      INSERT INTO public.sleep_logs
        (child_id, parent_id, sleep_type, started_at, ended_at, duration_minutes, quality, source)
      VALUES
        (_child, _uid, _nap.sleep_type, _s, _e,
         (extract(epoch FROM (_e - _s)) / 60)::integer, _nap.quality, 'import');
    END LOOP;

    -- Feeds: breast alternating sides, two bottles.
    FOR _feed IN
      SELECT * FROM (VALUES
        (_day + time '01:30', 'breast', 10, NULL::numeric),
        (_day + time '06:35', 'breast', 16, NULL),
        (_day + time '10:05', 'bottle', NULL, 4.0),
        (_day + time '13:00', 'breast', 14, NULL),
        (_day + time '16:50', 'bottle', NULL, 4.5),
        (_day + time '19:05', 'breast', 18, NULL)
      ) AS v(at_local, feeding_type, minutes, oz)
    LOOP
      _s := (_feed.at_local + make_interval(mins => _j)) AT TIME ZONE _tz;
      CONTINUE WHEN _s > now();
      INSERT INTO public.feeding_logs
        (child_id, parent_id, logged_at, feeding_type, side, duration_minutes, amount_oz, source)
      VALUES
        (_child, _uid, _s, _feed.feeding_type,
         CASE WHEN _feed.feeding_type = 'breast'
              THEN CASE WHEN (_d + extract(hour FROM _feed.at_local)::integer) % 2 = 0 THEN 'left' ELSE 'right' END
         END,
         _feed.minutes, _feed.oz, 'import');
    END LOOP;

    -- Diapers.
    FOR _diaper IN
      SELECT * FROM (VALUES
        (_day + time '01:25', 'wet',   NULL,     NULL),
        (_day + time '06:30', 'wet',   NULL,     NULL),
        (_day + time '09:10', 'dirty', 'yellow', 'soft'),
        (_day + time '12:05', 'wet',   NULL,     NULL),
        (_day + time '15:20', 'both',  'yellow', 'loose'),
        (_day + time '18:45', 'wet',   NULL,     NULL)
      ) AS v(at_local, diaper_type, color, consistency)
    LOOP
      _s := (_diaper.at_local + make_interval(mins => _j)) AT TIME ZONE _tz;
      CONTINUE WHEN _s > now();
      INSERT INTO public.diaper_logs
        (child_id, parent_id, logged_at, diaper_type, color, consistency, source)
      VALUES
        (_child, _uid, _s, _diaper.diaper_type, _diaper.color, _diaper.consistency, 'import');
    END LOOP;
  END LOOP;

  -- ── Report ─────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _uid AND tier = 'plus' AND status IN ('active', 'trialing')
  ) THEN
    RAISE NOTICE 'Heads up: % is not on Flare+ yet. Merge/apply migration 20261103000000_flare_plus_early_access, which grants it to every account.', _email;
  END IF;

  RAISE NOTICE 'App Review demo ready: child % (born %), % sleeps, % feeds, % diapers, % milestones.',
    _child, _dob,
    (SELECT count(*) FROM public.sleep_logs   WHERE child_id = _child),
    (SELECT count(*) FROM public.feeding_logs WHERE child_id = _child),
    (SELECT count(*) FROM public.diaper_logs  WHERE child_id = _child),
    (SELECT count(*) FROM public.child_speech WHERE child_id = _child)
      + (SELECT count(*) FROM public.custom_milestones WHERE child_id = _child);
END;
$$;
