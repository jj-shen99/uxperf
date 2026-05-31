import { Injectable, Logger, NotFoundException, ConflictException, Inject, Optional } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { BaselinesService } from "../baselines/baselines.service";

/**
 * Performance Budget Service (E-28 through E-31).
 *
 * Implements the budget framework from Ch 12 of "Measured":
 *   - Per-route, per-metric budgets with device-class segmentation (E-28, E-31)
 *   - Ratchet-on-improvement: auto-tighten when baseline improves (E-29)
 *   - Variance-aware thresholds: noise-tolerant evaluation (E-30)
 */

// ── Types ──────────────────────────────────────────────────────

export type DeviceClass = "desktop" | "mobile" | "all";
export type BudgetPolicy = "block" | "warn" | "info";

export interface BudgetRow {
  id: string;
  project_id: string;
  route: string;
  metric: string;
  device_class: DeviceClass;
  threshold: number;
  original_threshold: number;
  policy: BudgetPolicy;
  variance_tolerance: number;       // E-30: stddev multiplier for noise band
  auto_ratchet: boolean;             // E-29: auto-tighten on improvement
  ratchet_pct: number;               // E-29: percentage cushion above new baseline
  enabled: boolean;
  last_ratcheted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBudgetDto {
  project_id: string;
  route: string;
  metric: string;
  device_class?: DeviceClass;       // E-31: default "all"
  threshold: number;
  policy?: BudgetPolicy;
  variance_tolerance?: number;      // E-30: default 0 (no tolerance)
  auto_ratchet?: boolean;           // E-29: default false
  ratchet_pct?: number;             // E-29: default 5
}

export interface UpdateBudgetDto {
  threshold?: number;
  policy?: BudgetPolicy;
  variance_tolerance?: number;
  auto_ratchet?: boolean;
  ratchet_pct?: number;
  enabled?: boolean;
}

export interface BudgetEvaluation {
  budget_id: string;
  route: string;
  metric: string;
  device_class: DeviceClass;
  policy: BudgetPolicy;
  threshold: number;
  effective_threshold: number;      // E-30: threshold + variance tolerance
  actual_value: number | undefined;
  passed: boolean;
  within_noise_band: boolean;       // E-30: failed threshold but within noise
  variance_tolerance_applied: number;
}

export interface RatchetResult {
  budget_id: string;
  metric: string;
  old_threshold: number;
  new_threshold: number;
  baseline_value: number;
  ratcheted: boolean;
  reason: string;
}

// ── Service ────────────────────────────────────────────────────

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    private readonly db: DatabaseService,
    @Optional() @Inject(BaselinesService) private readonly baselinesService?: BaselinesService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────

  async findAll(projectId?: string): Promise<BudgetRow[]> {
    if (projectId) {
      const r = await this.db.query<BudgetRow>(
        "SELECT * FROM budgets WHERE project_id = $1 ORDER BY route, metric, device_class",
        [projectId],
      );
      return r.rows;
    }
    const r = await this.db.query<BudgetRow>(
      "SELECT * FROM budgets ORDER BY created_at DESC LIMIT 200",
    );
    return r.rows;
  }

  async findById(id: string): Promise<BudgetRow> {
    const r = await this.db.query<BudgetRow>(
      "SELECT * FROM budgets WHERE id = $1", [id],
    );
    if (r.rows.length === 0) throw new NotFoundException(`Budget ${id} not found`);
    return r.rows[0];
  }

  async create(dto: CreateBudgetDto): Promise<BudgetRow> {
    // Dedup: same project + route + metric + device_class
    const dup = await this.db.query<{ id: string }>(
      `SELECT id FROM budgets
       WHERE project_id = $1 AND route = $2 AND metric = $3 AND device_class = $4`,
      [dto.project_id, dto.route, dto.metric, dto.device_class ?? "all"],
    );
    if (dup.rows.length > 0) {
      throw new ConflictException(
        `Budget already exists for ${dto.metric} on ${dto.route} (${dto.device_class ?? "all"})`,
      );
    }

    const r = await this.db.query<BudgetRow>(
      `INSERT INTO budgets
        (project_id, route, metric, device_class, threshold, original_threshold,
         policy, variance_tolerance, auto_ratchet, ratchet_pct, enabled)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, true)
       RETURNING *`,
      [
        dto.project_id,
        dto.route,
        dto.metric,
        dto.device_class ?? "all",
        dto.threshold,
        dto.policy ?? "warn",
        dto.variance_tolerance ?? 0,
        dto.auto_ratchet ?? false,
        dto.ratchet_pct ?? 5,
      ],
    );
    return r.rows[0];
  }

  async update(id: string, dto: UpdateBudgetDto): Promise<BudgetRow> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (dto.threshold !== undefined) { sets.push(`threshold = $${idx++}`); vals.push(dto.threshold); }
    if (dto.policy !== undefined) { sets.push(`policy = $${idx++}`); vals.push(dto.policy); }
    if (dto.variance_tolerance !== undefined) { sets.push(`variance_tolerance = $${idx++}`); vals.push(dto.variance_tolerance); }
    if (dto.auto_ratchet !== undefined) { sets.push(`auto_ratchet = $${idx++}`); vals.push(dto.auto_ratchet); }
    if (dto.ratchet_pct !== undefined) { sets.push(`ratchet_pct = $${idx++}`); vals.push(dto.ratchet_pct); }
    if (dto.enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(dto.enabled); }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = now()`);
    vals.push(id);
    const r = await this.db.query<BudgetRow>(
      `UPDATE budgets SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (r.rows.length === 0) throw new NotFoundException(`Budget ${id} not found`);
    return r.rows[0];
  }

  async delete(id: string): Promise<void> {
    const r = await this.db.query("DELETE FROM budgets WHERE id = $1", [id]);
    if (r.rowCount === 0) throw new NotFoundException(`Budget ${id} not found`);
  }

  // ── E-30: Variance-Aware Evaluation ──────────────────────────

  /**
   * Evaluate a metric value against a budget with variance tolerance.
   * Ch 12, p149: "A budget threshold that fires on natural variance
   * is a budget that gets muted."
   *
   * effective_threshold = threshold + variance_tolerance * stddev
   * where stddev comes from the active baseline.
   */
  async evaluate(
    budget: BudgetRow,
    actualValue: number | undefined,
    stddev?: number,
  ): Promise<BudgetEvaluation> {
    if (actualValue === undefined) {
      return {
        budget_id: budget.id,
        route: budget.route,
        metric: budget.metric,
        device_class: budget.device_class,
        policy: budget.policy,
        threshold: budget.threshold,
        effective_threshold: budget.threshold,
        actual_value: undefined,
        passed: true,
        within_noise_band: false,
        variance_tolerance_applied: 0,
      };
    }

    const toleranceBand = budget.variance_tolerance > 0 && stddev
      ? budget.variance_tolerance * stddev
      : 0;
    const effectiveThreshold = budget.threshold + toleranceBand;
    const passed = actualValue <= effectiveThreshold;
    const withinNoiseBand = !passed && actualValue <= effectiveThreshold;

    // Check if value is above raw threshold but within noise band
    const rawPassed = actualValue <= budget.threshold;

    return {
      budget_id: budget.id,
      route: budget.route,
      metric: budget.metric,
      device_class: budget.device_class,
      policy: budget.policy,
      threshold: budget.threshold,
      effective_threshold: Math.round(effectiveThreshold * 100) / 100,
      actual_value: actualValue,
      passed,
      within_noise_band: !rawPassed && passed,
      variance_tolerance_applied: Math.round(toleranceBand * 100) / 100,
    };
  }

  /**
   * Evaluate all enabled budgets for a route against provided metrics.
   */
  async evaluateRoute(
    projectId: string,
    route: string,
    metrics: Record<string, number>,
    deviceClass: DeviceClass = "all",
  ): Promise<BudgetEvaluation[]> {
    const budgets = await this.db.query<BudgetRow>(
      `SELECT * FROM budgets
       WHERE project_id = $1
         AND (route = $2 OR route = '*')
         AND (device_class = $3 OR device_class = 'all')
         AND enabled = true
       ORDER BY metric`,
      [projectId, route, deviceClass],
    );

    const evaluations: BudgetEvaluation[] = [];
    for (const budget of budgets.rows) {
      const actualValue = metrics[budget.metric];

      // Get stddev from baseline for variance-aware evaluation
      let stddev: number | undefined;
      if (budget.variance_tolerance > 0 && this.baselinesService) {
        try {
          const baseline = await this.baselinesService.findActive(
            projectId, budget.metric, "staging",
          );
          stddev = baseline?.stddev ?? undefined;
        } catch {
          // Baseline unavailable — evaluate without tolerance
        }
      }

      evaluations.push(await this.evaluate(budget, actualValue, stddev));
    }

    return evaluations;
  }

  // ── E-29: Ratchet on Improvement ─────────────────────────────

  /**
   * Auto-tighten budgets when baseline improves.
   * Ch 12, p153: "Every time a real performance improvement ships,
   * the budget should be lowered to match."
   *
   * new_threshold = new_baseline_p75 * (1 + ratchet_pct/100)
   * Only ratchets downward (never loosens).
   */
  async ratchetBudgets(projectId: string): Promise<RatchetResult[]> {
    if (!this.baselinesService) {
      this.logger.warn("BaselinesService not available; skipping ratchet");
      return [];
    }

    const budgets = await this.db.query<BudgetRow>(
      `SELECT * FROM budgets
       WHERE project_id = $1 AND auto_ratchet = true AND enabled = true`,
      [projectId],
    );

    const results: RatchetResult[] = [];

    for (const budget of budgets.rows) {
      const baseline = await this.baselinesService.findActive(
        projectId, budget.metric, "staging",
      );

      if (!baseline || baseline.p75 === null) {
        results.push({
          budget_id: budget.id,
          metric: budget.metric,
          old_threshold: budget.threshold,
          new_threshold: budget.threshold,
          baseline_value: 0,
          ratcheted: false,
          reason: "No active baseline available",
        });
        continue;
      }

      const newCandidate = baseline.p75 * (1 + budget.ratchet_pct / 100);
      const rounded = Math.round(newCandidate * 100) / 100;

      // Only ratchet downward — never loosen
      if (rounded >= budget.threshold) {
        results.push({
          budget_id: budget.id,
          metric: budget.metric,
          old_threshold: budget.threshold,
          new_threshold: budget.threshold,
          baseline_value: baseline.p75,
          ratcheted: false,
          reason: `Candidate ${rounded} >= current ${budget.threshold}; no ratchet`,
        });
        continue;
      }

      // Apply ratchet
      await this.db.query(
        `UPDATE budgets SET threshold = $1, last_ratcheted_at = now(), updated_at = now()
         WHERE id = $2`,
        [rounded, budget.id],
      );

      this.logger.log(
        `Ratcheted budget ${budget.id} (${budget.metric}): ${budget.threshold} → ${rounded}`,
      );

      results.push({
        budget_id: budget.id,
        metric: budget.metric,
        old_threshold: budget.threshold,
        new_threshold: rounded,
        baseline_value: baseline.p75,
        ratcheted: true,
        reason: `Ratcheted: baseline p75=${baseline.p75}, +${budget.ratchet_pct}% = ${rounded}`,
      });
    }

    return results;
  }
}
