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
  SchedulesService,
  CreateScheduleDto,
  UpdateScheduleDto,
} from "./schedules.service";

@Controller("schedules")
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  findAll(@Query("project_id") projectId?: string) {
    return this.schedulesService.findAll(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.schedulesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedulesService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.schedulesService.delete(id);
  }
}
