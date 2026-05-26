import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { BaselinesModule } from "../baselines/baselines.module";
import { GatesController } from "./gates.controller";
import { GatesService } from "./gates.service";

@Module({
  imports: [DatabaseModule, BaselinesModule],
  controllers: [GatesController],
  providers: [GatesService],
  exports: [GatesService],
})
export class GatesModule {}
