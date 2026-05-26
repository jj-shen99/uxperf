import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CapacityReport {
  id?: string;
  project_id: string;
  report_type: string;
  max_sustainable_vus: number | null;
  saturation_metric: string | null;
  saturation_threshold: number | null;
  headroom_percent: number | null;
  recommendations: CapacityRecommendation[];
  load_runs_analyzed: string[];
  forecast_horizon_days: number;
  projected_growth: ProjectedGrowth | null;
}

export interface CapacityRecommendation {
  resource: string;
  current: number;
  projected: number;
  recommendation: string;
  priority: "high" | "medium" | "low";
}

export interface ProjectedGrowth {
  current_p95: number;
  projected_p95: number;
  growth_rate: number;
}

export interface ResourceFloorCondition {
  metric: string;         // cpu_percent, memory_percent, event_loop_lag_ms
  operator: "lt" | "lte" | "gt" | "gte";
  threshold: number;
  host_pattern: string;   // "*" = all hosts
}

export interface CapacityFloor {
  min_sustainable_vus: number;
  max_event_loop_lag_ms: number;
}

export interface ResourceFloorEvaluation {
  gate_id: string;
  conditions: ResourceFloorCondition[];
  results: {
    condition: ResourceFloorCondition;
    actual_value: number;
    passed: boolean;
    host: string;
    message: string;
  }[];
  overall_passed: boolean;
}

@Injectable()
export class CapacityPlanningService {
  private readonly logger = new Logger(CapacityPlanningService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate a capacity planning report by analyzing historical load runs.
   */
  async generateReport(projectId: string, horizonDays = 90): Promise<CapacityReport> {
    // Fetch completed load runs
    const loadRuns = await this.db.query<{
      id: string;
      target_vus: number;
      actual_peak_vus: number | null;
      metrics_summary: Record<string, number> | null;
      saturation_warnings: any[];
    }>(
      `SELECT id, target_vus, actual_peak_vus, metrics_summary, saturation_warnings
       FROM load_runs WHERE project_id = $1 AND status = 'completed'
       ORDER BY created_at DESC LIMIT 20`,
      [projectId],
    );

    const runs = loadRuns.rows;
    if (runs.length === 0) {
      return this.emptyReport(projectId, horizonDays);
    }

    // Analyze saturation points
    const saturation = this.findSaturationPoint(runs);

    // Analyze server resource trends
    const resourceAnalysis = await this.analyzeResources(runs.map((r) => r.id));

    // Build recommendations
    const recommendations = this.buildRecommendations(saturation, resourceAnalysis);

    // Project growth
    const growth = this.projectGrowth(runs, horizonDays);

    const report: CapacityReport = {
      project_id: projectId,
      report_type: "capacity_plan",
      max_sustainable_vus: saturation.maxVus,
      saturation_metric: saturation.metric,
      saturation_threshold: saturation.threshold,
      headroom_percent: saturation.headroom,
      recommendations,
      load_runs_analyzed: runs.map((r) => r.id),
      forecast_horizon_days: horizonDays,
      projected_growth: growth,
    };

    // Persist
    await this.saveReport(report);

    return report;
  }

  /**
   * Evaluate server-resource floor conditions for a load run.
   */
  async evaluateResourceFloor(
    loadRunId: string,
    conditions: ResourceFloorCondition[],
  ): Promise<ResourceFloorEvaluation> {
    const results: ResourceFloorEvaluation["results"] = [];

    for (const condition of conditions) {
      // Get latest snapshots matching host pattern
      const hostFilter = condition.host_pattern === "*" ? "" : "AND host LIKE $3";
      const params: unknown[] = [loadRunId, condition.metric];
      if (condition.host_pattern !== "*") {
        params.push(condition.host_pattern.replace("*", "%"));
      }

      const snapshotResult = await this.db.query<{ host: string; value: number }>(
        `SELECT host, AVG(
          CASE
            WHEN $2 = 'cpu_percent' THEN cpu_percent
            WHEN $2 = 'memory_percent' THEN memory_percent
            WHEN $2 = 'event_loop_lag_ms' THEN event_loop_lag_ms
            WHEN $2 = 'active_connections' THEN active_connections::numeric
            ELSE 0
          END
        ) AS value
        FROM server_resource_snapshots
        WHERE load_run_id = $1 ${hostFilter}
        GROUP BY host`,
        params,
      );

      for (const snap of snapshotResult.rows) {
        const actual = Number(snap.value);
        const passed = this.evaluateCondition(actual, condition.operator, condition.threshold);

        results.push({
          condition,
          actual_value: Math.round(actual * 100) / 100,
          passed,
          host: snap.host,
          message: passed
            ? `${condition.metric} on ${snap.host}: ${actual.toFixed(1)} ${condition.operator} ${condition.threshold} ✓`
            : `${condition.metric} on ${snap.host}: ${actual.toFixed(1)} violates ${condition.operator} ${condition.threshold}`,
        });
      }
    }

    return {
      gate_id: "",
      conditions,
      results,
      overall_passed: results.every((r) => r.passed),
    };
  }

  /**
   * Evaluate capacity floor gate.
   */
  async evaluateCapacityFloor(
    loadRunId: string,
    floor: CapacityFloor,
  ): Promise<{ passed: boolean; details: Record<string, unknown> }> {
    const run = await this.db.query<{
      actual_peak_vus: number | null;
    }>(
      "SELECT actual_peak_vus FROM load_runs WHERE id = $1",
      [loadRunId],
    );

    const actualVus = run.rows[0]?.actual_peak_vus ?? 0;
    const vusOk = actualVus >= floor.min_sustainable_vus;

    // Check event loop lag
    const lagResult = await this.db.query<{ max_lag: number }>(
      `SELECT MAX(event_loop_lag_ms) AS max_lag
       FROM server_resource_snapshots WHERE load_run_id = $1`,
      [loadRunId],
    );

    const maxLag = Number(lagResult.rows[0]?.max_lag ?? 0);
    const lagOk = maxLag <= floor.max_event_loop_lag_ms;

    return {
      passed: vusOk && lagOk,
      details: {
        actual_peak_vus: actualVus,
        min_sustainable_vus: floor.min_sustainable_vus,
        vus_passed: vusOk,
        max_event_loop_lag_ms: maxLag,
        max_allowed_lag_ms: floor.max_event_loop_lag_ms,
        lag_passed: lagOk,
      },
    };
  }

  // --- Private helpers ---

  private evaluateCondition(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case "lt": return actual < threshold;
      case "lte": return actual <= threshold;
      case "gt": return actual > threshold;
      case "gte": return actual >= threshold;
      default: return false;
    }
  }

  private findSaturationPoint(runs: {
    target_vus: number;
    actual_peak_vus: number | null;
    saturation_warnings: any[];
  }[]): { maxVus: number | null; metric: string | null; threshold: number | null; headroom: number | null } {
    // Find highest VU count that ran without saturation warnings
    const clean = runs.filter((r) => !r.saturation_warnings || r.saturation_warnings.length === 0);
    const saturated = runs.filter((r) => r.saturation_warnings && r.saturation_warnings.length > 0);

    const maxCleanVus = clean.length > 0
      ? Math.max(...clean.map((r) => r.actual_peak_vus ?? r.target_vus))
      : null;

    const minSaturatedVus = saturated.length > 0
      ? Math.min(...saturated.map((r) => r.actual_peak_vus ?? r.target_vus))
      : null;

    const headroom = maxCleanVus && minSaturatedVus
      ? Math.round(((minSaturatedVus - maxCleanVus) / minSaturatedVus) * 100)
      : null;

    return {
      maxVus: maxCleanVus,
      metric: saturated.length > 0 ? "http_req_duration_p95" : null,
      threshold: minSaturatedVus,
      headroom,
    };
  }

  private async analyzeResources(loadRunIds: string[]): Promise<{
    peak_cpu: number | null;
    peak_memory: number | null;
    peak_lag: number | null;
  }> {
    if (loadRunIds.length === 0) return { peak_cpu: null, peak_memory: null, peak_lag: null };

    const r = await this.db.query<{ peak_cpu: number; peak_memory: number; peak_lag: number }>(
      `SELECT
        MAX(cpu_percent) AS peak_cpu,
        MAX(memory_percent) AS peak_memory,
        MAX(event_loop_lag_ms) AS peak_lag
       FROM server_resource_snapshots
       WHERE load_run_id = ANY($1)`,
      [loadRunIds],
    );

    return {
      peak_cpu: r.rows[0]?.peak_cpu ? Number(r.rows[0].peak_cpu) : null,
      peak_memory: r.rows[0]?.peak_memory ? Number(r.rows[0].peak_memory) : null,
      peak_lag: r.rows[0]?.peak_lag ? Number(r.rows[0].peak_lag) : null,
    };
  }

  private buildRecommendations(
    saturation: { maxVus: number | null; headroom: number | null },
    resources: { peak_cpu: number | null; peak_memory: number | null; peak_lag: number | null },
  ): CapacityRecommendation[] {
    const recs: CapacityRecommendation[] = [];

    if (resources.peak_cpu != null && resources.peak_cpu > 80) {
      recs.push({
        resource: "CPU",
        current: resources.peak_cpu,
        projected: resources.peak_cpu * 1.2,
        recommendation: "Add horizontal scaling or optimize CPU-intensive operations",
        priority: resources.peak_cpu > 90 ? "high" : "medium",
      });
    }

    if (resources.peak_memory != null && resources.peak_memory > 80) {
      recs.push({
        resource: "Memory",
        current: resources.peak_memory,
        projected: resources.peak_memory * 1.1,
        recommendation: "Increase memory allocation or investigate memory leaks",
        priority: "medium",
      });
    }

    if (resources.peak_lag != null && resources.peak_lag > 100) {
      recs.push({
        resource: "Event Loop",
        current: resources.peak_lag,
        projected: resources.peak_lag * 1.3,
        recommendation: "Offload CPU-intensive work to worker threads or reduce blocking operations",
        priority: "high",
      });
    }

    if (saturation.headroom != null && saturation.headroom < 20) {
      recs.push({
        resource: "VU Capacity",
        current: saturation.maxVus ?? 0,
        projected: (saturation.maxVus ?? 0) * 1.5,
        recommendation: "System is close to saturation; scale infrastructure before increasing load targets",
        priority: "high",
      });
    }

    return recs;
  }

  private projectGrowth(
    runs: { target_vus: number; metrics_summary: Record<string, number> | null }[],
    horizonDays: number,
  ): ProjectedGrowth | null {
    const p95Values = runs
      .filter((r) => r.metrics_summary)
      .map((r) => (r.metrics_summary as Record<string, number>)?.http_req_duration_p95)
      .filter((v): v is number => v != null);

    if (p95Values.length < 2) return null;

    const current = p95Values[0]; // most recent
    const oldest = p95Values[p95Values.length - 1];
    const growthRate = oldest > 0 ? (current - oldest) / oldest : 0;

    return {
      current_p95: Math.round(current * 100) / 100,
      projected_p95: Math.round(current * (1 + growthRate * (horizonDays / 30)) * 100) / 100,
      growth_rate: Math.round(growthRate * 10000) / 10000,
    };
  }

  private emptyReport(projectId: string, horizonDays: number): CapacityReport {
    return {
      project_id: projectId,
      report_type: "capacity_plan",
      max_sustainable_vus: null,
      saturation_metric: null,
      saturation_threshold: null,
      headroom_percent: null,
      recommendations: [],
      load_runs_analyzed: [],
      forecast_horizon_days: horizonDays,
      projected_growth: null,
    };
  }

  private async saveReport(report: CapacityReport): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO capacity_reports
        (project_id, report_type, max_sustainable_vus, saturation_metric,
         saturation_threshold, headroom_percent, recommendations,
         load_runs_analyzed, forecast_horizon_days, projected_growth)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        report.project_id, report.report_type, report.max_sustainable_vus,
        report.saturation_metric, report.saturation_threshold, report.headroom_percent,
        JSON.stringify(report.recommendations), report.load_runs_analyzed,
        report.forecast_horizon_days, JSON.stringify(report.projected_growth),
      ],
    );
    return r.rows[0].id;
  }

  async listReports(projectId: string, limit = 10): Promise<any[]> {
    const r = await this.db.query(
      "SELECT * FROM capacity_reports WHERE project_id = $1 ORDER BY computed_at DESC LIMIT $2",
      [projectId, limit],
    );
    return r.rows;
  }
}
