-- Rollback E-42: Remove CI columns from baselines
ALTER TABLE baselines DROP COLUMN IF EXISTS ci_p75_lower;
ALTER TABLE baselines DROP COLUMN IF EXISTS ci_p75_upper;
ALTER TABLE baselines DROP COLUMN IF EXISTS ci_p75_reliable;
