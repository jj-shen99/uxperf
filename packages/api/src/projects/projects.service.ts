import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CreateProjectDto {
  name: string;
  owner_team: string;
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
        dto.owner_team,
        dto.description ?? null,
        JSON.stringify(dto.environment_configs ?? {}),
        dto.domain_allowlist ?? [],
      ]
    );
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
