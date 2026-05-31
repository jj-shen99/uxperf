import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { percentileCI, PercentileCI } from "../analytics/percentile-ci";

export interface BaselineRow {
  id: string;
  project_id: string;
  script_id: string | null;
  metric: string;
  environment: string;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  p99: number | null;
  mean: number | null;
  stddev: number | null;
  sample_size: number;
  confidence: number;
  seasonality_profile: Record<string, unknown>;
  day_of_week: number | null;
  hour_bucket: number | null;
  seasonality_bucket: string | null;
  ci_p75_lower: number | null;
  ci_p75_upper: number | null;
  ci_p75_reliable: boolean;
  computed_at: Date;
  valid_from: Date;
  valid_to: Date | null;
  is_active: boolean;
}

export interface ComputeBaselineOptions {
  project_id: string;
  script_id?: string;
  metric: string;
  environment?: string;
  window_size?: number; // number of recent runs to consider (default 20)
  day_of_week?: number; // 0=Sunday..6=Saturday, null=all
  hour_bucket?: number; // 0-23, null=all
  seasonality_bucket?: string; // custom label
}

/**
 * Metrics that can be baselined, mapping gate metric names to run metrics keys.
 */
const METRIC_KEYS: Record<string, string> = {
  lcp: "lcp_ms",
  fcp: "fcp_ms",
  inp: "inp_ms",
  cls: "cls",
  ttfb: "ttfb_ms",
  si: "si_ms",
  tti: "tti_ms",
  tbt: "tbt_ms",
  lighthouse_performance: "lighthouse_performance_score",
  lighthouse_accessibility: "lighthouse_accessibility_score",
  lighthouse_best_practices: "lighthouse_best_practices_score",
  lighthouse_seo: "lighthouse_seo_score",
};

@Injectable()
export class BaselinesService {
  private readonly logger = new Logger(BaselinesService.name);

  constructor(private readonly db: DatabaseService) {}

  // -- CRUD --

  async findAll(projectId?: string): Promise<BaselineRow[]> {
    if (projectId) {
      const result = await this.db.query<BaselineRow>(
        "SELECT * FROM baselines WHERE project_id = $1 ORDER BY computed_at DESC",
        [projectId]
      );
      return result.rows;
    }
    const result = await this.db.query<BaselineRow>(
      "SELECT * FROM baselines ORDER BY computed_at DESC LIMIT 200"
    );
    return result.rows;
  }

  async findActive(
    projectId: string,
    metric: string,
    environment: string = "staging",
    scriptId?: string,
    dayOfWeek?: number,
    hourBucket?: number,
  ): Promise<BaselineRow | null> {
    const result = await this.db.query<BaselineRow>(
      `SELECT * FROM baselines
       WHERE project_id = $1 AND metric = $2 AND environment = $3
         AND ($4::uuid IS NULL OR script_id = $4)
         AND ($5::smallint IS NULL OR day_of_week = $5 OR day_of_week IS NULL)
         AND ($6::smallint IS NULL OR hour_bucket = $6 OR hour_bucket IS NULL)
         AND is_active = true
       ORDER BY
         day_of_week IS NOT NULL DESC,
         hour_bucket IS NOT NULL DESC,
         computed_at DESC
       LIMIT 1`,
      [projectId, metric, environment, scriptId ?? null, dayOfWeek ?? null, hourBucket ?? null]
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<BaselineRow> {
    const result = await this.db.query<BaselineRow>(
      "SELECT * FROM baselines WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Baseline ${id} not found`);
    }
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM baselines WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException(`Baseline ${id} not found`);
    }
  }

  // -- Computation --

  /**
   * Compute a baseline for a given metric from the last N completed runs.
   * Collects metric values, calculates percentiles (p50, p75, p95, p99),
   * mean, and stddev, then upserts the active baseline.
   */
  async computeBaseline(opts: ComputeBaselineOptions): Promise<BaselineRow | null> {
    const {
      project_id,
      script_id,
      metric,
      environment = "staging",
      window_size = 20,
    } = opts;

    const metricKey = METRIC_KEYS[metric] ?? metric;

    // E-44: When seasonality bucket is requested, filter by day_of_week/hour
    let seasonalFilter = "";
    const queryParams: unknown[] = [project_id, script_id ?? null, environment, window_size];

    if (opts.day_of_week != null) {
      queryParams.push(opts.day_of_week);
      seasonalFilter += ` AND EXTRACT(DOW FROM finished_at) = $${queryParams.length}`;
    }
    if (opts.hour_bucket != null) {
      queryParams.push(opts.hour_bucket);
      seasonalFilter += ` AND EXTRACT(HOUR FROM finished_at) = $${queryParams.length}`;
    }

    // Fetch metric values from the last N completed runs
    const result = await this.db.query<{ metrics: Record<string, unknown> }>(
      `SELECT metrics FROM runs
       WHERE project_id = $1
         AND ($2::uuid IS NULL OR script_id = $2)
         AND environment = $3
         AND status = 'completed'
         AND metrics IS NOT NULL
         ${seasonalFilter}
       ORDER BY finished_at DESC
       LIMIT $4`,
      queryParams
    );

    const values: number[] = [];
    for (const row of result.rows) {
      const m = row.metrics;
      if (m && typeof m[metricKey] === "number") {
        values.push(m[metricKey] as number);
      }
    }

    if (values.length < 3) {
      this.logger.log(
        `Skipping baseline for ${metric}: only ${values.length} samples (need >= 3)`
      );
      return null;
    }

    // Sort for percentile calculation
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const p50 = this.percentile(sorted, 0.5);
    const p75 = this.percentile(sorted, 0.75);
    const p95 = this.percentile(sorted, 0.95);
    const p99 = this.percentile(sorted, 0.99);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    // Confidence: higher sample size → higher confidence (capped at 1.0)
    const confidence = Math.min(n / window_size, 1.0);

    // E-42: Compute percentile confidence interval for p75
    const ci = percentileCI(values, 0.75);

    // Deactivate old baselines for this scope
    await this.db.query(
      `UPDATE baselines SET is_active = false, valid_to = now()
       WHERE project_id = $1 AND metric = $2 AND environment = $3
         AND ($4::uuid IS NULL OR script_id = $4)
         AND is_active = true`,
      [project_id, metric, environment, script_id ?? null]
    );

    // Insert new active baseline
    const insertResult = await this.db.query<BaselineRow>(
      `INSERT INTO baselines
         (project_id, script_id, metric, environment, p50, p75, p95, p99, mean, stddev,
          sample_size, confidence, seasonality_profile, day_of_week, hour_bucket, seasonality_bucket,
          ci_p75_lower, ci_p75_upper, ci_p75_reliable, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, true)
       RETURNING *`,
      [
        project_id,
        script_id ?? null,
        metric,
        environment,
        p50,
        p75,
        p95,
        p99,
        mean,
        stddev,
        n,
        confidence,
        JSON.stringify({}),
        opts.day_of_week ?? null,
        opts.hour_bucket ?? null,
        opts.seasonality_bucket ?? null,
        ci.lower,
        ci.upper,
        ci.is_reliable,
      ]
    );

    this.logger.log(
      `Computed baseline for ${metric} (${environment}): ` +
      `p50=${p50.toFixed(1)} p75=${p75.toFixed(1)} p95=${p95.toFixed(1)} ` +
      `mean=${mean.toFixed(1)} stddev=${stddev.toFixed(1)} (n=${n})`
    );

    return insertResult.rows[0];
  }

  /**
   * Recompute baselines for all key metrics for a project+environment.
   * Called automatically after a run completes.
   */
  async refreshBaselines(
    projectId: string,
    environment: string = "staging",
    scriptId?: string
  ): Promise<BaselineRow[]> {
    const metrics = Object.keys(METRIC_KEYS);
    const results: BaselineRow[] = [];

    for (const metric of metrics) {
      const baseline = await this.computeBaseline({
        project_id: projectId,
        script_id: scriptId,
        metric,
        environment,
      });
      if (baseline) results.push(baseline);
    }

    return results;
  }

  /**
   * E-44: Compute seasonality-aware baselines.
   *
   * Book Ch 14, p238: "Baselines should be computed per time-of-day/day-of-week
   * bucket to avoid flagging normal daily traffic patterns as regressions."
   *
   * Generates baselines for each day-of-week (0-6) and optionally each
   * hour bucket (morning/afternoon/evening/night).
   */
  async computeSeasonalBaselines(
    projectId: string,
    environment: string = "staging",
    scriptId?: string,
    options?: { includeHourly?: boolean; windowSize?: number },
  ): Promise<BaselineRow[]> {
    const metrics = Object.keys(METRIC_KEYS);
    const results: BaselineRow[] = [];
    const windowSize = options?.windowSize ?? 20;
    const hourBuckets = options?.includeHourly
      ? [0, 6, 12, 18] // night, morning, afternoon, evening
      : [undefined];

    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const HOUR_NAMES: Record<number, string> = { 0: "night", 6: "morning", 12: "afternoon", 18: "evening" };

    for (const metric of metrics) {
      for (let dow = 0; dow <= 6; dow++) {
        for (const hour of hourBuckets) {
          const bucketLabel = hour != null
            ? `${DAY_NAMES[dow]}-${HOUR_NAMES[hour]}`
            : DAY_NAMES[dow];

          const baseline = await this.computeBaseline({
            project_id: projectId,
            script_id: scriptId,
            metric,
            environment,
            window_size: windowSize,
            day_of_week: dow,
            hour_bucket: hour,
            seasonality_bucket: bucketLabel,
          });
          if (baseline) results.push(baseline);
        }
      }
    }

    this.logger.log(
      `Computed ${results.length} seasonal baselines for project ${projectId} (${environment})`,
    );
    return results;
  }

  // -- Helpers --

  /**
   * Linear interpolation percentile on a sorted array.
   */
  percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = p * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const frac = idx - lower;
    return sorted[lower] * (1 - frac) + sorted[upper] * frac;
  }
}
