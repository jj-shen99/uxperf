/**
 * E-54: Saturation Point Auto-Detection
 *
 * Book: Ch 14, p242; Ch 15, p257
 * "Detect the VU count at which p95 latency crosses a threshold
 * or throughput plateaus."
 *
 * Analyzes load test data to find the inflection point where
 * performance degrades under increasing concurrency.
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { SaturationWarning } from "./load-orchestrator.service";

export interface SaturationAnalysis {
  load_run_id: string;
  saturation_point_vus: number | null;
  saturation_type: "latency" | "throughput" | "cpu" | "error_rate" | null;
  confidence: "high" | "medium" | "low";
  knee_point: KneePoint | null;
  warnings: SaturationWarning[];
  degradation_curve: DegradationPoint[];
  recommendation: string;
}

export interface KneePoint {
  vus: number;
  metric: string;
  value_before: number;
  value_after: number;
  slope_change_ratio: number;
}

export interface DegradationPoint {
  vus: number;
  p50_ms: number | null;
  p95_ms: number | null;
  throughput_rps: number | null;
  error_rate: number | null;
  cpu_percent: number | null;
}

export interface SaturationConfig {
  latency_threshold_ms: number;     // p95 latency threshold
  cpu_threshold_percent: number;     // CPU threshold for saturation
  error_rate_threshold: number;      // Error rate threshold (0-1)
  throughput_plateau_pct: number;    // Throughput increase < this % means plateau
  min_data_points: number;           // Minimum points for analysis
  slope_change_threshold: number;    // Ratio of slope change to detect knee
}

const DEFAULT_CONFIG: SaturationConfig = {
  latency_threshold_ms: 3000,
  cpu_threshold_percent: 80,
  error_rate_threshold: 0.05,
  throughput_plateau_pct: 5,
  min_data_points: 5,
  slope_change_threshold: 2.0,
};

@Injectable()
export class SaturationDetectorService {
  private readonly logger = new Logger(SaturationDetectorService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Analyze a load run for saturation points.
   */
  async analyze(
    loadRunId: string,
    config: Partial<SaturationConfig> = {},
  ): Promise<SaturationAnalysis> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Get time-series data points for this load run
    const dataPoints = await this.getDataPoints(loadRunId);

    if (dataPoints.length < cfg.min_data_points) {
      return {
        load_run_id: loadRunId,
        saturation_point_vus: null,
        saturation_type: null,
        confidence: "low",
        knee_point: null,
        warnings: [],
        degradation_curve: dataPoints,
        recommendation: `Insufficient data points (${dataPoints.length}/${cfg.min_data_points}). Run a longer test with more VU stages.`,
      };
    }

    const warnings: SaturationWarning[] = [];
    let saturationVus: number | null = null;
    let satType: SaturationAnalysis["saturation_type"] = null;
    let knee: KneePoint | null = null;

    // 1. Check latency threshold crossing
    const latencyKnee = this.detectLatencyThreshold(dataPoints, cfg.latency_threshold_ms);
    if (latencyKnee) {
      saturationVus = latencyKnee.vus;
      satType = "latency";
      knee = latencyKnee;
      warnings.push({
        timestamp: new Date().toISOString(),
        metric: "p95_ms",
        value: latencyKnee.value_after,
        threshold: cfg.latency_threshold_ms,
        message: `p95 latency crossed ${cfg.latency_threshold_ms}ms at ${latencyKnee.vus} VUs`,
      });
    }

    // 2. Check CPU threshold
    const cpuSat = this.detectCpuSaturation(dataPoints, cfg.cpu_threshold_percent);
    if (cpuSat && (!saturationVus || cpuSat.vus < saturationVus)) {
      saturationVus = cpuSat.vus;
      satType = "cpu";
      knee = cpuSat;
      warnings.push({
        timestamp: new Date().toISOString(),
        metric: "cpu_percent",
        value: cpuSat.value_after,
        threshold: cfg.cpu_threshold_percent,
        message: `CPU exceeded ${cfg.cpu_threshold_percent}% at ${cpuSat.vus} VUs`,
      });
    }

    // 3. Check throughput plateau (knee point via slope change)
    const throughputKnee = this.detectThroughputPlateau(dataPoints, cfg);
    if (throughputKnee && (!saturationVus || throughputKnee.vus < saturationVus)) {
      saturationVus = throughputKnee.vus;
      satType = "throughput";
      knee = throughputKnee;
      warnings.push({
        timestamp: new Date().toISOString(),
        metric: "throughput_rps",
        value: throughputKnee.value_after,
        threshold: throughputKnee.value_before,
        message: `Throughput plateaued at ${throughputKnee.vus} VUs`,
      });
    }

    // 4. Check error rate
    const errorSat = this.detectErrorRate(dataPoints, cfg.error_rate_threshold);
    if (errorSat) {
      if (!saturationVus || errorSat.vus < saturationVus) {
        saturationVus = errorSat.vus;
        satType = "error_rate";
        knee = errorSat;
      }
      warnings.push({
        timestamp: new Date().toISOString(),
        metric: "error_rate",
        value: errorSat.value_after,
        threshold: cfg.error_rate_threshold,
        message: `Error rate exceeded ${(cfg.error_rate_threshold * 100).toFixed(1)}% at ${errorSat.vus} VUs`,
      });
    }

    // Determine confidence
    const confidence = this.assessConfidence(dataPoints, saturationVus, warnings);

    // Generate recommendation
    const recommendation = this.generateRecommendation(saturationVus, satType, knee, dataPoints);

    // Persist warnings to the load run
    if (warnings.length > 0) {
      await this.persistWarnings(loadRunId, saturationVus, warnings);
    }

    return {
      load_run_id: loadRunId,
      saturation_point_vus: saturationVus,
      saturation_type: satType,
      confidence,
      knee_point: knee,
      warnings,
      degradation_curve: dataPoints,
      recommendation,
    };
  }

  /**
   * Detect where p95 latency crosses a threshold.
   */
  detectLatencyThreshold(points: DegradationPoint[], threshold: number): KneePoint | null {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (prev.p95_ms != null && curr.p95_ms != null) {
        if (prev.p95_ms <= threshold && curr.p95_ms > threshold) {
          return {
            vus: curr.vus,
            metric: "p95_ms",
            value_before: prev.p95_ms,
            value_after: curr.p95_ms,
            slope_change_ratio: curr.p95_ms / Math.max(prev.p95_ms, 1),
          };
        }
      }
    }
    return null;
  }

  /**
   * Detect where CPU exceeds threshold.
   */
  detectCpuSaturation(points: DegradationPoint[], threshold: number): KneePoint | null {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (prev.cpu_percent != null && curr.cpu_percent != null) {
        if (prev.cpu_percent <= threshold && curr.cpu_percent > threshold) {
          return {
            vus: curr.vus,
            metric: "cpu_percent",
            value_before: prev.cpu_percent,
            value_after: curr.cpu_percent,
            slope_change_ratio: curr.cpu_percent / Math.max(prev.cpu_percent, 1),
          };
        }
      }
    }
    return null;
  }

  /**
   * Detect throughput plateau using slope analysis.
   */
  detectThroughputPlateau(points: DegradationPoint[], cfg: SaturationConfig): KneePoint | null {
    const withThroughput = points.filter((p) => p.throughput_rps != null);
    if (withThroughput.length < 3) return null;

    for (let i = 2; i < withThroughput.length; i++) {
      const p0 = withThroughput[i - 2];
      const p1 = withThroughput[i - 1];
      const p2 = withThroughput[i];

      const slope1 = (p1.throughput_rps! - p0.throughput_rps!) / Math.max(p1.vus - p0.vus, 1);
      const slope2 = (p2.throughput_rps! - p1.throughput_rps!) / Math.max(p2.vus - p1.vus, 1);

      // Slope decreased significantly → plateau
      if (slope1 > 0 && slope2 / slope1 < 1 / cfg.slope_change_threshold) {
        return {
          vus: p1.vus,
          metric: "throughput_rps",
          value_before: p1.throughput_rps!,
          value_after: p2.throughput_rps!,
          slope_change_ratio: slope1 > 0 ? slope2 / slope1 : 0,
        };
      }
    }

    return null;
  }

  /**
   * Detect where error rate exceeds threshold.
   */
  detectErrorRate(points: DegradationPoint[], threshold: number): KneePoint | null {
    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      if (curr.error_rate != null && curr.error_rate > threshold) {
        const prev = i > 0 ? points[i - 1] : null;
        return {
          vus: curr.vus,
          metric: "error_rate",
          value_before: prev?.error_rate ?? 0,
          value_after: curr.error_rate,
          slope_change_ratio: curr.error_rate / Math.max(prev?.error_rate ?? 0.001, 0.001),
        };
      }
    }
    return null;
  }

  private assessConfidence(
    points: DegradationPoint[],
    saturationVus: number | null,
    warnings: SaturationWarning[],
  ): "high" | "medium" | "low" {
    if (!saturationVus) return "low";
    if (warnings.length >= 2) return "high"; // Multiple signals agree
    if (points.length >= 10) return "medium";
    return "low";
  }

  private generateRecommendation(
    vus: number | null,
    type: string | null,
    knee: KneePoint | null,
    points: DegradationPoint[],
  ): string {
    if (!vus) {
      const maxVus = Math.max(...points.map((p) => p.vus), 0);
      return `No saturation detected up to ${maxVus} VUs. System can handle this load. Consider testing with higher VU counts.`;
    }

    const safeVus = Math.floor(vus * 0.75);
    switch (type) {
      case "latency":
        return `Latency-based saturation at ${vus} VUs (p95 = ${knee?.value_after?.toFixed(0)}ms). Recommended capacity: ≤${safeVus} VUs for acceptable latency.`;
      case "cpu":
        return `CPU-based saturation at ${vus} VUs (CPU = ${knee?.value_after?.toFixed(0)}%). Scale horizontally or optimize server-side processing. Safe capacity: ≤${safeVus} VUs.`;
      case "throughput":
        return `Throughput plateau at ${vus} VUs. Adding more users won't increase throughput. Max effective capacity: ${vus} VUs.`;
      case "error_rate":
        return `Error-rate spike at ${vus} VUs (${((knee?.value_after ?? 0) * 100).toFixed(1)}% errors). Investigate error source. Safe capacity: ≤${safeVus} VUs.`;
      default:
        return `Saturation detected at ${vus} VUs. Safe capacity: ≤${safeVus} VUs.`;
    }
  }

  private async getDataPoints(loadRunId: string): Promise<DegradationPoint[]> {
    try {
      const result = await this.db.query<any>(
        `SELECT
          st.snapshot->>'vus' AS vus,
          st.snapshot->>'p50_ms' AS p50_ms,
          st.snapshot->>'p95_ms' AS p95_ms,
          st.snapshot->>'throughput_rps' AS throughput_rps,
          st.snapshot->>'error_rate' AS error_rate,
          st.cpu_percent,
          st.memory_percent
         FROM server_telemetry st
         WHERE st.load_run_id = $1
         ORDER BY st.recorded_at ASC`,
        [loadRunId],
      );

      return result.rows.map((r: any) => ({
        vus: Number(r.vus ?? 0),
        p50_ms: r.p50_ms != null ? Number(r.p50_ms) : null,
        p95_ms: r.p95_ms != null ? Number(r.p95_ms) : null,
        throughput_rps: r.throughput_rps != null ? Number(r.throughput_rps) : null,
        error_rate: r.error_rate != null ? Number(r.error_rate) : null,
        cpu_percent: r.cpu_percent != null ? Number(r.cpu_percent) : null,
      }));
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      throw err;
    }
  }

  private async persistWarnings(
    loadRunId: string,
    saturationVus: number | null,
    warnings: SaturationWarning[],
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE load_runs SET
          saturation_warnings = $2,
          saturation_point_vus = $3
         WHERE id = $1`,
        [loadRunId, JSON.stringify(warnings), saturationVus],
      );
    } catch (err: any) {
      if (err?.code !== "42P01" && err?.code !== "42703") {
        this.logger.error(`Failed to persist saturation warnings: ${err.message}`);
      }
    }
  }
}
