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
import { RbacService } from "../rbac/rbac.service";
import { Public } from "../auth/auth.guard";

@Controller("runs")
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly orchestrator: RunOrchestratorService,
    private readonly rbacService: RbacService,
  ) {}

  @Get()
  async findAll(
    @Query("project_id") projectId?: string,
    @Query("user_id") userId?: string,
    @Query("is_admin") _isAdmin?: string,
  ) {
    // Server-validate admin role instead of trusting client query param
    let isAdmin = false;
    if (userId) {
      try {
        const user = await this.rbacService.findUserById(userId);
        isAdmin = user.role === "admin";
      } catch {
        // User not found — treat as non-admin
      }
    }
    return this.runsService.findAll(projectId, userId, isAdmin);
  }

  /** Worker polls this to claim the next queued run. */
  @Public()
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

  /** Worker appends log lines during execution. */
  @Public()
  @Post(":id/log")
  appendLog(@Param("id") id: string, @Body() body: { lines: string }) {
    return this.runsService.appendLog(id, body.lines);
  }

  /** Worker calls this when a run completes or fails. */
  @Public()
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
