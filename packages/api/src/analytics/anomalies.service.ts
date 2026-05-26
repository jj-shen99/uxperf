import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ChangePointService, ChangePointResult } from "./change-point.service";

export interface AnomalyRow {
  id: string;
  project_id: string;
  run_id: string | null;
  metric: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  detector: string;
  description: string;
  details: Record<string, unknown>;
  attribution: Record<string, unknown> | null;
  change_point_at: string | null;
  detected_at: string;
  resolved_at: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAnomalyDto {
  project_id: string;
  run_id?: string;
  metric: string;
  severity?: "info" | "warning" | "critical";
  detector: string;
  description: string;
  details?: Record<string, unknown>;
  attribution?: Record<string, unknown>;
  change_point_at?: string;
}

@Injectable()
export class AnomaliesService {
  private readonly logger = new Logger(AnomaliesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly changePointService: ChangePointService,
  ) {}

  async findAll(
    projectId?: string,
    status?: string,
    limit = 50,
  ): Promise<AnomalyRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (projectId) {
      params.push(projectId);
      conditions.push(`project_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(Math.min(limit, 200));

    const result = await this.db.query<AnomalyRow>(
      `SELECT * FROM anomalies ${where} ORDER BY detected_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  async findById(id: string): Promise<AnomalyRow> {
    const result = await this.db.query<AnomalyRow>(
      "SELECT * FROM anomalies WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Anomaly ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateAnomalyDto): Promise<AnomalyRow> {
    const result = await this.db.query<AnomalyRow>(
      `INSERT INTO anomalies
        (project_id, run_id, metric, severity, detector, description, details, attribution, change_point_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.project_id,
        dto.run_id ?? null,
        dto.metric,
        dto.severity ?? "warning",
        dto.detector,
        dto.description,
        JSON.stringify(dto.details ?? {}),
        dto.attribution ? JSON.stringify(dto.attribution) : null,
        dto.change_point_at ?? null,
      ],
    );
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: "acknowledged" | "resolved" | "false_positive",
    resolvedBy?: string,
  ): Promise<AnomalyRow> {
    const sets = ["status = $2"];
    const params: unknown[] = [id, status];

    if (status === "resolved" || status === "false_positive") {
      sets.push(`resolved_at = now()`);
    }
    if (resolvedBy) {
      params.push(resolvedBy);
      sets.push(`resolved_by = $${params.length}`);
    }

    const result = await this.db.query<AnomalyRow>(
      `UPDATE anomalies SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      params,
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Anomaly ${id} not found`);
    }
    return result.rows[0];
  }

  async provideFeedback(
    id: string,
    feedback: "correct" | "incorrect" | "partial",
  ): Promise<AnomalyRow> {
    const result = await this.db.query<AnomalyRow>(
      "UPDATE anomalies SET feedback = $2 WHERE id = $1 RETURNING *",
      [id, feedback],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Anomaly ${id} not found`);
    }
    return result.rows[0];
  }

  /**
   * Run change-point detection for a project and persist any new anomalies.
   * Deduplicates: won't create an anomaly if one already exists for the same
   * metric + run_id.
   */
  async analyzeProject(
    projectId: string,
    environment?: string,
  ): Promise<AnomalyRow[]> {
    const changePoints = await this.changePointService.detectForProject(
      projectId,
      environment,
    );

    const created: AnomalyRow[] = [];

    for (const cp of changePoints) {
      if (!cp.detected || !cp.changeRunId) continue;

      // Dedup check
      const existing = await this.db.query(
        `SELECT id FROM anomalies
         WHERE project_id = $1 AND metric = $2 AND run_id = $3 AND detector = $4`,
        [projectId, cp.metric, cp.changeRunId, cp.detector],
      );
      if (existing.rows.length > 0) continue;

      const anomaly = await this.create({
        project_id: projectId,
        run_id: cp.changeRunId,
        metric: cp.metric,
        severity: cp.severity,
        detector: cp.detector,
        description: cp.description,
        details: cp.details,
      });

      created.push(anomaly);
      this.logger.log(
        `Created anomaly for ${cp.metric} in project ${projectId}: ${cp.description}`,
      );
    }

    return created;
  }
}
