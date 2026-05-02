ALTER TABLE feeding_logs
ADD COLUMN IF NOT EXISTS duration_minutes_left integer,
ADD COLUMN IF NOT EXISTS duration_minutes_right integer;
