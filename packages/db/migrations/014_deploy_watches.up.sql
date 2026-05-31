-- E-50: Deploy watch table for post-deploy RUM evaluation
CREATE TABLE IF NOT EXISTS deploy_watches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  build_hash      TEXT NOT NULL,
  git_sha         TEXT NOT NULL,
  environment     TEXT NOT NULL DEFAULT 'production',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'evaluating', 'passed', 'failed', 'expired')),
  deployed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_at    TIMESTAMPTZ,
  rum_sample_count INTEGER NOT NULL DEFAULT 0,
  result_details  JSONB,
  github_owner    TEXT,
  github_repo     TEXT,
  github_token    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deploy_watches_pending
  ON deploy_watches (status, deployed_at DESC)
  WHERE status IN ('pending', 'evaluating');

CREATE INDEX IF NOT EXISTS idx_deploy_watches_project
  ON deploy_watches (project_id, deployed_at DESC);
