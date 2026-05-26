import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnomaliesService } from "./anomalies.service";
import { ChangePointService } from "./change-point.service";
import { AttributionService } from "./attribution.service";

@Module({
  controllers: [AnalyticsController],
  providers: [AnomaliesService, ChangePointService, AttributionService],
  exports: [AnomaliesService, ChangePointService, AttributionService],
})
export class AnalyticsModule {}
