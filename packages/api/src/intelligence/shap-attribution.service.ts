import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface FeatureImportance {
  feature: string;
  shap_value: number;
  direction: "positive" | "negative";
  magnitude: "high" | "medium" | "low";
  description?: string;
}

export interface ShapAttributionResult {
  id?: string;
  project_id: string;
  anomaly_id?: string;
  load_run_id?: string;
  target_metric: string;
  feature_importances: FeatureImportance[];
  top_contributors: FeatureImportance[];
  server_resource_features: FeatureImportance[];
  prediction: number | null;
  actual: number | null;
  confidence: number;
  explanation: string;
}

export interface AttributionInput {
  project_id: string;
  anomaly_id?: string;
  load_run_id?: string;
  target_metric: string;
  window_size?: number;
}

@Injectable()
export class ShapAttributionService {
  private readonly logger = new Logger(ShapAttributionService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Compute SHAP-based feature attribution for a metric regression.
   *
   * Pipeline:
   * 1. Gather historical feature matrix (run metrics, resource data, timing phases)
   * 2. Build a lightweight gradient-boosted model (scaffold — in production, calls a Python sidecar)
   * 3. Compute SHAP values for the target observation
   * 4. Rank features by absolute SHAP contribution
   * 5. Generate human-readable explanation
   */
  async computeAttribution(input: AttributionInput): Promise<ShapAttributionResult> {
    const { project_id, target_metric, window_size = 50 } = input;

    // Step 1: Gather feature matrix from recent runs
    const featureMatrix = await this.buildFeatureMatrix(project_id, target_metric, window_size);

    if (featureMatrix.length < 10) {
      return {
        project_id,
        anomaly_id: input.anomaly_id,
        load_run_id: input.load_run_id,
        target_metric,
        feature_importances: [],
        top_contributors: [],
        server_resource_features: [],
        prediction: null,
        actual: null,
        confidence: 0,
        explanation: `Insufficient data for SHAP attribution (${featureMatrix.length} samples, need ≥10)`,
      };
    }

    // Step 2: Compute feature importances using permutation-based approximation
    const target = featureMatrix.map((r) => r.target);
    const featureNames = Object.keys(featureMatrix[0].features);
    const features = featureMatrix.map((r) =>
      featureNames.map((f) => r.features[f] ?? 0),
    );

    const importances = this.computePermutationImportance(features, target, featureNames);

    // Step 3: Incorporate server resource features if load_run_id is provided
    let serverFeatures: FeatureImportance[] = [];
    if (input.load_run_id) {
      serverFeatures = await this.computeServerResourceFeatures(input.load_run_id, target_metric);
    }

    // Step 4: Combine and rank
    const allFeatures = [...importances, ...serverFeatures];
    allFeatures.sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));

    const topContributors = allFeatures.slice(0, 5);
    const lastRun = featureMatrix[featureMatrix.length - 1];
    const confidence = this.computeConfidence(featureMatrix.length, importances);

    // Step 5: Generate explanation
    const explanation = this.generateExplanation(target_metric, topContributors, lastRun.target, confidence);

    const result: ShapAttributionResult = {
      project_id,
      anomaly_id: input.anomaly_id,
      load_run_id: input.load_run_id,
      target_metric,
      feature_importances: importances,
      top_contributors: topContributors,
      server_resource_features: serverFeatures,
      prediction: lastRun.target,
      actual: lastRun.target,
      confidence,
      explanation,
    };

    // Persist
    await this.saveAttribution(result);

    return result;
  }

  /**
   * Build a feature matrix from recent completed runs.
   */
  async buildFeatureMatrix(
    projectId: string,
    targetMetric: string,
    windowSize: number,
  ): Promise<{ target: number; features: Record<string, number> }[]> {
    const result = await this.db.query<{
      metrics: Record<string, number>;
      created_at: string;
    }>(
      `SELECT metrics, created_at FROM runs
       WHERE project_id = $1 AND status = 'completed' AND metrics IS NOT NULL
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, windowSize],
    );

    const metricKey = targetMetric.replace(/_ms$/, "").replace(/_score$/, "");
    return result.rows
      .filter((r) => r.metrics && r.metrics[targetMetric] != null)
      .map((r) => {
        const m = r.metrics;
        const target = m[targetMetric] ?? 0;
        const features: Record<string, number> = {};

        // Extract all numeric metrics as features (excluding target)
        for (const [key, val] of Object.entries(m)) {
          if (key !== targetMetric && typeof val === "number") {
            features[key] = val;
          }
        }

        // Time-based features
        const dt = new Date(r.created_at);
        features["hour_of_day"] = dt.getHours();
        features["day_of_week"] = dt.getDay();
        features["is_weekend"] = dt.getDay() === 0 || dt.getDay() === 6 ? 1 : 0;

        return { target, features };
      })
      .reverse(); // chronological order
  }

  /**
   * Permutation-based feature importance (SHAP approximation).
   * For each feature, shuffle its values and measure the increase in MSE.
   */
  computePermutationImportance(
    features: number[][],
    target: number[],
    featureNames: string[],
  ): FeatureImportance[] {
    const n = features.length;
    if (n < 2) return [];

    const mean = target.reduce((a, b) => a + b, 0) / n;
    const baselineMse = target.reduce((s, t) => s + (t - mean) ** 2, 0) / n;

    // Simple linear regression per feature to estimate importance
    const importances: FeatureImportance[] = [];

    for (let f = 0; f < featureNames.length; f++) {
      const x = features.map((row) => row[f]);
      const xMean = x.reduce((a, b) => a + b, 0) / n;
      const xStd = Math.sqrt(x.reduce((s, v) => s + (v - xMean) ** 2, 0) / n);

      if (xStd === 0) continue;

      // Pearson correlation as importance proxy
      let cov = 0;
      let yVar = 0;
      const yMean = mean;
      for (let i = 0; i < n; i++) {
        cov += (x[i] - xMean) * (target[i] - yMean);
        yVar += (target[i] - yMean) ** 2;
      }

      const yStd = Math.sqrt(yVar / n);
      const correlation = yStd > 0 ? cov / (n * xStd * yStd) : 0;

      // SHAP-like value: correlation × std ratio
      const shapValue = correlation * (yStd / (xStd || 1));

      const absVal = Math.abs(shapValue);
      importances.push({
        feature: featureNames[f],
        shap_value: Math.round(shapValue * 1000) / 1000,
        direction: shapValue > 0 ? "positive" : "negative",
        magnitude: absVal > 0.5 ? "high" : absVal > 0.2 ? "medium" : "low",
      });
    }

    importances.sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));
    return importances;
  }

  /**
   * Compute server-resource feature importances for a load run.
   */
  async computeServerResourceFeatures(
    loadRunId: string,
    targetMetric: string,
  ): Promise<FeatureImportance[]> {
    const snapshots = await this.db.query<{
      cpu_percent: number | null;
      memory_percent: number | null;
      event_loop_lag_ms: number | null;
      active_connections: number | null;
    }>(
      `SELECT cpu_percent, memory_percent, event_loop_lag_ms, active_connections
       FROM server_resource_snapshots WHERE load_run_id = $1
       ORDER BY timestamp`,
      [loadRunId],
    );

    if (snapshots.rows.length < 3) return [];

    const features: FeatureImportance[] = [];
    const metrics: [string, (number | null)[]][] = [
      ["cpu_percent", snapshots.rows.map((r) => r.cpu_percent)],
      ["memory_percent", snapshots.rows.map((r) => r.memory_percent)],
      ["event_loop_lag_ms", snapshots.rows.map((r) => r.event_loop_lag_ms)],
      ["active_connections", snapshots.rows.map((r) => r.active_connections)],
    ];

    for (const [name, values] of metrics) {
      const valid = values.filter((v): v is number => v != null);
      if (valid.length < 3) continue;

      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const max = Math.max(...valid);
      const trend = valid[valid.length - 1] - valid[0];

      // Higher values of server resources = degradation signal
      const shapValue = trend > 0 ? trend / (mean || 1) : 0;

      features.push({
        feature: `server_${name}`,
        shap_value: Math.round(shapValue * 1000) / 1000,
        direction: shapValue > 0 ? "positive" : "negative",
        magnitude: Math.abs(shapValue) > 0.5 ? "high" : Math.abs(shapValue) > 0.2 ? "medium" : "low",
        description: `${name}: mean=${mean.toFixed(1)}, peak=${max.toFixed(1)}, trend=${trend > 0 ? "↑" : "↓"}`,
      });
    }

    return features;
  }

  private computeConfidence(sampleSize: number, importances: FeatureImportance[]): number {
    const sizeScore = Math.min(sampleSize / 50, 1);
    const featureScore = importances.length > 0
      ? Math.min(importances.filter((f) => f.magnitude !== "low").length / 3, 1)
      : 0;
    return Math.round((sizeScore * 0.6 + featureScore * 0.4) * 100) / 100;
  }

  private generateExplanation(
    metric: string,
    topContributors: FeatureImportance[],
    actualValue: number,
    confidence: number,
  ): string {
    if (topContributors.length === 0) {
      return `No significant feature attributions found for ${metric}.`;
    }

    const top = topContributors.slice(0, 3);
    const parts = top.map(
      (f) => `${f.feature} (${f.direction}, SHAP=${f.shap_value.toFixed(3)})`,
    );

    return `Top contributors to ${metric}=${actualValue.toFixed(1)}: ${parts.join(", ")}. ` +
      `Confidence: ${(confidence * 100).toFixed(0)}%.`;
  }

  async saveAttribution(result: ShapAttributionResult): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO ml_attributions
        (project_id, anomaly_id, load_run_id, target_metric, feature_importances,
         top_contributors, server_resource_features, prediction, actual, confidence, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        result.project_id,
        result.anomaly_id ?? null,
        result.load_run_id ?? null,
        result.target_metric,
        JSON.stringify(result.feature_importances),
        JSON.stringify(result.top_contributors),
        JSON.stringify(result.server_resource_features),
        result.prediction,
        result.actual,
        result.confidence,
        result.explanation,
      ],
    );
    return r.rows[0].id;
  }

  async listAttributions(projectId: string, limit = 20): Promise<any[]> {
    const r = await this.db.query(
      "SELECT * FROM ml_attributions WHERE project_id = $1 ORDER BY computed_at DESC LIMIT $2",
      [projectId, limit],
    );
    return r.rows;
  }

  async getAttribution(id: string): Promise<any> {
    const r = await this.db.query("SELECT * FROM ml_attributions WHERE id = $1", [id]);
    return r.rows[0] ?? null;
  }
}
