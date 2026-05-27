import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { LoadProfilesService, LoadProfileRow, LoadStage } from "./load-profiles.service";

export interface LoadRunRow {
  id: string;
  project_id: string;
  load_profile_id: string | null;
  run_id: string | null;
  status: string;
  engine: string;
  target_vus: number;
  actual_peak_vus: number | null;
  stages: LoadStage[];
  cache_state: string;
  started_at: string | null;
  finished_at: string | null;
  duration_s: number | null;
  vu_minutes: number | null;
  cost_estimate: CostEstimate | null;
  saturation_warnings: SaturationWarning[];
  metrics_summary: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CostEstimate {
  vu_minutes: number;
  unit_cost: number;
  total_cost: number;
  currency: string;
}

export interface SaturationWarning {
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

export interface CreateLoadRunDto {
  project_id: string;
  load_profile_id?: string;
  run_id?: string;
  target_vus?: number;
  stages?: LoadStage[];
  cache_state?: string;
  engine?: string;
}

/** Maximum time (seconds) a load run may stay in an active state before being auto-failed. */
const MAX_RUN_DURATION_S = 30 * 60; // 30 minutes

@Injectable()
export class LoadOrchestratorService {
  private readonly logger = new Logger(LoadOrchestratorService.name);
  private timeoutTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly loadProfilesService: LoadProfilesService,
  ) {}

  onModuleInit() {
    // Check for stale runs every 60 seconds
    this.timeoutTimer = setInterval(() => this.timeoutStaleRuns(), 60_000);
    this.logger.log(`Run timeout enforcer started (max ${MAX_RUN_DURATION_S}s)`);
  }

  onModuleDestroy() {
    if (this.timeoutTimer) clearInterval(this.timeoutTimer);
  }

  /**
   * Find load runs that have been in an active state longer than
   * MAX_RUN_DURATION_S and transition them to "failed".
   */
  async timeoutStaleRuns(): Promise<number> {
    try {
      const result = await this.db.query<LoadRunRow>(
        `UPDATE load_runs
         SET status = 'failed',
             finished_at = now(),
             error = 'Timed out after ' || $1 || ' seconds'
         WHERE status IN ('queued', 'warming', 'running')
           AND created_at < now() - ($1 || ' seconds')::interval
         RETURNING id, status`,
        [MAX_RUN_DURATION_S],
      );
      if (result.rows.length > 0) {
        this.logger.warn(
          `Timed out ${result.rows.length} stale load run(s): ${result.rows.map((r) => r.id).join(", ")}`,
        );
      }
      return result.rows.length;
    } catch (err: any) {
      if (err?.code === "42P01") {
        // Table doesn't exist yet — skip silently
        return 0;
      }
      this.logger.error(`timeoutStaleRuns failed: ${err.message}`);
      return 0;
    }
  }

  /**
   * Create and queue a new load run.
   * Enforces concurrency caps, quota, and pre-run validation.
   */
  async createLoadRun(dto: CreateLoadRunDto): Promise<LoadRunRow> {
    // Resolve load profile
    let stages = dto.stages ?? [{ duration_s: 30, target_vus: 1 }];
    let targetVus = dto.target_vus ?? 1;
    let cacheState = dto.cache_state ?? "warm";
    let engine = dto.engine ?? "k6_browser";

    if (dto.load_profile_id) {
      const profile = await this.loadProfilesService.findById(dto.load_profile_id);
      stages = profile.stages;
      targetVus = profile.target_vus;
      cacheState = profile.cache_state;
    }

    // Pre-run validation
    await this.validatePreRun(dto.project_id, engine, targetVus);

    // Cache state validation
    const cacheValidation = this.loadProfilesService.validateCacheState(cacheState);
    if (!cacheValidation.valid) {
      throw new BadRequestException(cacheValidation.errors.join("; "));
    }

    // Cost estimate
    const costEstimate = this.estimateCost(stages, targetVus);

    // Quota check
    await this.checkQuota(dto.project_id, costEstimate.vu_minutes);

    const result = await this.db.query<LoadRunRow>(
      `INSERT INTO load_runs
        (project_id, load_profile_id, run_id, status, engine, target_vus, stages,
         cache_state, cost_estimate)
       VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        dto.project_id,
        dto.load_profile_id ?? null,
        dto.run_id ?? null,
        engine,
        targetVus,
        JSON.stringify(stages),
        cacheState,
        JSON.stringify(costEstimate),
      ],
    );

    this.logger.log(
      `Queued load run ${result.rows[0].id} for project ${dto.project_id}: ` +
      `${targetVus} VUs, ${costEstimate.vu_minutes.toFixed(1)} VU-min estimated`,
    );

    return result.rows[0];
  }

  async findAll(projectId?: string, status?: string, limit = 50): Promise<LoadRunRow[]> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (projectId) {
      params.push(projectId);
      conditions.push(`project_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(Math.min(limit, 200));

    const result = await this.db.query<LoadRunRow>(
      `SELECT * FROM load_runs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  async findById(id: string): Promise<LoadRunRow> {
    const result = await this.db.query<LoadRunRow>(
      "SELECT * FROM load_runs WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Load run ${id} not found`);
    }
    return result.rows[0];
  }

  /**
   * Transition load run status.
   */
  async updateStatus(
    id: string,
    status: string,
    extras?: {
      actual_peak_vus?: number;
      vu_minutes?: number;
      duration_s?: number;
      metrics_summary?: Record<string, unknown>;
      saturation_warnings?: SaturationWarning[];
      error?: string;
    },
  ): Promise<LoadRunRow> {
    const sets = ["status = $2"];
    const params: unknown[] = [id, status];
    let idx = 3;

    if (status === "running") {
      sets.push(`started_at = now()`);
    }
    if (status === "completed" || status === "failed") {
      sets.push(`finished_at = now()`);
    }
    if (extras?.actual_peak_vus !== undefined) {
      sets.push(`actual_peak_vus = $${idx}`);
      params.push(extras.actual_peak_vus);
      idx++;
    }
    if (extras?.vu_minutes !== undefined) {
      sets.push(`vu_minutes = $${idx}`);
      params.push(extras.vu_minutes);
      idx++;
    }
    if (extras?.duration_s !== undefined) {
      sets.push(`duration_s = $${idx}`);
      params.push(extras.duration_s);
      idx++;
    }
    if (extras?.metrics_summary) {
      sets.push(`metrics_summary = $${idx}`);
      params.push(JSON.stringify(extras.metrics_summary));
      idx++;
    }
    if (extras?.saturation_warnings) {
      sets.push(`saturation_warnings = $${idx}`);
      params.push(JSON.stringify(extras.saturation_warnings));
      idx++;
    }
    if (extras?.error) {
      sets.push(`error = $${idx}`);
      params.push(extras.error);
      idx++;
    }

    const result = await this.db.query<LoadRunRow>(
      `UPDATE load_runs SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      params,
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Load run ${id} not found`);
    }
    return result.rows[0];
  }

  /**
   * Cancel a load run.
   */
  async cancel(id: string): Promise<LoadRunRow> {
    return this.updateStatus(id, "cancelled");
  }

  // --- Validation & Enforcement ---

  /**
   * Validate that the project can accept a new load run:
   * - Engine concurrency cap not exceeded
   * - Max concurrent load runs not exceeded
   */
  async validatePreRun(projectId: string, engine: string, targetVus: number): Promise<void> {
    // Get project caps
    const projectResult = await this.db.query<{
      engine_concurrency_caps: Record<string, number>;
      load_quota: { max_concurrent_load_runs: number };
    }>(
      "SELECT engine_concurrency_caps, load_quota FROM projects WHERE id = $1",
      [projectId],
    );

    const project = projectResult.rows[0];
    if (!project) {
      throw new BadRequestException(`Project ${projectId} not found`);
    }

    const caps = project.engine_concurrency_caps ?? {};
    const engineCap = caps[engine] ?? 10;

    // Count active load runs for this engine
    const activeResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM load_runs
       WHERE project_id = $1 AND engine = $2 AND status IN ('queued', 'warming', 'running')`,
      [projectId, engine],
    );
    const activeCount = parseInt(activeResult.rows[0]?.count ?? "0", 10);

    if (activeCount >= engineCap) {
      throw new BadRequestException(
        `Engine "${engine}" concurrency cap reached (${activeCount}/${engineCap}). ` +
        `Wait for existing load runs to complete.`,
      );
    }

    // Check max concurrent load runs
    const maxConcurrent = project.load_quota?.max_concurrent_load_runs ?? 3;
    const totalActiveResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM load_runs
       WHERE project_id = $1 AND status IN ('queued', 'warming', 'running')`,
      [projectId],
    );
    const totalActive = parseInt(totalActiveResult.rows[0]?.count ?? "0", 10);

    if (totalActive >= maxConcurrent) {
      throw new BadRequestException(
        `Max concurrent load runs reached (${totalActive}/${maxConcurrent}).`,
      );
    }
  }

  /**
   * Check VU-minute quota.
   */
  async checkQuota(projectId: string, estimatedVuMinutes: number): Promise<void> {
    const projectResult = await this.db.query<{
      load_quota: { max_vu_minutes_per_day: number };
    }>(
      "SELECT load_quota FROM projects WHERE id = $1",
      [projectId],
    );

    const quota = projectResult.rows[0]?.load_quota;
    const maxPerDay = quota?.max_vu_minutes_per_day ?? 10000;

    // Sum VU-minutes used today
    const usageResult = await this.db.query<{ total: string }>(
      `SELECT COALESCE(SUM(vu_minutes), 0) as total FROM load_runs
       WHERE project_id = $1 AND created_at >= CURRENT_DATE
         AND status NOT IN ('cancelled', 'failed')`,
      [projectId],
    );
    const usedToday = parseFloat(usageResult.rows[0]?.total ?? "0");

    if (usedToday + estimatedVuMinutes > maxPerDay) {
      throw new BadRequestException(
        `VU-minute quota exceeded: ${usedToday.toFixed(1)} used today + ` +
        `${estimatedVuMinutes.toFixed(1)} estimated = ${(usedToday + estimatedVuMinutes).toFixed(1)} > ` +
        `${maxPerDay} daily limit.`,
      );
    }
  }

  /**
   * Estimate cost for a load run based on stages and VU count.
   */
  estimateCost(stages: LoadStage[], targetVus: number): CostEstimate {
    let vuMinutes = 0;
    let prevVus = targetVus;
    for (const stage of stages) {
      // Average VUs during stage × duration in minutes
      const avgVus = (stage.target_vus + prevVus) / 2;
      vuMinutes += avgVus * (stage.duration_s / 60);
      prevVus = stage.target_vus;
    }

    const unitCost = 0.001; // $0.001 per VU-minute (configurable)
    return {
      vu_minutes: Math.round(vuMinutes * 10) / 10,
      unit_cost: unitCost,
      total_cost: Math.round(vuMinutes * unitCost * 100) / 100,
      currency: "USD",
    };
  }
}
