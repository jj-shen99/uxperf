import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

/**
 * Per-request data service.
 * Currently backed by Postgres; designed for easy migration to ClickHouse.
 * Cardinality controls: URL domains are stored as-is but aggregation
 * queries group by resource_type and is_third_party to limit cardinality.
 */

export interface PerRequestRow {
  id: string;
  run_id: string;
  request_url: string;
  method: string;
  status_code: number | null;
  resource_type: string | null;
  transfer_size: number | null;
  content_size: number | null;
  duration_ms: number | null;
  ttfb_ms: number | null;
  protocol: string | null;
  is_third_party: boolean;
  created_at: Date;
}

export interface IngestRequestDto {
  run_id: string;
  requests: Array<{
    request_url: string;
    method?: string;
    status_code?: number;
    resource_type?: string;
    transfer_size?: number;
    content_size?: number;
    duration_ms?: number;
    ttfb_ms?: number;
    protocol?: string;
    is_third_party?: boolean;
  }>;
}

export interface RequestSummary {
  resource_type: string;
  count: number;
  total_transfer_size: number;
  total_content_size: number;
  avg_duration_ms: number;
  avg_ttfb_ms: number;
  third_party_count: number;
}

@Injectable()
export class PerRequestService {
  private readonly logger = new Logger(PerRequestService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Bulk ingest per-request data for a run.
   */
  async ingest(dto: IngestRequestDto): Promise<number> {
    if (!dto.requests || dto.requests.length === 0) return 0;

    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const req of dto.requests) {
      values.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
      );
      params.push(
        dto.run_id,
        req.request_url,
        req.method ?? "GET",
        req.status_code ?? null,
        req.resource_type ?? null,
        req.transfer_size ?? null,
        req.content_size ?? null,
        req.duration_ms ?? null,
        req.ttfb_ms ?? null,
        req.protocol ?? null,
        req.is_third_party ?? false,
      );
    }

    await this.db.query(
      `INSERT INTO per_request_data (run_id, request_url, method, status_code, resource_type, transfer_size, content_size, duration_ms, ttfb_ms, protocol, is_third_party)
       VALUES ${values.join(", ")}`,
      params,
    );

    this.logger.log(`Ingested ${dto.requests.length} per-request records for run ${dto.run_id}`);
    return dto.requests.length;
  }

  /**
   * Get per-request data for a run.
   */
  async findByRun(runId: string, limit = 500): Promise<PerRequestRow[]> {
    const result = await this.db.query<PerRequestRow>(
      "SELECT * FROM per_request_data WHERE run_id = $1 ORDER BY duration_ms DESC NULLS LAST LIMIT $2",
      [runId, Math.min(limit, 2000)],
    );
    return result.rows;
  }

  /**
   * Aggregated summary by resource type (cardinality-controlled).
   */
  async summarizeByRun(runId: string): Promise<RequestSummary[]> {
    const result = await this.db.query<RequestSummary>(
      `SELECT
        COALESCE(resource_type, 'other') AS resource_type,
        COUNT(*)::int AS count,
        COALESCE(SUM(transfer_size), 0)::int AS total_transfer_size,
        COALESCE(SUM(content_size), 0)::int AS total_content_size,
        ROUND(AVG(duration_ms)::numeric, 2)::float AS avg_duration_ms,
        ROUND(AVG(ttfb_ms)::numeric, 2)::float AS avg_ttfb_ms,
        COUNT(*) FILTER (WHERE is_third_party = true)::int AS third_party_count
       FROM per_request_data
       WHERE run_id = $1
       GROUP BY resource_type
       ORDER BY total_transfer_size DESC`,
      [runId],
    );
    return result.rows;
  }
}
