import { Controller, Get, Post, Delete, Param, Query, Body } from "@nestjs/common";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post("executive")
  generateExecutive(
    @Body() body: { project_id: string; days?: number; environment?: string },
  ) {
    return this.reportsService.generateExecutiveReport(
      body.project_id,
      body.days,
      body.environment,
    );
  }

  @Get()
  listReports(
    @Query("project_id") projectId: string,
    @Query("report_type") reportType?: string,
    @Query("limit") limit?: string,
  ) {
    return this.reportsService.listReports(
      projectId,
      reportType,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(":id")
  getReport(@Param("id") id: string) {
    return this.reportsService.getReport(id);
  }

  @Delete(":id")
  deleteReport(@Param("id") id: string) {
    return this.reportsService.deleteReport(id);
  }
}
