import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScriptsController } from "./scripts.controller";
import { ScriptsService } from "./scripts.service";
import { ScriptVersionsService } from "./script-versions.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ScriptsController],
  providers: [ScriptsService, ScriptVersionsService],
  exports: [ScriptsService, ScriptVersionsService],
})
export class ScriptsModule {}
