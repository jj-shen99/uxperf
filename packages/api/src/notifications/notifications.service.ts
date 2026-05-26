import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type ChannelType = "slack" | "email" | "webhook";
export type NotificationEvent = "gate_failed" | "run_completed" | "run_failed" | "baseline_regression" | "digest";

export interface NotificationChannelRow {
  id: string;
  project_id: string;
  channel_type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  events: NotificationEvent[];
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChannelDto {
  project_id: string;
  channel_type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  events?: NotificationEvent[];
  enabled?: boolean;
}

export interface UpdateChannelDto {
  name?: string;
  config?: Record<string, unknown>;
  events?: NotificationEvent[];
  enabled?: boolean;
}

export interface NotificationPayload {
  event: NotificationEvent;
  project_id: string;
  title: string;
  message: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly db: DatabaseService) {}

  // -- Channel CRUD --

  async findChannels(projectId?: string): Promise<NotificationChannelRow[]> {
    if (projectId) {
      const result = await this.db.query<NotificationChannelRow>(
        "SELECT * FROM notification_channels WHERE project_id = $1 ORDER BY created_at",
        [projectId],
      );
      return result.rows;
    }
    const result = await this.db.query<NotificationChannelRow>(
      "SELECT * FROM notification_channels ORDER BY created_at LIMIT 100",
    );
    return result.rows;
  }

  async findChannelById(id: string): Promise<NotificationChannelRow> {
    const result = await this.db.query<NotificationChannelRow>(
      "SELECT * FROM notification_channels WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Channel ${id} not found`);
    return result.rows[0];
  }

  async createChannel(dto: CreateChannelDto): Promise<NotificationChannelRow> {
    const result = await this.db.query<NotificationChannelRow>(
      `INSERT INTO notification_channels (project_id, channel_type, name, config, events, enabled)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        dto.project_id,
        dto.channel_type,
        dto.name,
        JSON.stringify(dto.config),
        dto.events ?? ["gate_failed", "run_completed"],
        dto.enabled ?? true,
      ],
    );
    return result.rows[0];
  }

  async updateChannel(id: string, dto: UpdateChannelDto): Promise<NotificationChannelRow> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.config !== undefined) { sets.push(`config = $${idx++}`); values.push(JSON.stringify(dto.config)); }
    if (dto.events !== undefined) { sets.push(`events = $${idx++}`); values.push(dto.events); }
    if (dto.enabled !== undefined) { sets.push(`enabled = $${idx++}`); values.push(dto.enabled); }

    if (sets.length === 0) return this.findChannelById(id);

    values.push(id);
    const result = await this.db.query<NotificationChannelRow>(
      `UPDATE notification_channels SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) throw new NotFoundException(`Channel ${id} not found`);
    return result.rows[0];
  }

  async deleteChannel(id: string): Promise<void> {
    const result = await this.db.query("DELETE FROM notification_channels WHERE id = $1", [id]);
    if (result.rowCount === 0) throw new NotFoundException(`Channel ${id} not found`);
  }

  // -- Dispatch notifications --

  async dispatch(payload: NotificationPayload): Promise<number> {
    const channels = await this.db.query<NotificationChannelRow>(
      `SELECT * FROM notification_channels
       WHERE project_id = $1 AND enabled = true AND $2 = ANY(events)`,
      [payload.project_id, payload.event],
    );

    let sent = 0;
    for (const channel of channels.rows) {
      try {
        switch (channel.channel_type) {
          case "slack":
            await this.sendSlack(channel, payload);
            break;
          case "webhook":
            await this.sendWebhook(channel, payload);
            break;
          case "email":
            this.logger.warn("Email notifications not yet implemented");
            continue;
        }
        sent++;
      } catch (e) {
        this.logger.error(`Failed to send to "${channel.name}": ${e}`);
      }
    }

    return sent;
  }

  // -- Slack --

  private async sendSlack(
    channel: NotificationChannelRow,
    payload: NotificationPayload,
  ): Promise<void> {
    const webhookUrl = channel.config.webhook_url as string;
    if (!webhookUrl) {
      throw new Error("Slack channel missing webhook_url in config");
    }

    const color = payload.event === "gate_failed" || payload.event === "run_failed"
      ? "#dc2626"
      : payload.event === "baseline_regression"
        ? "#f59e0b"
        : "#22c55e";

    const body = {
      attachments: [
        {
          color,
          fallback: `${payload.title}: ${payload.message}`,
          title: payload.title,
          text: payload.message,
          fields: payload.details
            ? Object.entries(payload.details).map(([k, v]) => ({
                title: k,
                value: String(v),
                short: true,
              }))
            : [],
          footer: "Perf Framework",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook returned ${res.status}`);
    }

    this.logger.log(`Slack notification sent to "${channel.name}"`);
  }

  // -- Webhook --

  private async sendWebhook(
    channel: NotificationChannelRow,
    payload: NotificationPayload,
  ): Promise<void> {
    const url = channel.config.url as string;
    if (!url) throw new Error("Webhook channel missing url in config");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((channel.config.headers as Record<string, string>) ?? {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }

    this.logger.log(`Webhook notification sent to "${channel.name}"`);
  }
}
