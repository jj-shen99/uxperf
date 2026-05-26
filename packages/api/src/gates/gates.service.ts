import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface GateDefinition {
  type: "threshold";
  metric: string;
  operator: "lte" | "gte" | "lt" | "gt";
  threshold: number;
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
  threshold: number;
  operator: string;
  quorum_detail?: {
    recent_failures: number;
    required_failures: number;
    window_size: number;
  };
}

@Injectable()
export class GatesService {
  constructor(private db: DatabaseService) {}

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
   * 3-of-5 quorum: check if a gate has failed in at least 3 of the last 5 runs.
   * §10.2: "a regression must appear in at least three of the last five runs
   * to fail a gate."
   */
  async checkQuorum(
    gateId: string,
    projectId: string,
    currentRunFailed: boolean
  ): Promise<{ shouldFail: boolean; recentFailures: number }> {
    // Get the last 4 gate results (we'll add the current as the 5th)
    const result = await this.db.query<GateResultRow>(
      `SELECT gr.* FROM gate_results gr
       JOIN runs r ON r.id = gr.run_id
       WHERE gr.gate_id = $1 AND r.project_id = $2
       ORDER BY gr.evaluated_at DESC
       LIMIT 4`,
      [gateId, projectId]
    );

    const recentStatuses = result.rows.map((r) => r.status);
    const pastFailures = recentStatuses.filter((s) => s === "failed").length;
    const totalFailures = pastFailures + (currentRunFailed ? 1 : 0);
    const windowSize = Math.min(recentStatuses.length + 1, 5);
    const requiredFailures = 3;

    return {
      shouldFail: totalFailures >= requiredFailures,
      recentFailures: totalFailures,
    };
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
      if (def.type !== "threshold") continue; // Phase 1: only threshold gates

      const actualValue = this.extractMetricValue(metrics, def.metric);
      const passed = this.evaluateThreshold(def, actualValue);

      // Apply 3-of-5 quorum
      const quorum = await this.checkQuorum(gate.id, projectId, !passed);

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
            actual_value: actualValue,
            threshold: def.threshold,
            operator: def.operator,
            single_run_passed: passed,
            quorum_failures: quorum.recentFailures,
            quorum_required: 3,
            quorum_window: 5,
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
        operator: def.operator,
        quorum_detail: {
          recent_failures: quorum.recentFailures,
          required_failures: 3,
          window_size: 5,
        },
      });
    }

    return outcomes;
  }
}
