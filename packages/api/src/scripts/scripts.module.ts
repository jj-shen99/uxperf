import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScriptsController } from "./scripts.controller";
import { ScriptsService } from "./scripts.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ScriptsController],
  providers: [ScriptsService],
  exports: [ScriptsService],
})
export class ScriptsModule {}
