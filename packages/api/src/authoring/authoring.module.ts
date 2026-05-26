import { Module } from "@nestjs/common";
import { AuthoringController } from "./authoring.controller";
import { NlAuthoringService } from "./nl-authoring.service";

@Module({
  controllers: [AuthoringController],
  providers: [NlAuthoringService],
  exports: [NlAuthoringService],
})
export class AuthoringModule {}
