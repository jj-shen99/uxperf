import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { GatesController } from "./gates.controller";
import { GatesService } from "./gates.service";

@Module({
  imports: [DatabaseModule],
  controllers: [GatesController],
  providers: [GatesService],
  exports: [GatesService],
})
export class GatesModule {}
