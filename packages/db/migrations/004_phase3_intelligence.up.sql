-- Phase 3: Intelligence — anomalies, change-point detection, executive reports, NL authoring

-- ============================================================
-- Extend baselines with seasonality buckets
-- ============================================================
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS day_of_week SMALLINT;          -- 0=Sunday..6=Saturday, NULL=all
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS hour_bucket SMALLINT;           -- 0-23 hour bin, NULL=all
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS seasonality_bucket TEXT;        -- custom bucket label (e.g., "peak_hours")

CREATE INDEX IF NOT EXISTS idx_baselines_seasonality
    ON baselines(project_id, metric, environment, day_of_week, hour_bucket);

-- ============================================================
-- anomalies — flagged by change-point detection / ML
-- ============================================================
CREATE TABLE IF NOT EXISTS anomalies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id          UUID REFERENCES runs(id) ON DELETE SET NULL,
    metric          TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'warning'
                    CHECK (severity IN ('info', 'warning', 'critical')),
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
    detector        TEXT NOT NULL,                       -- 'cusum', 'ewma', 'threshold', 'manual'
    description     TEXT NOT NULL,                       -- human-readable explanation
    details         JSONB NOT NULL DEFAULT '{}',         -- detector-specific data
    attribution     JSONB,                               -- root-cause attribution result
    change_point_at TIMESTAMPTZ,                         -- estimated time of the change
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id),
    feedback        TEXT CHECK (feedback IN ('correct', 'incorrect', 'partial')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_project ON anomalies(project_id, status);
CREATE INDEX IF NOT EXISTS idx_anomalies_metric ON anomalies(project_id, metric, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_run ON anomalies(run_id);

CREATE TRIGGER set_updated_at_anomalies
    BEFORE UPDATE ON anomalies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- report_snapshots — executive and team reports
-- ============================================================
CREATE TABLE IF NOT EXISTS report_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_type     TEXT NOT NULL
                    CHECK (report_type IN ('executive', 'team_scorecard', 'weekly_digest', 'monthly_digest')),
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,
    team            TEXT,                                -- for team_scorecard type
    data            JSONB NOT NULL,                      -- full report payload
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON report_snapshots(project_id, report_type, period_end DESC);

-- ============================================================
-- nl_generation_logs — NL test authoring audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS nl_generation_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    script_id       UUID REFERENCES scripts(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    prompt          TEXT NOT NULL,                       -- user's NL prompt
    target_url      TEXT,                                -- target URL for recon
    pipeline_stages JSONB NOT NULL DEFAULT '[]',         -- per-stage results
    generated_script JSONB,                              -- final canonical JSON
    confidence_scores JSONB,                             -- per-step confidence
    clarifying_questions JSONB,                          -- questions for user
    model_version   TEXT,                                -- LLM model used
    generation_time_ms INTEGER,                          -- wall time
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'validated', 'committed', 'failed')),
    validation_result JSONB,                             -- lint, type-check, dry-run
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_logs_project ON nl_generation_logs(project_id, created_at DESC);

-- ============================================================
-- digest_schedules — scheduled notification digests
-- ============================================================
CREATE TABLE IF NOT EXISTS digest_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    channel_id      UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
    digest_type     TEXT NOT NULL
                    CHECK (digest_type IN ('daily', 'weekly', 'monthly')),
    cron_expression TEXT NOT NULL,                       -- when to send
    config          JSONB NOT NULL DEFAULT '{}',         -- what to include
    enabled         BOOLEAN NOT NULL DEFAULT true,
    last_sent_at    TIMESTAMPTZ,
    next_send_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digest_schedules_next ON digest_schedules(next_send_at) WHERE enabled = true;

CREATE TRIGGER set_updated_at_digest_schedules
    BEFORE UPDATE ON digest_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
