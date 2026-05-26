import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface TrendPoint {
  run_id: string;
  finished_at: string;
  environment: string;
  [metric: string]: unknown;
}

export interface ProjectSummary {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  avg_lcp_ms: number | null;
  avg_fcp_ms: number | null;
  avg_cls: number | null;
  avg_lighthouse_performance: number | null;
  last_run_at: string | null;
}

@Injectable()
export class TrendsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Return time-series data for specified metrics across recent completed runs.
   */
  async getMetricTrends(
    projectId: string,
    metrics: string[],
    environment?: string,
    limit: number = 50,
  ): Promise<TrendPoint[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);

    // Build SELECT for each requested metric from the JSONB metrics column
    const metricSelects = metrics
      .map((m) => `metrics->>'${m.replace(/[^a-z0-9_]/gi, "")}' AS "${m}"`)
      .join(", ");

    let whereClause = "project_id = $1 AND status = 'completed' AND metrics IS NOT NULL";
    const params: unknown[] = [projectId];

    if (environment) {
      params.push(environment);
      whereClause += ` AND environment = $${params.length}`;
    }

    params.push(safeLimit);

    const result = await this.db.query(
      `SELECT id AS run_id, finished_at, environment, ${metricSelects}
       FROM runs
       WHERE ${whereClause}
       ORDER BY finished_at DESC
       LIMIT $${params.length}`,
      params,
    );

    // Reverse so oldest first (chronological for charts)
    const rows = result.rows.reverse();

    // Cast string values to numbers
    return rows.map((row) => {
      const point: TrendPoint = {
        run_id: row.run_id,
        finished_at: row.finished_at,
        environment: row.environment,
      };
      for (const m of metrics) {
        const val = row[m];
        if (val !== null && val !== undefined) {
          const num = parseFloat(val);
          point[m] = Number.isNaN(num) ? null : num;
        } else {
          point[m] = null;
        }
      }
      return point;
    });
  }

  /**
   * Get aggregate project summary statistics.
   */
  async getProjectSummary(
    projectId: string,
    environment?: string,
  ): Promise<ProjectSummary> {
    let whereClause = "project_id = $1";
    const params: unknown[] = [projectId];

    if (environment) {
      params.push(environment);
      whereClause += ` AND environment = $${params.length}`;
    }

    const result = await this.db.query(
      `SELECT
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
        AVG((metrics->>'lcp_ms')::numeric) FILTER (WHERE status = 'completed' AND metrics IS NOT NULL) AS avg_lcp_ms,
        AVG((metrics->>'fcp_ms')::numeric) FILTER (WHERE status = 'completed' AND metrics IS NOT NULL) AS avg_fcp_ms,
        AVG((metrics->>'cls')::numeric) FILTER (WHERE status = 'completed' AND metrics IS NOT NULL) AS avg_cls,
        AVG((metrics->>'lighthouse_performance_score')::numeric) FILTER (WHERE status = 'completed' AND metrics IS NOT NULL) AS avg_lighthouse_performance,
        MAX(finished_at) AS last_run_at
       FROM runs
       WHERE ${whereClause}`,
      params,
    );

    const row = result.rows[0];
    return {
      total_runs: parseInt(row.total_runs, 10),
      completed_runs: parseInt(row.completed_runs, 10),
      failed_runs: parseInt(row.failed_runs, 10),
      avg_lcp_ms: row.avg_lcp_ms ? parseFloat(row.avg_lcp_ms) : null,
      avg_fcp_ms: row.avg_fcp_ms ? parseFloat(row.avg_fcp_ms) : null,
      avg_cls: row.avg_cls ? parseFloat(row.avg_cls) : null,
      avg_lighthouse_performance: row.avg_lighthouse_performance
        ? parseFloat(row.avg_lighthouse_performance)
        : null,
      last_run_at: row.last_run_at,
    };
  }
}
