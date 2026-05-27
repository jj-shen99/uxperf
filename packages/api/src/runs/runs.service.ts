import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CreateRunDto {
  project_id: string;
  script_id?: string;
  schedule_id?: string;
  mode?: string;
  engine?: string;
  environment?: string;
  config: {
    url: string;
    device?: string;
    network?: string;
    n_runs?: number;
    viewport?: { width: number; height: number };
  };
}

export interface UpdateRunDto {
  status?: string;
  metrics?: Record<string, unknown>;
  lighthouse_report_path?: string;
  trace_path?: string;
  har_path?: string;
  cost_actual?: number;
  started_at?: string;
  finished_at?: string;
  error?: string;
}

export interface RunRow {
  id: string;
  script_id: string | null;
  project_id: string;
  mode: string;
  engine: string;
  environment: string;
  status: string;
  config: Record<string, unknown>;
  metrics: Record<string, unknown> | null;
  lighthouse_report_path: string | null;
  trace_path: string | null;
  har_path: string | null;
  cost_estimate: number | null;
  cost_actual: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  error: string | null;
}

@Injectable()
export class RunsService {
  constructor(private db: DatabaseService) {}

  async findAll(projectId?: string): Promise<RunRow[]> {
    if (projectId) {
      const result = await this.db.query<RunRow>(
        "SELECT * FROM runs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100",
        [projectId]
      );
      return result.rows;
    }
    const result = await this.db.query<RunRow>(
      "SELECT * FROM runs ORDER BY created_at DESC LIMIT 100"
    );
    return result.rows;
  }

  async findById(id: string): Promise<RunRow> {
    const result = await this.db.query<RunRow>(
      "SELECT * FROM runs WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Run ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateRunDto): Promise<RunRow> {
    const result = await this.db.query<RunRow>(
      `INSERT INTO runs (project_id, script_id, schedule_id, mode, engine, environment, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')
       RETURNING *`,
      [
        dto.project_id,
        dto.script_id ?? null,
        dto.schedule_id ?? null,
        dto.mode ?? "stability",
        dto.engine ?? "playwright_lighthouse",
        dto.environment ?? "staging",
        JSON.stringify(dto.config),
      ]
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM runs WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException(`Run ${id} not found`);
    }
  }

  async update(id: string, dto: UpdateRunDto): Promise<RunRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.status !== undefined) {
      sets.push(`status = $${paramIndex++}`);
      values.push(dto.status);
    }
    if (dto.metrics !== undefined) {
      sets.push(`metrics = $${paramIndex++}`);
      values.push(JSON.stringify(dto.metrics));
    }
    if (dto.lighthouse_report_path !== undefined) {
      sets.push(`lighthouse_report_path = $${paramIndex++}`);
      values.push(dto.lighthouse_report_path);
    }
    if (dto.trace_path !== undefined) {
      sets.push(`trace_path = $${paramIndex++}`);
      values.push(dto.trace_path);
    }
    if (dto.har_path !== undefined) {
      sets.push(`har_path = $${paramIndex++}`);
      values.push(dto.har_path);
    }
    if (dto.cost_actual !== undefined) {
      sets.push(`cost_actual = $${paramIndex++}`);
      values.push(dto.cost_actual);
    }
    if (dto.started_at !== undefined) {
      sets.push(`started_at = $${paramIndex++}`);
      values.push(dto.started_at);
    }
    if (dto.finished_at !== undefined) {
      sets.push(`finished_at = $${paramIndex++}`);
      values.push(dto.finished_at);
    }
    if (dto.error !== undefined) {
      sets.push(`error = $${paramIndex++}`);
      values.push(dto.error);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await this.db.query<RunRow>(
      `UPDATE runs SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Run ${id} not found`);
    }
    return result.rows[0];
  }
}
