import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface RumEvent {
  project_id: string;
  page_url: string;
  origin: string;
  device_type?: string;
  connection_type?: string;
  country_code?: string;
  region?: string;
  lcp_ms?: number;
  fcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
  dom_interactive_ms?: number;
  dom_complete_ms?: number;
  load_event_ms?: number;
  total_transfer_bytes?: number;
  resource_count?: number;
  user_agent?: string;
  session_id?: string;
  nav_type?: string;
  sample_rate?: number;
  labels?: Record<string, string>;
  recorded_at?: string;
  custom_metrics?: Record<string, number>;
  build_hash?: string;
}

export interface RumSummary {
  origin: string;
  device_type: string;
  sample_count: number;
  lcp_p75: number | null;
  fcp_p75: number | null;
  inp_p75: number | null;
  cls_p75: number | null;
  ttfb_p75: number | null;
}

@Injectable()
export class RumIngestionService {
  private readonly logger = new Logger(RumIngestionService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Ingest a single RUM event.
   */
  async ingest(event: RumEvent): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO rum_events
        (project_id, page_url, origin, device_type, connection_type, country_code, region,
         lcp_ms, fcp_ms, inp_ms, cls, ttfb_ms,
         dom_interactive_ms, dom_complete_ms, load_event_ms,
         total_transfer_bytes, resource_count,
         user_agent, session_id, nav_type, sample_rate, labels, recorded_at,
         custom_metrics, build_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING id`,
      [
        event.project_id, event.page_url, event.origin,
        event.device_type ?? "desktop", event.connection_type ?? null,
        event.country_code ?? null, event.region ?? null,
        event.lcp_ms ?? null, event.fcp_ms ?? null, event.inp_ms ?? null,
        event.cls ?? null, event.ttfb_ms ?? null,
        event.dom_interactive_ms ?? null, event.dom_complete_ms ?? null,
        event.load_event_ms ?? null,
        event.total_transfer_bytes ?? null, event.resource_count ?? null,
        event.user_agent ?? null, event.session_id ?? null,
        event.nav_type ?? "navigate", event.sample_rate ?? 1.0,
        JSON.stringify(event.labels ?? {}),
        event.recorded_at ?? new Date().toISOString(),
        event.custom_metrics ? JSON.stringify(event.custom_metrics) : null,
        event.build_hash ?? null,
      ],
    );
    return result.rows[0];
  }

  /**
   * Batch ingest RUM events.
   */
  async ingestBatch(events: RumEvent[]): Promise<{ ingested: number }> {
    let ingested = 0;
    // Use a transaction for batch insert
    for (const event of events) {
      await this.ingest(event);
      ingested++;
    }
    return { ingested };
  }

  /**
   * Get p75 summary per origin/device for a project.
   */
  async getSummary(
    projectId: string,
    days = 28,
    origin?: string,
  ): Promise<RumSummary[]> {
    const params: unknown[] = [projectId, days];
    let where = "project_id = $1 AND recorded_at >= NOW() - ($2 || ' days')::interval";
    if (origin) {
      params.push(origin);
      where += ` AND origin = $${params.length}`;
    }

    const result = await this.db.query<RumSummary>(
      `SELECT
        origin,
        device_type,
        COUNT(*) AS sample_count,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lcp_ms) AS lcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY fcp_ms) AS fcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inp_ms) AS inp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cls) AS cls_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfb_ms) AS ttfb_p75
       FROM rum_events
       WHERE ${where}
       GROUP BY origin, device_type
       ORDER BY sample_count DESC`,
      params,
    );
    return result.rows;
  }

  /**
   * Get time-series trend of RUM metrics.
   */
  async getTrend(
    projectId: string,
    metric: string,
    days = 28,
    origin?: string,
  ): Promise<{ date: string; p75: number; p50: number; count: number }[]> {
    const metricCol = this.sanitizeMetricColumn(metric);
    const params: unknown[] = [projectId, days];
    let where = "project_id = $1 AND recorded_at >= NOW() - ($2 || ' days')::interval";
    if (origin) {
      params.push(origin);
      where += ` AND origin = $${params.length}`;
    }

    const result = await this.db.query<{ day: string; p75: number; p50: number; count: number }>(
      `SELECT
        DATE(recorded_at) AS day,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${metricCol}) AS p75,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${metricCol}) AS p50,
        COUNT(*) AS count
       FROM rum_events
       WHERE ${where} AND ${metricCol} IS NOT NULL
       GROUP BY DATE(recorded_at)
       ORDER BY day`,
      params,
    );
    return result.rows.map((r) => ({ date: r.day, p75: Number(r.p75), p50: Number(r.p50), count: Number(r.count) }));
  }

  private sanitizeMetricColumn(metric: string): string {
    const allowed = ["lcp_ms", "fcp_ms", "inp_ms", "cls", "ttfb_ms", "dom_complete_ms", "load_event_ms"];
    if (!allowed.includes(metric)) throw new Error(`Invalid RUM metric: ${metric}`);
    return metric;
  }
}
