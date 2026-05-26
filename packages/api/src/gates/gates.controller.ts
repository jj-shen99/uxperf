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

@Controller("gates")
export class GatesController {
  constructor(private readonly gatesService: GatesService) {}

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

  @Get("results/:runId")
  getRunResults(@Param("runId") runId: string) {
    return this.gatesService.getResultsForRun(runId);
  }
}
