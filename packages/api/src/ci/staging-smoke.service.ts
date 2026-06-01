/**
 * E-52: Staging Smoke-Test Gate
 *
 * Book: Ch 13, p215
 * "Run a reduced synthetic suite against staging per deploy.
 * Not per PR — this is the staging-as-sanity-check pattern."
 *
 * On staging deploy, runs a subset of scripts (tagged 'smoke') against
 * the staging URL, evaluates gates, and reports pass/fail.
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface SmokeTestConfig {
  project_id: string;
  staging_url: string;
  script_tag: string; // default: "smoke"
  timeout_s: number;  // max wait before declaring failure
  gate_policy: "block" | "warn"; // how to treat failures
}

export interface SmokeTestRun {
  id: string;
  project_id: string;
  staging_url: string;
  deploy_sha: string;
  status: "pending" | "running" | "passed" | "failed" | "timeout";
  scripts_total: number;
  scripts_passed: number;
  scripts_failed: number;
  gate_results: SmokeGateResult[];
  started_at: string | null;
  finished_at: string | null;
  duration_s: number | null;
  error: string | null;
  created_at: string;
}

export interface SmokeGateResult {
  script_name: string;
  metric: string;
  actual_value: number;
  threshold: number;
  operator: string;
  status: "passed" | "failed";
}

export interface CreateSmokeTestDto {
  project_id: string;
  staging_url: string;
  deploy_sha: string;
  scripts?: string[]; // specific script IDs, or empty for all smoke-tagged
}

@Injectable()
export class StagingSmokeService {
  private readonly logger = new Logger(StagingSmokeService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Register a new staging smoke test.
   */
  async createSmokeTest(dto: CreateSmokeTestDto): Promise<SmokeTestRun> {
    // Find smoke-tagged scripts for this project
    const scriptFilter = dto.scripts?.length
      ? `AND id = ANY($2::uuid[])`
      : `AND tags @> ARRAY['smoke']::text[]`;
    const scriptParams: unknown[] = [dto.project_id];
    if (dto.scripts?.length) scriptParams.push(dto.scripts);

    let scriptCount = 0;
    try {
      const scriptResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM scripts WHERE project_id = $1 ${scriptFilter}`,
        scriptParams,
      );
      scriptCount = parseInt(scriptResult.rows[0]?.count ?? "0", 10);
    } catch (err: any) {
      if (err?.code !== "42P01") throw err;
      this.logger.warn("scripts table not found; using 0 scripts");
    }

    const result = await this.insertSmokeRun({
      project_id: dto.project_id,
      staging_url: dto.staging_url,
      deploy_sha: dto.deploy_sha,
      scripts_total: scriptCount,
    });

    this.logger.log(
      `Created smoke test ${result.id} for ${dto.staging_url} ` +
      `(${scriptCount} scripts, sha: ${dto.deploy_sha.slice(0, 8)})`,
    );

    return result;
  }

  /**
   * Update smoke test with results.
   */
  async completeSmokeTest(
    id: string,
    results: {
      scripts_passed: number;
      scripts_failed: number;
      gate_results: SmokeGateResult[];
      error?: string;
    },
  ): Promise<SmokeTestRun> {
    const hasFailed = results.scripts_failed > 0 || results.gate_results.some((r) => r.status === "failed");
    const status = results.error ? "failed" : hasFailed ? "failed" : "passed";

    const result = await this.db.query<SmokeTestRun>(
      `UPDATE staging_smoke_tests SET
        status = $2,
        scripts_passed = $3,
        scripts_failed = $4,
        gate_results = $5,
        error = $6,
        finished_at = now(),
        duration_s = EXTRACT(EPOCH FROM (now() - started_at))::int
       WHERE id = $1 RETURNING *`,
      [
        id,
        status,
        results.scripts_passed,
        results.scripts_failed,
        JSON.stringify(results.gate_results),
        results.error ?? null,
      ],
    );

    this.logger.log(
      `Smoke test ${id} completed: ${status} ` +
      `(${results.scripts_passed} passed, ${results.scripts_failed} failed)`,
    );

    return result.rows[0];
  }

  /**
   * Find smoke tests for a project.
   */
  async findAll(projectId: string, limit = 20): Promise<SmokeTestRun[]> {
    const result = await this.db.query<SmokeTestRun>(
      `SELECT * FROM staging_smoke_tests
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return result.rows;
  }

  /**
   * Find a specific smoke test.
   */
  async findById(id: string): Promise<SmokeTestRun | null> {
    const result = await this.db.query<SmokeTestRun>(
      "SELECT * FROM staging_smoke_tests WHERE id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Timeout stale smoke tests.
   */
  async timeoutStale(maxAgeMinutes = 30): Promise<number> {
    try {
      const result = await this.db.query(
        `UPDATE staging_smoke_tests
         SET status = 'timeout', finished_at = now(),
             error = 'Timed out after ' || $1 || ' minutes'
         WHERE status IN ('pending', 'running')
           AND created_at < now() - MAKE_INTERVAL(mins => $1::int)
         RETURNING id`,
        [maxAgeMinutes],
      );
      const count = result.rows?.length ?? 0;
      if (count > 0) this.logger.warn(`Timed out ${count} stale smoke test(s)`);
      return count;
    } catch (err: any) {
      if (err?.code === "42P01") return 0;
      throw err;
    }
  }

  /**
   * Evaluate smoke gate: given metric results, check against default thresholds.
   */
  evaluateSmokeGates(
    metrics: Record<string, number>,
    thresholds: Record<string, { operator: string; value: number }>,
  ): SmokeGateResult[] {
    const results: SmokeGateResult[] = [];

    for (const [metric, actual] of Object.entries(metrics)) {
      const threshold = thresholds[metric];
      if (!threshold) continue;

      const passed = this.compareValue(actual, threshold.operator, threshold.value);
      results.push({
        script_name: "smoke",
        metric,
        actual_value: actual,
        threshold: threshold.value,
        operator: threshold.operator,
        status: passed ? "passed" : "failed",
      });
    }

    return results;
  }

  private compareValue(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case "lte": return actual <= threshold;
      case "lt":  return actual < threshold;
      case "gte": return actual >= threshold;
      case "gt":  return actual > threshold;
      default: return actual <= threshold;
    }
  }

  private async insertSmokeRun(data: {
    project_id: string;
    staging_url: string;
    deploy_sha: string;
    scripts_total: number;
  }): Promise<SmokeTestRun> {
    try {
      const result = await this.db.query<SmokeTestRun>(
        `INSERT INTO staging_smoke_tests
          (project_id, staging_url, deploy_sha, status, scripts_total,
           scripts_passed, scripts_failed, gate_results, started_at)
         VALUES ($1, $2, $3, 'running', $4, 0, 0, '[]'::jsonb, now())
         RETURNING *`,
        [data.project_id, data.staging_url, data.deploy_sha, data.scripts_total],
      );
      return result.rows[0];
    } catch (err: any) {
      // Table not created yet — return a mock
      if (err?.code === "42P01") {
        this.logger.warn("staging_smoke_tests table not yet created");
        return {
          id: "mock-smoke-" + Date.now(),
          project_id: data.project_id,
          staging_url: data.staging_url,
          deploy_sha: data.deploy_sha,
          status: "pending",
          scripts_total: data.scripts_total,
          scripts_passed: 0,
          scripts_failed: 0,
          gate_results: [],
          started_at: new Date().toISOString(),
          finished_at: null,
          duration_s: null,
          error: null,
          created_at: new Date().toISOString(),
        };
      }
      throw err;
    }
  }
}
