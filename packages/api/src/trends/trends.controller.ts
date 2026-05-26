import { Controller, Get, Query } from "@nestjs/common";
import { TrendsService } from "./trends.service";

@Controller("trends")
export class TrendsController {
  constructor(private readonly trendsService: TrendsService) {}

  /**
   * Get time-series metrics for charting.
   * Query params:
   *   project_id (required) — project UUID
   *   metric — comma-separated metric names (default: lcp_ms,fcp_ms,cls)
   *   environment — filter by environment (default: all)
   *   limit — max runs to return (default: 50)
   */
  @Get()
  getMetricTrends(
    @Query("project_id") projectId: string,
    @Query("metric") metric?: string,
    @Query("environment") environment?: string,
    @Query("limit") limit?: string,
  ) {
    const metrics = metric?.split(",").map((m) => m.trim()) ?? [
      "lcp_ms", "fcp_ms", "cls",
    ];
    return this.trendsService.getMetricTrends(
      projectId,
      metrics,
      environment,
      parseInt(limit ?? "50", 10),
    );
  }

  /**
   * Get summary statistics for a project.
   */
  @Get("summary")
  getSummary(
    @Query("project_id") projectId: string,
    @Query("environment") environment?: string,
  ) {
    return this.trendsService.getProjectSummary(projectId, environment);
  }
}
