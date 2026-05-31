import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

/**
 * Gate Override Service (E-34).
 *
 * Ch 12, p155 / Ch 13, p168: "When a regression is justified, the engineer
 * should be able to acknowledge and proceed without disabling the check."
 *
 * Provides a structured override path with full audit trail:
 *   - Engineer requests override with justification
 *   - Approver (optional) approves/rejects
 *   - Override expires after a configurable window
 *   - Full audit log of who overrode what and why
 */

export interface GateOverrideRow {
  id: string;
  gate_id: string;
  gate_name: string;
  run_id: string;
  project_id: string;
  requested_by: string;
  approved_by: string | null;
  justification: string;
  status: "pending" | "approved" | "rejected" | "expired";
  expires_at: Date;
  created_at: Date;
  resolved_at: Date | null;
}

export interface CreateOverrideDto {
  gate_id: string;
  gate_name: string;
  run_id: string;
  project_id: string;
  requested_by: string;
  justification: string;
  ttl_hours?: number;        // default 24h
}

export interface OverrideDecisionDto {
  decided_by: string;
  decision: "approved" | "rejected";
  reason?: string;
}

@Injectable()
export class GateOverridesService {
  private readonly logger = new Logger(GateOverridesService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateOverrideDto): Promise<GateOverrideRow> {
    const ttlHours = dto.ttl_hours ?? 24;
    const result = await this.db.query<GateOverrideRow>(
      `INSERT INTO gate_overrides
        (gate_id, gate_name, run_id, project_id, requested_by, justification, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', now() + ($7 || ' hours')::interval)
       RETURNING *`,
      [
        dto.gate_id,
        dto.gate_name,
        dto.run_id,
        dto.project_id,
        dto.requested_by,
        dto.justification,
        ttlHours.toString(),
      ],
    );

    this.logger.log(
      `Override requested by ${dto.requested_by} for gate ${dto.gate_name} on run ${dto.run_id}`,
    );
    return result.rows[0];
  }

  async decide(id: string, dto: OverrideDecisionDto): Promise<GateOverrideRow> {
    const override = await this.findById(id);

    if (override.status !== "pending") {
      throw new Error(`Override ${id} is already ${override.status}`);
    }

    // Check expiry
    if (new Date(override.expires_at) < new Date()) {
      await this.db.query(
        "UPDATE gate_overrides SET status = 'expired', resolved_at = now() WHERE id = $1",
        [id],
      );
      throw new Error(`Override ${id} has expired`);
    }

    const result = await this.db.query<GateOverrideRow>(
      `UPDATE gate_overrides
       SET status = $2, approved_by = $3, resolved_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, dto.decision, dto.decided_by],
    );

    this.logger.log(
      `Override ${id} ${dto.decision} by ${dto.decided_by}${dto.reason ? `: ${dto.reason}` : ""}`,
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<GateOverrideRow> {
    const result = await this.db.query<GateOverrideRow>(
      "SELECT * FROM gate_overrides WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Override ${id} not found`);
    }
    return result.rows[0];
  }

  async findForRun(runId: string): Promise<GateOverrideRow[]> {
    const result = await this.db.query<GateOverrideRow>(
      "SELECT * FROM gate_overrides WHERE run_id = $1 ORDER BY created_at DESC",
      [runId],
    );
    return result.rows;
  }

  async findForProject(projectId: string, status?: string): Promise<GateOverrideRow[]> {
    const params: unknown[] = [projectId];
    let where = "project_id = $1";
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    const result = await this.db.query<GateOverrideRow>(
      `SELECT * FROM gate_overrides WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
      params,
    );
    return result.rows;
  }

  /**
   * Check if a gate has an active (approved, not expired) override for a run.
   */
  async hasActiveOverride(gateId: string, runId: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM gate_overrides
       WHERE gate_id = $1 AND run_id = $2 AND status = 'approved' AND expires_at > now()
       LIMIT 1`,
      [gateId, runId],
    );
    return result.rows.length > 0;
  }

  /**
   * Expire all pending overrides past their TTL.
   */
  async expireStale(): Promise<number> {
    const result = await this.db.query(
      `UPDATE gate_overrides
       SET status = 'expired', resolved_at = now()
       WHERE status = 'pending' AND expires_at < now()`,
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      this.logger.log(`Expired ${count} stale override(s)`);
    }
    return count;
  }

  /**
   * Get audit trail — all overrides with full details.
   */
  async getAuditTrail(
    projectId: string,
    limit = 50,
  ): Promise<GateOverrideRow[]> {
    const result = await this.db.query<GateOverrideRow>(
      `SELECT * FROM gate_overrides
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, Math.min(limit, 200)],
    );
    return result.rows;
  }
}
