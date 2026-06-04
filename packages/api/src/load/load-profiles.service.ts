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
  script_id: string | null;
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
  script_id?: string;
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
         ui_server_targets, network_profile, device, concurrency_cap, script_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        dto.script_id ?? null,
      ],
    );
    return result.rows[0];
  }

  async update(id: string, dto: Partial<CreateLoadProfileDto>): Promise<LoadProfileRow> {
    await this.findById(id); // throws NotFoundException if missing

    const sets: string[] = [];
    const params: any[] = [id];
    let idx = 2;

    const field = (col: string, val: any) => {
      sets.push(`${col} = $${idx}`);
      params.push(val);
      idx++;
    };

    if ("name" in dto && dto.name != null)       field("name", dto.name);
    if ("description" in dto)                    field("description", dto.description ?? null);
    if ("stages" in dto && dto.stages)           field("stages", JSON.stringify(dto.stages));
    if ("target_vus" in dto && dto.target_vus != null) field("target_vus", dto.target_vus);
    if ("cache_state" in dto && dto.cache_state) field("cache_state", dto.cache_state);
    if ("ui_server_targets" in dto)              field("ui_server_targets", JSON.stringify(dto.ui_server_targets ?? []));
    if ("concurrency_cap" in dto)                field("concurrency_cap", dto.concurrency_cap ?? 10);
    if ("script_id" in dto)                      field("script_id", dto.script_id ?? null);

    sets.push("updated_at = now()");

    const result = await this.db.query<LoadProfileRow>(
      `UPDATE load_profiles SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      params,
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
