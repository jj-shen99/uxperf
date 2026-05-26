import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { LoadStage } from "./load-profiles.service";

export interface CorrelationDataPoint {
  timestamp: string;
  vus: number;
  stage_index: number;
  stage_label: string;
  metrics: Record<string, number | null>;
  server: Record<string, number | null>;
}

export interface CorrelationResult {
  load_run_id: string;
  data_points: CorrelationDataPoint[];
  stages: StageAnnotation[];
  correlations: MetricCorrelation[];
  summary: CorrelationSummary;
}

export interface StageAnnotation {
  index: number;
  label: string;
  start_offset_s: number;
  duration_s: number;
  target_vus: number;
  ramp_type: string;
}

export interface MetricCorrelation {
  metric: string;
  server_metric: string;
  pearson_r: number;
  direction: "positive" | "negative" | "none";
}

export interface CorrelationSummary {
  total_duration_s: number;
  peak_vus: number;
  avg_lcp_ms: number | null;
  avg_fcp_ms: number | null;
  peak_cpu_percent: number | null;
  peak_memory_percent: number | null;
  saturation_point_vus: number | null;
}

@Injectable()
export class LoadCorrelationService {
  private readonly logger = new Logger(LoadCorrelationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Build a correlated time-series dataset for a load run,
   * aligning browser metrics with server resource snapshots.
   */
  async getCorrelation(loadRunId: string): Promise<CorrelationResult> {
    // Get load run details
    const runResult = await this.db.query<{
      id: string;
      stages: LoadStage[];
      started_at: string;
      finished_at: string;
      target_vus: number;
      actual_peak_vus: number | null;
      metrics_summary: Record<string, unknown> | null;
    }>(
      "SELECT * FROM load_runs WHERE id = $1",
      [loadRunId],
    );

    const run = runResult.rows[0];
    if (!run) {
      return {
        load_run_id: loadRunId,
        data_points: [],
        stages: [],
        correlations: [],
        summary: {
          total_duration_s: 0,
          peak_vus: 0,
          avg_lcp_ms: null,
          avg_fcp_ms: null,
          peak_cpu_percent: null,
          peak_memory_percent: null,
          saturation_point_vus: null,
        },
      };
    }

    // Build stage annotations
    const stages = this.buildStageAnnotations(run.stages);

    // Get server snapshots
    const snapshots = await this.db.query<{
      timestamp: string;
      cpu_percent: number | null;
      memory_percent: number | null;
      active_connections: number | null;
      event_loop_lag_ms: number | null;
      http_request_rate: number | null;
    }>(
      `SELECT timestamp, cpu_percent, memory_percent, active_connections,
              event_loop_lag_ms, http_request_rate
       FROM server_resource_snapshots
       WHERE load_run_id = $1
       ORDER BY timestamp ASC`,
      [loadRunId],
    );

    // Build correlated data points
    const startTime = run.started_at ? new Date(run.started_at).getTime() : Date.now();
    const dataPoints: CorrelationDataPoint[] = snapshots.rows.map((snap) => {
      const ts = new Date(snap.timestamp).getTime();
      const offsetS = (ts - startTime) / 1000;
      const { stageIndex, stageLabel, vus } = this.resolveStageAtOffset(stages, offsetS, run.target_vus);

      return {
        timestamp: snap.timestamp,
        vus,
        stage_index: stageIndex,
        stage_label: stageLabel,
        metrics: {
          lcp_ms: null, // browser metrics are aggregated, not per-snapshot
          fcp_ms: null,
        },
        server: {
          cpu_percent: snap.cpu_percent,
          memory_percent: snap.memory_percent,
          active_connections: snap.active_connections,
          event_loop_lag_ms: snap.event_loop_lag_ms,
          http_request_rate: snap.http_request_rate,
        },
      };
    });

    // Compute correlations between VUs and server metrics
    const correlations = this.computeCorrelations(dataPoints);

    // Build summary
    const summary = this.buildSummary(run, dataPoints);

    return {
      load_run_id: loadRunId,
      data_points: dataPoints,
      stages,
      correlations,
      summary,
    };
  }

  /**
   * Build stage annotations from load profile stages.
   */
  buildStageAnnotations(stages: LoadStage[]): StageAnnotation[] {
    let offset = 0;
    return stages.map((stage, i) => {
      const annotation: StageAnnotation = {
        index: i,
        label: `Stage ${i + 1}: ${stage.target_vus} VUs`,
        start_offset_s: offset,
        duration_s: stage.duration_s,
        target_vus: stage.target_vus,
        ramp_type: stage.ramp_type ?? "linear",
      };
      offset += stage.duration_s;
      return annotation;
    });
  }

  /**
   * Resolve which stage a given offset falls into and interpolate VU count.
   */
  private resolveStageAtOffset(
    stages: StageAnnotation[],
    offsetS: number,
    initialVus: number,
  ): { stageIndex: number; stageLabel: string; vus: number } {
    let prevVus = initialVus;
    for (const stage of stages) {
      if (offsetS >= stage.start_offset_s && offsetS < stage.start_offset_s + stage.duration_s) {
        const progress = (offsetS - stage.start_offset_s) / stage.duration_s;
        const vus = stage.ramp_type === "step"
          ? stage.target_vus
          : Math.round(prevVus + (stage.target_vus - prevVus) * progress);
        return { stageIndex: stage.index, stageLabel: stage.label, vus };
      }
      prevVus = stage.target_vus;
    }
    return { stageIndex: stages.length - 1, stageLabel: "Post-test", vus: 0 };
  }

  /**
   * Compute Pearson correlation between VU count and server metrics.
   */
  private computeCorrelations(dataPoints: CorrelationDataPoint[]): MetricCorrelation[] {
    if (dataPoints.length < 3) return [];

    const serverMetrics = ["cpu_percent", "memory_percent", "active_connections", "event_loop_lag_ms"];
    const vus = dataPoints.map((dp) => dp.vus);
    const correlations: MetricCorrelation[] = [];

    for (const metric of serverMetrics) {
      const values = dataPoints.map((dp) => dp.server[metric]);
      const validPairs = vus
        .map((v, i) => [v, values[i]] as [number, number | null])
        .filter(([, val]) => val != null) as [number, number][];

      if (validPairs.length < 3) continue;

      const x = validPairs.map(([v]) => v);
      const y = validPairs.map(([, v]) => v);
      const r = this.pearson(x, y);

      correlations.push({
        metric: "vus",
        server_metric: metric,
        pearson_r: Math.round(r * 1000) / 1000,
        direction: r > 0.3 ? "positive" : r < -0.3 ? "negative" : "none",
      });
    }

    return correlations;
  }

  /**
   * Pearson correlation coefficient.
   */
  pearson(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  }

  /**
   * Build correlation summary.
   */
  private buildSummary(
    run: { target_vus: number; actual_peak_vus: number | null; metrics_summary: Record<string, unknown> | null },
    dataPoints: CorrelationDataPoint[],
  ): CorrelationSummary {
    const cpuValues = dataPoints.map((dp) => dp.server.cpu_percent).filter((v): v is number => v != null);
    const memValues = dataPoints.map((dp) => dp.server.memory_percent).filter((v): v is number => v != null);

    // Detect saturation: find VU count where CPU > 80%
    let saturationVus: number | null = null;
    for (const dp of dataPoints) {
      if (dp.server.cpu_percent != null && dp.server.cpu_percent > 80) {
        saturationVus = dp.vus;
        break;
      }
    }

    const ms = run.metrics_summary as Record<string, number> | null;

    return {
      total_duration_s: dataPoints.length > 0
        ? (new Date(dataPoints[dataPoints.length - 1].timestamp).getTime() -
           new Date(dataPoints[0].timestamp).getTime()) / 1000
        : 0,
      peak_vus: run.actual_peak_vus ?? run.target_vus,
      avg_lcp_ms: ms?.browser_lcp_p95 ?? null,
      avg_fcp_ms: ms?.browser_fcp_p95 ?? null,
      peak_cpu_percent: cpuValues.length > 0 ? Math.max(...cpuValues) : null,
      peak_memory_percent: memValues.length > 0 ? Math.max(...memValues) : null,
      saturation_point_vus: saturationVus,
    };
  }
}
