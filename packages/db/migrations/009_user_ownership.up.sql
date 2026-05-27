-- Add user_id ownership columns to scripts and runs
ALTER TABLE scripts ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE runs    ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Indexes for filtering by user
CREATE INDEX idx_scripts_user_id ON scripts(user_id);
CREATE INDEX idx_runs_user_id    ON runs(user_id);
