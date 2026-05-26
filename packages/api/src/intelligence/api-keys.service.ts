import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { createHash, randomBytes } from "crypto";

export interface ApiKeyRow {
  id: string;
  project_id: string;
  user_id: string | null;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_rpm: number;
  rate_limit_rpd: number;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateApiKeyDto {
  project_id: string;
  user_id?: string;
  name: string;
  scopes?: string[];
  rate_limit_rpm?: number;
  rate_limit_rpd?: number;
  expires_at?: string;
}

export interface ApiKeyCreated {
  id: string;
  key: string;       // shown only on creation
  key_prefix: string;
  name: string;
  scopes: string[];
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new API key. The raw key is returned only once.
   */
  async create(dto: CreateApiKeyDto): Promise<ApiKeyCreated> {
    const rawKey = `pfk_${randomBytes(24).toString("hex")}`;
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);
    const scopes = dto.scopes ?? ["read"];

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO api_keys
        (project_id, user_id, name, key_hash, key_prefix, scopes,
         rate_limit_rpm, rate_limit_rpd, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        dto.project_id,
        dto.user_id ?? null,
        dto.name,
        keyHash,
        keyPrefix,
        scopes,
        dto.rate_limit_rpm ?? 60,
        dto.rate_limit_rpd ?? 10000,
        dto.expires_at ?? null,
      ],
    );

    return {
      id: result.rows[0].id,
      key: rawKey,
      key_prefix: keyPrefix,
      name: dto.name,
      scopes,
    };
  }

  /**
   * Validate an API key. Returns the key record if valid, null otherwise.
   */
  async validate(rawKey: string): Promise<ApiKeyRow | null> {
    const keyHash = this.hashKey(rawKey);

    const result = await this.db.query<ApiKeyRow>(
      `SELECT id, project_id, user_id, name, key_prefix, scopes,
              rate_limit_rpm, rate_limit_rpd, expires_at, last_used_at, is_active, created_at
       FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );

    const key = result.rows[0];
    if (!key) return null;
    if (!key.is_active) return null;
    if (key.expires_at && new Date(key.expires_at) < new Date()) return null;

    // Update last_used_at
    await this.db.query(
      "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
      [key.id],
    );

    return key;
  }

  /**
   * Check if a key has a required scope.
   */
  hasScope(key: ApiKeyRow, requiredScope: string): boolean {
    return key.scopes.includes(requiredScope) || key.scopes.includes("admin");
  }

  async list(projectId: string): Promise<ApiKeyRow[]> {
    const result = await this.db.query<ApiKeyRow>(
      `SELECT id, project_id, user_id, name, key_prefix, scopes,
              rate_limit_rpm, rate_limit_rpd, expires_at, last_used_at, is_active, created_at
       FROM api_keys WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  async revoke(id: string): Promise<void> {
    const result = await this.db.query(
      "UPDATE api_keys SET is_active = false WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException(`API key ${id} not found`);
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query(
      "DELETE FROM api_keys WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException(`API key ${id} not found`);
    }
  }

  private hashKey(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }
}
