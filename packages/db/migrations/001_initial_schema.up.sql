-- Phase 0: Data-model draft
-- Based on §8.1 of the Frontend Performance Testing Framework Design v1.3

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- projects
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    owner_team      TEXT NOT NULL,
    description     TEXT,
    -- environment configs stored as JSONB: staging/production URLs, domain allowlists
    environment_configs JSONB NOT NULL DEFAULT '{}',
    -- per-project quotas
    quota           JSONB NOT NULL DEFAULT '{
        "max_runs_per_day": 100,
        "max_vu_minutes_per_day": 0,
        "max_llm_tokens_per_day": 0,
        "max_artifact_storage_mb": 5000
    }',
    -- domain allowlist for runtime policy envelope
    domain_allowlist TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- scripts
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authoring_mode') THEN CREATE TYPE authoring_mode AS ENUM ('record', 'template', 'describe', 'manual');

END IF; END $$;

CREATE TABLE IF NOT EXISTS scripts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- canonical JSON script (§7.4)
    canonical_json  JSONB NOT NULL,
    -- source NL prompt (null if not NL-authored)
    source_prompt   TEXT,
    -- git ref for versioning
    version_ref     TEXT,
    authoring_mode  authoring_mode NOT NULL DEFAULT 'manual',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);

-- ============================================================
-- runs
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_mode') THEN CREATE TYPE run_mode AS ENUM ('stability', 'load', 'deep', 'scheduled'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_engine') THEN CREATE TYPE run_engine AS ENUM ('playwright_lighthouse', 'k6_browser', 'wpt', 'sitespeed'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_status') THEN CREATE TYPE run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled'); END IF; END $$;

CREATE TABLE IF NOT EXISTS runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id       UUID REFERENCES scripts(id) ON DELETE SET NULL,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    mode            run_mode NOT NULL DEFAULT 'stability',
    engine          run_engine NOT NULL DEFAULT 'playwright_lighthouse',
    -- environment identifier (e.g. 'staging', 'production')
    environment     TEXT NOT NULL DEFAULT 'staging',
    status          run_status NOT NULL DEFAULT 'queued',
    -- run configuration: URL, device profile, network profile, N-runs count, etc.
    config          JSONB NOT NULL DEFAULT '{}',
    -- collected metrics summary (LCP, FCP, INP, CLS, TTFB, Lighthouse scores)
    metrics         JSONB,
    -- Lighthouse JSON report reference (object store path)
    lighthouse_report_path TEXT,
    -- Playwright trace reference (object store path)
    trace_path      TEXT,
    -- HAR reference
    har_path        TEXT,
    -- cost tracking
    cost_estimate   NUMERIC(10, 4),
    cost_actual     NUMERIC(10, 4),
    -- timestamps
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- error details if failed
    error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_script ON runs(script_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

-- ============================================================
-- baselines (§11.4)
-- ============================================================
CREATE TABLE IF NOT EXISTS baselines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    script_id           UUID REFERENCES scripts(id) ON DELETE CASCADE,
    -- metric name: 'lcp', 'fcp', 'inp', 'cls', 'ttfb', etc.
    metric              TEXT NOT NULL,
    environment         TEXT NOT NULL DEFAULT 'staging',
    -- statistical values
    p50                 DOUBLE PRECISION,
    p75                 DOUBLE PRECISION,
    p95                 DOUBLE PRECISION,
    p99                 DOUBLE PRECISION,
    mean                DOUBLE PRECISION,
    stddev              DOUBLE PRECISION,
    sample_size         INTEGER NOT NULL DEFAULT 0,
    confidence          DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    -- seasonality bucket
    seasonality_profile JSONB NOT NULL DEFAULT '{}',
    -- validity window
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to            TIMESTAMPTZ,
    -- is this the active baseline for this scope+bucket?
    is_active           BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_baselines_scope ON baselines(project_id, script_id, metric, environment);

-- ============================================================
-- gates (§10)
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gate_policy') THEN CREATE TYPE gate_policy AS ENUM ('block', 'warn', 'page'); END IF; END $$;

CREATE TABLE IF NOT EXISTS gates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- gate definition: type (threshold/baseline-relative/statistical/load-aware),
    -- metric, threshold values, VU params, etc.
    definition      JSONB NOT NULL,
    policy          gate_policy NOT NULL DEFAULT 'warn',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gates_project ON gates(project_id);

-- ============================================================
-- gate_results
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gate_result_status') THEN CREATE TYPE gate_result_status AS ENUM ('passed', 'failed', 'skipped', 'overridden'); END IF; END $$;

CREATE TABLE IF NOT EXISTS gate_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_id         UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    status          gate_result_status NOT NULL,
    -- details of evaluation
    details         JSONB,
    evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_results_run ON gate_results(run_id);

-- ============================================================
-- audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor           TEXT NOT NULL,
    action          TEXT NOT NULL,
    target_type     TEXT,       -- 'project', 'script', 'run', 'gate', 'baseline'
    target_id       UUID,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_scripts_updated_at ON scripts;
CREATE TRIGGER trg_scripts_updated_at BEFORE UPDATE ON scripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_gates_updated_at ON gates;
CREATE TRIGGER trg_gates_updated_at BEFORE UPDATE ON gates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
