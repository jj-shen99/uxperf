-- E-42: Add percentile confidence interval columns to baselines table
-- These columns store the CI bounds for p75, enabling CI-aware gate evaluation.

ALTER TABLE baselines ADD COLUMN IF NOT EXISTS ci_p75_lower NUMERIC;
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS ci_p75_upper NUMERIC;
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS ci_p75_reliable BOOLEAN DEFAULT false;
