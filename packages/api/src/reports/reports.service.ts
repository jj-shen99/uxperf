import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface ReportSnapshotRow {
  id: string;
  project_id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  team: string | null;
  data: Record<string, unknown>;
  generated_at: string;
}

export interface ExecutiveReport {
  period: { start: string; end: string; days: number };
  core_web_vitals: {
    lcp_p75_ms: number | null;
    fcp_p75_ms: number | null;
    cls_p75: number | null;
    inp_p75_ms: number | null;
    ttfb_p75_ms: number | null;
  };
  run_stats: {
    total_runs: number;
    completed: number;
    failed: number;
    pass_rate: number;
  };
  gate_stats: {
    total_evaluations: number;
    passed: number;
    failed: number;
    pass_rate: number;
  };
  anomalies: {
    total: number;
    critical: number;
    resolved: number;
  };
  trend_direction: Record<string, "improving" | "stable" | "degrading">;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate an executive report for a project over a rolling window.
   */
  async generateExecutiveReport(
    projectId: string,
    days: number = 30,
    environment?: string,
  ): Promise<ExecutiveReport> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 86400000);

    let envFilter = "";
    const baseParams: unknown[] = [projectId, periodStart, periodEnd];
    if (environment) {
      baseParams.push(environment);
      envFilter = ` AND environment = $${baseParams.length}`;
    }

    // Core Web Vitals (p75)
    const cwvResult = await this.db.query(
      `SELECT
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (metrics->>'lcp_ms')::numeric) AS lcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (metrics->>'fcp_ms')::numeric) AS fcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (metrics->>'cls')::numeric) AS cls_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (metrics->>'inp_ms')::numeric) AS inp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (metrics->>'ttfb_ms')::numeric) AS ttfb_p75
       FROM runs
       WHERE project_id = $1 AND status = 'completed'
         AND finished_at BETWEEN $2 AND $3
         AND metrics IS NOT NULL${envFilter}`,
      baseParams,
    );

    const cwv = cwvResult.rows[0] || {};

    // Run stats
    const runResult = await this.db.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM runs
       WHERE project_id = $1 AND created_at BETWEEN $2 AND $3${envFilter}`,
      baseParams,
    );

    const runStats = runResult.rows[0] || {};
    const totalRuns = parseInt(runStats.total, 10) || 0;
    const completedRuns = parseInt(runStats.completed, 10) || 0;
    const failedRuns = parseInt(runStats.failed, 10) || 0;

    // Gate stats
    const gateResult = await this.db.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE gr.status = 'passed') AS passed,
        COUNT(*) FILTER (WHERE gr.status = 'failed') AS failed
       FROM gate_results gr
       JOIN runs r ON gr.run_id = r.id
       WHERE r.project_id = $1 AND r.created_at BETWEEN $2 AND $3${envFilter}`,
      baseParams,
    );

    const gateStats = gateResult.rows[0] || {};
    const totalGates = parseInt(gateStats.total, 10) || 0;
    const passedGates = parseInt(gateStats.passed, 10) || 0;
    const failedGates = parseInt(gateStats.failed, 10) || 0;

    // Anomaly stats
    const anomalyResult = await this.db.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved
       FROM anomalies
       WHERE project_id = $1 AND detected_at BETWEEN $2 AND $3`,
      [projectId, periodStart, periodEnd],
    );

    const anomalyStats = anomalyResult.rows[0] || {};

    // Trend direction for key metrics
    const trendDirection = await this.computeTrendDirections(
      projectId,
      periodStart,
      periodEnd,
      envFilter,
      baseParams,
    );

    const report: ExecutiveReport = {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        days,
      },
      core_web_vitals: {
        lcp_p75_ms: cwv.lcp_p75 ? parseFloat(cwv.lcp_p75) : null,
        fcp_p75_ms: cwv.fcp_p75 ? parseFloat(cwv.fcp_p75) : null,
        cls_p75: cwv.cls_p75 ? parseFloat(cwv.cls_p75) : null,
        inp_p75_ms: cwv.inp_p75 ? parseFloat(cwv.inp_p75) : null,
        ttfb_p75_ms: cwv.ttfb_p75 ? parseFloat(cwv.ttfb_p75) : null,
      },
      run_stats: {
        total_runs: totalRuns,
        completed: completedRuns,
        failed: failedRuns,
        pass_rate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
      },
      gate_stats: {
        total_evaluations: totalGates,
        passed: passedGates,
        failed: failedGates,
        pass_rate: totalGates > 0 ? Math.round((passedGates / totalGates) * 100) : 0,
      },
      anomalies: {
        total: parseInt(anomalyStats.total, 10) || 0,
        critical: parseInt(anomalyStats.critical, 10) || 0,
        resolved: parseInt(anomalyStats.resolved, 10) || 0,
      },
      trend_direction: trendDirection,
    };

    // Persist snapshot
    await this.db.query(
      `INSERT INTO report_snapshots (project_id, report_type, period_start, period_end, data)
       VALUES ($1, 'executive', $2, $3, $4)`,
      [projectId, periodStart, periodEnd, JSON.stringify(report)],
    );

    return report;
  }

  /**
   * List saved report snapshots.
   */
  async listReports(
    projectId: string,
    reportType?: string,
    limit = 20,
  ): Promise<ReportSnapshotRow[]> {
    const params: unknown[] = [projectId];
    let where = "project_id = $1";

    if (reportType) {
      params.push(reportType);
      where += ` AND report_type = $${params.length}`;
    }

    params.push(Math.min(limit, 100));
    const result = await this.db.query<ReportSnapshotRow>(
      `SELECT * FROM report_snapshots WHERE ${where} ORDER BY generated_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  async getReport(id: string): Promise<ReportSnapshotRow> {
    const result = await this.db.query<ReportSnapshotRow>(
      "SELECT * FROM report_snapshots WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    return result.rows[0];
  }

  /**
   * Compute simple trend direction by comparing first-half vs second-half means.
   */
  private async computeTrendDirections(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
    envFilter: string,
    baseParams: unknown[],
  ): Promise<Record<string, "improving" | "stable" | "degrading">> {
    const midpoint = new Date(
      periodStart.getTime() + (periodEnd.getTime() - periodStart.getTime()) / 2,
    );

    const metrics = ["lcp_ms", "fcp_ms", "cls", "ttfb_ms"];
    const directions: Record<string, "improving" | "stable" | "degrading"> = {};

    for (const metric of metrics) {
      const result = await this.db.query(
        `SELECT
          AVG((metrics->>'${metric.replace(/[^a-z0-9_]/gi, "")}')::numeric) FILTER (WHERE finished_at < $4) AS first_half,
          AVG((metrics->>'${metric.replace(/[^a-z0-9_]/gi, "")}')::numeric) FILTER (WHERE finished_at >= $4) AS second_half
         FROM runs
         WHERE project_id = $1 AND status = 'completed'
           AND finished_at BETWEEN $2 AND $3
           AND metrics IS NOT NULL${envFilter}`,
        [...baseParams, midpoint],
      );

      const row = result.rows[0];
      if (!row?.first_half || !row?.second_half) {
        directions[metric] = "stable";
        continue;
      }

      const firstHalf = parseFloat(row.first_half);
      const secondHalf = parseFloat(row.second_half);
      const pctChange = ((secondHalf - firstHalf) / firstHalf) * 100;

      // For most metrics, lower is better (except lighthouse scores)
      if (metric.includes("score")) {
        directions[metric] = pctChange > 5 ? "improving" : pctChange < -5 ? "degrading" : "stable";
      } else {
        directions[metric] = pctChange < -5 ? "improving" : pctChange > 5 ? "degrading" : "stable";
      }
    }

    return directions;
  }
}
