-- Platform-wide key-value configuration store
CREATE TABLE IF NOT EXISTS platform_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
