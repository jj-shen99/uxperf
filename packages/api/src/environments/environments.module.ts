import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EnvironmentsController } from "./environments.controller";
import { EnvironmentsService } from "./environments.service";

@Module({
  imports: [DatabaseModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
