import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CreateProjectDto {
  name: string;
  owner_team?: string;
  description?: string;
  environment_configs?: Record<string, unknown>;
  domain_allowlist?: string[];
}

export interface UpdateProjectDto {
  name?: string;
  owner_team?: string;
  description?: string;
  environment_configs?: Record<string, unknown>;
  domain_allowlist?: string[];
}

export interface ProjectRow {
  id: string;
  name: string;
  owner_team: string;
  description: string | null;
  environment_configs: Record<string, unknown>;
  quota: Record<string, unknown>;
  domain_allowlist: string[];
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ProjectsService {
  constructor(private db: DatabaseService) {}

  async findAll(): Promise<ProjectRow[]> {
    const result = await this.db.query<ProjectRow>(
      "SELECT * FROM projects ORDER BY created_at DESC"
    );
    return result.rows;
  }

  async findById(id: string): Promise<ProjectRow> {
    const result = await this.db.query<ProjectRow>(
      "SELECT * FROM projects WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateProjectDto): Promise<ProjectRow> {
    const result = await this.db.query<ProjectRow>(
      `INSERT INTO projects (name, owner_team, description, environment_configs, domain_allowlist)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        dto.name,
        dto.owner_team ?? "default",
        dto.description ?? null,
        JSON.stringify(dto.environment_configs ?? {}),
        dto.domain_allowlist ?? [],
      ]
    );
    return result.rows[0];
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.owner_team !== undefined) { sets.push(`owner_team = $${idx++}`); values.push(dto.owner_team); }
    if (dto.description !== undefined) { sets.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.environment_configs !== undefined) {
      sets.push(`environment_configs = $${idx++}`);
      values.push(JSON.stringify(dto.environment_configs));
    }
    if (dto.domain_allowlist !== undefined) {
      sets.push(`domain_allowlist = $${idx++}`);
      values.push(dto.domain_allowlist);
    }

    if (sets.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.db.query<ProjectRow>(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query(
      "DELETE FROM projects WHERE id = $1",
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }
}
