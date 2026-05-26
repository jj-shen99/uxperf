-- Seed demo users for the performance testing framework
-- Run: psql $DATABASE_URL -f packages/db/seed-demo-users.sql

-- Admin user
INSERT INTO users (email, display_name, role)
VALUES ('admin@perftest.io', 'Admin User', 'admin')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- Editor user
INSERT INTO users (email, display_name, role)
VALUES ('editor@perftest.io', 'Jane Editor', 'editor')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- Viewer user
INSERT INTO users (email, display_name, role)
VALUES ('viewer@perftest.io', 'Bob Viewer', 'viewer')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- QA engineer
INSERT INTO users (email, display_name, role)
VALUES ('qa@perftest.io', 'Alice QA', 'editor')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- Dev user
INSERT INTO users (email, display_name, role)
VALUES ('dev@perftest.io', 'Charlie Dev', 'viewer')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;
