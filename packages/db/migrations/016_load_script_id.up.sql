-- Add script_id to load_runs and load_profiles so load tests can execute
-- multi-step journey scripts instead of only single-URL tests.

ALTER TABLE load_runs ADD COLUMN IF NOT EXISTS script_id UUID REFERENCES scripts(id) ON DELETE SET NULL;
ALTER TABLE load_profiles ADD COLUMN IF NOT EXISTS script_id UUID REFERENCES scripts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_load_runs_script ON load_runs(script_id);
