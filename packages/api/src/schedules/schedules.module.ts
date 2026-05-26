import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RunsModule } from "../runs/runs.module";
import { SchedulesController } from "./schedules.controller";
import { SchedulesService } from "./schedules.service";
import { ScheduleDispatcherService } from "./schedule-dispatcher.service";

@Module({
  imports: [DatabaseModule, forwardRef(() => RunsModule)],
  controllers: [SchedulesController],
  providers: [SchedulesService, ScheduleDispatcherService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
