-- E-34: Gate overrides with audit trail

CREATE TABLE IF NOT EXISTS gate_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id         UUID NOT NULL,
  gate_name       TEXT NOT NULL,
  run_id          UUID NOT NULL,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by    TEXT NOT NULL,
  approved_by     TEXT,
  justification   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at      TIMESTAMPTZ NOT NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_overrides_project ON gate_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_gate_overrides_run ON gate_overrides(run_id);
CREATE INDEX IF NOT EXISTS idx_gate_overrides_gate ON gate_overrides(gate_id);
CREATE INDEX IF NOT EXISTS idx_gate_overrides_status ON gate_overrides(status) WHERE status = 'pending';
