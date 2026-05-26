import { Module } from "@nestjs/common";
import { IntelligenceController } from "./intelligence.controller";
import { ShapAttributionService } from "./shap-attribution.service";
import { ForecastingService } from "./forecasting.service";
import { RumIngestionService } from "./rum-ingestion.service";
import { CruxIngestionService } from "./crux-ingestion.service";
import { CapacityPlanningService } from "./capacity-planning.service";
import { AuditService } from "./audit.service";
import { ApiKeysService } from "./api-keys.service";
import { MultiGeoService } from "./multi-geo.service";

@Module({
  controllers: [IntelligenceController],
  providers: [
    ShapAttributionService,
    ForecastingService,
    RumIngestionService,
    CruxIngestionService,
    CapacityPlanningService,
    AuditService,
    ApiKeysService,
    MultiGeoService,
  ],
  exports: [
    ShapAttributionService,
    ForecastingService,
    RumIngestionService,
    CruxIngestionService,
    CapacityPlanningService,
    AuditService,
    ApiKeysService,
    MultiGeoService,
  ],
})
export class IntelligenceModule {}
