-- Phase 4 rollback

DROP TRIGGER IF EXISTS set_api_keys_updated_at ON api_keys;

ALTER TABLE runs DROP COLUMN IF EXISTS geo_locations;
ALTER TABLE load_profiles DROP COLUMN IF EXISTS regions;
ALTER TABLE gates DROP COLUMN IF EXISTS capacity_floor;
ALTER TABLE gates DROP COLUMN IF EXISTS resource_floor_conditions;

DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS capacity_reports;
DROP TABLE IF EXISTS ml_attributions;
DROP TABLE IF EXISTS forecasts;
DROP TABLE IF EXISTS crux_snapshots;
DROP TABLE IF EXISTS rum_events;
