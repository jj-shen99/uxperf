DROP TABLE IF EXISTS rum_hourly_aggregates;
ALTER TABLE rum_events DROP COLUMN IF EXISTS custom_metrics;
ALTER TABLE rum_events DROP COLUMN IF EXISTS build_hash;
