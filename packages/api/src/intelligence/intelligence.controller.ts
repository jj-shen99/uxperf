import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import { Public } from "../auth/auth.guard";
import { ShapAttributionService } from "./shap-attribution.service";
import { ForecastingService } from "./forecasting.service";
import { RumIngestionService } from "./rum-ingestion.service";
import { CruxIngestionService } from "./crux-ingestion.service";
import { CapacityPlanningService } from "./capacity-planning.service";
import { AuditService } from "./audit.service";
import { ApiKeysService } from "./api-keys.service";
import { MultiGeoService } from "./multi-geo.service";
import { RumAggregationService } from "./rum-aggregation.service";

@Controller("intelligence")
export class IntelligenceController {
  constructor(
    private readonly shap: ShapAttributionService,
    private readonly forecasting: ForecastingService,
    private readonly rum: RumIngestionService,
    private readonly crux: CruxIngestionService,
    private readonly capacity: CapacityPlanningService,
    private readonly audit: AuditService,
    private readonly apiKeys: ApiKeysService,
    private readonly multiGeo: MultiGeoService,
    private readonly rumAggregation: RumAggregationService,
  ) {}

  // -- SHAP Attribution --

  @Post("attribution")
  computeAttribution(@Body() body: any) {
    return this.shap.computeAttribution(body);
  }

  @Get("attribution")
  listAttributions(@Query("project_id") projectId: string) {
    return this.shap.listAttributions(projectId);
  }

  @Get("attribution/:id")
  getAttribution(@Param("id") id: string) {
    return this.shap.getAttribution(id);
  }

  // -- Forecasting --

  @Post("forecast")
  generateForecast(@Body() body: any) {
    return this.forecasting.generateForecast(body);
  }

  @Get("forecast")
  listForecasts(@Query("project_id") projectId: string, @Query("metric") metric?: string) {
    return this.forecasting.listForecasts(projectId, metric);
  }

  @Post("forecast/breach")
  projectBreach(@Body() body: any) {
    return this.forecasting.projectBreach(body);
  }

  @Post("forecast/breach-check")
  checkBudgetBreaches(
    @Body() body: {
      project_id: string;
      budgets: { metric: string; threshold: number }[];
      environment?: string;
    },
  ) {
    return this.forecasting.checkAllBudgetBreaches(
      body.project_id, body.budgets, body.environment,
    );
  }

  @Post("forecast/breach-notify")
  checkAndNotifyBreaches(
    @Body() body: {
      project_id: string;
      budgets: { metric: string; threshold: number }[];
      environment?: string;
    },
  ) {
    return this.forecasting.checkAndNotifyBreaches(
      body.project_id, body.budgets, body.environment,
    );
  }

  // -- RUM --

  @Public()
  @Post("rum/ingest")
  ingestRum(@Body() body: any) {
    return this.rum.ingest(body);
  }

  @Public()
  @Post("rum/ingest/batch")
  ingestRumBatch(@Body() body: { events: any[] }) {
    return this.rum.ingestBatch(body.events);
  }

  @Get("rum/summary")
  rumSummary(
    @Query("project_id") projectId: string,
    @Query("days") days?: string,
    @Query("origin") origin?: string,
  ) {
    return this.rum.getSummary(projectId, days ? parseInt(days, 10) : undefined, origin);
  }

  @Get("rum/trend")
  rumTrend(
    @Query("project_id") projectId: string,
    @Query("metric") metric: string,
    @Query("days") days?: string,
    @Query("origin") origin?: string,
  ) {
    return this.rum.getTrend(projectId, metric, days ? parseInt(days, 10) : undefined, origin);
  }

  // -- RUM Aggregation (E-39) --

  @Post("rum/aggregate")
  aggregateRum(@Body() body: { project_id: string; hours_back?: number }) {
    return this.rumAggregation.aggregateHourly(body.project_id, body.hours_back);
  }

  @Get("rum/hourly")
  rumHourly(
    @Query("project_id") projectId: string,
    @Query("metric") metric: string,
    @Query("days") days?: string,
    @Query("origin") origin?: string,
    @Query("device_type") deviceType?: string,
  ) {
    return this.rumAggregation.getHourlyTrend(projectId, metric, days ? parseInt(days, 10) : undefined, origin, deviceType);
  }

  @Get("rum/daily")
  rumDaily(
    @Query("project_id") projectId: string,
    @Query("metric") metric: string,
    @Query("days") days?: string,
    @Query("origin") origin?: string,
  ) {
    return this.rumAggregation.getDailySummary(projectId, metric, days ? parseInt(days, 10) : undefined, origin);
  }

  @Post("rum/purge")
  purgeRum(@Body() body: { project_id: string; retention_days?: number }) {
    return this.rumAggregation.purgeRawEvents(body.project_id, body.retention_days);
  }

  // -- CrUX --

  @Post("crux/fetch")
  fetchCrux(@Body() body: any) {
    return this.crux.fetchAndStore(body);
  }

  @Get("crux")
  listCruxSnapshots(@Query("project_id") projectId: string, @Query("origin") origin?: string) {
    return this.crux.listSnapshots(projectId, origin);
  }

  // -- Capacity Planning --

  @Post("capacity/report")
  generateCapacityReport(@Body() body: { project_id: string; horizon_days?: number }) {
    return this.capacity.generateReport(body.project_id, body.horizon_days);
  }

  @Get("capacity/reports")
  listCapacityReports(@Query("project_id") projectId: string) {
    return this.capacity.listReports(projectId);
  }

  @Post("capacity/resource-floor")
  evaluateResourceFloor(@Body() body: { load_run_id: string; conditions: any[] }) {
    return this.capacity.evaluateResourceFloor(body.load_run_id, body.conditions);
  }

  @Post("capacity/capacity-floor")
  evaluateCapacityFloor(@Body() body: { load_run_id: string; floor: any }) {
    return this.capacity.evaluateCapacityFloor(body.load_run_id, body.floor);
  }

  // -- Audit --

  @Get("audit")
  queryAudit(
    @Query("project_id") projectId?: string,
    @Query("user_id") userId?: string,
    @Query("action") action?: string,
    @Query("days") days?: string,
    @Query("limit") limit?: string,
  ) {
    return this.audit.query({
      project_id: projectId,
      user_id: userId,
      action,
      days: days ? parseInt(days, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("audit/summary")
  auditSummary(@Query("project_id") projectId: string, @Query("days") days?: string) {
    return this.audit.summary(projectId, days ? parseInt(days, 10) : undefined);
  }

  // -- API Keys --

  @Post("api-keys")
  createApiKey(@Body() body: any) {
    return this.apiKeys.create(body);
  }

  @Get("api-keys")
  listApiKeys(@Query("project_id") projectId: string) {
    return this.apiKeys.list(projectId);
  }

  @Post("api-keys/:id/revoke")
  revokeApiKey(@Param("id") id: string) {
    return this.apiKeys.revoke(id);
  }

  @Delete("api-keys/:id")
  deleteApiKey(@Param("id") id: string) {
    return this.apiKeys.delete(id);
  }

  // -- Multi-Geo --

  @Get("geo/locations")
  listGeoLocations(@Query("provider") provider?: string) {
    return this.multiGeo.listLocations(provider);
  }

  @Post("geo/dispatch")
  dispatchMultiGeo(@Body() body: any) {
    return this.multiGeo.dispatch(body);
  }

  @Get("geo/compare/:runId")
  compareGeoResults(@Param("runId") runId: string) {
    return this.multiGeo.getComparison(runId);
  }
}
