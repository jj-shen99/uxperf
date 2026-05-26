import { Module, Global } from "@nestjs/common";
import { GitHubCheckService } from "./github-check.service";

@Global()
@Module({
  providers: [GitHubCheckService],
  exports: [GitHubCheckService],
})
export class GitHubCheckModule {}
