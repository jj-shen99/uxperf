import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { LoadRunRow } from "./load-orchestrator.service";
import { LoadStage } from "./load-profiles.service";

export interface CapacityEstimate {
  max_sustainable_vus: number;
  confidence: "low" | "medium" | "high";
  lcp_at_peak_ms: number | null;
  fcp_at_peak_ms: number | null;
  ttfb_at_peak_ms: number | null;
  saturation_point_vus: number | null;
  degradation_slope: number | null;
  recommendation: string;
}

export interface MetricPercentiles {
  metric: string;
  label: string;
  unit: string;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface TrendPoint {
  run_id: string;
  created_at: string;
  target_vus: number;
  duration_s: number | null;
  lcp_ms: number | null;
  fcp_ms: number | null;
  cls: number | null;
  ttfb_ms: number | null;
  inp_ms: number | null;
  error_rate: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  elapsed_s: number;
  vus: number;
  lcp_ms: number | null;
  fcp_ms: number | null;
  ttfb_ms: number | null;
  cls: number | null;
  run_id: string;
  label: string;
}

export interface LoadResultsAnalysis {
  project_id: string;
  total_completed_runs: number;
  total_failed_runs: number;
  total_vu_minutes: number;
  avg_run_duration_s: number;
  capacity: CapacityEstimate;
  percentiles: MetricPercentiles[];
  trend: TrendPoint[];
  time_series: TimeSeriesPoint[];
  vu_vs_response: { vus: number; lcp_ms: number; fcp_ms: number; ttfb_ms: number }[];
  cache_comparison: { cache_state: string; avg_lcp_ms: number; avg_fcp_ms: number; avg_ttfb_ms: number; run_count: number }[];
  error_analysis: { error: string; count: number; last_seen: string }[];
}

@Injectable()
export class LoadResultsService {
  private readonly logger = new Logger(LoadResultsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Analyse all completed load runs for a project.
   */
  async analyse(projectId: string): Promise<LoadResultsAnalysis> {
    const runs = await this.getCompletedRuns(projectId);
    const allRuns = await this.getAllRuns(projectId);

    const completedRuns = runs.filter((r) => r.status === "completed");
    const failedRuns = allRuns.filter((r) => r.status === "failed");

    const totalVuMin = completedRuns.reduce((s, r) => s + (Number(r.vu_minutes) || 0), 0);
    const avgDuration = completedRuns.length > 0
      ? completedRuns.reduce((s, r) => s + (Number(r.duration_s) || 0), 0) / completedRuns.length
      : 0;

    const percentiles = this.computePercentiles(completedRuns);
    const trend = this.buildTrend(allRuns);
    const timeSeries = this.buildTimeSeries(completedRuns);
    const vuVsResponse = this.buildVuVsResponse(completedRuns);
    const capacity = this.estimateCapacity(completedRuns, vuVsResponse);
    const cacheComparison = this.buildCacheComparison(completedRuns);
    const errorAnalysis = this.buildErrorAnalysis(failedRuns);

    return {
      project_id: projectId,
      total_completed_runs: completedRuns.length,
      total_failed_runs: failedRuns.length,
      total_vu_minutes: Math.round(totalVuMin * 10) / 10,
      avg_run_duration_s: Math.round(avgDuration),
      capacity,
      percentiles,
      trend,
      time_series: timeSeries,
      vu_vs_response: vuVsResponse,
      cache_comparison: cacheComparison,
      error_analysis: errorAnalysis,
    };
  }

  private async getCompletedRuns(projectId: string): Promise<LoadRunRow[]> {
    const result = await this.db.query<LoadRunRow>(
      `SELECT * FROM load_runs
       WHERE project_id = $1 AND status = 'completed'
       ORDER BY created_at ASC`,
      [projectId],
    );
    return result.rows;
  }

  private async getAllRuns(projectId: string): Promise<LoadRunRow[]> {
    const result = await this.db.query<LoadRunRow>(
      `SELECT * FROM load_runs
       WHERE project_id = $1
       ORDER BY created_at ASC
       LIMIT 500`,
      [projectId],
    );
    return result.rows;
  }

  private computePercentiles(runs: LoadRunRow[]): MetricPercentiles[] {
    const metricDefs = [
      { key: "lcp_ms", label: "LCP", unit: "ms" },
      { key: "fcp_ms", label: "FCP", unit: "ms" },
      { key: "cls", label: "CLS", unit: "" },
      { key: "ttfb_ms", label: "TTFB", unit: "ms" },
      { key: "inp_ms", label: "INP", unit: "ms" },
    ];

    return metricDefs.map(({ key, label, unit }) => {
      // If a run contains k6's per-VU-iteration percentile breakdown, prefer it
      // over the cross-run computation (which is meaningless with only 1 run).
      const firstBreakdown = runs.length <= 3
        ? (runs.find((r) => (r.metrics_summary as any)?.percentiles?.[key])?.metrics_summary as any)?.percentiles?.[key]
        : null;

      if (firstBreakdown && firstBreakdown.count > 1) {
        const rnd = (v: any) => v != null ? Math.round(Number(v) * 100) / 100 : null;
        return {
          metric: key, label, unit,
          p50: rnd(firstBreakdown.med),
          p75: rnd(firstBreakdown.p75),
          p90: rnd(firstBreakdown.p90),
          p95: rnd(firstBreakdown.p95),
          p99: rnd(firstBreakdown.p99),
          min: rnd(firstBreakdown.min),
          max: rnd(firstBreakdown.max),
          count: firstBreakdown.count ?? 1,
        };
      }

      // Fallback: compute percentiles across runs
      const vals = runs
        .map((r) => Number((r.metrics_summary as any)?.[key]))
        .filter((v) => !isNaN(v) && v > 0)
        .sort((a, b) => a - b);

      if (vals.length === 0) {
        return { metric: key, label, unit, p50: null, p75: null, p90: null, p95: null, p99: null, min: null, max: null, count: 0 };
      }

      const pct = (p: number) => vals[Math.min(Math.floor(vals.length * p), vals.length - 1)];

      return {
        metric: key,
        label,
        unit,
        p50: Math.round(pct(0.5) * 100) / 100,
        p75: Math.round(pct(0.75) * 100) / 100,
        p90: Math.round(pct(0.90) * 100) / 100,
        p95: Math.round(pct(0.95) * 100) / 100,
        p99: Math.round(pct(0.99) * 100) / 100,
        min: Math.round(vals[0] * 100) / 100,
        max: Math.round(vals[vals.length - 1] * 100) / 100,
        count: vals.length,
      };
    });
  }

  /**
   * Build a time-series view across completed runs.
   * For each run, creates data points at each ramp stage boundary showing the
   * VU count at that time and the run's measured response-time metrics.
   * This allows plotting "response time vs wall-clock time" with a VU overlay.
   */
  private buildTimeSeries(runs: LoadRunRow[]): TimeSeriesPoint[] {
    const points: TimeSeriesPoint[] = [];

    for (const r of runs) {
      const startTime = r.started_at ? new Date(r.started_at).getTime() : new Date(r.created_at).getTime();
      const ms = r.metrics_summary as any;
      const lcp = ms?.lcp_ms != null ? Number(ms.lcp_ms) : null;
      const fcp = ms?.fcp_ms != null ? Number(ms.fcp_ms) : null;
      const ttfb = ms?.ttfb_ms != null ? Number(ms.ttfb_ms) : null;
      const cls = ms?.cls != null ? Number(ms.cls) : null;

      const stages: LoadStage[] = Array.isArray(r.stages) ? r.stages : [];

      if (stages.length === 0) {
        // Single data point for runs without stage info
        points.push({
          timestamp: new Date(startTime).toISOString(),
          elapsed_s: 0,
          vus: r.actual_peak_vus ?? r.target_vus,
          lcp_ms: lcp,
          fcp_ms: fcp,
          ttfb_ms: ttfb,
          cls,
          run_id: r.id,
          label: `${r.actual_peak_vus ?? r.target_vus} VUs`,
        });
        continue;
      }

      // Create a point at the start and at the end of each ramp stage
      let elapsed = 0;
      let prevVus = 0;

      // Starting point
      points.push({
        timestamp: new Date(startTime).toISOString(),
        elapsed_s: 0,
        vus: 0,
        lcp_ms: null,
        fcp_ms: null,
        ttfb_ms: null,
        cls: null,
        run_id: r.id,
        label: "Ramp start",
      });

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        elapsed += stage.duration_s;
        const atPeak = stage.target_vus >= (r.actual_peak_vus ?? r.target_vus);

        points.push({
          timestamp: new Date(startTime + elapsed * 1000).toISOString(),
          elapsed_s: elapsed,
          vus: stage.target_vus,
          lcp_ms: atPeak ? lcp : null,
          fcp_ms: atPeak ? fcp : null,
          ttfb_ms: atPeak ? ttfb : null,
          cls: atPeak ? cls : null,
          run_id: r.id,
          label: `Stage ${i + 1}: ${prevVus}→${stage.target_vus} VUs`,
        });
        prevVus = stage.target_vus;
      }
    }

    return points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private buildTrend(runs: LoadRunRow[]): TrendPoint[] {
    return runs
      .filter((r) => r.status === "completed" || r.status === "failed")
      .map((r) => ({
        run_id: r.id,
        created_at: r.created_at,
        target_vus: r.target_vus,
        duration_s: r.duration_s,
        lcp_ms: Number((r.metrics_summary as any)?.lcp_ms) || null,
        fcp_ms: Number((r.metrics_summary as any)?.fcp_ms) || null,
        cls: Number((r.metrics_summary as any)?.cls) || null,
        ttfb_ms: Number((r.metrics_summary as any)?.ttfb_ms) || null,
        inp_ms: Number((r.metrics_summary as any)?.inp_ms) || null,
        error_rate: r.status === "failed" ? 1 : 0,
      }));
  }

  /**
   * Build VU vs response time curve for capacity estimation.
   * Groups completed runs by target_vus and averages their metrics.
   */
  private buildVuVsResponse(runs: LoadRunRow[]): { vus: number; lcp_ms: number; fcp_ms: number; ttfb_ms: number }[] {
    const byVus = new Map<number, { lcp: number[]; fcp: number[]; ttfb: number[] }>();

    for (const r of runs) {
      const ms = r.metrics_summary as any;
      if (!ms) continue;
      const vus = r.actual_peak_vus ?? r.target_vus;
      if (!byVus.has(vus)) byVus.set(vus, { lcp: [], fcp: [], ttfb: [] });
      const bucket = byVus.get(vus)!;
      if (ms.lcp_ms) bucket.lcp.push(Number(ms.lcp_ms));
      if (ms.fcp_ms) bucket.fcp.push(Number(ms.fcp_ms));
      if (ms.ttfb_ms) bucket.ttfb.push(Number(ms.ttfb_ms));
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return Array.from(byVus.entries())
      .map(([vus, b]) => ({
        vus,
        lcp_ms: Math.round(avg(b.lcp)),
        fcp_ms: Math.round(avg(b.fcp)),
        ttfb_ms: Math.round(avg(b.ttfb)),
      }))
      .sort((a, b) => a.vus - b.vus);
  }

  /**
   * Estimate max sustainable capacity based on the VU vs response curve.
   * Uses a simple linear regression to find where LCP would exceed 2500ms.
   */
  private estimateCapacity(
    runs: LoadRunRow[],
    vuVsResponse: { vus: number; lcp_ms: number; fcp_ms: number; ttfb_ms: number }[],
  ): CapacityEstimate {
    if (vuVsResponse.length < 2) {
      const peakVus = runs.length > 0 ? Math.max(...runs.map((r) => r.actual_peak_vus ?? r.target_vus)) : 0;
      return {
        max_sustainable_vus: peakVus,
        confidence: "low",
        lcp_at_peak_ms: vuVsResponse[0]?.lcp_ms ?? null,
        fcp_at_peak_ms: vuVsResponse[0]?.fcp_ms ?? null,
        ttfb_at_peak_ms: vuVsResponse[0]?.ttfb_ms ?? null,
        saturation_point_vus: null,
        degradation_slope: null,
        recommendation: "Need runs at multiple VU levels for capacity estimation. Try 5, 10, 25, 50, 100 VUs.",
      };
    }

    // Linear regression: LCP = slope * VUs + intercept
    const points = vuVsResponse.filter((p) => p.lcp_ms > 0);
    if (points.length < 2) {
      return {
        max_sustainable_vus: Math.max(...vuVsResponse.map((p) => p.vus)),
        confidence: "low",
        lcp_at_peak_ms: vuVsResponse[vuVsResponse.length - 1]?.lcp_ms ?? null,
        fcp_at_peak_ms: vuVsResponse[vuVsResponse.length - 1]?.fcp_ms ?? null,
        ttfb_at_peak_ms: vuVsResponse[vuVsResponse.length - 1]?.ttfb_ms ?? null,
        saturation_point_vus: null,
        degradation_slope: null,
        recommendation: "Need more runs with valid LCP data for capacity estimation.",
      };
    }

    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.vus, 0);
    const sumY = points.reduce((s, p) => s + p.lcp_ms, 0);
    const sumXY = points.reduce((s, p) => s + p.vus * p.lcp_ms, 0);
    const sumXX = points.reduce((s, p) => s + p.vus * p.vus, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const lcpThreshold = 2500; // good LCP threshold
    const maxVus = slope > 0 ? Math.floor((lcpThreshold - intercept) / slope) : Math.max(...points.map((p) => p.vus)) * 2;

    // Find saturation point where LCP starts degrading significantly
    let saturationVus: number | null = null;
    for (let i = 1; i < points.length; i++) {
      const delta = points[i].lcp_ms - points[i - 1].lcp_ms;
      const vuDelta = points[i].vus - points[i - 1].vus;
      if (vuDelta > 0 && delta / vuDelta > 20) {
        saturationVus = points[i - 1].vus;
        break;
      }
    }

    const peakPoint = points[points.length - 1];
    const confidence = n >= 5 ? "high" : n >= 3 ? "medium" : "low";

    let recommendation: string;
    if (slope <= 0) {
      recommendation = "Response times are stable or improving with load. System has headroom — consider testing at higher VU counts.";
    } else if (maxVus > peakPoint.vus * 2) {
      recommendation = `LCP degrades slowly (${slope.toFixed(1)}ms per VU). Estimated ceiling of ${maxVus} VUs before LCP > 2500ms. Good headroom.`;
    } else if (maxVus > peakPoint.vus) {
      recommendation = `Current peak of ${peakPoint.vus} VUs is approaching the estimated ceiling of ${maxVus} VUs. Plan for optimization.`;
    } else {
      recommendation = `System may already be over capacity. LCP exceeds 2500ms threshold. Investigate bottlenecks and optimize.`;
    }

    return {
      max_sustainable_vus: Math.max(maxVus, 0),
      confidence,
      lcp_at_peak_ms: peakPoint.lcp_ms,
      fcp_at_peak_ms: peakPoint.fcp_ms,
      ttfb_at_peak_ms: peakPoint.ttfb_ms,
      saturation_point_vus: saturationVus,
      degradation_slope: Math.round(slope * 100) / 100,
      recommendation,
    };
  }

  /**
   * Compare metrics across cache states (cold vs warm).
   */
  private buildCacheComparison(runs: LoadRunRow[]): { cache_state: string; avg_lcp_ms: number; avg_fcp_ms: number; avg_ttfb_ms: number; run_count: number }[] {
    const byCache = new Map<string, { lcp: number[]; fcp: number[]; ttfb: number[] }>();

    for (const r of runs) {
      const ms = r.metrics_summary as any;
      if (!ms) continue;
      const cache = r.cache_state ?? "unknown";
      if (!byCache.has(cache)) byCache.set(cache, { lcp: [], fcp: [], ttfb: [] });
      const bucket = byCache.get(cache)!;
      if (ms.lcp_ms) bucket.lcp.push(Number(ms.lcp_ms));
      if (ms.fcp_ms) bucket.fcp.push(Number(ms.fcp_ms));
      if (ms.ttfb_ms) bucket.ttfb.push(Number(ms.ttfb_ms));
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    return Array.from(byCache.entries()).map(([cache_state, b]) => ({
      cache_state,
      avg_lcp_ms: avg(b.lcp),
      avg_fcp_ms: avg(b.fcp),
      avg_ttfb_ms: avg(b.ttfb),
      run_count: Math.max(b.lcp.length, b.fcp.length, b.ttfb.length),
    }));
  }

  /**
   * Aggregate error messages from failed runs.
   */
  private buildErrorAnalysis(failedRuns: LoadRunRow[]): { error: string; count: number; last_seen: string }[] {
    const byError = new Map<string, { count: number; last_seen: string }>();

    for (const r of failedRuns) {
      const err = r.error ?? "Unknown error";
      const key = err.length > 120 ? err.slice(0, 120) + "…" : err;
      const existing = byError.get(key);
      if (existing) {
        existing.count++;
        if (r.created_at > existing.last_seen) existing.last_seen = r.created_at;
      } else {
        byError.set(key, { count: 1, last_seen: r.created_at });
      }
    }

    return Array.from(byError.entries())
      .map(([error, data]) => ({ error, ...data }))
      .sort((a, b) => b.count - a.count);
  }
}
