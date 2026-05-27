-- Rollback: remove password-based auth columns
ALTER TABLE users DROP COLUMN IF EXISTS reset_token_expires;
ALTER TABLE users DROP COLUMN IF EXISTS reset_token;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
