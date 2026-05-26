import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface ScriptVersionRow {
  id: string;
  script_id: string;
  version_number: number;
  canonical_json: Record<string, unknown>;
  commit_sha: string | null;
  commit_message: string | null;
  author_id: string | null;
  created_at: Date;
}

export interface CreateVersionDto {
  script_id: string;
  canonical_json: Record<string, unknown>;
  commit_sha?: string;
  commit_message?: string;
  author_id?: string;
}

@Injectable()
export class ScriptVersionsService {
  private readonly logger = new Logger(ScriptVersionsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * List all versions for a script, newest first.
   */
  async listVersions(scriptId: string): Promise<ScriptVersionRow[]> {
    const result = await this.db.query<ScriptVersionRow>(
      "SELECT * FROM script_versions WHERE script_id = $1 ORDER BY version_number DESC",
      [scriptId],
    );
    return result.rows;
  }

  /**
   * Get a specific version by script ID and version number.
   */
  async getVersion(scriptId: string, versionNumber: number): Promise<ScriptVersionRow> {
    const result = await this.db.query<ScriptVersionRow>(
      "SELECT * FROM script_versions WHERE script_id = $1 AND version_number = $2",
      [scriptId, versionNumber],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(
        `Version ${versionNumber} of script ${scriptId} not found`,
      );
    }
    return result.rows[0];
  }

  /**
   * Create a new version for a script.
   * Automatically increments version_number.
   */
  async createVersion(dto: CreateVersionDto): Promise<ScriptVersionRow> {
    // Get next version number
    const maxResult = await this.db.query<{ max_ver: number }>(
      "SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM script_versions WHERE script_id = $1",
      [dto.script_id],
    );
    const nextVersion = (maxResult.rows[0]?.max_ver ?? 0) + 1;

    const result = await this.db.query<ScriptVersionRow>(
      `INSERT INTO script_versions (script_id, version_number, canonical_json, commit_sha, commit_message, author_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        dto.script_id,
        nextVersion,
        JSON.stringify(dto.canonical_json),
        dto.commit_sha ?? null,
        dto.commit_message ?? null,
        dto.author_id ?? null,
      ],
    );

    this.logger.log(`Created version ${nextVersion} for script ${dto.script_id}`);
    return result.rows[0];
  }

  /**
   * Diff two versions (returns both canonical_json payloads).
   */
  async diffVersions(
    scriptId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<{ from: ScriptVersionRow; to: ScriptVersionRow }> {
    const [from, to] = await Promise.all([
      this.getVersion(scriptId, fromVersion),
      this.getVersion(scriptId, toVersion),
    ]);
    return { from, to };
  }
}
