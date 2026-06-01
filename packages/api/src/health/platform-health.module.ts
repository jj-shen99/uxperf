import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PlatformHealthService } from "./platform-health.service";
import { OnCallRotationService } from "./oncall-rotation.service";
import { PracticeReviewService } from "./practice-review.service";
import { PlatformHealthController } from "./platform-health.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformHealthController],
  providers: [PlatformHealthService, OnCallRotationService, PracticeReviewService],
  exports: [PlatformHealthService, OnCallRotationService, PracticeReviewService],
})
export class PlatformHealthModule {}
