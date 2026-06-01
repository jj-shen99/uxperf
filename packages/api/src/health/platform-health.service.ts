/**
 * E-65: Platform health self-monitoring service.
 *
 * Monitors the platform itself — detects when runs stop completing,
 * checks worker liveness, and manages gate behavior during outages
 * (default-safe: pause rather than auto-pass).
 *
 * Book Ch 14, p245: "Health checks on the platform itself — alerts when
 * the platform stops reporting, explicit policy for gate behavior during
 * platform outages."
 */
import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface HealthCheckResult {
  component: string;
  status: "healthy" | "degraded" | "down";
  message: string;
  last_activity?: string;
  checked_at: string;
}

export interface PlatformHealthReport {
  overall: "healthy" | "degraded" | "down";
  checks: HealthCheckResult[];
  gate_policy: "enforce" | "pause";
  checked_at: string;
}

export interface StalenessConfig {
  run_staleness_minutes: number;
  worker_staleness_minutes: number;
  alert_on_degraded: boolean;
}

const DEFAULT_CONFIG: StalenessConfig = {
  run_staleness_minutes: 60,
  worker_staleness_minutes: 15,
  alert_on_degraded: true,
};

@Injectable()
export class PlatformHealthService {
  private readonly logger = new Logger(PlatformHealthService.name);
  private config: StalenessConfig = { ...DEFAULT_CONFIG };
  private gatePolicyOverride: "enforce" | "pause" | null = null;

  constructor(private readonly db: DatabaseService) {}

  /**
   * Update staleness configuration.
   */
  configure(config: Partial<StalenessConfig>): StalenessConfig {
    this.config = { ...this.config, ...config };
    return this.config;
  }

  getConfig(): StalenessConfig {
    return { ...this.config };
  }

  /**
   * Override gate policy (e.g., during known maintenance).
   */
  setGatePolicy(policy: "enforce" | "pause" | null): void {
    this.gatePolicyOverride = policy;
    this.logger.log(`Gate policy override set to: ${policy ?? "auto"}`);
  }

  /**
   * Determine the current gate policy.
   * If platform is degraded/down and no override is set, default to "pause"
   * (safe default: don't auto-pass gates during outages).
   */
  async getGatePolicy(): Promise<"enforce" | "pause"> {
    if (this.gatePolicyOverride) return this.gatePolicyOverride;
    const report = await this.check();
    return report.overall === "healthy" ? "enforce" : "pause";
  }

  /**
   * Run all platform health checks.
   */
  async check(): Promise<PlatformHealthReport> {
    const checks: HealthCheckResult[] = [];
    const now = new Date();

    // 1. Database connectivity
    checks.push(await this.checkDatabase());

    // 2. Run pipeline staleness — are runs completing?
    checks.push(await this.checkRunPipeline(now));

    // 3. Worker liveness — has the worker polled recently?
    checks.push(await this.checkWorkerLiveness(now));

    // 4. Scheduled run adherence — are scheduled runs firing?
    checks.push(await this.checkScheduleAdherence(now));

    // Determine overall status
    const statuses = checks.map((c) => c.status);
    let overall: "healthy" | "degraded" | "down";
    if (statuses.includes("down")) {
      overall = "down";
    } else if (statuses.includes("degraded")) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    const gatePolicy = this.gatePolicyOverride ?? (overall === "healthy" ? "enforce" : "pause");

    return {
      overall,
      checks,
      gate_policy: gatePolicy,
      checked_at: now.toISOString(),
    };
  }

  /**
   * Check database connectivity.
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const now = new Date().toISOString();
    try {
      await this.db.query("SELECT 1");
      return { component: "database", status: "healthy", message: "Connected", checked_at: now };
    } catch (err) {
      return {
        component: "database",
        status: "down",
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
        checked_at: now,
      };
    }
  }

  /**
   * Check whether runs are completing within the staleness window.
   */
  private async checkRunPipeline(now: Date): Promise<HealthCheckResult> {
    const checkedAt = now.toISOString();
    try {
      const result = await this.db.query<{ last_completed: string | null; queued_count: string }>(
        `SELECT
          MAX(finished_at) AS last_completed,
          COUNT(*) FILTER (WHERE status = 'queued') AS queued_count
         FROM runs`,
      );
      const row = result.rows[0];
      const lastCompleted = row?.last_completed ? new Date(row.last_completed) : null;
      const queuedCount = parseInt(row?.queued_count ?? "0", 10);

      if (!lastCompleted) {
        return {
          component: "run_pipeline",
          status: "degraded",
          message: "No completed runs found",
          checked_at: checkedAt,
        };
      }

      const minutesSince = (now.getTime() - lastCompleted.getTime()) / 60000;
      const stale = minutesSince > this.config.run_staleness_minutes;

      if (stale && queuedCount > 0) {
        return {
          component: "run_pipeline",
          status: "down",
          message: `Last run completed ${Math.round(minutesSince)}min ago; ${queuedCount} runs queued but not processing`,
          last_activity: lastCompleted.toISOString(),
          checked_at: checkedAt,
        };
      }

      if (stale) {
        return {
          component: "run_pipeline",
          status: "degraded",
          message: `No runs completed in ${Math.round(minutesSince)} minutes`,
          last_activity: lastCompleted.toISOString(),
          checked_at: checkedAt,
        };
      }

      return {
        component: "run_pipeline",
        status: "healthy",
        message: `Last run completed ${Math.round(minutesSince)}min ago`,
        last_activity: lastCompleted.toISOString(),
        checked_at: checkedAt,
      };
    } catch {
      return { component: "run_pipeline", status: "down", message: "Failed to query run pipeline", checked_at: checkedAt };
    }
  }

  /**
   * Check worker liveness by looking at recent run claims/completions.
   */
  private async checkWorkerLiveness(now: Date): Promise<HealthCheckResult> {
    const checkedAt = now.toISOString();
    try {
      const result = await this.db.query<{ last_activity: string | null }>(
        `SELECT MAX(GREATEST(COALESCE(started_at, created_at), COALESCE(finished_at, created_at))) AS last_activity
         FROM runs
         WHERE status IN ('running', 'completed', 'failed')`,
      );
      const lastActivity = result.rows[0]?.last_activity ? new Date(result.rows[0].last_activity) : null;

      if (!lastActivity) {
        return { component: "worker", status: "degraded", message: "No worker activity recorded", checked_at: checkedAt };
      }

      const minutesSince = (now.getTime() - lastActivity.getTime()) / 60000;
      if (minutesSince > this.config.worker_staleness_minutes) {
        return {
          component: "worker",
          status: "degraded",
          message: `No worker activity for ${Math.round(minutesSince)} minutes`,
          last_activity: lastActivity.toISOString(),
          checked_at: checkedAt,
        };
      }

      return {
        component: "worker",
        status: "healthy",
        message: `Worker active ${Math.round(minutesSince)}min ago`,
        last_activity: lastActivity.toISOString(),
        checked_at: checkedAt,
      };
    } catch {
      return { component: "worker", status: "down", message: "Failed to check worker", checked_at: checkedAt };
    }
  }

  /**
   * Check schedule adherence — are scheduled runs firing on time?
   */
  private async checkScheduleAdherence(now: Date): Promise<HealthCheckResult> {
    const checkedAt = now.toISOString();
    try {
      const result = await this.db.query<{ total: string; overdue: string }>(
        `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE next_run_at < NOW() - INTERVAL '30 minutes' AND enabled = true) AS overdue
         FROM schedules`,
      );
      const total = parseInt(result.rows[0]?.total ?? "0", 10);
      const overdue = parseInt(result.rows[0]?.overdue ?? "0", 10);

      if (total === 0) {
        return { component: "schedules", status: "healthy", message: "No schedules configured", checked_at: checkedAt };
      }

      if (overdue > 0) {
        return {
          component: "schedules",
          status: "degraded",
          message: `${overdue} of ${total} schedule(s) overdue by >30min`,
          checked_at: checkedAt,
        };
      }

      return { component: "schedules", status: "healthy", message: `${total} schedule(s) on time`, checked_at: checkedAt };
    } catch {
      return { component: "schedules", status: "healthy", message: "Schedule check skipped (no table)", checked_at: checkedAt };
    }
  }
}
