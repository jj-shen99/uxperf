import { Module } from "@nestjs/common";
import { BudgetsService } from "./budgets.service";
import { BudgetsController } from "./budgets.controller";
import { DatabaseModule } from "../database/database.module";
import { BaselinesModule } from "../baselines/baselines.module";

@Module({
  imports: [DatabaseModule, BaselinesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
