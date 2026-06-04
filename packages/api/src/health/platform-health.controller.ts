/**
 * E-65/E-66/E-67: Platform health, on-call, and practice review endpoints.
 */
import { Controller, Get, Post, Delete, Body, Param, Query } from "@nestjs/common";
import { PlatformHealthService } from "./platform-health.service";
import { OnCallRotationService } from "./oncall-rotation.service";
import { PracticeReviewService } from "./practice-review.service";
import { Public } from "../auth/auth.guard";

@Controller("platform-health")
export class PlatformHealthController {
  constructor(
    private readonly healthService: PlatformHealthService,
    private readonly onCallService: OnCallRotationService,
    private readonly reviewService: PracticeReviewService,
  ) {}

  // === Platform Health (E-65) ===

  @Get()
  @Public()
  async check() {
    return this.healthService.check();
  }

  @Get("gate-policy")
  async getGatePolicy() {
    return { policy: await this.healthService.getGatePolicy() };
  }

  @Post("gate-policy")
  setGatePolicy(@Body() body: { policy: "enforce" | "pause" | null }) {
    this.healthService.setGatePolicy(body.policy);
    return { success: true };
  }

  @Get("config")
  getHealthConfig() {
    return this.healthService.getConfig();
  }

  @Post("config")
  setHealthConfig(@Body() body: any) {
    return this.healthService.configure(body);
  }

  // === On-Call Rotation (E-66) ===

  @Get("oncall")
  listRotations() {
    return this.onCallService.list();
  }

  @Post("oncall")
  createRotation(@Body() body: any) {
    return this.onCallService.create(body);
  }

  @Get("oncall/:id")
  getRotation(@Param("id") id: string) {
    return this.onCallService.get(id);
  }

  @Delete("oncall/:id")
  deleteRotation(@Param("id") id: string) {
    return { deleted: this.onCallService.delete(id) };
  }

  @Get("oncall/:id/current")
  getCurrentOnCall(@Param("id") id: string) {
    return this.onCallService.getCurrentOnCall(id);
  }

  @Post("oncall/:id/rotate")
  rotate(@Param("id") id: string) {
    return this.onCallService.rotate(id);
  }

  @Post("oncall/:id/override")
  addOverride(@Param("id") id: string, @Body() body: any) {
    return this.onCallService.addOverride({ ...body, rotation_id: id });
  }

  @Get("oncall/:id/overrides")
  listOverrides(@Param("id") id: string) {
    return this.onCallService.listOverrides(id);
  }

  @Delete("oncall/override/:overrideId")
  removeOverride(@Param("overrideId") overrideId: string) {
    return { removed: this.onCallService.removeOverride(overrideId) };
  }

  @Get("oncall/:id/events")
  getEvents(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.onCallService.getEvents(id, limit ? parseInt(limit, 10) : undefined);
  }

  @Post("oncall/:id/paging-policy")
  updatePagingPolicy(@Param("id") id: string, @Body() body: any) {
    return this.onCallService.updatePagingPolicy(id, body);
  }

  // === Practice Review (E-67) ===

  @Get("reviews/questions")
  getQuestions(@Query("category") category?: string) {
    if (category) {
      return this.reviewService.getQuestionsByCategory(category as any);
    }
    return this.reviewService.getQuestions();
  }

  @Get("reviews/:projectId")
  listReviews(@Param("projectId") projectId: string) {
    return this.reviewService.listReviews(projectId);
  }

  @Post("reviews/:projectId")
  getOrCreateReview(@Param("projectId") projectId: string, @Body() body?: { quarter?: string }) {
    return this.reviewService.getOrCreateReview(projectId, body?.quarter);
  }

  @Post("reviews/:reviewId/respond")
  submitResponse(@Param("reviewId") reviewId: string, @Body() body: any) {
    return this.reviewService.submitResponse(reviewId, body);
  }

  @Post("reviews/:reviewId/complete")
  completeReview(@Param("reviewId") reviewId: string) {
    return this.reviewService.completeReview(reviewId);
  }

  @Get("reviews/:reviewId/summary")
  getReviewSummary(@Param("reviewId") reviewId: string) {
    return this.reviewService.getSummary(reviewId);
  }

  @Post("reviews/overdue")
  getOverduePrompts(@Body() body: { project_ids: string[] }) {
    return this.reviewService.getOverduePrompts(body.project_ids);
  }
}
