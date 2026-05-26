import { Controller, Get, Post, Delete, Body, Param } from "@nestjs/common";
import { ProjectsService, CreateProjectDto } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projectsService.delete(id);
  }
}
