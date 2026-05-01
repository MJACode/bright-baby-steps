-- Adds a `source` column to all log tables so we can distinguish voice-logged
-- entries from manual ones (also enables a "saved N taps with voice" stat
-- later).
--
-- Timestamp bumped from 20260429010000 to avoid colliding with the
-- subscriptions migration also applied today.
--
-- Idempotent — safe to re-run. Tables that don't exist (journal_entries,
-- milestones in our schema) are silently skipped by the `if exists` guard.

do $$
declare
  t text;
begin
  foreach t in array array['feeding_logs', 'sleep_logs', 'diaper_logs', 'custom_milestones', 'milestones', 'journal_entries']
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format(
        'alter table public.%I add column if not exists source text not null default ''manual''',
        t
      );
      begin
        execute format(
          'alter table public.%I add constraint %I check (source in (''manual'', ''voice'', ''photo'', ''watch'', ''import''))',
          t, t || '_source_check'
        );
      exception when duplicate_object then null;
      end;
    end if;
  end loop;
end $$;
