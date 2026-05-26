import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

/**
 * Artifact storage service.
 * Phase 1: local filesystem. Future: S3-compatible object store.
 * Layout: ARTIFACTS_DIR/<run_id>/<filename>
 */
@Injectable()
export class ArtifactsService {
  private readonly logger = new Logger(ArtifactsService.name);
  private readonly baseDir: string;

  constructor() {
    this.baseDir = process.env.ARTIFACTS_DIR ?? path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Validate that a resolved path is inside the base artifacts directory.
   * Prevents path traversal attacks via malicious runId or filenames.
   */
  private safePath(relativePath: string): string {
    const resolved = path.resolve(this.baseDir, relativePath);
    const normalBase = path.resolve(this.baseDir);
    if (!resolved.startsWith(normalBase + path.sep) && resolved !== normalBase) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }
    return resolved;
  }

  private runDir(runId: string): string {
    const dir = this.safePath(runId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Save a JSON artifact for a run.
   * Returns the relative path suitable for storing in the DB.
   */
  async saveJson(runId: string, filename: string, data: unknown): Promise<string> {
    const filePath = this.safePath(`${runId}/${filename}`);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    const relPath = `${runId}/${filename}`;
    this.logger.log(`Saved artifact: ${relPath}`);
    return relPath;
  }

  /**
   * Save raw buffer (trace files, HARs).
   */
  async saveBuffer(runId: string, filename: string, data: Buffer): Promise<string> {
    const filePath = this.safePath(`${runId}/${filename}`);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await fs.promises.writeFile(filePath, data);
    return `${runId}/${filename}`;
  }

  /**
   * Read a JSON artifact.
   */
  async readJson(relativePath: string): Promise<unknown> {
    const filePath = this.safePath(relativePath);
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Check if artifact exists.
   */
  exists(relativePath: string): boolean {
    try {
      return fs.existsSync(this.safePath(relativePath));
    } catch {
      return false;
    }
  }

  /**
   * List artifacts for a run.
   */
  async listForRun(runId: string): Promise<string[]> {
    let dir: string;
    try { dir = this.safePath(runId); } catch { return []; }
    if (!fs.existsSync(dir)) return [];
    const files = await fs.promises.readdir(dir);
    return files.map((f) => `${runId}/${f}`);
  }

  /**
   * Get the full filesystem path for serving/downloading.
   */
  getAbsolutePath(relativePath: string): string {
    return this.safePath(relativePath);
  }
}
