import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PerRequestController } from "./per-request.controller";
import { PerRequestService } from "./per-request.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PerRequestController],
  providers: [PerRequestService],
  exports: [PerRequestService],
})
export class PerRequestModule {}
