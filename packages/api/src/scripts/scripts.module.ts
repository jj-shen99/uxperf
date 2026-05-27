import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RbacModule } from "../rbac/rbac.module";
import { ScriptsController } from "./scripts.controller";
import { ScriptsService } from "./scripts.service";
import { ScriptVersionsService } from "./script-versions.service";

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [ScriptsController],
  providers: [ScriptsService, ScriptVersionsService],
  exports: [ScriptsService, ScriptVersionsService],
})
export class ScriptsModule {}
