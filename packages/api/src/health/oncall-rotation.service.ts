/**
 * E-66: On-call rotation management service.
 *
 * Manages a perf on-call rotation: cross-team rotation, severity-gated paging,
 * and explicit authority to roll back. Integrates with the notification dispatcher.
 *
 * Book Ch 16, p270–272: "Support for a perf on-call rotation: cross-team rotation,
 * severity-gated paging, and explicit authority to roll back."
 */
import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface OnCallMember {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  team: string;
  order: number;
}

export interface OnCallRotation {
  id: string;
  name: string;
  members: OnCallMember[];
  rotation_interval_days: number;
  current_index: number;
  last_rotated_at: string;
  paging_policy: PagingPolicy;
  created_at: string;
}

export interface PagingPolicy {
  critical: "page" | "notify" | "silent";
  warning: "page" | "notify" | "silent";
  info: "notify" | "silent";
  escalation_timeout_minutes: number;
  escalation_levels: number;
}

export interface OnCallOverride {
  id: string;
  rotation_id: string;
  user_id: string;
  display_name: string;
  start_at: string;
  end_at: string;
  reason: string;
}

export interface OnCallEvent {
  id: string;
  rotation_id: string;
  user_id: string;
  severity: "critical" | "warning" | "info";
  action: "paged" | "notified" | "acknowledged" | "escalated" | "resolved";
  message: string;
  created_at: string;
}

const DEFAULT_PAGING_POLICY: PagingPolicy = {
  critical: "page",
  warning: "notify",
  info: "silent",
  escalation_timeout_minutes: 15,
  escalation_levels: 2,
};

@Injectable()
export class OnCallRotationService {
  private readonly logger = new Logger(OnCallRotationService.name);
  private rotations: Map<string, OnCallRotation> = new Map();
  private overrides: OnCallOverride[] = [];
  private events: OnCallEvent[] = [];
  private idCounter = 0;

  constructor(private readonly db: DatabaseService) {}

  private nextId(): string {
    return `oncall_${++this.idCounter}_${Date.now()}`;
  }

  /**
   * Create a new on-call rotation.
   */
  create(data: {
    name: string;
    members: { user_id: string; display_name: string; email: string; team: string }[];
    rotation_interval_days?: number;
    paging_policy?: Partial<PagingPolicy>;
  }): OnCallRotation {
    const id = this.nextId();
    const rotation: OnCallRotation = {
      id,
      name: data.name,
      members: data.members.map((m, i) => ({ ...m, id: `member_${i}`, order: i })),
      rotation_interval_days: data.rotation_interval_days ?? 7,
      current_index: 0,
      last_rotated_at: new Date().toISOString(),
      paging_policy: { ...DEFAULT_PAGING_POLICY, ...data.paging_policy },
      created_at: new Date().toISOString(),
    };
    this.rotations.set(id, rotation);
    this.logger.log(`Created on-call rotation "${data.name}" with ${data.members.length} members`);
    return rotation;
  }

  /**
   * List all rotations.
   */
  list(): OnCallRotation[] {
    return Array.from(this.rotations.values());
  }

  /**
   * Get a rotation by ID.
   */
  get(id: string): OnCallRotation | null {
    return this.rotations.get(id) ?? null;
  }

  /**
   * Delete a rotation.
   */
  delete(id: string): boolean {
    return this.rotations.delete(id);
  }

  /**
   * Get the current on-call person for a rotation.
   * Checks overrides first, then falls back to the rotation schedule.
   */
  getCurrentOnCall(rotationId: string): OnCallMember | null {
    const rotation = this.rotations.get(rotationId);
    if (!rotation || rotation.members.length === 0) return null;

    // Check for active override
    const now = new Date();
    const activeOverride = this.overrides.find(
      (o) =>
        o.rotation_id === rotationId &&
        new Date(o.start_at) <= now &&
        new Date(o.end_at) > now,
    );

    if (activeOverride) {
      const overrideMember = rotation.members.find((m) => m.user_id === activeOverride.user_id);
      if (overrideMember) return overrideMember;
    }

    // Auto-rotate if interval has elapsed
    this.autoRotate(rotation);

    return rotation.members[rotation.current_index] ?? rotation.members[0];
  }

  /**
   * Manually rotate to next person.
   */
  rotate(rotationId: string): OnCallMember | null {
    const rotation = this.rotations.get(rotationId);
    if (!rotation || rotation.members.length === 0) return null;

    rotation.current_index = (rotation.current_index + 1) % rotation.members.length;
    rotation.last_rotated_at = new Date().toISOString();

    this.logger.log(`Rotated "${rotation.name}" to ${rotation.members[rotation.current_index].display_name}`);
    return rotation.members[rotation.current_index];
  }

  /**
   * Auto-rotate based on elapsed time since last rotation.
   */
  private autoRotate(rotation: OnCallRotation): void {
    const now = new Date();
    const lastRotated = new Date(rotation.last_rotated_at);
    const daysSince = (now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince >= rotation.rotation_interval_days) {
      const rotationCount = Math.floor(daysSince / rotation.rotation_interval_days);
      rotation.current_index = (rotation.current_index + rotationCount) % rotation.members.length;
      rotation.last_rotated_at = now.toISOString();
      this.logger.log(`Auto-rotated "${rotation.name}" by ${rotationCount} position(s)`);
    }
  }

  /**
   * Add a temporary override (e.g., vacation coverage).
   */
  addOverride(data: {
    rotation_id: string;
    user_id: string;
    display_name: string;
    start_at: string;
    end_at: string;
    reason: string;
  }): OnCallOverride {
    const override: OnCallOverride = { id: this.nextId(), ...data };
    this.overrides.push(override);
    this.logger.log(`Override added for rotation ${data.rotation_id}: ${data.display_name}`);
    return override;
  }

  /**
   * List active and upcoming overrides for a rotation.
   */
  listOverrides(rotationId: string): OnCallOverride[] {
    const now = new Date();
    return this.overrides.filter(
      (o) => o.rotation_id === rotationId && new Date(o.end_at) > now,
    );
  }

  /**
   * Remove an override.
   */
  removeOverride(overrideId: string): boolean {
    const idx = this.overrides.findIndex((o) => o.id === overrideId);
    if (idx < 0) return false;
    this.overrides.splice(idx, 1);
    return true;
  }

  /**
   * Determine the notification action for a given severity.
   */
  getPageAction(rotationId: string, severity: "critical" | "warning" | "info"): "page" | "notify" | "silent" {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) return "notify";
    return rotation.paging_policy[severity];
  }

  /**
   * Record a paging/notification event.
   */
  recordEvent(data: {
    rotation_id: string;
    user_id: string;
    severity: "critical" | "warning" | "info";
    action: "paged" | "notified" | "acknowledged" | "escalated" | "resolved";
    message: string;
  }): OnCallEvent {
    const event: OnCallEvent = {
      id: this.nextId(),
      ...data,
      created_at: new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  /**
   * Get event history for a rotation.
   */
  getEvents(rotationId: string, limit = 50): OnCallEvent[] {
    return this.events
      .filter((e) => e.rotation_id === rotationId)
      .slice(-limit);
  }

  /**
   * Update paging policy for a rotation.
   */
  updatePagingPolicy(rotationId: string, policy: Partial<PagingPolicy>): PagingPolicy | null {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) return null;
    rotation.paging_policy = { ...rotation.paging_policy, ...policy };
    return rotation.paging_policy;
  }
}
