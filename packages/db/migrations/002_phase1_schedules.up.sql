-- Phase 1: Add schedules table for cron-based run scheduling
-- Also add a scheduled_by field on runs to trace origin

CREATE TABLE IF NOT EXISTS schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    script_id       UUID REFERENCES scripts(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    -- cron expression (standard 5-field: minute hour day month weekday)
    cron_expression TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    -- run configuration template used when dispatching
    config          JSONB NOT NULL DEFAULT '{}',
    environment     TEXT NOT NULL DEFAULT 'staging',
    -- track last and next execution
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_project ON schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at) WHERE enabled = true;

-- Link runs back to schedules
ALTER TABLE runs ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_runs_schedule ON runs(schedule_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
