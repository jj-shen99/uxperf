/**
 * Deploy Watch Service (E-50)
 *
 * Book Ch 14, p244; Ch 15, p260:
 * "After code merges and deploys, the platform watches RUM for the new
 * build hash, compares against baseline, and posts pass/fail back to
 * the deploy system."
 *
 * Flow:
 *   1. Deploy system calls registerDeploy(projectId, buildHash, sha)
 *   2. Periodic check (or webhook) calls evaluateDeploy()
 *   3. Once enough RUM events for the new build hash arrive,
 *      compare p75 against baseline
 *   4. Post commit status (success/failure) via GitHub API
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { GitHubCheckService, GitHubCheckConfig } from "./github-check.service";

export interface DeployRecord {
  id: string;
  project_id: string;
  build_hash: string;
  git_sha: string;
  environment: string;
  status: "pending" | "evaluating" | "passed" | "failed" | "expired";
  deployed_at: string;
  evaluated_at: string | null;
  rum_sample_count: number;
  result_details: Record<string, unknown> | null;
}

export interface RegisterDeployInput {
  project_id: string;
  build_hash: string;
  git_sha: string;
  environment?: string;
  github_owner?: string;
  github_repo?: string;
  github_token?: string;
}

export interface DeployEvaluationResult {
  deploy_id: string;
  status: "pending" | "passed" | "failed" | "expired";
  rum_samples: number;
  required_samples: number;
  metrics_evaluated: Array<{
    metric: string;
    baseline_p75: number | null;
    deploy_p75: number | null;
    delta_pct: number | null;
    passed: boolean;
  }>;
  commit_status_posted: boolean;
}

const RUM_METRICS = ["lcp_ms", "fcp_ms", "inp_ms", "cls", "ttfb_ms"] as const;
const MIN_SAMPLES = 30;
const REGRESSION_THRESHOLD_PCT = 15; // fail if any metric regresses > 15%
const EXPIRE_HOURS = 48;

@Injectable()
export class DeployWatchService {
  private readonly logger = new Logger(DeployWatchService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly github: GitHubCheckService,
  ) {}

  /**
   * Register a new deploy for monitoring.
   */
  async registerDeploy(input: RegisterDeployInput): Promise<DeployRecord> {
    const result = await this.db.query<DeployRecord>(
      `INSERT INTO deploy_watches
        (project_id, build_hash, git_sha, environment, status, deployed_at,
         github_owner, github_repo, github_token)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), $5, $6, $7)
       RETURNING *`,
      [
        input.project_id,
        input.build_hash,
        input.git_sha,
        input.environment ?? "production",
        input.github_owner ?? null,
        input.github_repo ?? null,
        input.github_token ?? null,
      ],
    );

    this.logger.log(
      `Registered deploy watch: ${input.build_hash} for project ${input.project_id}`,
    );

    return result.rows[0];
  }

  /**
   * Evaluate a pending deploy by comparing RUM data for the build hash
   * against baseline p75.
   */
  async evaluateDeploy(deployId: string): Promise<DeployEvaluationResult> {
    const deploy = await this.getDeployById(deployId);
    if (!deploy) {
      throw new Error(`Deploy ${deployId} not found`);
    }

    if (deploy.status !== "pending" && deploy.status !== "evaluating") {
      return {
        deploy_id: deployId,
        status: deploy.status,
        rum_samples: deploy.rum_sample_count,
        required_samples: MIN_SAMPLES,
        metrics_evaluated: [],
        commit_status_posted: false,
      };
    }

    // Check for expiry
    const deployedAt = new Date(deploy.deployed_at);
    const hoursElapsed = (Date.now() - deployedAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed > EXPIRE_HOURS) {
      await this.updateDeployStatus(deployId, "expired");
      return {
        deploy_id: deployId,
        status: "expired",
        rum_samples: 0,
        required_samples: MIN_SAMPLES,
        metrics_evaluated: [],
        commit_status_posted: false,
      };
    }

    // Count RUM events for this build hash
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM rum_events
       WHERE project_id = $1 AND build_hash = $2
         AND recorded_at >= $3`,
      [deploy.project_id, deploy.build_hash, deploy.deployed_at],
    );
    const rumSamples = parseInt(countResult.rows[0]?.count ?? "0", 10);

    if (rumSamples < MIN_SAMPLES) {
      await this.updateDeployStatus(deployId, "evaluating", rumSamples);
      return {
        deploy_id: deployId,
        status: "pending",
        rum_samples: rumSamples,
        required_samples: MIN_SAMPLES,
        metrics_evaluated: [],
        commit_status_posted: false,
      };
    }

    // Enough samples — compute RUM p75 for each metric and compare against baseline
    const metricsEvaluated: DeployEvaluationResult["metrics_evaluated"] = [];
    let allPassed = true;

    for (const metric of RUM_METRICS) {
      const p75Result = await this.db.query<{ p75: number }>(
        `SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${metric}) AS p75
         FROM rum_events
         WHERE project_id = $1 AND build_hash = $2
           AND recorded_at >= $3 AND ${metric} IS NOT NULL`,
        [deploy.project_id, deploy.build_hash, deploy.deployed_at],
      );
      const deployP75 = p75Result.rows[0]?.p75 != null ? Number(p75Result.rows[0].p75) : null;

      // Get baseline p75
      const baselineResult = await this.db.query<{ p75: number }>(
        `SELECT p75 FROM baselines
         WHERE project_id = $1 AND metric = $2
           AND environment = $3 AND is_active = true
         ORDER BY computed_at DESC LIMIT 1`,
        [deploy.project_id, metric.replace("_ms", "").replace("cls", "cls"), deploy.environment],
      );
      const baselineP75 = baselineResult.rows[0]?.p75 != null ? Number(baselineResult.rows[0].p75) : null;

      let deltaPct: number | null = null;
      let passed = true;

      if (deployP75 != null && baselineP75 != null && baselineP75 > 0) {
        deltaPct = ((deployP75 - baselineP75) / baselineP75) * 100;
        passed = deltaPct <= REGRESSION_THRESHOLD_PCT;
      }

      if (!passed) allPassed = false;

      metricsEvaluated.push({
        metric,
        baseline_p75: baselineP75,
        deploy_p75: deployP75,
        delta_pct: deltaPct != null ? Math.round(deltaPct * 10) / 10 : null,
        passed,
      });
    }

    const finalStatus = allPassed ? "passed" : "failed";
    await this.updateDeployStatus(deployId, finalStatus, rumSamples, { metrics: metricsEvaluated });

    // Post commit status via GitHub
    let commitStatusPosted = false;
    const ghConfig = await this.getGitHubConfig(deployId);
    if (ghConfig) {
      try {
        // Build synthetic GateEvaluationOutcome array for commit status
        const outcomes = metricsEvaluated.map((m) => ({
          gate_id: `deploy-${deployId}`,
          gate_name: `Deploy ${m.metric}`,
          policy: "block" as const,
          status: (m.passed ? "passed" : "failed") as "passed" | "failed",
          metric: m.metric,
          actual_value: m.deploy_p75 ?? undefined,
          baseline_value: m.baseline_p75 ?? undefined,
        }));
        await this.github.reportCommitStatus(ghConfig, deployId, outcomes);
        commitStatusPosted = true;
        this.logger.log(
          `Posted commit status '${finalStatus}' for deploy ${deploy.build_hash}`,
        );
      } catch (e) {
        this.logger.error(`Failed to post commit status: ${e}`);
      }
    }

    return {
      deploy_id: deployId,
      status: finalStatus,
      rum_samples: rumSamples,
      required_samples: MIN_SAMPLES,
      metrics_evaluated: metricsEvaluated,
      commit_status_posted: commitStatusPosted,
    };
  }

  /**
   * Check all pending deploys.
   */
  async evaluateAllPending(): Promise<DeployEvaluationResult[]> {
    const result = await this.db.query<DeployRecord>(
      `SELECT * FROM deploy_watches
       WHERE status IN ('pending', 'evaluating')
       ORDER BY deployed_at DESC`,
    );

    const results: DeployEvaluationResult[] = [];
    for (const deploy of result.rows) {
      const evalResult = await this.evaluateDeploy(deploy.id);
      results.push(evalResult);
    }
    return results;
  }

  private async getDeployById(id: string): Promise<DeployRecord | null> {
    const result = await this.db.query<DeployRecord>(
      "SELECT * FROM deploy_watches WHERE id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  }

  private async updateDeployStatus(
    id: string,
    status: string,
    rumSamples?: number,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.query(
      `UPDATE deploy_watches SET
        status = $2,
        rum_sample_count = COALESCE($3, rum_sample_count),
        result_details = COALESCE($4, result_details),
        evaluated_at = CASE WHEN $2 IN ('passed', 'failed', 'expired') THEN NOW() ELSE evaluated_at END
       WHERE id = $1`,
      [id, status, rumSamples ?? null, details ? JSON.stringify(details) : null],
    );
  }

  private async getGitHubConfig(deployId: string): Promise<GitHubCheckConfig | null> {
    const result = await this.db.query<{
      github_owner: string | null;
      github_repo: string | null;
      github_token: string | null;
      git_sha: string;
    }>(
      `SELECT github_owner, github_repo, github_token, git_sha
       FROM deploy_watches WHERE id = $1`,
      [deployId],
    );
    const row = result.rows[0];
    if (!row?.github_owner || !row.github_repo || !row.github_token) return null;
    return {
      owner: row.github_owner,
      repo: row.github_repo,
      token: row.github_token,
      sha: row.git_sha,
    };
  }
}
