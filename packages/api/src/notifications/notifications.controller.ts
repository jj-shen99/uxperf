import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from "@nestjs/common";
import {
  NotificationsService,
  CreateChannelDto,
  UpdateChannelDto,
} from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("channels")
  listChannels(@Query("project_id") projectId?: string) {
    return this.notificationsService.findChannels(projectId);
  }

  @Get("channels/:id")
  getChannel(@Param("id") id: string) {
    return this.notificationsService.findChannelById(id);
  }

  @Post("channels")
  createChannel(@Body() dto: CreateChannelDto) {
    return this.notificationsService.createChannel(dto);
  }

  @Patch("channels/:id")
  updateChannel(@Param("id") id: string, @Body() dto: UpdateChannelDto) {
    return this.notificationsService.updateChannel(id, dto);
  }

  @Delete("channels/:id")
  deleteChannel(@Param("id") id: string) {
    return this.notificationsService.deleteChannel(id);
  }

  @Post("test")
  testNotification(@Body() dto: { channel_id: string }) {
    return this.notificationsService.findChannelById(dto.channel_id).then(async (channel) => {
      const sent = await this.notificationsService.dispatch({
        event: "run_completed",
        project_id: channel.project_id,
        title: "Test Notification",
        message: "This is a test notification from the Perf Framework.",
        details: { source: "manual_test" },
      });
      return { sent };
    });
  }
}
