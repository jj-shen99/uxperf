-- Phase 3.5: Concurrent Load Testing
-- Migration 005

-- Load profiles: reusable load configuration templates
CREATE TABLE IF NOT EXISTS load_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  stages      JSONB NOT NULL DEFAULT '[]',
  -- stages: [{duration_s, target_vus, ramp_type}]
  target_vus  INT NOT NULL DEFAULT 1,
  cache_state TEXT NOT NULL DEFAULT 'warm'
    CHECK (cache_state IN ('cold', 'warm', 'production_replay')),
  ui_server_targets JSONB NOT NULL DEFAULT '[]',
  -- [{host, port, scrape_path, labels}]
  network_profile TEXT,
  device      TEXT DEFAULT 'desktop',
  concurrency_cap INT DEFAULT 10,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_load_profiles_project ON load_profiles(project_id);

-- Load runs: metadata for each load test execution
CREATE TABLE IF NOT EXISTS load_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  load_profile_id UUID REFERENCES load_profiles(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES runs(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'warming', 'running', 'cooling', 'completed', 'failed', 'cancelled')),
  engine          TEXT NOT NULL DEFAULT 'k6_browser',
  target_vus      INT NOT NULL DEFAULT 1,
  actual_peak_vus INT,
  stages          JSONB NOT NULL DEFAULT '[]',
  cache_state     TEXT NOT NULL DEFAULT 'warm',
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  duration_s      NUMERIC,
  vu_minutes      NUMERIC,
  -- cost tracking
  cost_estimate   JSONB,
  -- {vu_minutes, unit_cost, total_cost, currency}
  -- saturation monitoring
  saturation_warnings JSONB DEFAULT '[]',
  -- [{timestamp, metric, value, threshold, message}]
  metrics_summary JSONB,
  -- {http_req_duration_p95, browser_lcp_p95, ...}
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_load_runs_project ON load_runs(project_id);
CREATE INDEX idx_load_runs_status ON load_runs(status);
CREATE INDEX idx_load_runs_profile ON load_runs(load_profile_id);
CREATE INDEX idx_load_runs_run ON load_runs(run_id);

-- Server resource snapshots: telemetry captured during load runs
CREATE TABLE IF NOT EXISTS server_resource_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_run_id UUID NOT NULL REFERENCES load_runs(id) ON DELETE CASCADE,
  host        TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL,
  cpu_percent NUMERIC,
  memory_percent NUMERIC,
  memory_used_bytes BIGINT,
  disk_io_read_bytes BIGINT,
  disk_io_write_bytes BIGINT,
  network_rx_bytes BIGINT,
  network_tx_bytes BIGINT,
  active_connections INT,
  http_request_rate NUMERIC,
  event_loop_lag_ms NUMERIC,
  -- nginx / reverse proxy
  nginx_active_connections INT,
  nginx_requests_per_sec NUMERIC,
  labels      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_snapshots_load_run ON server_resource_snapshots(load_run_id);
CREATE INDEX idx_server_snapshots_ts ON server_resource_snapshots(load_run_id, timestamp);

-- Load-aware gates: extend gates with VU-parameterized thresholds
ALTER TABLE gates ADD COLUMN IF NOT EXISTS load_profile_id UUID REFERENCES load_profiles(id) ON DELETE SET NULL;
ALTER TABLE gates ADD COLUMN IF NOT EXISTS vu_thresholds JSONB;
-- vu_thresholds: [{min_vus, max_vus, threshold_value}]
-- allows tiered thresholds that scale with VU count

-- Load run quotas per project
ALTER TABLE projects ADD COLUMN IF NOT EXISTS load_quota JSONB DEFAULT '{"max_vu_minutes_per_day": 10000, "max_concurrent_load_runs": 3}';

-- Concurrency caps per engine
ALTER TABLE projects ADD COLUMN IF NOT EXISTS engine_concurrency_caps JSONB DEFAULT '{"k6_browser": 5, "playwright_lighthouse": 10, "wpt": 3}';

-- Triggers
CREATE TRIGGER set_load_profiles_updated_at BEFORE UPDATE ON load_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_load_runs_updated_at BEFORE UPDATE ON load_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
