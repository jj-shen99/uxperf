import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

/**
 * Platform-wide configuration store (key-value in `platform_config` table).
 * Falls back gracefully if the table doesn't exist yet.
 */
@Injectable()
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);

  constructor(private readonly db: DatabaseService) {}

  async get(key: string): Promise<string | null> {
    try {
      const res = await this.db.query<{ value: string }>(
        "SELECT value FROM platform_config WHERE key = $1",
        [key],
      );
      return res.rows[0]?.value ?? null;
    } catch {
      // Table may not exist — return null
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO platform_config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value],
      );
    } catch (err) {
      this.logger.warn(`Failed to set config ${key}: ${err}`);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.db.query("DELETE FROM platform_config WHERE key = $1", [key]);
    } catch {
      // ignore
    }
  }

  async getAll(prefix?: string): Promise<Record<string, string>> {
    try {
      const res = prefix
        ? await this.db.query<{ key: string; value: string }>(
            "SELECT key, value FROM platform_config WHERE key LIKE $1",
            [`${prefix}%`],
          )
        : await this.db.query<{ key: string; value: string }>(
            "SELECT key, value FROM platform_config",
          );
      const map: Record<string, string> = {};
      for (const row of res.rows) {
        map[row.key] = row.value;
      }
      return map;
    } catch {
      return {};
    }
  }
}
