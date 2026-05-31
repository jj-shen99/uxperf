import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnomaliesService } from "./anomalies.service";
import { ChangePointService } from "./change-point.service";
import { AttributionService } from "./attribution.service";
import { CanaryAnalysisService } from "./canary-analysis.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [AnalyticsController],
  providers: [AnomaliesService, ChangePointService, AttributionService, CanaryAnalysisService],
  exports: [AnomaliesService, ChangePointService, AttributionService, CanaryAnalysisService],
})
export class AnalyticsModule {}
