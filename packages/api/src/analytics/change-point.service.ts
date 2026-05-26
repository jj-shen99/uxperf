import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

/**
 * CUSUM (Cumulative Sum) change-point detector.
 * Detects a sustained shift in the mean of a time series.
 */
export interface CusumResult {
  detected: boolean;
  changeIndex: number | null;
  magnitude: number;      // estimated shift size
  cumSum: number[];        // running cusum values
}

/**
 * EWMA (Exponentially Weighted Moving Average) detector.
 * Detects when a metric drifts outside a control band.
 */
export interface EwmaResult {
  detected: boolean;
  changeIndex: number | null;
  currentEwma: number;
  upperBound: number;
  lowerBound: number;
}

export interface ChangePointResult {
  metric: string;
  detector: "cusum" | "ewma";
  detected: boolean;
  changeIndex: number | null;
  changeRunId: string | null;
  description: string;
  severity: "info" | "warning" | "critical";
  details: Record<string, unknown>;
}

@Injectable()
export class ChangePointService {
  private readonly logger = new Logger(ChangePointService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Run CUSUM detector on a metric time series.
   * threshold = sensitivity control (higher = less sensitive, default 5σ)
   * drift = allowance for expected drift (default 0.5σ)
   */
  cusum(
    values: number[],
    threshold?: number,
    drift?: number,
  ): CusumResult {
    if (values.length < 5) {
      return { detected: false, changeIndex: null, magnitude: 0, cumSum: [] };
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stddev = Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    );

    if (stddev === 0) {
      return { detected: false, changeIndex: null, magnitude: 0, cumSum: [] };
    }

    const h = (threshold ?? 5) * stddev;
    const k = (drift ?? 0.5) * stddev;

    let sPlus = 0;
    let sMinus = 0;
    const cumSum: number[] = [];

    for (let i = 0; i < values.length; i++) {
      sPlus = Math.max(0, sPlus + (values[i] - mean) - k);
      sMinus = Math.max(0, sMinus - (values[i] - mean) - k);
      cumSum.push(Math.max(sPlus, sMinus));

      if (sPlus > h || sMinus > h) {
        const beforeMean =
          values.slice(0, i).reduce((a, b) => a + b, 0) / i || mean;
        const afterMean =
          values.slice(i).reduce((a, b) => a + b, 0) / (values.length - i);
        const magnitude = Math.abs(afterMean - beforeMean);

        return {
          detected: true,
          changeIndex: i,
          magnitude,
          cumSum,
        };
      }
    }

    return { detected: false, changeIndex: null, magnitude: 0, cumSum };
  }

  /**
   * Run EWMA detector on a metric time series.
   * lambda = smoothing factor (default 0.2)
   * sigmaMultiplier = control limit width (default 3)
   */
  ewma(
    values: number[],
    lambda = 0.2,
    sigmaMultiplier = 3,
  ): EwmaResult {
    if (values.length < 5) {
      return {
        detected: false,
        changeIndex: null,
        currentEwma: 0,
        upperBound: 0,
        lowerBound: 0,
      };
    }

    // Use first half as baseline to establish reference mean/stddev
    const baselineLen = Math.max(5, Math.floor(values.length / 2));
    const baseline = values.slice(0, baselineLen);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const stddev = Math.sqrt(
      baseline.reduce((sum, v) => sum + (v - mean) ** 2, 0) / baseline.length,
    );

    if (stddev === 0) {
      return {
        detected: false,
        changeIndex: null,
        currentEwma: mean,
        upperBound: mean,
        lowerBound: mean,
      };
    }

    let ewmaVal = mean;

    for (let i = 0; i < values.length; i++) {
      ewmaVal = lambda * values[i] + (1 - lambda) * ewmaVal;

      // EWMA control limits widen with i
      const L =
        sigmaMultiplier *
        stddev *
        Math.sqrt(
          (lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * (i + 1))),
        );

      const upper = mean + L;
      const lower = mean - L;

      if (ewmaVal > upper || ewmaVal < lower) {
        return {
          detected: true,
          changeIndex: i,
          currentEwma: ewmaVal,
          upperBound: upper,
          lowerBound: lower,
        };
      }
    }

    return {
      detected: false,
      changeIndex: null,
      currentEwma: ewmaVal,
      upperBound: mean + sigmaMultiplier * stddev,
      lowerBound: mean - sigmaMultiplier * stddev,
    };
  }

  /**
   * Analyze a project's recent runs for change points across key metrics.
   * Fetches the last `window` completed runs and runs both detectors.
   */
  async detectForProject(
    projectId: string,
    environment?: string,
    window = 50,
  ): Promise<ChangePointResult[]> {
    let whereClause =
      "project_id = $1 AND status = 'completed' AND metrics IS NOT NULL";
    const params: unknown[] = [projectId];

    if (environment) {
      params.push(environment);
      whereClause += ` AND environment = $${params.length}`;
    }

    params.push(Math.min(window, 200));

    const result = await this.db.query<{
      id: string;
      metrics: Record<string, unknown>;
      finished_at: string;
    }>(
      `SELECT id, metrics, finished_at FROM runs
       WHERE ${whereClause}
       ORDER BY finished_at ASC
       LIMIT $${params.length}`,
      params,
    );

    if (result.rows.length < 5) return [];

    const metricsToCheck = [
      "lcp_ms",
      "fcp_ms",
      "cls",
      "ttfb_ms",
      "si_ms",
      "tbt_ms",
      "lighthouse_performance_score",
    ];

    const results: ChangePointResult[] = [];

    for (const metric of metricsToCheck) {
      const values: number[] = [];
      const runIds: string[] = [];

      for (const row of result.rows) {
        const val = row.metrics[metric];
        if (typeof val === "number") {
          values.push(val);
          runIds.push(row.id);
        }
      }

      if (values.length < 5) continue;

      // Run CUSUM
      const cusumResult = this.cusum(values);
      if (cusumResult.detected && cusumResult.changeIndex !== null) {
        const severity = this.classifySeverity(
          metric,
          cusumResult.magnitude,
          values,
        );
        results.push({
          metric,
          detector: "cusum",
          detected: true,
          changeIndex: cusumResult.changeIndex,
          changeRunId: runIds[cusumResult.changeIndex] ?? null,
          description: `CUSUM detected a shift of ${cusumResult.magnitude.toFixed(1)} in ${metric} at run index ${cusumResult.changeIndex}`,
          severity,
          details: {
            magnitude: cusumResult.magnitude,
            cumSum: cusumResult.cumSum,
          },
        });
      }

      // Run EWMA
      const ewmaResult = this.ewma(values);
      if (ewmaResult.detected && ewmaResult.changeIndex !== null) {
        const severity = this.classifySeverity(
          metric,
          Math.abs(ewmaResult.currentEwma - (values.reduce((a, b) => a + b, 0) / values.length)),
          values,
        );
        results.push({
          metric,
          detector: "ewma",
          detected: true,
          changeIndex: ewmaResult.changeIndex,
          changeRunId: runIds[ewmaResult.changeIndex] ?? null,
          description: `EWMA detected drift in ${metric} at run index ${ewmaResult.changeIndex}; EWMA=${ewmaResult.currentEwma.toFixed(1)}`,
          severity,
          details: {
            currentEwma: ewmaResult.currentEwma,
            upperBound: ewmaResult.upperBound,
            lowerBound: ewmaResult.lowerBound,
          },
        });
      }
    }

    return results;
  }

  /**
   * Classify severity based on magnitude relative to the series mean.
   */
  private classifySeverity(
    metric: string,
    magnitude: number,
    values: number[],
  ): "info" | "warning" | "critical" {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return "info";
    const pctChange = (magnitude / mean) * 100;

    if (pctChange > 30) return "critical";
    if (pctChange > 15) return "warning";
    return "info";
  }
}
