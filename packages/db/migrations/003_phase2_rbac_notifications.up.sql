-- Phase 2: RBAC, Script versioning, Slack notifications, ClickHouse config

-- ============================================================
-- users & roles (RBAC)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'editor', 'viewer')),
    api_key_hash    TEXT,              -- bcrypt hash of API key
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- ============================================================
-- script_versions (Git-based versioning)
-- ============================================================
CREATE TABLE IF NOT EXISTS script_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id       UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    version_number  INT NOT NULL,
    canonical_json  JSONB NOT NULL,
    commit_sha      TEXT,              -- Git commit SHA if synced
    commit_message  TEXT,
    author_id       UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (script_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_script_versions_script ON script_versions(script_id);

-- ============================================================
-- notification_channels (Slack, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    channel_type    TEXT NOT NULL CHECK (channel_type IN ('slack', 'email', 'webhook')),
    name            TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    -- config examples:
    --   slack:   { "webhook_url": "https://hooks.slack.com/...", "channel": "#perf" }
    --   email:   { "recipients": ["a@b.com"] }
    --   webhook: { "url": "https://...", "headers": {} }
    events          TEXT[] NOT NULL DEFAULT '{gate_failed,run_completed}',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_project ON notification_channels(project_id);

-- ============================================================
-- per_request_data (ClickHouse-ready schema, stored in PG for now)
-- ============================================================
CREATE TABLE IF NOT EXISTS per_request_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    request_url     TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'GET',
    status_code     INT,
    resource_type   TEXT,               -- script, stylesheet, image, font, xhr, fetch, etc.
    transfer_size   INT,
    content_size    INT,
    duration_ms     NUMERIC(10,2),
    ttfb_ms         NUMERIC(10,2),
    protocol        TEXT,               -- h2, h3, http/1.1
    is_third_party  BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_per_request_data_run ON per_request_data(run_id);
CREATE INDEX IF NOT EXISTS idx_per_request_data_type ON per_request_data(resource_type);

-- triggers
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_notification_channels
    BEFORE UPDATE ON notification_channels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
