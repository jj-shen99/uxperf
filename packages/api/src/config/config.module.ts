import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PlatformConfigService } from "./platform-config.service";
import { PlatformConfigController } from "./platform-config.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformConfigController],
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class ConfigModule {}
