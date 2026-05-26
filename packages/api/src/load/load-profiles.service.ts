import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface LoadProfileRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  stages: LoadStage[];
  target_vus: number;
  cache_state: "cold" | "warm" | "production_replay";
  ui_server_targets: UiServerTarget[];
  network_profile: string | null;
  device: string;
  concurrency_cap: number;
  created_at: string;
  updated_at: string;
}

export interface LoadStage {
  duration_s: number;
  target_vus: number;
  ramp_type?: "linear" | "step";
}

export interface UiServerTarget {
  host: string;
  port: number;
  scrape_path?: string;
  labels?: Record<string, string>;
}

export interface CreateLoadProfileDto {
  project_id: string;
  name: string;
  description?: string;
  stages: LoadStage[];
  target_vus: number;
  cache_state?: "cold" | "warm" | "production_replay";
  ui_server_targets?: UiServerTarget[];
  network_profile?: string;
  device?: string;
  concurrency_cap?: number;
}

@Injectable()
export class LoadProfilesService {
  private readonly logger = new Logger(LoadProfilesService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll(projectId?: string): Promise<LoadProfileRow[]> {
    if (projectId) {
      const result = await this.db.query<LoadProfileRow>(
        "SELECT * FROM load_profiles WHERE project_id = $1 ORDER BY created_at DESC",
        [projectId],
      );
      return result.rows;
    }
    const result = await this.db.query<LoadProfileRow>(
      "SELECT * FROM load_profiles ORDER BY created_at DESC LIMIT 100",
    );
    return result.rows;
  }

  async findById(id: string): Promise<LoadProfileRow> {
    const result = await this.db.query<LoadProfileRow>(
      "SELECT * FROM load_profiles WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Load profile ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateLoadProfileDto): Promise<LoadProfileRow> {
    const result = await this.db.query<LoadProfileRow>(
      `INSERT INTO load_profiles
        (project_id, name, description, stages, target_vus, cache_state,
         ui_server_targets, network_profile, device, concurrency_cap)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        dto.project_id,
        dto.name,
        dto.description ?? null,
        JSON.stringify(dto.stages),
        dto.target_vus,
        dto.cache_state ?? "warm",
        JSON.stringify(dto.ui_server_targets ?? []),
        dto.network_profile ?? null,
        dto.device ?? "desktop",
        dto.concurrency_cap ?? 10,
      ],
    );
    return result.rows[0];
  }

  async update(id: string, dto: Partial<CreateLoadProfileDto>): Promise<LoadProfileRow> {
    const existing = await this.findById(id);
    const result = await this.db.query<LoadProfileRow>(
      `UPDATE load_profiles SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        stages = COALESCE($4, stages),
        target_vus = COALESCE($5, target_vus),
        cache_state = COALESCE($6, cache_state),
        ui_server_targets = COALESCE($7, ui_server_targets),
        concurrency_cap = COALESCE($8, concurrency_cap)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        dto.name ?? null,
        dto.description ?? null,
        dto.stages ? JSON.stringify(dto.stages) : null,
        dto.target_vus ?? null,
        dto.cache_state ?? null,
        dto.ui_server_targets ? JSON.stringify(dto.ui_server_targets) : null,
        dto.concurrency_cap ?? null,
      ],
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM load_profiles WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException(`Load profile ${id} not found`);
    }
  }

  /**
   * Compute total duration of a load profile in seconds.
   */
  totalDuration(stages: LoadStage[]): number {
    return stages.reduce((sum, s) => sum + s.duration_s, 0);
  }

  /**
   * Compute peak VUs from stages.
   */
  peakVus(stages: LoadStage[]): number {
    return Math.max(...stages.map((s) => s.target_vus), 1);
  }

  /**
   * Validate cache state and pre-run conditions.
   */
  validateCacheState(cacheState: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!["cold", "warm", "production_replay"].includes(cacheState)) {
      errors.push(`Invalid cache_state: ${cacheState}`);
    }
    return { valid: errors.length === 0, errors };
  }
}
