import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { GatesModule } from "../gates/gates.module";
import { BaselinesModule } from "../baselines/baselines.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RbacModule } from "../rbac/rbac.module";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";
import { RunOrchestratorService } from "./run-orchestrator.service";

@Module({
  imports: [DatabaseModule, GatesModule, BaselinesModule, NotificationsModule, RbacModule],
  controllers: [RunsController],
  providers: [RunsService, RunOrchestratorService],
  exports: [RunsService, RunOrchestratorService],
})
export class RunsModule {}
