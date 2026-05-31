import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

/**
 * Canary Deployment Analysis Service (E-35).
 *
 * Ch 13, p162–164: "Canary analysis is the integration between your deploy
 * system and your perf platform."
 *
 * Compares metrics from a canary cohort against a baseline cohort to decide
 * whether the canary is safe to promote. Uses statistical comparison
 * (Mann-Whitney U approximation) to account for variance.
 */

export interface CanaryConfig {
  project_id: string;
  canary_build: string;       // build hash or version for canary
  baseline_build: string;     // build hash or version for baseline
  metric: string;
  environment?: string;
  min_samples?: number;       // minimum samples per cohort (default 10)
  significance_level?: number; // p-value threshold (default 0.05)
}

export interface CohortStats {
  build: string;
  count: number;
  mean: number;
  median: number;
  p75: number;
  p95: number;
  stddev: number;
  values: number[];
}

export type CanaryVerdict = "pass" | "fail" | "inconclusive";

export interface CanaryResult {
  project_id: string;
  metric: string;
  canary: CohortStats;
  baseline: CohortStats;
  verdict: CanaryVerdict;
  relative_change_pct: number;  // (canary - baseline) / baseline * 100
  p_value: number;
  significant: boolean;
  reason: string;
}

@Injectable()
export class CanaryAnalysisService {
  private readonly logger = new Logger(CanaryAnalysisService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Compare canary vs baseline cohorts for a single metric.
   */
  async analyze(config: CanaryConfig): Promise<CanaryResult> {
    const {
      project_id,
      canary_build,
      baseline_build,
      metric,
      environment = "production",
      min_samples = 10,
      significance_level = 0.05,
    } = config;

    // Fetch cohort values
    const [canaryValues, baselineValues] = await Promise.all([
      this.fetchCohort(project_id, canary_build, metric, environment),
      this.fetchCohort(project_id, baseline_build, metric, environment),
    ]);

    const canaryStats = this.computeStats(canary_build, canaryValues);
    const baselineStats = this.computeStats(baseline_build, baselineValues);

    // Check minimum sample size
    if (canaryStats.count < min_samples || baselineStats.count < min_samples) {
      return {
        project_id,
        metric,
        canary: canaryStats,
        baseline: baselineStats,
        verdict: "inconclusive",
        relative_change_pct: 0,
        p_value: 1,
        significant: false,
        reason: `Insufficient samples: canary=${canaryStats.count}, baseline=${baselineStats.count} (need ≥${min_samples})`,
      };
    }

    // Statistical test (Mann-Whitney U via normal approximation)
    const pValue = this.mannWhitneyU(canaryValues, baselineValues);
    const significant = pValue < significance_level;

    const relativeChange = baselineStats.mean > 0
      ? ((canaryStats.mean - baselineStats.mean) / baselineStats.mean) * 100
      : 0;

    // Determine verdict
    let verdict: CanaryVerdict;
    let reason: string;

    if (!significant) {
      verdict = "pass";
      reason = `No significant difference (p=${pValue.toFixed(4)}). Canary is safe to promote.`;
    } else if (relativeChange > 0) {
      // Metric increased (degraded for latency-type metrics)
      verdict = "fail";
      reason = `Significant regression: canary ${metric} is ${relativeChange.toFixed(1)}% worse (p=${pValue.toFixed(4)})`;
    } else {
      // Metric decreased (improved)
      verdict = "pass";
      reason = `Significant improvement: canary ${metric} is ${Math.abs(relativeChange).toFixed(1)}% better (p=${pValue.toFixed(4)})`;
    }

    this.logger.log(
      `Canary analysis for ${metric}: ${verdict} (canary=${canaryStats.mean.toFixed(1)}, baseline=${baselineStats.mean.toFixed(1)}, p=${pValue.toFixed(4)})`,
    );

    return {
      project_id,
      metric,
      canary: canaryStats,
      baseline: baselineStats,
      verdict,
      relative_change_pct: Math.round(relativeChange * 100) / 100,
      p_value: Math.round(pValue * 10000) / 10000,
      significant,
      reason,
    };
  }

  /**
   * Analyze multiple metrics at once. Fails if ANY metric fails.
   */
  async analyzeMultiMetric(
    project_id: string,
    canary_build: string,
    baseline_build: string,
    metrics: string[],
    environment?: string,
  ): Promise<{ results: CanaryResult[]; overall_verdict: CanaryVerdict }> {
    const results: CanaryResult[] = [];

    for (const metric of metrics) {
      const result = await this.analyze({
        project_id,
        canary_build,
        baseline_build,
        metric,
        environment,
      });
      results.push(result);
    }

    const anyFail = results.some((r) => r.verdict === "fail");
    const anyInconclusive = results.some((r) => r.verdict === "inconclusive");
    const overall_verdict: CanaryVerdict = anyFail
      ? "fail"
      : anyInconclusive
        ? "inconclusive"
        : "pass";

    return { results, overall_verdict };
  }

  // ── Private helpers ──────────────────────────────────────────

  private async fetchCohort(
    projectId: string,
    build: string,
    metric: string,
    environment: string,
  ): Promise<number[]> {
    const result = await this.db.query<{ value: string }>(
      `SELECT metrics->>$3 as value
       FROM runs
       WHERE project_id = $1
         AND build_hash = $2
         AND environment = $4
         AND status = 'completed'
         AND metrics->>$3 IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 100`,
      [projectId, build, metric, environment],
    );

    return result.rows
      .map((r) => Number(r.value))
      .filter((v) => Number.isFinite(v));
  }

  computeStats(build: string, values: number[]): CohortStats {
    if (values.length === 0) {
      return {
        build,
        count: 0,
        mean: 0,
        median: 0,
        p75: 0,
        p95: 0,
        stddev: 0,
        values: [],
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

    return {
      build,
      count: n,
      mean: Math.round(mean * 100) / 100,
      median: this.percentile(sorted, 0.5),
      p75: this.percentile(sorted, 0.75),
      p95: this.percentile(sorted, 0.95),
      stddev: Math.round(Math.sqrt(variance) * 100) / 100,
      values,
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = p * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const frac = idx - lower;
    return Math.round((sorted[lower] * (1 - frac) + sorted[upper] * frac) * 100) / 100;
  }

  /**
   * Mann-Whitney U test via normal approximation.
   * Returns approximate p-value for two-sided test.
   */
  mannWhitneyU(a: number[], b: number[]): number {
    const n1 = a.length;
    const n2 = b.length;

    if (n1 === 0 || n2 === 0) return 1;

    // Rank all values together
    const combined = [
      ...a.map((v) => ({ v, group: "a" })),
      ...b.map((v) => ({ v, group: "b" })),
    ].sort((x, y) => x.v - y.v);

    // Assign ranks (average ties)
    const ranks = new Array(combined.length);
    let i = 0;
    while (i < combined.length) {
      let j = i;
      while (j < combined.length && combined[j].v === combined[i].v) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) ranks[k] = avgRank;
      i = j;
    }

    // Sum ranks for group a
    let r1 = 0;
    for (let k = 0; k < combined.length; k++) {
      if (combined[k].group === "a") r1 += ranks[k];
    }

    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const u2 = n1 * n2 - u1;
    const u = Math.min(u1, u2);

    // Normal approximation
    const mu = (n1 * n2) / 2;
    const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

    if (sigma === 0) return 1;

    const z = Math.abs((u - mu) / sigma);

    // Two-tailed p-value from z-score (approximation)
    const p = 2 * (1 - this.normalCdf(z));
    return Math.max(0, Math.min(1, p));
  }

  /**
   * Standard normal CDF approximation (Abramowitz & Stegun).
   */
  private normalCdf(z: number): number {
    if (z < -8) return 0;
    if (z > 8) return 1;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }
}
