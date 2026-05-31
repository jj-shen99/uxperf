import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { BaselinesModule } from "../baselines/baselines.module";
import { GatesController } from "./gates.controller";
import { GatesService } from "./gates.service";
import { GateOverridesService } from "./gate-overrides.service";

@Module({
  imports: [DatabaseModule, BaselinesModule],
  controllers: [GatesController],
  providers: [GatesService, GateOverridesService],
  exports: [GatesService, GateOverridesService],
})
export class GatesModule {}
