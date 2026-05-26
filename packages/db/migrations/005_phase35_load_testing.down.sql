-- Phase 3.5 rollback

DROP TRIGGER IF EXISTS set_load_runs_updated_at ON load_runs;
DROP TRIGGER IF EXISTS set_load_profiles_updated_at ON load_profiles;

ALTER TABLE projects DROP COLUMN IF EXISTS engine_concurrency_caps;
ALTER TABLE projects DROP COLUMN IF EXISTS load_quota;
ALTER TABLE gates DROP COLUMN IF EXISTS vu_thresholds;
ALTER TABLE gates DROP COLUMN IF EXISTS load_profile_id;

DROP TABLE IF EXISTS server_resource_snapshots;
DROP TABLE IF EXISTS load_runs;
DROP TABLE IF EXISTS load_profiles;
