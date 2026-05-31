/**
 * Gate YAML Configuration Service (E-48)
 *
 * Book Ch 15, p258–259:
 * "Gates should be configurable via a single YAML file checked into the repo.
 * The file is the source of truth; DB records are synced from it."
 *
 * Format:
 *   gates:
 *     - name: LCP Gate
 *       metric: lcp
 *       type: threshold
 *       operator: lte
 *       threshold: 2500
 *       policy: block
 *       quorum:
 *         window_size: 5
 *         required_failures: 3
 *
 *     - name: FCP Baseline
 *       metric: fcp
 *       type: baseline_relative
 *       regression_pct: 10
 *       policy: warn
 */

import { Injectable, Logger } from "@nestjs/common";
import { GatesService, GateDefinition, CreateGateDto, GateRow, QuorumConfig } from "./gates.service";

export interface GateYamlEntry {
  name: string;
  metric: string;
  type: GateDefinition["type"];
  policy?: string;
  enabled?: boolean;
  // threshold
  operator?: string;
  threshold?: number;
  // baseline_relative
  regression_pct?: number;
  baseline_stat?: string;
  // statistical
  stddev_multiplier?: number;
  // vu_tiered
  vu_tiers?: Array<{ max_vus: number; threshold: number; operator?: string }>;
  // resource_floor
  resource_metric?: string;
  floor_value?: number;
  // capacity_floor
  capacity_metric?: string;
  min_capacity?: number;
  // quorum
  quorum?: { window_size?: number; required_failures?: number };
}

export interface GateYamlConfig {
  gates: GateYamlEntry[];
}

export interface SyncResult {
  created: string[];
  updated: string[];
  disabled: string[];
  unchanged: string[];
  errors: string[];
}

@Injectable()
export class GateYamlConfigService {
  private readonly logger = new Logger(GateYamlConfigService.name);

  constructor(private readonly gatesService: GatesService) {}

  /**
   * Parse a YAML string into a GateYamlConfig.
   * Uses a simple parser that handles the subset of YAML we need.
   */
  parseYaml(yamlContent: string): GateYamlConfig {
    // Simple YAML parser for gate configs — avoids external dependency
    // Supports the flat gate structure defined above
    const lines = yamlContent.split("\n");
    const gates: GateYamlEntry[] = [];
    let current: Partial<GateYamlEntry> | null = null;
    let inQuorum = false;
    let inVuTiers = false;
    let currentTier: Partial<{ max_vus: number; threshold: number; operator: string }> | null = null;

    for (const raw of lines) {
      const line = raw.trimEnd();
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed === "gates:") continue;

      // New gate entry (starts with "- name:")
      if (/^\s*- name:/.test(line)) {
        if (current && current.name) {
          if (currentTier && inVuTiers) {
            current.vu_tiers = current.vu_tiers ?? [];
            current.vu_tiers.push(currentTier as any);
            currentTier = null;
          }
          gates.push(current as GateYamlEntry);
        }
        current = { name: trimmed.replace(/^- name:\s*/, "").trim() };
        inQuorum = false;
        inVuTiers = false;
        currentTier = null;
        continue;
      }

      if (!current) continue;

      // VU tier entry
      if (inVuTiers && /^\s*- max_vus:/.test(line)) {
        if (currentTier) {
          current.vu_tiers = current.vu_tiers ?? [];
          current.vu_tiers.push(currentTier as any);
        }
        currentTier = { max_vus: parseInt(trimmed.replace(/^- max_vus:\s*/, ""), 10) };
        continue;
      }

      // Key-value pair
      const kvMatch = trimmed.match(/^(\w+):\s*(.+)?$/);
      if (!kvMatch) continue;

      const [, key, rawVal] = kvMatch;
      const val = rawVal?.trim();

      if (key === "quorum" && (!val || val === "")) {
        inQuorum = true;
        current.quorum = current.quorum ?? {};
        continue;
      }

      if (key === "vu_tiers" && (!val || val === "")) {
        inVuTiers = true;
        current.vu_tiers = [];
        continue;
      }

      if (inQuorum && current.quorum) {
        if (key === "window_size") current.quorum.window_size = parseInt(val!, 10);
        else if (key === "required_failures") current.quorum.required_failures = parseInt(val!, 10);
        continue;
      }

      if (inVuTiers && currentTier) {
        if (key === "threshold") currentTier.threshold = parseFloat(val!);
        else if (key === "operator") currentTier.operator = val;
        continue;
      }

      // Standard gate fields
      switch (key) {
        case "metric": current.metric = val; break;
        case "type": current.type = val as GateDefinition["type"]; break;
        case "policy": current.policy = val; break;
        case "enabled": current.enabled = val !== "false"; break;
        case "operator": current.operator = val; break;
        case "threshold": current.threshold = parseFloat(val!); break;
        case "regression_pct": current.regression_pct = parseFloat(val!); break;
        case "baseline_stat": current.baseline_stat = val; break;
        case "stddev_multiplier": current.stddev_multiplier = parseFloat(val!); break;
        case "resource_metric": current.resource_metric = val; break;
        case "floor_value": current.floor_value = parseFloat(val!); break;
        case "capacity_metric": current.capacity_metric = val; break;
        case "min_capacity": current.min_capacity = parseFloat(val!); break;
      }
    }

    // Push last gate
    if (current && current.name) {
      if (currentTier && inVuTiers) {
        current.vu_tiers = current.vu_tiers ?? [];
        current.vu_tiers.push(currentTier as any);
      }
      gates.push(current as GateYamlEntry);
    }

    return { gates };
  }

  /**
   * Convert a YAML entry to a CreateGateDto.
   */
  toCreateDto(projectId: string, entry: GateYamlEntry): CreateGateDto {
    const definition: GateDefinition = {
      type: entry.type,
      metric: entry.metric,
    };

    if (entry.operator) definition.operator = entry.operator as any;
    if (entry.threshold != null) definition.threshold = entry.threshold;
    if (entry.regression_pct != null) definition.regression_pct = entry.regression_pct;
    if (entry.baseline_stat) definition.baseline_stat = entry.baseline_stat as any;
    if (entry.stddev_multiplier != null) definition.stddev_multiplier = entry.stddev_multiplier;
    if (entry.vu_tiers) definition.vu_tiers = entry.vu_tiers as GateDefinition["vu_tiers"];
    if (entry.resource_metric) definition.resource_metric = entry.resource_metric as any;
    if (entry.floor_value != null) definition.floor_value = entry.floor_value;
    if (entry.capacity_metric) definition.capacity_metric = entry.capacity_metric as any;
    if (entry.min_capacity != null) definition.min_capacity = entry.min_capacity;
    if (entry.quorum) definition.quorum = entry.quorum;

    return {
      project_id: projectId,
      name: entry.name,
      definition,
      policy: entry.policy ?? "block",
      enabled: entry.enabled !== false,
    };
  }

  /**
   * Sync gates from YAML config to the database.
   *
   * - Creates new gates not in DB
   * - Updates definition/policy for existing gates (matched by name)
   * - Disables DB gates not in YAML
   */
  async syncFromYaml(
    projectId: string,
    yamlContent: string,
  ): Promise<SyncResult> {
    const config = this.parseYaml(yamlContent);
    const result: SyncResult = { created: [], updated: [], disabled: [], unchanged: [], errors: [] };

    const existingGates = await this.gatesService.findAll(projectId);
    const existingByName = new Map(existingGates.map((g) => [g.name, g]));
    const yamlNames = new Set(config.gates.map((g) => g.name));

    // Create or update gates from YAML
    for (const entry of config.gates) {
      try {
        const existing = existingByName.get(entry.name);
        const dto = this.toCreateDto(projectId, entry);

        if (!existing) {
          await this.gatesService.create(dto);
          result.created.push(entry.name);
          this.logger.log(`Created gate: ${entry.name}`);
        } else {
          // Check if update needed
          const defChanged = JSON.stringify(existing.definition) !== JSON.stringify(dto.definition);
          const policyChanged = existing.policy !== dto.policy;
          const enabledChanged = existing.enabled !== dto.enabled;

          if (defChanged || policyChanged || enabledChanged) {
            await this.gatesService.update(existing.id, {
              definition: dto.definition,
              policy: dto.policy,
              enabled: dto.enabled,
            });
            result.updated.push(entry.name);
            this.logger.log(`Updated gate: ${entry.name}`);
          } else {
            result.unchanged.push(entry.name);
          }
        }
      } catch (e) {
        result.errors.push(`${entry.name}: ${e}`);
        this.logger.error(`Failed to sync gate ${entry.name}: ${e}`);
      }
    }

    // Disable gates not in YAML
    for (const [name, gate] of existingByName) {
      if (!yamlNames.has(name) && gate.enabled) {
        try {
          await this.gatesService.update(gate.id, { enabled: false });
          result.disabled.push(name);
          this.logger.log(`Disabled gate not in YAML: ${name}`);
        } catch (e) {
          result.errors.push(`disable ${name}: ${e}`);
        }
      }
    }

    this.logger.log(
      `Gate sync complete: ${result.created.length} created, ${result.updated.length} updated, ` +
      `${result.disabled.length} disabled, ${result.unchanged.length} unchanged`,
    );

    return result;
  }
}
