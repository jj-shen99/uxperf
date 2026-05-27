import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CreateScriptDto {
  project_id: string;
  name: string;
  canonical_json: Record<string, unknown>;
  source_prompt?: string;
  version_ref?: string;
  authoring_mode?: string;
  template_id?: string;
  user_id?: string;
}

export interface UpdateScriptDto {
  name?: string;
  canonical_json?: Record<string, unknown>;
  source_prompt?: string;
  version_ref?: string;
}

export interface ScriptRow {
  id: string;
  project_id: string;
  user_id: string | null;
  name: string;
  canonical_json: Record<string, unknown>;
  source_prompt: string | null;
  version_ref: string | null;
  authoring_mode: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ScriptsService {
  constructor(private db: DatabaseService) {}

  async findAll(projectId?: string, userId?: string, isAdmin?: boolean): Promise<ScriptRow[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (projectId) {
      conditions.push(`project_id = $${idx++}`);
      values.push(projectId);
    }
    if (userId && !isAdmin) {
      conditions.push(`user_id = $${idx++}`);
      values.push(userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.db.query<ScriptRow>(
      `SELECT * FROM scripts ${where} ORDER BY updated_at DESC LIMIT 100`,
      values
    );
    return result.rows;
  }

  async findById(id: string): Promise<ScriptRow> {
    const result = await this.db.query<ScriptRow>(
      "SELECT * FROM scripts WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Script ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateScriptDto): Promise<ScriptRow> {
    const result = await this.db.query<ScriptRow>(
      `INSERT INTO scripts (project_id, name, canonical_json, source_prompt, version_ref, authoring_mode, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        dto.project_id,
        dto.name,
        JSON.stringify(dto.canonical_json),
        dto.template_id ? `template:${dto.template_id}` : (dto.source_prompt ?? null),
        dto.version_ref ?? null,
        dto.template_id ? "template" : (dto.authoring_mode ?? "manual"),
        dto.user_id ?? null,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, dto: UpdateScriptDto): Promise<ScriptRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.canonical_json !== undefined) {
      sets.push(`canonical_json = $${paramIndex++}`);
      values.push(JSON.stringify(dto.canonical_json));
    }
    if (dto.source_prompt !== undefined) {
      sets.push(`source_prompt = $${paramIndex++}`);
      values.push(dto.source_prompt);
    }
    if (dto.version_ref !== undefined) {
      sets.push(`version_ref = $${paramIndex++}`);
      values.push(dto.version_ref);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await this.db.query<ScriptRow>(
      `UPDATE scripts SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Script ${id} not found`);
    }
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query(
      "DELETE FROM scripts WHERE id = $1",
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundException(`Script ${id} not found`);
    }
  }
}
