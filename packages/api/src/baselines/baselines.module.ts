import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { BaselinesController } from "./baselines.controller";
import { BaselinesService } from "./baselines.service";

@Module({
  imports: [DatabaseModule],
  controllers: [BaselinesController],
  providers: [BaselinesService],
  exports: [BaselinesService],
})
export class BaselinesModule {}
