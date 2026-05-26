import { Module, Global } from "@nestjs/common";
import { ArtifactsService } from "./artifacts.service";

@Global()
@Module({
  providers: [ArtifactsService],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
