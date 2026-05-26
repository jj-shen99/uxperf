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
  ScriptsService,
  CreateScriptDto,
  UpdateScriptDto,
} from "./scripts.service";

@Controller("scripts")
export class ScriptsController {
  constructor(private readonly scriptsService: ScriptsService) {}

  @Get()
  findAll(@Query("project_id") projectId?: string) {
    return this.scriptsService.findAll(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.scriptsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateScriptDto) {
    return this.scriptsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateScriptDto) {
    return this.scriptsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.scriptsService.delete(id);
  }
}
