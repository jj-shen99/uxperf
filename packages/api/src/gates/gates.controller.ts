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
import {
  GatesService,
  CreateGateDto,
  UpdateGateDto,
} from "./gates.service";
import { GateOverridesService, CreateOverrideDto, OverrideDecisionDto } from "./gate-overrides.service";

@Controller("gates")
export class GatesController {
  constructor(
    private readonly gatesService: GatesService,
    private readonly overridesService: GateOverridesService,
  ) {}

  @Get()
  findAll(@Query("project_id") projectId?: string) {
    return this.gatesService.findAll(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.gatesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateGateDto) {
    return this.gatesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateGateDto) {
    return this.gatesService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.gatesService.delete(id);
  }

  @Post("batch")
  batchCreate(@Body() body: { project_id: string; gates: any[] }) {
    return this.gatesService.batchCreate(body.project_id, body.gates);
  }

  @Post("evaluate")
  evaluate(@Body() body: { run_id: string }) {
    return this.gatesService.evaluateAgainstRun(body.run_id);
  }

  @Get("results/:runId")
  getRunResults(@Param("runId") runId: string) {
    return this.gatesService.getResultsForRun(runId);
  }

  // -- E-34: Gate Overrides --

  @Post("overrides")
  createOverride(@Body() dto: CreateOverrideDto) {
    return this.overridesService.create(dto);
  }

  @Post("overrides/:id/decide")
  decideOverride(@Param("id") id: string, @Body() dto: OverrideDecisionDto) {
    return this.overridesService.decide(id, dto);
  }

  @Get("overrides/run/:runId")
  findOverridesForRun(@Param("runId") runId: string) {
    return this.overridesService.findForRun(runId);
  }

  @Get("overrides/project/:projectId")
  findOverridesForProject(
    @Param("projectId") projectId: string,
    @Query("status") status?: string,
  ) {
    return this.overridesService.findForProject(projectId, status);
  }

  @Get("overrides/audit/:projectId")
  getOverrideAuditTrail(@Param("projectId") projectId: string) {
    return this.overridesService.getAuditTrail(projectId);
  }
}
