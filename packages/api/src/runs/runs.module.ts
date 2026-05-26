import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { GatesModule } from "../gates/gates.module";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";
import { RunOrchestratorService } from "./run-orchestrator.service";

@Module({
  imports: [DatabaseModule, GatesModule],
  controllers: [RunsController],
  providers: [RunsService, RunOrchestratorService],
  exports: [RunsService, RunOrchestratorService],
})
export class RunsModule {}
