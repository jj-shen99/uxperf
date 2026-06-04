import { Module } from "@nestjs/common";
import { LoadController } from "./load.controller";
import { LoadProfilesService } from "./load-profiles.service";
import { LoadOrchestratorService } from "./load-orchestrator.service";
import { ServerTelemetryService } from "./server-telemetry.service";
import { LoadCorrelationService } from "./load-correlation.service";
import { LoadGatesService } from "./load-gates.service";
import { LoadResultsService } from "./load-results.service";

@Module({
  controllers: [LoadController],
  providers: [
    LoadProfilesService,
    LoadOrchestratorService,
    ServerTelemetryService,
    LoadCorrelationService,
    LoadGatesService,
    LoadResultsService,
  ],
  exports: [
    LoadProfilesService,
    LoadOrchestratorService,
    ServerTelemetryService,
    LoadCorrelationService,
    LoadGatesService,
    LoadResultsService,
  ],
})
export class LoadModule {}
