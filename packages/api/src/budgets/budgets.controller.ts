import { Controller, Get, Post, Put, Delete, Body, Param, Query } from "@nestjs/common";
import { BudgetsService, CreateBudgetDto, UpdateBudgetDto, DeviceClass } from "./budgets.service";

@Controller("budgets")
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  findAll(@Query("project_id") projectId?: string) {
    return this.budgetsService.findAll(projectId);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.budgetsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateBudgetDto) {
    return this.budgetsService.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBudgetDto) {
    return this.budgetsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.budgetsService.delete(id);
  }

  @Post("evaluate")
  evaluateRoute(
    @Body() body: {
      project_id: string;
      route: string;
      metrics: Record<string, number>;
      device_class?: DeviceClass;
    },
  ) {
    return this.budgetsService.evaluateRoute(
      body.project_id, body.route, body.metrics, body.device_class,
    );
  }

  @Post("ratchet")
  ratchet(@Body() body: { project_id: string }) {
    return this.budgetsService.ratchetBudgets(body.project_id);
  }
}
