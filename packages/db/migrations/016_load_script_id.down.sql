DROP INDEX IF EXISTS idx_load_runs_script;
ALTER TABLE load_runs DROP COLUMN IF EXISTS script_id;
ALTER TABLE load_profiles DROP COLUMN IF EXISTS script_id;
