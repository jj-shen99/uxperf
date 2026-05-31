import { Injectable, Inject, NotFoundException, ConflictException, Optional, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { BaselinesService, BaselineRow } from "../baselines/baselines.service";

export interface GateDefinition {
  type: "threshold" | "baseline_relative" | "statistical" | "vu_tiered" | "resource_floor" | "capacity_floor";
  metric: string;
  // threshold gate fields
  operator?: "lte" | "gte" | "lt" | "gt";
  threshold?: number;
  // baseline_relative gate fields
  regression_pct?: number;   // e.g. 10 → fail if metric exceeds baseline p75 by 10%
  baseline_stat?: "p50" | "p75" | "p95" | "mean"; // which stat to compare (default p75)
  // statistical gate fields
  stddev_multiplier?: number; // e.g. 2 → fail if metric exceeds mean + 2*stddev
  // E-11: VU-tiered fields
  vu_tiers?: VuTier[];       // thresholds per VU level
  // E-12: resource floor fields
  resource_metric?: "cpu_pct" | "memory_pct" | "disk_io_pct" | "network_mbps";
  floor_value?: number;      // minimum acceptable value (e.g. 20 → fail if < 20%)
  // E-13: capacity floor fields
  capacity_metric?: "rps" | "concurrent_users" | "throughput_mbps";
  min_capacity?: number;     // required minimum capacity
  // E-47: Per-severity quorum configuration
  quorum?: QuorumConfig;
}

// E-47: Per-severity quorum thresholds
// Book Ch 14, p240–241: "advisory gates can be 1-of-N, blocking gates
// require high quorum, paging gates require the highest bar."
export interface QuorumConfig {
  window_size?: number;       // how many recent runs to consider (default 5)
  required_failures?: number; // failures required to trigger (default varies by policy)
}

// E-11: VU tier configuration
export interface VuTier {
  max_vus: number;           // apply this threshold when VUs <= max_vus
  threshold: number;         // the metric threshold for this tier
  operator?: "lte" | "gte" | "lt" | "gt";
}

export interface CreateGateDto {
  project_id: string;
  name: string;
  definition: GateDefinition;
  policy?: string;
  enabled?: boolean;
}

export interface UpdateGateDto {
  name?: string;
  definition?: GateDefinition;
  policy?: string;
  enabled?: boolean;
}

export interface GateRow {
  id: string;
  project_id: string;
  name: string;
  definition: GateDefinition;
  policy: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface GateResultRow {
  id: string;
  gate_id: string;
  run_id: string;
  status: string;
  details: Record<string, unknown> | null;
  evaluated_at: Date;
}

export interface GateEvaluationOutcome {
  gate_id: string;
  gate_name: string;
  policy: string;
  status: "passed" | "failed" | "skipped";
  metric: string;
  actual_value?: number;
  threshold?: number;
  computed_threshold?: number; // for baseline/statistical gates
  operator?: string;
  baseline_value?: number;
  ci_lower?: number;  // E-42: confidence interval lower bound
  ci_upper?: number;  // E-42: confidence interval upper bound
  ci_reliable?: boolean; // E-42: whether CI has enough samples
  quorum_detail?: {
    recent_failures: number;
    required_failures: number;
    window_size: number;
  };
}

@Injectable()
export class GatesService {
  private readonly logger = new Logger(GatesService.name);

  constructor(
    private db: DatabaseService,
    @Optional() @Inject(BaselinesService) private baselinesService?: BaselinesService,
  ) {}

  // -- CRUD --

  async findAll(projectId?: string): Promise<GateRow[]> {
    if (projectId) {
      const result = await this.db.query<GateRow>(
        "SELECT * FROM gates WHERE project_id = $1 ORDER BY created_at DESC",
        [projectId]
      );
      return result.rows;
    }
    const result = await this.db.query<GateRow>(
      "SELECT * FROM gates ORDER BY created_at DESC LIMIT 100"
    );
    return result.rows;
  }

  async findById(id: string): Promise<GateRow> {
    const result = await this.db.query<GateRow>(
      "SELECT * FROM gates WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Gate ${id} not found`);
    }
    return result.rows[0];
  }

  async create(dto: CreateGateDto): Promise<GateRow> {
    const dup = await this.db.query<{ id: string }>(
      "SELECT id FROM gates WHERE project_id = $1 AND name = $2",
      [dto.project_id, dto.name],
    );
    if (dup.rows.length > 0) {
      throw new ConflictException(
        `A gate named "${dto.name}" already exists for this project`,
      );
    }

    const result = await this.db.query<GateRow>(
      `INSERT INTO gates (project_id, name, definition, policy, enabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        dto.project_id,
        dto.name,
        JSON.stringify(dto.definition),
        dto.policy ?? "warn",
        dto.enabled ?? true,
      ]
    );
    return result.rows[0];
  }

  async batchCreate(
    projectId: string,
    gates: Omit<CreateGateDto, "project_id">[],
  ): Promise<{ created: GateRow[]; skipped: string[] }> {
    const existing = await this.db.query<{ name: string }>(
      "SELECT name FROM gates WHERE project_id = $1",
      [projectId],
    );
    const existingNames = new Set(existing.rows.map((r) => r.name));

    const created: GateRow[] = [];
    const skipped: string[] = [];

    for (const g of gates) {
      if (existingNames.has(g.name)) {
        skipped.push(g.name);
        continue;
      }
      const result = await this.db.query<GateRow>(
        `INSERT INTO gates (project_id, name, definition, policy, enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          projectId,
          g.name,
          JSON.stringify(g.definition),
          g.policy ?? "warn",
          g.enabled ?? true,
        ],
      );
      created.push(result.rows[0]);
      existingNames.add(g.name);
    }

    return { created, skipped };
  }

  async update(id: string, dto: UpdateGateDto): Promise<GateRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(dto.name);
    }
    if (dto.definition !== undefined) {
      sets.push(`definition = $${idx++}`);
      values.push(JSON.stringify(dto.definition));
    }
    if (dto.policy !== undefined) {
      sets.push(`policy = $${idx++}`);
      values.push(dto.policy);
    }
    if (dto.enabled !== undefined) {
      sets.push(`enabled = $${idx++}`);
      values.push(dto.enabled);
    }

    if (sets.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.db.query<GateRow>(
      `UPDATE gates SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Gate ${id} not found`);
    }
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM gates WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException(`Gate ${id} not found`);
    }
  }

  /**
   * Get gate evaluation results for a specific run, joined with gate metadata.
   */
  async getResultsForRun(runId: string): Promise<Record<string, unknown>[]> {
    const result = await this.db.query(
      `SELECT gr.*, g.name AS gate_name, g.policy, g.definition
       FROM gate_results gr
       JOIN gates g ON g.id = gr.gate_id
       WHERE gr.run_id = $1
       ORDER BY gr.evaluated_at DESC`,
      [runId]
    );
    return result.rows;
  }

  // -- Gate evaluation --

  /**
   * Evaluate a single metric value against a gate definition.
   * Returns true if the metric passes the gate threshold.
   */
  evaluateThreshold(
    definition: GateDefinition,
    metricValue: number | undefined
  ): boolean {
    if (metricValue === undefined || metricValue === null) return true; // skip if no data
    const { operator, threshold } = definition;
    if (threshold === undefined) return true;
    switch (operator) {
      case "lte": return metricValue <= threshold;
      case "gte": return metricValue >= threshold;
      case "lt":  return metricValue < threshold;
      case "gt":  return metricValue > threshold;
      default:    return true;
    }
  }

  /**
   * Extract the metric value from run metrics by gate metric name.
   */
  extractMetricValue(
    metrics: Record<string, unknown>,
    metricName: string
  ): number | undefined {
    const metricMap: Record<string, string> = {
      lcp: "lcp_ms",
      fcp: "fcp_ms",
      inp: "inp_ms",
      cls: "cls",
      ttfb: "ttfb_ms",
      si: "si_ms",
      tti: "tti_ms",
      tbt: "tbt_ms",
      lighthouse_performance: "lighthouse_performance_score",
      lighthouse_accessibility: "lighthouse_accessibility_score",
      lighthouse_best_practices: "lighthouse_best_practices_score",
      lighthouse_seo: "lighthouse_seo_score",
    };
    const key = metricMap[metricName] ?? metricName;
    const val = metrics[key];
    return typeof val === "number" ? val : undefined;
  }

  /**
   * E-47: Per-severity quorum check.
   *
   * Book Ch 14, p240–241: quorum thresholds tighten with severity:
   *   - advisory/warn:  1-of-3 (any failure triggers warning)
   *   - block:          3-of-5 (high confidence before blocking a deploy)
   *   - page:           4-of-5 (highest bar for paging on-call)
   *
   * Gate-level overrides via definition.quorum take precedence over
   * policy defaults.
   */
  async checkQuorum(
    gateId: string,
    projectId: string,
    currentRunFailed: boolean,
    policy?: string,
    quorumConfig?: QuorumConfig,
  ): Promise<{ shouldFail: boolean; recentFailures: number; requiredFailures: number; windowSize: number }> {
    // E-47: Determine quorum thresholds based on policy severity
    const defaults = this.getQuorumDefaults(policy ?? "block");
    const windowSize = quorumConfig?.window_size ?? defaults.windowSize;
    const requiredFailures = quorumConfig?.required_failures ?? defaults.requiredFailures;

    // Get the last (windowSize - 1) gate results (current run is the Nth)
    const result = await this.db.query<GateResultRow>(
      `SELECT gr.* FROM gate_results gr
       JOIN runs r ON r.id = gr.run_id
       WHERE gr.gate_id = $1 AND r.project_id = $2
       ORDER BY gr.evaluated_at DESC
       LIMIT $3`,
      [gateId, projectId, windowSize - 1]
    );

    const recentStatuses = result.rows.map((r) => r.status);
    const pastFailures = recentStatuses.filter((s) => s === "failed").length;
    const totalFailures = pastFailures + (currentRunFailed ? 1 : 0);

    return {
      shouldFail: totalFailures >= requiredFailures,
      recentFailures: totalFailures,
      requiredFailures,
      windowSize,
    };
  }

  /**
   * E-47: Default quorum thresholds per gate policy.
   */
  private getQuorumDefaults(policy: string): { windowSize: number; requiredFailures: number } {
    switch (policy) {
      case "warn":
      case "advisory":
        return { windowSize: 3, requiredFailures: 1 };
      case "page":
        return { windowSize: 5, requiredFailures: 4 };
      case "block":
      default:
        return { windowSize: 5, requiredFailures: 3 };
    }
  }

  /**
   * Evaluate all enabled gates for a project against a run's metrics.
   * Returns gate evaluation outcomes and persists gate_results.
   */
  async evaluateGatesForRun(
    projectId: string,
    runId: string,
    metrics: Record<string, unknown>
  ): Promise<GateEvaluationOutcome[]> {
    const gates = await this.db.query<GateRow>(
      "SELECT * FROM gates WHERE project_id = $1 AND enabled = true",
      [projectId]
    );

    const outcomes: GateEvaluationOutcome[] = [];

    for (const gate of gates.rows) {
      const def = gate.definition;
      const actualValue = this.extractMetricValue(metrics, def.metric);

      let passed: boolean;
      let computedThreshold: number | undefined;
      let baselineValue: number | undefined;
      let ciLower: number | undefined;
      let ciUpper: number | undefined;
      let ciReliable: boolean | undefined;

      switch (def.type) {
        case "threshold":
          passed = this.evaluateThreshold(def, actualValue);
          break;

        case "baseline_relative": {
          const result = await this.evaluateBaselineRelative(
            def, actualValue, projectId
          );
          passed = result.passed;
          computedThreshold = result.computedThreshold;
          baselineValue = result.baselineValue;
          ciLower = result.ci_lower;
          ciUpper = result.ci_upper;
          ciReliable = result.ci_reliable;
          break;
        }

        case "statistical": {
          const result = await this.evaluateStatistical(
            def, actualValue, projectId
          );
          passed = result.passed;
          computedThreshold = result.computedThreshold;
          baselineValue = result.baselineValue;
          ciLower = result.ci_lower;
          ciUpper = result.ci_upper;
          ciReliable = result.ci_reliable;
          break;
        }

        // E-11: VU-tiered gate — different thresholds at different load levels
        case "vu_tiered": {
          const result = this.evaluateVuTiered(def, actualValue, metrics);
          passed = result.passed;
          computedThreshold = result.computedThreshold;
          break;
        }

        // E-12: Resource floor gate — ensure resources stay above minimum
        case "resource_floor": {
          const result = this.evaluateResourceFloor(def, metrics);
          passed = result.passed;
          computedThreshold = result.computedThreshold;
          break;
        }

        // E-13: Capacity floor gate — ensure system can handle minimum capacity
        case "capacity_floor": {
          const result = this.evaluateCapacityFloor(def, metrics);
          passed = result.passed;
          computedThreshold = result.computedThreshold;
          break;
        }

        default:
          this.logger.warn(`Unknown gate type: ${(def as any).type}, skipping`);
          continue;
      }

      // E-47: Apply per-severity quorum
      const quorum = await this.checkQuorum(gate.id, projectId, !passed, gate.policy, def.quorum);

      const finalStatus: "passed" | "failed" | "skipped" =
        actualValue === undefined
          ? "skipped"
          : quorum.shouldFail
            ? "failed"
            : "passed";

      // Persist gate result
      await this.db.query<GateResultRow>(
        `INSERT INTO gate_results (gate_id, run_id, status, details)
         VALUES ($1, $2, $3, $4)`,
        [
          gate.id,
          runId,
          finalStatus,
          JSON.stringify({
            gate_type: def.type,
            actual_value: actualValue,
            threshold: def.threshold,
            computed_threshold: computedThreshold,
            baseline_value: baselineValue,
            operator: def.operator,
            regression_pct: def.regression_pct,
            single_run_passed: passed,
            quorum_failures: quorum.recentFailures,
            quorum_required: quorum.requiredFailures,
            quorum_window: quorum.windowSize,
          }),
        ]
      );

      outcomes.push({
        gate_id: gate.id,
        gate_name: gate.name,
        policy: gate.policy,
        status: finalStatus,
        metric: def.metric,
        actual_value: actualValue,
        threshold: def.threshold,
        computed_threshold: computedThreshold,
        baseline_value: baselineValue,
        operator: def.operator,
        ci_lower: ciLower,
        ci_upper: ciUpper,
        ci_reliable: ciReliable,
        quorum_detail: {
          recent_failures: quorum.recentFailures,
          required_failures: quorum.requiredFailures,
          window_size: quorum.windowSize,
        },
      });
    }

    return outcomes;
  }

  /**
   * Evaluate all gates for a given run_id.
   * Fetches the run from the database, then delegates to evaluateGatesForRun.
   */
  async evaluateAgainstRun(runId: string): Promise<{
    outcomes: GateEvaluationOutcome[];
    project_id: string;
    project_name?: string;
    reason?: string;
  }> {
    const result = await this.db.query<{
      project_id: string;
      metrics: Record<string, unknown> | null;
      status: string;
    }>(
      "SELECT project_id, metrics, status FROM runs WHERE id = $1",
      [runId],
    );
    const run = result.rows[0];
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Fetch project name for UI clarity
    const projResult = await this.db.query<{ name: string }>(
      "SELECT name FROM projects WHERE id = $1",
      [run.project_id],
    );
    const projectName = projResult.rows[0]?.name ?? "Unknown";

    if (!run.metrics) {
      return {
        outcomes: [],
        project_id: run.project_id,
        project_name: projectName,
        reason: "Run has no metrics. Only completed runs with metrics can be evaluated.",
      };
    }

    // Check if any enabled gates exist for the project
    const gateCount = await this.db.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM gates WHERE project_id = $1 AND enabled = true",
      [run.project_id],
    );
    if (Number(gateCount.rows[0]?.count) === 0) {
      return {
        outcomes: [],
        project_id: run.project_id,
        project_name: projectName,
        reason: `No enabled gates found for project "${projectName}". Create gates for this project first.`,
      };
    }

    const outcomes = await this.evaluateGatesForRun(run.project_id, runId, run.metrics);
    return { outcomes, project_id: run.project_id, project_name: projectName };
  }

  /**
   * E-45: Evaluate a metric against a baseline-relative gate.
   * Fails if actual > baseline_stat * (1 + regression_pct/100).
   * Example: if p75=2000 and regression_pct=10, fails if actual > 2200.
   *
   * E-42 enhancement: When CI data is available, only fail if the actual
   * value exceeds the CI upper bound of the computed threshold. This
   * prevents false positives from normal sampling variance.
   */
  async evaluateBaselineRelative(
    def: GateDefinition,
    actualValue: number | undefined,
    projectId: string,
  ): Promise<{ passed: boolean; computedThreshold?: number; baselineValue?: number; ci_lower?: number; ci_upper?: number; ci_reliable?: boolean }> {
    if (actualValue === undefined) return { passed: true };
    if (!this.baselinesService) {
      this.logger.warn("BaselinesService not available; skipping baseline gate");
      return { passed: true };
    }

    const baseline = await this.baselinesService.findActive(
      projectId, def.metric, "staging"
    );
    if (!baseline) {
      this.logger.warn(`No active baseline for ${def.metric}; passing gate by default`);
      return { passed: true };
    }

    const stat = def.baseline_stat ?? "p75";
    const baselineValue = baseline[stat] as number | null;
    if (baselineValue === null || baselineValue === undefined) {
      return { passed: true };
    }

    const regressionPct = def.regression_pct ?? 10;
    const computedThreshold = baselineValue * (1 + regressionPct / 100);

    // E-42: If CI data is available and reliable, use CI upper bound
    // to avoid false positives from sampling noise
    const ciUpper = baseline.ci_p75_upper;
    const ciLower = baseline.ci_p75_lower;
    const ciReliable = baseline.ci_p75_reliable ?? false;

    let effectiveThreshold = computedThreshold;
    if (ciReliable && ciUpper != null && stat === "p75") {
      // Use CI upper bound + regression_pct as the threshold
      effectiveThreshold = ciUpper * (1 + regressionPct / 100);
    }

    const passed = actualValue <= effectiveThreshold;

    return {
      passed,
      computedThreshold: effectiveThreshold,
      baselineValue,
      ci_lower: ciLower ?? undefined,
      ci_upper: ciUpper ?? undefined,
      ci_reliable: ciReliable,
    };
  }

  /**
   * E-46: Evaluate a metric against a statistical gate.
   * Fails if actual > mean + stddev_multiplier * stddev.
   * Default multiplier is 2 (≈95% confidence interval).
   *
   * Book Ch 14, p239: "The statistical gate fires if mobile-segment
   * RUM data shows LCP more than 2 standard deviations above the
   * rolling 24-hour median."
   *
   * E-42 enhancement: Uses CI from baseline when available to
   * determine the effective control limit.
   */
  async evaluateStatistical(
    def: GateDefinition,
    actualValue: number | undefined,
    projectId: string,
  ): Promise<{ passed: boolean; computedThreshold?: number; baselineValue?: number; ci_lower?: number; ci_upper?: number; ci_reliable?: boolean }> {
    if (actualValue === undefined) return { passed: true };
    if (!this.baselinesService) {
      this.logger.warn("BaselinesService not available; skipping statistical gate");
      return { passed: true };
    }

    const baseline = await this.baselinesService.findActive(
      projectId, def.metric, "staging"
    );
    if (!baseline || baseline.mean === null || baseline.stddev === null) {
      return { passed: true };
    }

    const multiplier = def.stddev_multiplier ?? 2;
    const computedThreshold = baseline.mean! + multiplier * baseline.stddev!;
    const passed = actualValue <= computedThreshold;

    return {
      passed,
      computedThreshold,
      baselineValue: baseline.mean!,
      ci_lower: baseline.ci_p75_lower ?? undefined,
      ci_upper: baseline.ci_p75_upper ?? undefined,
      ci_reliable: baseline.ci_p75_reliable ?? false,
    };
  }

  /**
   * E-11: Evaluate a VU-tiered gate.
   * Different thresholds apply at different VU levels.
   * §10: "A 200ms LCP gate at 10 VUs is not the same as at 1000 VUs."
   */
  evaluateVuTiered(
    def: GateDefinition,
    actualValue: number | undefined,
    metrics: Record<string, unknown>,
  ): { passed: boolean; computedThreshold?: number; matchedTier?: VuTier } {
    if (actualValue === undefined) return { passed: true };
    const tiers = def.vu_tiers ?? [];
    if (tiers.length === 0) {
      // Fall back to basic threshold
      return { passed: this.evaluateThreshold(def, actualValue) };
    }

    // Get current VU count from metrics
    const currentVus = (metrics.virtual_users ?? metrics.vus ?? metrics.concurrent_users ?? 0) as number;

    // Find the matching tier (smallest max_vus that is >= currentVus)
    const sorted = [...tiers].sort((a, b) => a.max_vus - b.max_vus);
    const matchedTier = sorted.find((t) => currentVus <= t.max_vus) ?? sorted[sorted.length - 1];

    const op = matchedTier.operator ?? def.operator ?? "lte";
    const threshold = matchedTier.threshold;

    let passed: boolean;
    switch (op) {
      case "lte": passed = actualValue <= threshold; break;
      case "gte": passed = actualValue >= threshold; break;
      case "lt":  passed = actualValue < threshold;  break;
      case "gt":  passed = actualValue > threshold;  break;
      default:    passed = true;
    }

    return { passed, computedThreshold: threshold, matchedTier };
  }

  /**
   * E-12: Evaluate a resource floor gate.
   * Ensures server resources (CPU, memory, etc.) stay above minimum during test.
   * "Resource floor gates protect against tests that pass on metrics but
   * leave the system starved."
   */
  evaluateResourceFloor(
    def: GateDefinition,
    metrics: Record<string, unknown>,
  ): { passed: boolean; computedThreshold?: number; actualValue?: number } {
    const resourceMetric = def.resource_metric ?? "cpu_pct";
    const floorValue = def.floor_value ?? 20; // default: fail if below 20%

    // Map resource metric names to possible keys in metrics
    const metricMap: Record<string, string[]> = {
      cpu_pct: ["cpu_available_pct", "cpu_idle_pct", "cpu_free_pct"],
      memory_pct: ["memory_available_pct", "memory_free_pct", "mem_available_pct"],
      disk_io_pct: ["disk_io_available_pct", "disk_free_pct"],
      network_mbps: ["network_available_mbps", "network_bandwidth_mbps"],
    };

    const keys = metricMap[resourceMetric] ?? [resourceMetric];
    let actualValue: number | undefined;
    for (const k of keys) {
      const v = metrics[k];
      if (typeof v === "number") {
        actualValue = v;
        break;
      }
    }

    if (actualValue === undefined) {
      this.logger.warn(`Resource metric ${resourceMetric} not found in metrics; skipping`);
      return { passed: true };
    }

    // Floor gate: value must be >= floor
    const passed = actualValue >= floorValue;
    return { passed, computedThreshold: floorValue, actualValue };
  }

  /**
   * E-13: Evaluate a capacity floor gate.
   * Ensures the system can sustain minimum throughput/RPS/concurrent users.
   * "If the system can't sustain 500 RPS at p95 < 200ms, the gate fails."
   */
  evaluateCapacityFloor(
    def: GateDefinition,
    metrics: Record<string, unknown>,
  ): { passed: boolean; computedThreshold?: number; actualValue?: number } {
    const capacityMetric = def.capacity_metric ?? "rps";
    const minCapacity = def.min_capacity ?? 100;

    const metricMap: Record<string, string[]> = {
      rps: ["requests_per_second", "rps", "throughput_rps"],
      concurrent_users: ["max_concurrent_users", "concurrent_users", "sustained_vus"],
      throughput_mbps: ["throughput_mbps", "data_throughput_mbps"],
    };

    const keys = metricMap[capacityMetric] ?? [capacityMetric];
    let actualValue: number | undefined;
    for (const k of keys) {
      const v = metrics[k];
      if (typeof v === "number") {
        actualValue = v;
        break;
      }
    }

    if (actualValue === undefined) {
      this.logger.warn(`Capacity metric ${capacityMetric} not found in metrics; skipping`);
      return { passed: true };
    }

    // Capacity floor: value must be >= minimum
    const passed = actualValue >= minCapacity;
    return { passed, computedThreshold: minCapacity, actualValue };
  }
}
