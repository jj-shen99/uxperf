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
import { ScriptVersionsService, CreateVersionDto } from "./script-versions.service";

@Controller("scripts")
export class ScriptsController {
  constructor(
    private readonly scriptsService: ScriptsService,
    private readonly versionsService: ScriptVersionsService,
  ) {}

  @Get()
  findAll(
    @Query("project_id") projectId?: string,
    @Query("user_id") userId?: string,
    @Query("is_admin") isAdmin?: string,
  ) {
    return this.scriptsService.findAll(projectId, userId, isAdmin === "true");
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

  // -- Script Versions --

  @Get(":id/versions")
  listVersions(@Param("id") id: string) {
    return this.versionsService.listVersions(id);
  }

  @Get(":id/versions/:version")
  getVersion(@Param("id") id: string, @Param("version") version: string) {
    return this.versionsService.getVersion(id, parseInt(version, 10));
  }

  @Post(":id/versions")
  createVersion(@Param("id") id: string, @Body() dto: Omit<CreateVersionDto, "script_id">) {
    return this.versionsService.createVersion({ ...dto, script_id: id } as CreateVersionDto);
  }
}
