import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface AuditEntry {
  id?: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  project_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at?: string;
}

export interface AuditQuery {
  project_id?: string;
  user_id?: string;
  action?: string;
  resource_type?: string;
  days?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Record an audit log entry.
   */
  async log(entry: AuditEntry): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO audit_log
        (user_id, action, resource_type, resource_id, project_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        entry.user_id ?? null,
        entry.action,
        entry.resource_type,
        entry.resource_id ?? null,
        entry.project_id ?? null,
        JSON.stringify(entry.details ?? {}),
        entry.ip_address ?? null,
        entry.user_agent ?? null,
      ],
    );
    return result.rows[0].id;
  }

  /**
   * Query audit log entries with filters.
   */
  async query(q: AuditQuery): Promise<AuditEntry[]> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (q.project_id) {
      params.push(q.project_id);
      conditions.push(`project_id = $${params.length}`);
    }
    if (q.user_id) {
      params.push(q.user_id);
      conditions.push(`user_id = $${params.length}`);
    }
    if (q.action) {
      params.push(q.action);
      conditions.push(`action = $${params.length}`);
    }
    if (q.resource_type) {
      params.push(q.resource_type);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (q.days) {
      params.push(q.days.toString());
      conditions.push(`created_at >= NOW() - ($${params.length} || ' days')::interval`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(q.limit ?? 100, 1000);
    params.push(limit);

    const result = await this.db.query<AuditEntry>(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  /**
   * Get audit summary — count of actions by type in the last N days.
   */
  async summary(projectId: string, days = 30): Promise<{ action: string; count: number }[]> {
    const result = await this.db.query<{ action: string; count: string }>(
      `SELECT action, COUNT(*) as count FROM audit_log
       WHERE project_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY action ORDER BY count DESC`,
      [projectId, days.toString()],
    );
    return result.rows.map((r) => ({ action: r.action, count: parseInt(r.count, 10) }));
  }
}
