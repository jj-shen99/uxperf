import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { RunsService, CreateRunDto, UpdateRunDto } from "./runs.service";
import { RunOrchestratorService, RunCompletionPayload } from "./run-orchestrator.service";

@Controller("runs")
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly orchestrator: RunOrchestratorService,
  ) {}

  @Get()
  findAll(@Query("project_id") projectId?: string) {
    return this.runsService.findAll(projectId);
  }

  /** Worker polls this to claim the next queued run. */
  @Post("claim")
  claimNext() {
    return this.orchestrator.claimNextRun();
  }

  @Post()
  create(@Body() dto: CreateRunDto) {
    return this.runsService.create(dto);
  }

  /** Get gate evaluation results for a run. */
  @Get(":id/gates")
  gateResults(@Param("id") id: string) {
    return this.orchestrator.getGateResultsForRun(id);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.runsService.findById(id);
  }

  /** Worker calls this when a run completes or fails. */
  @Post(":id/complete")
  complete(@Param("id") id: string, @Body() payload: Omit<RunCompletionPayload, "run_id">) {
    return this.orchestrator.completeRun({ run_id: id, ...payload });
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.runsService.delete(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRunDto) {
    return this.runsService.update(id, dto);
  }
}
