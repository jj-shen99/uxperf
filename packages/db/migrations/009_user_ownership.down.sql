DROP INDEX IF EXISTS idx_runs_user_id;
DROP INDEX IF EXISTS idx_scripts_user_id;
ALTER TABLE runs    DROP COLUMN IF EXISTS user_id;
ALTER TABLE scripts DROP COLUMN IF EXISTS user_id;
