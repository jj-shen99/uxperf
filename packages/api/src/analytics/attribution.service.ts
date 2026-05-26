import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface AttributionResult {
  metric: string;
  regression_ms: number;
  attributions: Attribution[];
  explanation: string;
}

export interface Attribution {
  type: "phase" | "request" | "resource_type" | "third_party";
  name: string;
  contribution_pct: number;
  delta: number;
  detail: string;
}

@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Heuristic root-cause attribution for a regression between two runs.
   *
   * Phase-level: compares per-request phase distributions.
   * Request-level: identifies specific requests that shifted most.
   */
  async attributeRegression(
    baselineRunId: string,
    regressionRunId: string,
    metric: string,
  ): Promise<AttributionResult> {
    // Get metrics for both runs
    const [baseRun, regRun] = await Promise.all([
      this.db.query<{ metrics: Record<string, unknown> }>(
        "SELECT metrics FROM runs WHERE id = $1",
        [baselineRunId],
      ),
      this.db.query<{ metrics: Record<string, unknown> }>(
        "SELECT metrics FROM runs WHERE id = $1",
        [regressionRunId],
      ),
    ]);

    const baseMetrics = baseRun.rows[0]?.metrics ?? {};
    const regMetrics = regRun.rows[0]?.metrics ?? {};

    const baseVal = typeof baseMetrics[metric] === "number" ? (baseMetrics[metric] as number) : 0;
    const regVal = typeof regMetrics[metric] === "number" ? (regMetrics[metric] as number) : 0;
    const regressionMs = regVal - baseVal;

    // Phase-level attribution via per-request data
    const attributions = await this.phaseAttribution(baselineRunId, regressionRunId);

    // Request-level attribution
    const requestAttrs = await this.requestAttribution(baselineRunId, regressionRunId);

    const allAttributions = [...attributions, ...requestAttrs]
      .sort((a, b) => Math.abs(b.contribution_pct) - Math.abs(a.contribution_pct))
      .slice(0, 5);

    const explanation = this.buildExplanation(metric, regressionMs, allAttributions);

    return {
      metric,
      regression_ms: regressionMs,
      attributions: allAttributions,
      explanation,
    };
  }

  /**
   * Phase-level attribution: compare aggregated per-request durations by resource type.
   */
  private async phaseAttribution(
    baseRunId: string,
    regRunId: string,
  ): Promise<Attribution[]> {
    const query = `
      SELECT resource_type,
             AVG(duration_ms) AS avg_duration,
             AVG(ttfb_ms) AS avg_ttfb,
             SUM(transfer_size) AS total_transfer
      FROM per_request_data
      WHERE run_id = $1
      GROUP BY resource_type
    `;

    const [baseSummary, regSummary] = await Promise.all([
      this.db.query<{
        resource_type: string;
        avg_duration: string;
        avg_ttfb: string;
        total_transfer: string;
      }>(query, [baseRunId]),
      this.db.query<{
        resource_type: string;
        avg_duration: string;
        avg_ttfb: string;
        total_transfer: string;
      }>(query, [regRunId]),
    ]);

    const baseMap = new Map(
      baseSummary.rows.map((r) => [r.resource_type, r]),
    );

    const attributions: Attribution[] = [];
    let totalDelta = 0;
    const deltas: { type: string; delta: number }[] = [];

    for (const row of regSummary.rows) {
      const base = baseMap.get(row.resource_type);
      const baseDuration = base ? parseFloat(base.avg_duration) : 0;
      const regDuration = parseFloat(row.avg_duration);
      const delta = regDuration - baseDuration;

      if (Math.abs(delta) > 1) {
        deltas.push({ type: row.resource_type, delta });
        totalDelta += Math.abs(delta);
      }
    }

    for (const d of deltas) {
      attributions.push({
        type: "resource_type",
        name: d.type,
        contribution_pct:
          totalDelta > 0 ? Math.round((Math.abs(d.delta) / totalDelta) * 100) : 0,
        delta: d.delta,
        detail: `${d.type} avg duration changed by ${d.delta > 0 ? "+" : ""}${d.delta.toFixed(1)} ms`,
      });
    }

    return attributions;
  }

  /**
   * Request-level attribution: find specific URLs with the biggest timing shifts.
   */
  private async requestAttribution(
    baseRunId: string,
    regRunId: string,
  ): Promise<Attribution[]> {
    // Get top slowest requests from regression run
    const regRequests = await this.db.query<{
      request_url: string;
      duration_ms: number;
      resource_type: string;
      is_third_party: boolean;
    }>(
      `SELECT request_url, duration_ms, resource_type, is_third_party
       FROM per_request_data
       WHERE run_id = $1 AND duration_ms IS NOT NULL
       ORDER BY duration_ms DESC
       LIMIT 20`,
      [regRunId],
    );

    // Get baseline timings for same URLs
    const baseRequests = await this.db.query<{
      request_url: string;
      duration_ms: number;
    }>(
      `SELECT request_url, AVG(duration_ms) AS duration_ms
       FROM per_request_data
       WHERE run_id = $1 AND duration_ms IS NOT NULL
       GROUP BY request_url`,
      [baseRunId],
    );

    const baseMap = new Map(
      baseRequests.rows.map((r) => [r.request_url, r.duration_ms]),
    );

    const attributions: Attribution[] = [];

    for (const req of regRequests.rows) {
      const baseDuration = baseMap.get(req.request_url) ?? 0;
      const delta = (req.duration_ms ?? 0) - baseDuration;

      if (Math.abs(delta) > 10) {
        const urlShort =
          req.request_url.length > 80
            ? req.request_url.substring(0, 77) + "..."
            : req.request_url;

        attributions.push({
          type: req.is_third_party ? "third_party" : "request",
          name: urlShort,
          contribution_pct: 0, // will be normalized later
          delta,
          detail: `${urlShort} (${req.resource_type}): ${delta > 0 ? "+" : ""}${delta.toFixed(0)} ms`,
        });
      }
    }

    // Normalize contribution percentages
    const totalAbsDelta = attributions.reduce(
      (sum, a) => sum + Math.abs(a.delta),
      0,
    );
    if (totalAbsDelta > 0) {
      for (const a of attributions) {
        a.contribution_pct = Math.round(
          (Math.abs(a.delta) / totalAbsDelta) * 100,
        );
      }
    }

    return attributions.slice(0, 5);
  }

  /**
   * Build a human-readable explanation from attribution results.
   */
  private buildExplanation(
    metric: string,
    regressionMs: number,
    attributions: Attribution[],
  ): string {
    if (attributions.length === 0) {
      return `${metric} ${regressionMs > 0 ? "regressed" : "improved"} by ${Math.abs(regressionMs).toFixed(0)} ms, but no specific per-request attribution data is available.`;
    }

    const top = attributions[0];
    const direction = regressionMs > 0 ? "regressed" : "improved";
    let explanation = `${metric} ${direction} ${Math.abs(regressionMs).toFixed(0)} ms; `;
    explanation += `${top.contribution_pct}% attributed to ${top.type === "third_party" ? "third-party " : ""}${top.name}`;

    if (top.delta !== 0) {
      explanation += ` (${top.delta > 0 ? "+" : ""}${top.delta.toFixed(0)} ms)`;
    }

    if (attributions.length > 1) {
      explanation += `. Also contributing: ${attributions
        .slice(1, 3)
        .map((a) => `${a.name} (${a.contribution_pct}%)`)
        .join(", ")}`;
    }

    explanation += ".";
    return explanation;
  }
}
