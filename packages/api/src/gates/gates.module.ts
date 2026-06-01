import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { BaselinesModule } from "../baselines/baselines.module";
import { GatesController } from "./gates.controller";
import { GatesService } from "./gates.service";
import { GateOverridesService } from "./gate-overrides.service";
import { GateYamlConfigService } from "./gate-yaml-config.service";

@Module({
  imports: [DatabaseModule, BaselinesModule],
  controllers: [GatesController],
  providers: [GatesService, GateOverridesService, GateYamlConfigService],
  exports: [GatesService, GateOverridesService, GateYamlConfigService],
})
export class GatesModule {}
