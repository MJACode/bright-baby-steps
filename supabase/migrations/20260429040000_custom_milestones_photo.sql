-- Adds columns to custom_milestones for photo-detected entries.
-- Idempotent.
--
-- `source` was already added to custom_milestones in 20260429020000_log_source.sql,
-- so the `add column if not exists` is a no-op for it. The CHECK constraint
-- `custom_milestones_source_check` was also added there with a slightly broader
-- value set ('manual','voice','photo','watch','import') — this migration's
-- guarded constraint add is a no-op when that exists.
--
-- Timestamp bumped from the handoff's 20260429030000 (collided with cry_analyses).

alter table public.custom_milestones
  add column if not exists category text,
  add column if not exists photo_path text,
  add column if not exists caption text,
  add column if not exists confidence numeric,
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'custom_milestones' and constraint_name = 'custom_milestones_source_check'
  ) then
    alter table public.custom_milestones
      add constraint custom_milestones_source_check
      check (source in ('manual', 'photo', 'voice', 'import'));
  end if;
end $$;
