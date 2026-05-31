-- E-39: RUM hourly aggregation table
-- Book Ch 14, p236–237: "Keep raw beacons 7–14 days; keep sketches forever."

CREATE TABLE IF NOT EXISTS rum_hourly_aggregates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin        TEXT NOT NULL,
  page_url      TEXT NOT NULL,
  device_type   TEXT NOT NULL DEFAULT 'desktop',
  country_code  TEXT NOT NULL DEFAULT 'unknown',
  hour_bucket   TIMESTAMPTZ NOT NULL,
  metric        TEXT NOT NULL,
  sample_count  INTEGER NOT NULL DEFAULT 0,
  p50           NUMERIC,
  p75           NUMERIC,
  p90           NUMERIC,
  p95           NUMERIC,
  p99           NUMERIC,
  mean          NUMERIC,
  min_val       NUMERIC,
  max_val       NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, origin, page_url, device_type, country_code, hour_bucket, metric)
);

CREATE INDEX IF NOT EXISTS idx_rum_hourly_project_metric
  ON rum_hourly_aggregates (project_id, metric, hour_bucket DESC);

-- E-41: Add custom_metrics JSONB and build_hash to rum_events for journey tracking
ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS custom_metrics JSONB;
ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS build_hash TEXT;
