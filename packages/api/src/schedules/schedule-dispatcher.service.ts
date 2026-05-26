import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { SchedulesService } from "./schedules.service";
import { RunsService } from "../runs/runs.service";

/**
 * Background service that polls for due schedules and creates runs.
 * Runs every 30 seconds (configurable via SCHEDULE_POLL_INTERVAL_MS).
 */
@Injectable()
export class ScheduleDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleDispatcherService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly runsService: RunsService,
  ) {}

  onModuleInit() {
    const intervalMs = parseInt(
      process.env.SCHEDULE_POLL_INTERVAL_MS ?? "30000",
      10,
    );
    this.logger.log(`Schedule dispatcher starting (poll every ${intervalMs}ms)`);
    this.intervalHandle = setInterval(() => this.tick(), intervalMs);
    // Run once immediately
    this.timeoutHandle = setTimeout(() => this.tick(), 2000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Check for due schedules and dispatch runs.
   * Guarded against concurrent execution.
   */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let dispatched = 0;

    try {
      const dueSchedules = await this.schedulesService.findDueSchedules();

      for (const schedule of dueSchedules) {
        try {
          const config = schedule.config as Record<string, unknown>;
          await this.runsService.create({
            project_id: schedule.project_id,
            script_id: schedule.script_id ?? undefined,
            schedule_id: schedule.id,
            mode: "scheduled",
            environment: schedule.environment,
            config: config as any,
          });

          await this.schedulesService.markExecuted(schedule.id);
          dispatched++;

          this.logger.log(
            `Dispatched scheduled run for "${schedule.name}" (${schedule.id})`
          );
        } catch (e) {
          this.logger.error(
            `Failed to dispatch schedule "${schedule.name}" (${schedule.id}): ${e}`
          );
        }
      }

      if (dispatched > 0) {
        this.logger.log(`Dispatched ${dispatched} scheduled run(s)`);
      }
    } catch (e) {
      this.logger.error(`Schedule dispatcher tick failed: ${e}`);
    } finally {
      this.running = false;
    }

    return dispatched;
  }
}
