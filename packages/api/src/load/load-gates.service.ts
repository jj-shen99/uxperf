import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface VuThreshold {
  min_vus: number;
  max_vus: number;
  threshold_value: number;
}

export interface LoadGateEvaluation {
  gate_id: string;
  gate_name: string;
  metric: string;
  actual_value: number;
  threshold_value: number;
  vu_count: number;
  tier_used: VuThreshold;
  status: "passed" | "failed" | "skipped";
  message: string;
}

@Injectable()
export class LoadGatesService {
  private readonly logger = new Logger(LoadGatesService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Evaluate load-aware gates for a load run.
   * Uses VU-parameterized thresholds: different threshold values
   * depending on the VU count at which the metric was measured.
   */
  async evaluateForLoadRun(
    loadRunId: string,
    actualVus: number,
    metricsSummary: Record<string, number>,
  ): Promise<LoadGateEvaluation[]> {
    // Find gates with vu_thresholds for this project
    const gatesResult = await this.db.query<{
      id: string;
      name: string;
      metric: string;
      vu_thresholds: VuThreshold[];
      load_profile_id: string | null;
    }>(
      `SELECT g.id, g.name, g.metric, g.vu_thresholds, g.load_profile_id
       FROM gates g
       JOIN load_runs lr ON g.project_id = lr.project_id
       WHERE lr.id = $1
         AND g.vu_thresholds IS NOT NULL
         AND g.enabled = true`,
      [loadRunId],
    );

    const evaluations: LoadGateEvaluation[] = [];

    for (const gate of gatesResult.rows) {
      const thresholds = gate.vu_thresholds ?? [];
      const tier = this.resolveTier(thresholds, actualVus);

      if (!tier) {
        evaluations.push({
          gate_id: gate.id,
          gate_name: gate.name,
          metric: gate.metric,
          actual_value: 0,
          threshold_value: 0,
          vu_count: actualVus,
          tier_used: { min_vus: 0, max_vus: 0, threshold_value: 0 },
          status: "skipped",
          message: `No VU threshold tier matches ${actualVus} VUs`,
        });
        continue;
      }

      const metricKey = this.metricToSummaryKey(gate.metric);
      const actualValue = metricsSummary[metricKey] ?? 0;
      const passed = actualValue <= tier.threshold_value;

      evaluations.push({
        gate_id: gate.id,
        gate_name: gate.name,
        metric: gate.metric,
        actual_value: actualValue,
        threshold_value: tier.threshold_value,
        vu_count: actualVus,
        tier_used: tier,
        status: passed ? "passed" : "failed",
        message: passed
          ? `${gate.metric} = ${actualValue.toFixed(1)} ≤ ${tier.threshold_value} (${tier.min_vus}-${tier.max_vus} VUs)`
          : `${gate.metric} = ${actualValue.toFixed(1)} > ${tier.threshold_value} threshold at ${tier.min_vus}-${tier.max_vus} VU tier`,
      });
    }

    return evaluations;
  }

  /**
   * Resolve the appropriate VU threshold tier for a given VU count.
   */
  resolveTier(thresholds: VuThreshold[], vus: number): VuThreshold | null {
    // Find the tier where min_vus <= vus <= max_vus
    for (const t of thresholds) {
      if (vus >= t.min_vus && vus <= t.max_vus) {
        return t;
      }
    }
    // Fallback: use the highest tier if vus exceeds all
    const sorted = [...thresholds].sort((a, b) => b.max_vus - a.max_vus);
    if (sorted.length > 0 && vus >= sorted[0].min_vus) {
      return sorted[0];
    }
    return null;
  }

  /**
   * Map gate metric names to k6 summary keys.
   */
  private metricToSummaryKey(metric: string): string {
    const map: Record<string, string> = {
      lcp: "browser_lcp_p95",
      fcp: "browser_fcp_p95",
      cls: "browser_cls_p95",
      ttfb: "browser_ttfb_p95",
      http_req_duration: "http_req_duration_p95",
      lcp_ms: "browser_lcp_p95",
      fcp_ms: "browser_fcp_p95",
    };
    return map[metric] ?? metric;
  }
}
