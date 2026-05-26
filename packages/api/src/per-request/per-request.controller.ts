import { Controller, Get, Post, Body, Param, Query } from "@nestjs/common";
import { PerRequestService, IngestRequestDto } from "./per-request.service";

@Controller("per-request")
export class PerRequestController {
  constructor(private readonly perRequestService: PerRequestService) {}

  @Post("ingest")
  ingest(@Body() dto: IngestRequestDto) {
    return this.perRequestService.ingest(dto).then((count) => ({ ingested: count }));
  }

  @Get(":runId")
  findByRun(
    @Param("runId") runId: string,
    @Query("limit") limit?: string,
  ) {
    return this.perRequestService.findByRun(runId, limit ? parseInt(limit, 10) : 500);
  }

  @Get(":runId/summary")
  summarize(@Param("runId") runId: string) {
    return this.perRequestService.summarizeByRun(runId);
  }
}
