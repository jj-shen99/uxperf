-- Reverse Phase 1 schedules migration
DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
ALTER TABLE runs DROP COLUMN IF EXISTS schedule_id;
DROP TABLE IF EXISTS schedules;
