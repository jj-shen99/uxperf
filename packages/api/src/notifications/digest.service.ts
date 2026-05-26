import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "./notifications.service";

export interface DigestScheduleRow {
  id: string;
  project_id: string;
  channel_id: string;
  digest_type: "daily" | "weekly" | "monthly";
  cron_expression: string;
  config: Record<string, unknown>;
  enabled: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(projectId?: string): Promise<DigestScheduleRow[]> {
    if (projectId) {
      const result = await this.db.query<DigestScheduleRow>(
        "SELECT * FROM digest_schedules WHERE project_id = $1 ORDER BY created_at DESC",
        [projectId],
      );
      return result.rows;
    }
    const result = await this.db.query<DigestScheduleRow>(
      "SELECT * FROM digest_schedules ORDER BY created_at DESC LIMIT 100",
    );
    return result.rows;
  }

  async findById(id: string): Promise<DigestScheduleRow> {
    const result = await this.db.query<DigestScheduleRow>(
      "SELECT * FROM digest_schedules WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Digest schedule ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: {
    project_id: string;
    channel_id: string;
    digest_type: "daily" | "weekly" | "monthly";
    cron_expression: string;
    config?: Record<string, unknown>;
  }): Promise<DigestScheduleRow> {
    const nextSendAt = this.computeNextSend(dto.cron_expression);
    const result = await this.db.query<DigestScheduleRow>(
      `INSERT INTO digest_schedules
        (project_id, channel_id, digest_type, cron_expression, config, next_send_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        dto.project_id,
        dto.channel_id,
        dto.digest_type,
        dto.cron_expression,
        JSON.stringify(dto.config ?? {}),
        nextSendAt,
      ],
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query(
      "DELETE FROM digest_schedules WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException(`Digest schedule ${id} not found`);
    }
  }

  /**
   * Find due digests and send them.
   */
  async processDueDigests(): Promise<number> {
    const result = await this.db.query<DigestScheduleRow>(
      `SELECT * FROM digest_schedules
       WHERE enabled = true AND next_send_at <= now()
       ORDER BY next_send_at ASC
       LIMIT 50`,
    );

    let sent = 0;

    for (const digest of result.rows) {
      try {
        // Build digest content based on type
        const content = await this.buildDigestContent(digest);

        // Dispatch via notifications service
        await this.notificationsService.dispatch({
          event: "digest",
          project_id: digest.project_id,
          title: `${digest.digest_type.charAt(0).toUpperCase() + digest.digest_type.slice(1)} Performance Digest`,
          message: content,
        });

        // Update last_sent_at and next_send_at
        const nextSend = this.computeNextSend(digest.cron_expression);
        await this.db.query(
          `UPDATE digest_schedules
           SET last_sent_at = now(), next_send_at = $2
           WHERE id = $1`,
          [digest.id, nextSend],
        );

        sent++;
        this.logger.log(`Sent ${digest.digest_type} digest for project ${digest.project_id}`);
      } catch (e) {
        this.logger.error(`Failed to send digest ${digest.id}: ${e}`);
      }
    }

    return sent;
  }

  /**
   * Build digest content from recent run data.
   */
  private async buildDigestContent(digest: DigestScheduleRow): Promise<string> {
    const days = digest.digest_type === "daily" ? 1 : digest.digest_type === "weekly" ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000);

    const stats = await this.db.query(
      `SELECT
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        AVG((metrics->>'lcp_ms')::numeric) FILTER (WHERE status = 'completed' AND metrics IS NOT NULL) AS avg_lcp
       FROM runs
       WHERE project_id = $1 AND created_at >= $2`,
      [digest.project_id, since],
    );

    const row = stats.rows[0] || {};
    const totalRuns = parseInt(row.total_runs, 10) || 0;
    const completed = parseInt(row.completed, 10) || 0;
    const failed = parseInt(row.failed, 10) || 0;
    const avgLcp = row.avg_lcp ? parseFloat(row.avg_lcp).toFixed(0) : "N/A";

    return [
      `📊 *${digest.digest_type} Performance Digest*`,
      `Period: last ${days} day(s)`,
      `Runs: ${totalRuns} total (${completed} passed, ${failed} failed)`,
      `Avg LCP: ${avgLcp} ms`,
      `Pass rate: ${totalRuns > 0 ? Math.round((completed / totalRuns) * 100) : 0}%`,
    ].join("\n");
  }

  /**
   * Simple next-send computation from cron expression.
   * For production: use a real cron parser.
   */
  private computeNextSend(cronExpression: string): Date {
    // Simplified: daily = +24h, weekly = +7d, monthly = +30d
    const now = new Date();
    if (cronExpression.includes("daily") || cronExpression === "0 9 * * *") {
      return new Date(now.getTime() + 86400000);
    }
    if (cronExpression.includes("weekly") || cronExpression === "0 9 * * 1") {
      return new Date(now.getTime() + 7 * 86400000);
    }
    return new Date(now.getTime() + 30 * 86400000);
  }
}
