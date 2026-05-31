/**
 * RUM Hourly Aggregation Service (E-39)
 *
 * Book: Ch 14, p236–237
 * "Raw RUM events are high-volume ephemera. Roll them into hourly
 * distribution sketches and keep the sketches forever."
 *
 * Rolls up raw rum_events into hourly pre-aggregated distributions:
 *   p50/p75/p90/p95/p99 per route × device × geo
 * Short retention for raw events, long retention for aggregates.
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface RumHourlyRow {
  id: string;
  project_id: string;
  origin: string;
  page_url: string;
  device_type: string;
  country_code: string | null;
  hour_bucket: string; // ISO timestamp truncated to hour
  metric: string;
  sample_count: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  created_at: Date;
}

export interface AggregationResult {
  metric: string;
  hours_processed: number;
  rows_created: number;
}

const METRICS = ["lcp_ms", "fcp_ms", "inp_ms", "cls", "ttfb_ms"] as const;

@Injectable()
export class RumAggregationService {
  private readonly logger = new Logger(RumAggregationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Aggregate raw RUM events into hourly distribution buckets.
   *
   * For each hour × origin × page_url × device_type × country_code,
   * compute percentiles and store in rum_hourly_aggregates.
   *
   * @param projectId - Project to aggregate
   * @param hoursBack - How many hours back to process (default 2, for overlap safety)
   */
  async aggregateHourly(
    projectId: string,
    hoursBack = 2,
  ): Promise<AggregationResult[]> {
    const results: AggregationResult[] = [];

    for (const metric of METRICS) {
      const result = await this.aggregateMetric(projectId, metric, hoursBack);
      results.push(result);
    }

    return results;
  }

  private async aggregateMetric(
    projectId: string,
    metric: string,
    hoursBack: number,
  ): Promise<AggregationResult> {
    // Upsert hourly aggregates using INSERT ... ON CONFLICT
    const result = await this.db.query(
      `INSERT INTO rum_hourly_aggregates
        (project_id, origin, page_url, device_type, country_code, hour_bucket,
         metric, sample_count, p50, p75, p90, p95, p99, mean, min_val, max_val)
       SELECT
         project_id,
         origin,
         page_url,
         device_type,
         COALESCE(country_code, 'unknown'),
         date_trunc('hour', recorded_at) AS hour_bucket,
         $2 AS metric,
         COUNT(*)::int AS sample_count,
         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${metric}) AS p50,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${metric}) AS p75,
         PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY ${metric}) AS p90,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${metric}) AS p95,
         PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${metric}) AS p99,
         AVG(${metric}) AS mean,
         MIN(${metric}) AS min_val,
         MAX(${metric}) AS max_val
       FROM rum_events
       WHERE project_id = $1
         AND ${metric} IS NOT NULL
         AND recorded_at >= NOW() - MAKE_INTERVAL(hours => $3::int)
       GROUP BY project_id, origin, page_url, device_type, country_code,
                date_trunc('hour', recorded_at)
       HAVING COUNT(*) >= 5
       ON CONFLICT (project_id, origin, page_url, device_type, country_code, hour_bucket, metric)
       DO UPDATE SET
         sample_count = EXCLUDED.sample_count,
         p50 = EXCLUDED.p50,
         p75 = EXCLUDED.p75,
         p90 = EXCLUDED.p90,
         p95 = EXCLUDED.p95,
         p99 = EXCLUDED.p99,
         mean = EXCLUDED.mean,
         min_val = EXCLUDED.min_val,
         max_val = EXCLUDED.max_val`,
      [projectId, metric, hoursBack],
    );

    const rowsCreated = result.rowCount ?? 0;
    this.logger.log(
      `Aggregated ${metric} for project ${projectId}: ${rowsCreated} hourly bucket(s)`,
    );

    return { metric, hours_processed: hoursBack, rows_created: rowsCreated };
  }

  /**
   * Get hourly aggregated data for a metric, useful for dashboard charts.
   */
  async getHourlyTrend(
    projectId: string,
    metric: string,
    days = 7,
    origin?: string,
    deviceType?: string,
  ): Promise<RumHourlyRow[]> {
    const params: unknown[] = [projectId, metric, days];
    let where = `project_id = $1 AND metric = $2 AND hour_bucket >= NOW() - MAKE_INTERVAL(days => $3::int)`;
    if (origin) {
      params.push(origin);
      where += ` AND origin = $${params.length}`;
    }
    if (deviceType) {
      params.push(deviceType);
      where += ` AND device_type = $${params.length}`;
    }

    const result = await this.db.query<RumHourlyRow>(
      `SELECT * FROM rum_hourly_aggregates
       WHERE ${where}
       ORDER BY hour_bucket DESC
       LIMIT 500`,
      params,
    );
    return result.rows;
  }

  /**
   * Clean up old raw RUM events (short retention).
   * Book: p237: "Keep raw beacons 7–14 days; keep sketches forever."
   */
  async purgeRawEvents(
    projectId: string,
    retentionDays = 14,
  ): Promise<{ deleted: number }> {
    const result = await this.db.query(
      `DELETE FROM rum_events
       WHERE project_id = $1 AND recorded_at < NOW() - MAKE_INTERVAL(days => $2::int)`,
      [projectId, retentionDays],
    );
    const deleted = result.rowCount ?? 0;
    this.logger.log(
      `Purged ${deleted} raw RUM events older than ${retentionDays} days for project ${projectId}`,
    );
    return { deleted };
  }

  /**
   * Get a daily distribution summary (used by the synthetic vs field comparison view).
   */
  async getDailySummary(
    projectId: string,
    metric: string,
    days = 28,
    origin?: string,
  ): Promise<{ date: string; p50: number; p75: number; p90: number; p95: number; p99: number; count: number }[]> {
    const params: unknown[] = [projectId, metric, days];
    let where = `project_id = $1 AND metric = $2 AND hour_bucket >= NOW() - MAKE_INTERVAL(days => $3::int)`;
    if (origin) {
      params.push(origin);
      where += ` AND origin = $${params.length}`;
    }

    const result = await this.db.query<any>(
      `SELECT
        DATE(hour_bucket) AS date,
        ROUND(AVG(p50)::numeric, 2) AS p50,
        ROUND(AVG(p75)::numeric, 2) AS p75,
        ROUND(AVG(p90)::numeric, 2) AS p90,
        ROUND(AVG(p95)::numeric, 2) AS p95,
        ROUND(AVG(p99)::numeric, 2) AS p99,
        SUM(sample_count) AS count
       FROM rum_hourly_aggregates
       WHERE ${where}
       GROUP BY DATE(hour_bucket)
       ORDER BY date`,
      params,
    );
    return result.rows.map((r: any) => ({
      date: r.date,
      p50: Number(r.p50),
      p75: Number(r.p75),
      p90: Number(r.p90),
      p95: Number(r.p95),
      p99: Number(r.p99),
      count: Number(r.count),
    }));
  }
}
