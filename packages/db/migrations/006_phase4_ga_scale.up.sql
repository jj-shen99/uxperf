-- Phase 4: GA, Scale, and Advanced Intelligence
-- Migration 006

-- RUM (Real User Monitoring) events
CREATE TABLE IF NOT EXISTS rum_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_url        TEXT NOT NULL,
  origin          TEXT NOT NULL,
  device_type     TEXT DEFAULT 'desktop',
  connection_type TEXT,
  country_code    TEXT,
  region          TEXT,
  -- Core Web Vitals
  lcp_ms          NUMERIC,
  fcp_ms          NUMERIC,
  inp_ms          NUMERIC,
  cls             NUMERIC,
  ttfb_ms         NUMERIC,
  -- Navigation timing
  dom_interactive_ms  NUMERIC,
  dom_complete_ms     NUMERIC,
  load_event_ms       NUMERIC,
  -- Resource counts
  total_transfer_bytes BIGINT,
  resource_count       INT,
  -- Context
  user_agent      TEXT,
  session_id      TEXT,
  nav_type        TEXT DEFAULT 'navigate',
  sample_rate     NUMERIC DEFAULT 1.0,
  labels          JSONB DEFAULT '{}',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rum_events_project ON rum_events(project_id);
CREATE INDEX idx_rum_events_origin ON rum_events(origin, recorded_at);
CREATE INDEX idx_rum_events_recorded ON rum_events(recorded_at);
CREATE INDEX idx_rum_events_country ON rum_events(country_code, recorded_at);

-- CrUX (Chrome User Experience Report) snapshots
CREATE TABLE IF NOT EXISTS crux_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin          TEXT NOT NULL,
  form_factor     TEXT NOT NULL DEFAULT 'ALL_FORM_FACTORS',
  collection_period_start DATE NOT NULL,
  collection_period_end   DATE NOT NULL,
  -- Metric distributions (JSONB arrays of {start, end, density})
  lcp_histogram   JSONB,
  fcp_histogram   JSONB,
  inp_histogram   JSONB,
  cls_histogram   JSONB,
  ttfb_histogram  JSONB,
  -- p75 summaries
  lcp_p75_ms      NUMERIC,
  fcp_p75_ms      NUMERIC,
  inp_p75_ms      NUMERIC,
  cls_p75         NUMERIC,
  ttfb_p75_ms     NUMERIC,
  -- Assessment
  lcp_rating      TEXT,   -- 'good', 'needs-improvement', 'poor'
  fcp_rating      TEXT,
  inp_rating      TEXT,
  cls_rating      TEXT,
  ttfb_rating     TEXT,
  raw_response    JSONB,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crux_snapshots_project ON crux_snapshots(project_id);
CREATE INDEX idx_crux_snapshots_origin ON crux_snapshots(origin, collection_period_end);

-- Forecasts: stored time-series forecasts
CREATE TABLE IF NOT EXISTS forecasts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric          TEXT NOT NULL,
  environment     TEXT NOT NULL DEFAULT 'staging',
  model           TEXT NOT NULL DEFAULT 'prophet_style',
  horizon_days    INT NOT NULL DEFAULT 30,
  forecast_data   JSONB NOT NULL,
  -- [{date, yhat, yhat_lower, yhat_upper}]
  trend_component JSONB,
  seasonal_component JSONB,
  accuracy        JSONB,
  -- {mape, rmse, mae}
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecasts_project ON forecasts(project_id, metric);

-- ML attributions: SHAP-based feature attribution results
CREATE TABLE IF NOT EXISTS ml_attributions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  anomaly_id        UUID REFERENCES anomalies(id) ON DELETE SET NULL,
  load_run_id       UUID REFERENCES load_runs(id) ON DELETE SET NULL,
  model_version     TEXT NOT NULL DEFAULT 'v1',
  target_metric     TEXT NOT NULL,
  feature_importances JSONB NOT NULL,
  -- [{feature, shap_value, direction, magnitude}]
  top_contributors  JSONB NOT NULL DEFAULT '[]',
  server_resource_features JSONB,
  -- [{feature, shap_value, host}]
  prediction        NUMERIC,
  actual            NUMERIC,
  confidence        NUMERIC,
  explanation       TEXT,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ml_attributions_project ON ml_attributions(project_id);
CREATE INDEX idx_ml_attributions_anomaly ON ml_attributions(anomaly_id);

-- Capacity planning reports
CREATE TABLE IF NOT EXISTS capacity_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_type     TEXT NOT NULL DEFAULT 'capacity_plan',
  max_sustainable_vus INT,
  saturation_metric TEXT,
  saturation_threshold NUMERIC,
  headroom_percent  NUMERIC,
  recommendations   JSONB DEFAULT '[]',
  -- [{resource, current, projected, recommendation}]
  load_runs_analyzed UUID[] DEFAULT '{}',
  forecast_horizon_days INT DEFAULT 90,
  projected_growth  JSONB,
  -- {current_p95, projected_p95, growth_rate}
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_capacity_reports_project ON capacity_reports(project_id);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  details         JSONB DEFAULT '{}',
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_log_project ON audit_log(project_id, created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- API keys for public API / SDK
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  key_prefix      TEXT NOT NULL,      -- first 8 chars for display
  scopes          TEXT[] NOT NULL DEFAULT '{"read"}',
  rate_limit_rpm  INT NOT NULL DEFAULT 60,
  rate_limit_rpd  INT NOT NULL DEFAULT 10000,
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_project ON api_keys(project_id);

-- Resource floor conditions on gates
ALTER TABLE gates ADD COLUMN IF NOT EXISTS resource_floor_conditions JSONB;
-- [{metric: "cpu_percent", operator: "lt", threshold: 80, host_pattern: "*"}]

-- Capacity floor on gates
ALTER TABLE gates ADD COLUMN IF NOT EXISTS capacity_floor JSONB;
-- {min_sustainable_vus: 50, max_event_loop_lag_ms: 100}

-- Multi-geo region on load profiles
ALTER TABLE load_profiles ADD COLUMN IF NOT EXISTS regions TEXT[] DEFAULT '{"us-east-1"}';

-- Multi-geo on WPT runs
ALTER TABLE runs ADD COLUMN IF NOT EXISTS geo_locations TEXT[];

CREATE TRIGGER set_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
