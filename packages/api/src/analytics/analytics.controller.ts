import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import { AnomaliesService } from "./anomalies.service";
import { ChangePointService } from "./change-point.service";
import { AttributionService } from "./attribution.service";
import { CanaryAnalysisService } from "./canary-analysis.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly anomaliesService: AnomaliesService,
    private readonly changePointService: ChangePointService,
    private readonly attributionService: AttributionService,
    private readonly canaryService: CanaryAnalysisService,
  ) {}

  // -- Anomalies --

  @Get("anomalies")
  listAnomalies(
    @Query("project_id") projectId?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.anomaliesService.findAll(
      projectId,
      status,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get("anomalies/:id")
  getAnomaly(@Param("id") id: string) {
    return this.anomaliesService.findById(id);
  }

  @Patch("anomalies/:id/status")
  updateAnomalyStatus(
    @Param("id") id: string,
    @Body() body: { status: "acknowledged" | "resolved" | "false_positive"; resolved_by?: string },
  ) {
    return this.anomaliesService.updateStatus(id, body.status, body.resolved_by);
  }

  @Patch("anomalies/:id/feedback")
  provideFeedback(
    @Param("id") id: string,
    @Body() body: { feedback: "correct" | "incorrect" | "partial" },
  ) {
    return this.anomaliesService.provideFeedback(id, body.feedback);
  }

  // -- Detection --

  @Post("detect")
  runDetection(
    @Body() body: { project_id: string; environment?: string },
  ) {
    return this.anomaliesService.analyzeProject(body.project_id, body.environment);
  }

  @Post("detect/change-points")
  detectChangePoints(
    @Body() body: { project_id: string; environment?: string; window?: number },
  ) {
    return this.changePointService.detectForProject(
      body.project_id,
      body.environment,
      body.window,
    );
  }

  // -- Attribution --

  @Get("attribution")
  attributeRegression(
    @Query("baseline_run_id") baselineRunId: string,
    @Query("regression_run_id") regressionRunId: string,
    @Query("metric") metric: string,
  ) {
    return this.attributionService.attributeRegression(
      baselineRunId,
      regressionRunId,
      metric,
    );
  }

  // -- E-35: Canary Analysis --

  @Post("canary")
  analyzeCanary(@Body() body: any) {
    return this.canaryService.analyze(body);
  }

  @Post("canary/multi")
  analyzeCanaryMulti(
    @Body() body: {
      project_id: string;
      canary_build: string;
      baseline_build: string;
      metrics: string[];
      environment?: string;
    },
  ) {
    return this.canaryService.analyzeMultiMetric(
      body.project_id,
      body.canary_build,
      body.baseline_build,
      body.metrics,
      body.environment,
    );
  }
}
