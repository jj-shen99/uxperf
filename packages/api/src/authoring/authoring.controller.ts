import { Controller, Get, Post, Query, Body } from "@nestjs/common";
import { NlAuthoringService } from "./nl-authoring.service";

@Controller("authoring")
export class AuthoringController {
  constructor(private readonly nlAuthoringService: NlAuthoringService) {}

  @Post("generate")
  generate(@Body() body: {
    project_id: string;
    user_id?: string;
    prompt: string;
    target_url?: string;
    device?: "desktop" | "mobile";
    model?: string;
  }) {
    return this.nlAuthoringService.generate(body);
  }

  @Get("logs")
  listLogs(
    @Query("project_id") projectId: string,
    @Query("limit") limit?: string,
  ) {
    return this.nlAuthoringService.listLogs(
      projectId,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get("policy")
  getPolicyEnvelope(@Query("project_id") projectId: string) {
    return this.nlAuthoringService.getPolicyEnvelope(projectId);
  }
}
