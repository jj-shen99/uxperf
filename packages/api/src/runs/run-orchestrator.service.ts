import { Injectable, Inject, Optional, Logger } from "@nestjs/common";
import { RunsService, RunRow } from "./runs.service";
import { GatesService, GateEvaluationOutcome } from "../gates/gates.service";
import { ArtifactsService } from "../artifacts/artifacts.service";
import { GitHubCheckService } from "../github/github-check.service";
import { BaselinesService } from "../baselines/baselines.service";
import { NotificationsService } from "../notifications/notifications.service";
import { DatabaseService } from "../database/database.service";

export interface RunCompletionPayload {
  run_id: string;
  success: boolean;
  metrics?: Record<string, unknown>;
  lighthouse_report?: unknown;
  har?: unknown;
  error?: string;
  started_at?: string;
  finished_at?: string;
  git?: {
    owner: string;
    repo: string;
    sha: string;
    token?: string;
  };
}

export interface RunDispatchResult {
  run: RunRow;
  dispatched: boolean;
}

/**
 * Orchestrates the run lifecycle:
 *   1. Create run → status: queued
 *   2. Dispatch to worker (Phase 1: poll-based, worker calls API)
 *   3. Worker reports completion → status: completed/failed
 *   4. Evaluate quality gates
 *   5. Store artifacts
 */
@Injectable()
export class RunOrchestratorService {
  private readonly logger = new Logger(RunOrchestratorService.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly gatesService: GatesService,
    private readonly artifactsService: ArtifactsService,
    private readonly githubCheckService: GitHubCheckService,
    private readonly baselinesService: BaselinesService,
    private readonly db: DatabaseService,
    @Optional() @Inject(NotificationsService) private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Called by the worker to pick up the next queued run.
   * Atomically transitions queued → running via SELECT FOR UPDATE.
   */
  async claimNextRun(): Promise<RunRow | null> {
    const result = await this.db.query<RunRow>(
      `UPDATE runs
       SET status = 'running', started_at = now()
       WHERE id = (
         SELECT id FROM runs
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Process a completed run: store artifacts, update status, evaluate gates.
   */
  async completeRun(
    payload: RunCompletionPayload
  ): Promise<{ run: RunRow; gateResults: GateEvaluationOutcome[] }> {
    const { run_id, success, metrics, lighthouse_report, har, error, started_at, finished_at, git } = payload;

    // Store artifacts
    let lighthouseReportPath: string | undefined;
    let harPath: string | undefined;

    if (lighthouse_report) {
      try {
        lighthouseReportPath = await this.artifactsService.saveJson(
          run_id,
          "lighthouse.json",
          lighthouse_report
        );
      } catch (e) {
        this.logger.warn(`Failed to save lighthouse report for ${run_id}: ${e}`);
      }
    }

    if (har) {
      try {
        harPath = await this.artifactsService.saveJson(run_id, "har.json", har);
      } catch (e) {
        this.logger.warn(`Failed to save HAR for ${run_id}: ${e}`);
      }
    }

    // Update run record
    const run = await this.runsService.update(run_id, {
      status: success ? "completed" : "failed",
      metrics: metrics ?? undefined,
      lighthouse_report_path: lighthouseReportPath,
      har_path: harPath,
      error: error ?? undefined,
      started_at,
      finished_at: finished_at ?? new Date().toISOString(),
    });

    // Evaluate quality gates
    let gateResults: GateEvaluationOutcome[] = [];
    if (success && metrics) {
      try {
        gateResults = await this.gatesService.evaluateGatesForRun(
          run.project_id,
          run_id,
          metrics
        );

        // Log gate outcomes
        const failed = gateResults.filter((g) => g.status === "failed");
        const blocking = failed.filter((g) => g.policy === "block");

        if (blocking.length > 0) {
          this.logger.warn(
            `Run ${run_id}: ${blocking.length} blocking gate(s) failed: ${blocking.map((g) => g.gate_name).join(", ")}`
          );
        }
        if (failed.length > blocking.length) {
          this.logger.log(
            `Run ${run_id}: ${failed.length - blocking.length} warning gate(s) failed`
          );
        }
      } catch (e) {
        this.logger.error(`Gate evaluation failed for run ${run_id}: ${e}`);
      }
    }

    // Refresh baselines with new data
    if (success && metrics) {
      try {
        await this.baselinesService.refreshBaselines(
          run.project_id,
          run.environment,
          run.script_id ?? undefined,
        );
      } catch (e) {
        this.logger.error(`Baseline refresh failed for run ${run_id}: ${e}`);
      }
    }

    // Post gate results to GitHub if git metadata is available
    if (git?.sha && git?.token && gateResults.length > 0) {
      try {
        await this.githubCheckService.reportGateResults(
          { owner: git.owner, repo: git.repo, sha: git.sha, token: git.token },
          run_id,
          gateResults
        );
      } catch (e) {
        this.logger.error(`GitHub check posting failed for run ${run_id}: ${e}`);
      }
    }

    // Dispatch notifications
    try {
      if (this.notificationsService) {
        const failed = gateResults.filter((g) => g.status === "failed");
        if (failed.length > 0) {
          await this.notificationsService.dispatch({
            event: "gate_failed",
            project_id: run.project_id,
            title: `Gate failures on run ${run_id}`,
            message: `${failed.length} gate(s) failed: ${failed.map((g) => g.gate_name).join(", ")}`,
            details: { run_id, status: run.status, failed_gates: failed.length },
          });
        }
        await this.notificationsService.dispatch({
          event: success ? "run_completed" : "run_failed",
          project_id: run.project_id,
          title: `Run ${success ? "completed" : "failed"}: ${run_id}`,
          message: success
            ? `Run completed with ${gateResults.length} gate(s) evaluated`
            : `Run failed: ${error ?? "unknown error"}`,
          details: { run_id, status: run.status },
        });
      }
    } catch (e) {
      this.logger.error(`Notification dispatch failed for run ${run_id}: ${e}`);
    }

    return { run, gateResults };
  }

  /**
   * Get gate results for a specific run.
   */
  async getGateResultsForRun(runId: string): Promise<Record<string, unknown>[]> {
    const result = await this.db.query(
      `SELECT gr.*, g.name as gate_name, g.policy, g.definition
       FROM gate_results gr
       JOIN gates g ON g.id = gr.gate_id
       WHERE gr.run_id = $1
       ORDER BY gr.evaluated_at DESC`,
      [runId]
    );
    return result.rows;
  }
}
