import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CreateScheduleDto {
  project_id: string;
  script_id?: string;
  name: string;
  cron_expression: string;
  config: Record<string, unknown>;
  environment?: string;
  enabled?: boolean;
}

export interface UpdateScheduleDto {
  name?: string;
  cron_expression?: string;
  config?: Record<string, unknown>;
  environment?: string;
  enabled?: boolean;
}

export interface ScheduleRow {
  id: string;
  project_id: string;
  script_id: string | null;
  name: string;
  cron_expression: string;
  enabled: boolean;
  config: Record<string, unknown>;
  environment: string;
  last_run_at: Date | null;
  next_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Parse a 5-field cron expression and compute the next occurrence after `after`.
 * Supports: minute, hour, day-of-month, month, day-of-week.
 * Wildcards (*) and simple numeric values only (no ranges/lists in this MVP).
 */
export function computeNextRun(cron: string, after: Date): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${cron}`);

  const [minField, hourField, domField, monField, dowField] = parts;

  const parseField = (field: string, max: number): number | null => {
    if (field === "*") return null;
    const n = parseInt(field, 10);
    if (isNaN(n) || n < 0 || n > max) return null;
    return n;
  };

  const minute = parseField(minField, 59);
  const hour = parseField(hourField, 23);
  const dom = parseField(domField, 31);
  const month = parseField(monField, 12);
  const dow = parseField(dowField, 6);

  // Simple forward search from `after`, checking each minute for up to 366 days
  const candidate = new Date(after);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const maxIterations = 366 * 24 * 60; // 366 days of minutes
  for (let i = 0; i < maxIterations; i++) {
    const matches =
      (minute === null || candidate.getUTCMinutes() === minute) &&
      (hour === null || candidate.getUTCHours() === hour) &&
      (dom === null || candidate.getUTCDate() === dom) &&
      (month === null || candidate.getUTCMonth() + 1 === month) &&
      (dow === null || candidate.getUTCDay() === dow);

    if (matches) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  // Fallback: next day same time
  const fallback = new Date(after);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(private db: DatabaseService) {}

  async findAll(projectId?: string): Promise<ScheduleRow[]> {
    if (projectId) {
      const result = await this.db.query<ScheduleRow>(
        "SELECT * FROM schedules WHERE project_id = $1 ORDER BY created_at DESC",
        [projectId]
      );
      return result.rows;
    }
    const result = await this.db.query<ScheduleRow>(
      "SELECT * FROM schedules ORDER BY created_at DESC LIMIT 100"
    );
    return result.rows;
  }

  async findById(id: string): Promise<ScheduleRow> {
    const result = await this.db.query<ScheduleRow>(
      "SELECT * FROM schedules WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateScheduleDto): Promise<ScheduleRow> {
    const nextRun = computeNextRun(dto.cron_expression, new Date());
    const result = await this.db.query<ScheduleRow>(
      `INSERT INTO schedules (project_id, script_id, name, cron_expression, config, environment, enabled, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        dto.project_id,
        dto.script_id ?? null,
        dto.name,
        dto.cron_expression,
        JSON.stringify(dto.config),
        dto.environment ?? "staging",
        dto.enabled ?? true,
        nextRun.toISOString(),
      ]
    );
    return result.rows[0];
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<ScheduleRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.cron_expression !== undefined) {
      sets.push(`cron_expression = $${idx++}`);
      values.push(dto.cron_expression);
      const nextRun = computeNextRun(dto.cron_expression, new Date());
      sets.push(`next_run_at = $${idx++}`);
      values.push(nextRun.toISOString());
    }
    if (dto.config !== undefined) { sets.push(`config = $${idx++}`); values.push(JSON.stringify(dto.config)); }
    if (dto.environment !== undefined) { sets.push(`environment = $${idx++}`); values.push(dto.environment); }
    if (dto.enabled !== undefined) { sets.push(`enabled = $${idx++}`); values.push(dto.enabled); }

    if (sets.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.db.query<ScheduleRow>(
      `UPDATE schedules SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM schedules WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
  }

  /**
   * Find schedules that are due for execution (next_run_at <= now).
   */
  async findDueSchedules(): Promise<ScheduleRow[]> {
    const result = await this.db.query<ScheduleRow>(
      "SELECT * FROM schedules WHERE enabled = true AND next_run_at <= now() ORDER BY next_run_at ASC LIMIT 50"
    );
    return result.rows;
  }

  /**
   * After dispatching a scheduled run, update last_run_at and compute next_run_at.
   */
  async markExecuted(id: string): Promise<void> {
    const schedule = await this.findById(id);
    const now = new Date();
    const nextRun = computeNextRun(schedule.cron_expression, now);
    await this.db.query(
      "UPDATE schedules SET last_run_at = $1, next_run_at = $2 WHERE id = $3",
      [now.toISOString(), nextRun.toISOString(), id]
    );
  }
}
