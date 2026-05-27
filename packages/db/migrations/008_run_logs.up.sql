-- Add logs column to runs table for worker console output
ALTER TABLE runs ADD COLUMN IF NOT EXISTS logs TEXT DEFAULT '';
