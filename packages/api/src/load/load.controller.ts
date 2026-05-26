import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import { LoadProfilesService } from "./load-profiles.service";
import { LoadOrchestratorService } from "./load-orchestrator.service";
import { ServerTelemetryService } from "./server-telemetry.service";
import { LoadCorrelationService } from "./load-correlation.service";
import { LoadGatesService } from "./load-gates.service";

@Controller("load")
export class LoadController {
  constructor(
    private readonly profiles: LoadProfilesService,
    private readonly orchestrator: LoadOrchestratorService,
    private readonly telemetry: ServerTelemetryService,
    private readonly correlation: LoadCorrelationService,
    private readonly loadGates: LoadGatesService,
  ) {}

  // -- Load Profiles --

  @Get("profiles")
  listProfiles(@Query("project_id") projectId?: string) {
    return this.profiles.findAll(projectId);
  }

  @Get("profiles/:id")
  getProfile(@Param("id") id: string) {
    return this.profiles.findById(id);
  }

  @Post("profiles")
  createProfile(@Body() body: any) {
    return this.profiles.create(body);
  }

  @Patch("profiles/:id")
  updateProfile(@Param("id") id: string, @Body() body: any) {
    return this.profiles.update(id, body);
  }

  @Delete("profiles/:id")
  deleteProfile(@Param("id") id: string) {
    return this.profiles.delete(id);
  }

  // -- Load Runs --

  @Get("runs")
  listLoadRuns(
    @Query("project_id") projectId?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.orchestrator.findAll(
      projectId,
      status,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get("runs/:id")
  getLoadRun(@Param("id") id: string) {
    return this.orchestrator.findById(id);
  }

  @Post("runs")
  createLoadRun(@Body() body: any) {
    return this.orchestrator.createLoadRun(body);
  }

  @Patch("runs/:id/status")
  updateLoadRunStatus(
    @Param("id") id: string,
    @Body() body: { status: string; [key: string]: any },
  ) {
    const { status, ...extras } = body;
    return this.orchestrator.updateStatus(id, status, extras);
  }

  @Post("runs/:id/cancel")
  cancelLoadRun(@Param("id") id: string) {
    return this.orchestrator.cancel(id);
  }

  @Post("runs/:id/cost-estimate")
  estimateCost(@Body() body: { stages: any[]; target_vus: number }) {
    return this.orchestrator.estimateCost(body.stages, body.target_vus);
  }

  @Post("runs/timeout-stale")
  async timeoutStaleRuns() {
    const count = await this.orchestrator.timeoutStaleRuns();
    return { timed_out: count };
  }

  // -- Server Telemetry --

  @Get("telemetry/:loadRunId")
  getSnapshots(
    @Param("loadRunId") loadRunId: string,
    @Query("host") host?: string,
  ) {
    return this.telemetry.getSnapshots(loadRunId, host);
  }

  @Get("telemetry/:loadRunId/summary")
  getTelemetrySummary(@Param("loadRunId") loadRunId: string) {
    return this.telemetry.getSummary(loadRunId);
  }

  @Post("telemetry")
  recordSnapshot(@Body() body: any) {
    return this.telemetry.recordSnapshot(body);
  }

  @Post("telemetry/batch")
  recordBatch(@Body() body: { snapshots: any[] }) {
    return this.telemetry.recordBatch(body.snapshots);
  }

  // -- Correlation --

  @Get("correlation/:loadRunId")
  getCorrelation(@Param("loadRunId") loadRunId: string) {
    return this.correlation.getCorrelation(loadRunId);
  }

  // -- Load Gates --

  @Post("gates/evaluate")
  evaluateLoadGates(
    @Body() body: { load_run_id: string; actual_vus: number; metrics_summary: Record<string, number> },
  ) {
    return this.loadGates.evaluateForLoadRun(
      body.load_run_id,
      body.actual_vus,
      body.metrics_summary,
    );
  }
}
