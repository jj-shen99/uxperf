import { Injectable, Logger, Inject, Optional } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";

export interface ForecastPoint {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface ForecastResult {
  id?: string;
  project_id: string;
  metric: string;
  environment: string;
  model: string;
  horizon_days: number;
  forecast_data: ForecastPoint[];
  trend_component: TrendComponent;
  seasonal_component: SeasonalComponent;
  accuracy: ForecastAccuracy;
}

export interface TrendComponent {
  direction: "improving" | "degrading" | "stable";
  slope_per_day: number;
  r_squared: number;
}

export interface SeasonalComponent {
  day_of_week: Record<string, number>;  // {Mon: -5, Tue: 2, ...}
  has_weekly_pattern: boolean;
  amplitude: number;
}

export interface ForecastAccuracy {
  mape: number;  // mean absolute percentage error
  rmse: number;  // root mean squared error
  mae: number;   // mean absolute error
}

export interface ForecastInput {
  project_id: string;
  metric: string;
  environment?: string;
  horizon_days?: number;
  history_days?: number;
}

export interface BreachWarning {
  project_id: string;
  metric: string;
  budget_threshold: number;
  will_breach: boolean;
  breach_date: string | null;
  days_until_breach: number | null;
  weeks_until_breach: number | null;
  current_trend: TrendComponent;
  confidence: "high" | "medium" | "low";
  reason: string;
}

@Injectable()
export class ForecastingService {
  private readonly logger = new Logger(ForecastingService.name);

  constructor(
    private readonly db: DatabaseService,
    @Optional() @Inject(NotificationsService) private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Generate a Prophet-style forecast for a metric.
   *
   * Pipeline:
   * 1. Fetch historical time-series data
   * 2. Decompose into trend + seasonal + residual components
   * 3. Fit a piecewise linear trend
   * 4. Detect weekly seasonality
   * 5. Project forward for the requested horizon
   * 6. Compute prediction intervals using residual variance
   */
  async generateForecast(input: ForecastInput): Promise<ForecastResult> {
    const {
      project_id,
      metric,
      environment = "staging",
      horizon_days = 30,
      history_days = 90,
    } = input;

    // Step 1: Fetch historical data
    const history = await this.fetchHistory(project_id, metric, environment, history_days);

    if (history.length < 7) {
      return this.emptyForecast(project_id, metric, environment, horizon_days,
        `Insufficient history (${history.length} points, need ≥7)`);
    }

    // Step 2: Fit trend
    const trend = this.fitTrend(history);

    // Step 3: Detect seasonality
    const seasonal = this.fitSeasonality(history, trend);

    // Step 4: Compute residuals and accuracy
    const residuals = this.computeResiduals(history, trend, seasonal);
    const accuracy = this.computeAccuracy(history, residuals);

    // Step 5: Generate forecast
    const forecastData = this.project(history, trend, seasonal, residuals, horizon_days);

    const result: ForecastResult = {
      project_id,
      metric,
      environment,
      model: "prophet_style",
      horizon_days,
      forecast_data: forecastData,
      trend_component: trend,
      seasonal_component: seasonal,
      accuracy,
    };

    // Persist
    await this.saveForecast(result);

    return result;
  }

  /**
   * Fetch historical metric values as a daily time series.
   */
  async fetchHistory(
    projectId: string,
    metric: string,
    environment: string,
    days: number,
  ): Promise<{ date: string; value: number }[]> {
    const result = await this.db.query<{ day: string; avg_value: number }>(
      `SELECT DATE(created_at) as day,
              AVG((metrics->>$2)::numeric) as avg_value
       FROM runs
       WHERE project_id = $1
         AND environment = $3
         AND status = 'completed'
         AND metrics->>$2 IS NOT NULL
         AND created_at >= NOW() - ($4 || ' days')::interval
       GROUP BY DATE(created_at)
       ORDER BY day`,
      [projectId, metric, environment, days.toString()],
    );

    return result.rows.map((r) => ({
      date: r.day,
      value: Number(r.avg_value),
    }));
  }

  /**
   * Fit a linear trend using ordinary least squares.
   */
  fitTrend(history: { date: string; value: number }[]): TrendComponent {
    const n = history.length;
    const x = history.map((_, i) => i);
    const y = history.map((h) => h.value);

    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = y.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - xMean) * (y[i] - yMean);
      den += (x[i] - xMean) ** 2;
    }

    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;

    // R-squared
    const predictions = x.map((xi) => intercept + slope * xi);
    const ssRes = y.reduce((s, yi, i) => s + (yi - predictions[i]) ** 2, 0);
    const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const direction: TrendComponent["direction"] =
      slope > 0.5 ? "degrading" : slope < -0.5 ? "improving" : "stable";

    return {
      direction,
      slope_per_day: Math.round(slope * 1000) / 1000,
      r_squared: Math.round(rSquared * 1000) / 1000,
    };
  }

  /**
   * Detect weekly seasonality by averaging residuals by day-of-week.
   */
  fitSeasonality(
    history: { date: string; value: number }[],
    trend: TrendComponent,
  ): SeasonalComponent {
    const dayBuckets: Record<string, number[]> = {
      Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [],
    };
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const n = history.length;
    const intercept = history[0]?.value ?? 0;

    for (let i = 0; i < n; i++) {
      const dt = new Date(history[i].date);
      const trendValue = intercept + trend.slope_per_day * i;
      const residual = history[i].value - trendValue;
      const dayName = dayNames[dt.getDay()];
      dayBuckets[dayName].push(residual);
    }

    const dayOfWeek: Record<string, number> = {};
    let maxAmp = 0;
    for (const [day, vals] of Object.entries(dayBuckets)) {
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      dayOfWeek[day] = Math.round(avg * 100) / 100;
      maxAmp = Math.max(maxAmp, Math.abs(avg));
    }

    return {
      day_of_week: dayOfWeek,
      has_weekly_pattern: maxAmp > 5, // significant if > 5ms variation
      amplitude: Math.round(maxAmp * 100) / 100,
    };
  }

  /**
   * Compute residuals after removing trend and seasonality.
   */
  private computeResiduals(
    history: { date: string; value: number }[],
    trend: TrendComponent,
    seasonal: SeasonalComponent,
  ): number[] {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const intercept = history[0]?.value ?? 0;

    return history.map((h, i) => {
      const trendVal = intercept + trend.slope_per_day * i;
      const dt = new Date(h.date);
      const seasonalVal = seasonal.day_of_week[dayNames[dt.getDay()]] ?? 0;
      return h.value - trendVal - seasonalVal;
    });
  }

  /**
   * Compute forecast accuracy metrics.
   */
  computeAccuracy(
    history: { date: string; value: number }[],
    residuals: number[],
  ): ForecastAccuracy {
    const n = residuals.length;
    if (n === 0) return { mape: 0, rmse: 0, mae: 0 };

    const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / n;
    const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

    let mape = 0;
    let validCount = 0;
    for (let i = 0; i < n; i++) {
      if (history[i].value !== 0) {
        mape += Math.abs(residuals[i] / history[i].value);
        validCount++;
      }
    }
    mape = validCount > 0 ? (mape / validCount) * 100 : 0;

    return {
      mape: Math.round(mape * 100) / 100,
      rmse: Math.round(rmse * 100) / 100,
      mae: Math.round(mae * 100) / 100,
    };
  }

  /**
   * Project the forecast forward.
   */
  private project(
    history: { date: string; value: number }[],
    trend: TrendComponent,
    seasonal: SeasonalComponent,
    residuals: number[],
    horizonDays: number,
  ): ForecastPoint[] {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const n = history.length;
    const intercept = history[0]?.value ?? 0;
    const residualStd = residuals.length > 0
      ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
      : 0;

    const lastDate = new Date(history[n - 1]?.date ?? new Date());
    const points: ForecastPoint[] = [];

    for (let d = 1; d <= horizonDays; d++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + d);

      const trendVal = intercept + trend.slope_per_day * (n + d - 1);
      const seasonalVal = seasonal.day_of_week[dayNames[forecastDate.getDay()]] ?? 0;
      const yhat = trendVal + seasonalVal;

      // Prediction interval widens with distance
      const uncertainty = residualStd * Math.sqrt(1 + d / n);

      points.push({
        date: forecastDate.toISOString().split("T")[0],
        yhat: Math.round(yhat * 100) / 100,
        yhat_lower: Math.round((yhat - 1.96 * uncertainty) * 100) / 100,
        yhat_upper: Math.round((yhat + 1.96 * uncertainty) * 100) / 100,
      });
    }

    return points;
  }

  private emptyForecast(
    projectId: string, metric: string, environment: string, horizonDays: number, reason: string,
  ): ForecastResult {
    return {
      project_id: projectId,
      metric,
      environment,
      model: "prophet_style",
      horizon_days: horizonDays,
      forecast_data: [],
      trend_component: { direction: "stable", slope_per_day: 0, r_squared: 0 },
      seasonal_component: { day_of_week: {}, has_weekly_pattern: false, amplitude: 0 },
      accuracy: { mape: 0, rmse: 0, mae: 0 },
    };
  }

  private async saveForecast(result: ForecastResult): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO forecasts
        (project_id, metric, environment, model, horizon_days, forecast_data,
         trend_component, seasonal_component, accuracy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        result.project_id, result.metric, result.environment, result.model,
        result.horizon_days, JSON.stringify(result.forecast_data),
        JSON.stringify(result.trend_component), JSON.stringify(result.seasonal_component),
        JSON.stringify(result.accuracy),
      ],
    );
    return r.rows[0].id;
  }

  /**
   * E-37: Forecast breach warnings.
   * Ch 14, p179: "If the bundle has grown 3KB a week for the last quarter,
   * when will it cross the 200KB budget?"
   *
   * Generates a forecast and checks if/when yhat crosses the budget threshold.
   * Returns breach info including estimated date and weeks until breach.
   */
  async projectBreach(input: ForecastInput & { budget_threshold: number }): Promise<BreachWarning> {
    const { budget_threshold, ...forecastInput } = input;
    const forecast = await this.generateForecast({
      ...forecastInput,
      horizon_days: forecastInput.horizon_days ?? 90,
    });

    if (forecast.forecast_data.length === 0) {
      return {
        project_id: input.project_id,
        metric: input.metric,
        budget_threshold,
        will_breach: false,
        breach_date: null,
        days_until_breach: null,
        weeks_until_breach: null,
        current_trend: forecast.trend_component,
        confidence: "low",
        reason: "Insufficient data to forecast",
      };
    }

    // Find first forecast point that crosses the budget
    const breachPoint = forecast.forecast_data.find((p) => p.yhat >= budget_threshold);
    const likelyBreachPoint = forecast.forecast_data.find((p) => p.yhat_lower >= budget_threshold);

    if (!breachPoint) {
      return {
        project_id: input.project_id,
        metric: input.metric,
        budget_threshold,
        will_breach: false,
        breach_date: null,
        days_until_breach: null,
        weeks_until_breach: null,
        current_trend: forecast.trend_component,
        confidence: forecast.trend_component.r_squared > 0.5 ? "high" : "medium",
        reason: `No breach projected within ${forecast.horizon_days} days`,
      };
    }

    const today = new Date();
    const breachDate = new Date(breachPoint.date);
    const daysUntil = Math.ceil((breachDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksUntil = Math.round(daysUntil / 7 * 10) / 10;

    // Confidence based on R² and whether lower bound also breaches
    const confidence: "high" | "medium" | "low" =
      likelyBreachPoint && forecast.trend_component.r_squared > 0.5
        ? "high"
        : forecast.trend_component.r_squared > 0.3
          ? "medium"
          : "low";

    return {
      project_id: input.project_id,
      metric: input.metric,
      budget_threshold,
      will_breach: true,
      breach_date: breachPoint.date,
      days_until_breach: Math.max(0, daysUntil),
      weeks_until_breach: Math.max(0, weeksUntil),
      current_trend: forecast.trend_component,
      confidence,
      reason: `At current pace (${forecast.trend_component.slope_per_day}/day), ${input.metric} will cross ${budget_threshold} in ~${weeksUntil} weeks`,
    };
  }

  /**
   * E-37: Check all budgets for a project and return breach warnings.
   */
  async checkAllBudgetBreaches(
    projectId: string,
    budgets: { metric: string; threshold: number }[],
    environment?: string,
  ): Promise<BreachWarning[]> {
    const warnings: BreachWarning[] = [];

    for (const budget of budgets) {
      const warning = await this.projectBreach({
        project_id: projectId,
        metric: budget.metric,
        budget_threshold: budget.threshold,
        environment,
        horizon_days: 90,
      });
      if (warning.will_breach) {
        warnings.push(warning);
      }
    }

    // Sort by urgency (closest breach first)
    warnings.sort((a, b) => (a.days_until_breach ?? 999) - (b.days_until_breach ?? 999));
    return warnings;
  }

  /**
   * E-59: Check all budgets and dispatch notifications for imminent breaches.
   *
   * Book Ch 14, p179: "If the bundle has grown 3KB a week for the last quarter,
   * when will it cross the 200KB budget?"
   *
   * When a forecast crosses a budget threshold, auto-create a warning
   * notification ("budget breach in N weeks").
   */
  async checkAndNotifyBreaches(
    projectId: string,
    budgets: { metric: string; threshold: number }[],
    environment?: string,
  ): Promise<BreachWarning[]> {
    const warnings = await this.checkAllBudgetBreaches(projectId, budgets, environment);

    if (warnings.length > 0 && this.notificationsService) {
      for (const warning of warnings) {
        try {
          await this.notificationsService.dispatch({
            event: "forecast_breach",
            project_id: projectId,
            title: `Forecast breach: ${warning.metric}`,
            message: warning.reason,
            details: {
              metric: warning.metric,
              budget_threshold: warning.budget_threshold,
              breach_date: warning.breach_date,
              days_until_breach: warning.days_until_breach,
              weeks_until_breach: warning.weeks_until_breach,
              confidence: warning.confidence,
              trend_direction: warning.current_trend.direction,
              slope_per_day: warning.current_trend.slope_per_day,
            },
          });
        } catch (e) {
          this.logger.error(`Failed to dispatch forecast breach notification for ${warning.metric}: ${e}`);
        }
      }

      this.logger.log(
        `Dispatched ${warnings.length} forecast breach notification(s) for project ${projectId}`,
      );
    }

    return warnings;
  }

  async listForecasts(projectId: string, metric?: string): Promise<any[]> {
    const params: unknown[] = [projectId];
    let where = "project_id = $1";
    if (metric) {
      params.push(metric);
      where += ` AND metric = $${params.length}`;
    }
    const r = await this.db.query(
      `SELECT * FROM forecasts WHERE ${where} ORDER BY computed_at DESC LIMIT 20`,
      params,
    );
    return r.rows;
  }
}
