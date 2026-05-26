import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import { BaselinesService, ComputeBaselineOptions } from "./baselines.service";

@Controller("baselines")
export class BaselinesController {
  constructor(private readonly baselinesService: BaselinesService) {}

  @Get()
  findAll(@Query("project_id") projectId?: string) {
    return this.baselinesService.findAll(projectId);
  }

  @Get("active")
  findActive(
    @Query("project_id") projectId: string,
    @Query("metric") metric: string,
    @Query("environment") environment?: string,
    @Query("script_id") scriptId?: string,
  ) {
    return this.baselinesService.findActive(projectId, metric, environment, scriptId);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.baselinesService.findById(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.baselinesService.delete(id);
  }

  /** Manually trigger baseline computation for a specific metric. */
  @Post("compute")
  compute(@Body() opts: ComputeBaselineOptions) {
    return this.baselinesService.computeBaseline(opts);
  }

  /** Recompute all baselines for a project. */
  @Post("refresh")
  refresh(
    @Body() body: { project_id: string; environment?: string; script_id?: string },
  ) {
    return this.baselinesService.refreshBaselines(
      body.project_id,
      body.environment,
      body.script_id,
    );
  }
}
