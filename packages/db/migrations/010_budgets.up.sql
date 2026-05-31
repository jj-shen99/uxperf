-- E-28 through E-31: Performance budgets with ratcheting, variance-aware thresholds, device-class segmentation

CREATE TABLE IF NOT EXISTS budgets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  route           TEXT NOT NULL DEFAULT '*',
  metric          TEXT NOT NULL,
  device_class    TEXT NOT NULL DEFAULT 'all' CHECK (device_class IN ('desktop', 'mobile', 'all')),
  threshold       DOUBLE PRECISION NOT NULL,
  original_threshold DOUBLE PRECISION NOT NULL,
  policy          TEXT NOT NULL DEFAULT 'warn' CHECK (policy IN ('block', 'warn', 'info')),
  variance_tolerance DOUBLE PRECISION NOT NULL DEFAULT 0,
  auto_ratchet    BOOLEAN NOT NULL DEFAULT false,
  ratchet_pct     DOUBLE PRECISION NOT NULL DEFAULT 5,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_ratcheted_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, route, metric, device_class)
);

CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_budgets_route ON budgets(project_id, route);
