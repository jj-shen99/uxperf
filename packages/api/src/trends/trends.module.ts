import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TrendsController } from "./trends.controller";
import { TrendsService } from "./trends.service";

@Module({
  imports: [DatabaseModule],
  controllers: [TrendsController],
  providers: [TrendsService],
  exports: [TrendsService],
})
export class TrendsModule {}
