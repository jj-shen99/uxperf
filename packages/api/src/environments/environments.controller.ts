import { Controller, Get, Post, Delete, Body, Param } from "@nestjs/common";
import { EnvironmentsService } from "./environments.service";

@Controller("environments")
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get()
  findAll() {
    return this.environmentsService.findAll();
  }

  @Post()
  create(@Body() data: { name: string; slug: string; description?: string }) {
    return this.environmentsService.create(data);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.environmentsService.delete(id);
  }
}
