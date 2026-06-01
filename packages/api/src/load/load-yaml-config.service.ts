/**
 * E-53: Load Test YAML Definition
 *
 * Book: Ch 15, p255–256
 * "Mirror the synthetic YAML format for load tests:
 * profile (ramp_to, hold_for, ramp_down), stages, measure list."
 *
 * Parses YAML load test definitions and converts them to
 * CreateLoadProfileDto for DB storage.
 */

import { Injectable, Logger } from "@nestjs/common";
import { LoadProfilesService, CreateLoadProfileDto, LoadStage, UiServerTarget } from "./load-profiles.service";

export interface LoadYamlEntry {
  name: string;
  description?: string;
  target_vus: number;
  cache_state?: "cold" | "warm" | "production_replay";
  device?: string;
  network_profile?: string;
  concurrency_cap?: number;
  stages: LoadYamlStage[];
  ui_server_targets?: LoadYamlServerTarget[];
  measures?: string[];
}

export interface LoadYamlStage {
  ramp_to?: number;
  hold_for?: string; // e.g. "2m", "30s"
  ramp_down?: string;
  duration?: string;
  target_vus?: number;
  ramp_type?: "linear" | "step";
}

export interface LoadYamlServerTarget {
  host: string;
  port: number;
  scrape_path?: string;
  labels?: Record<string, string>;
}

export interface LoadYamlSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  profiles: string[];
}

@Injectable()
export class LoadYamlConfigService {
  private readonly logger = new Logger(LoadYamlConfigService.name);

  constructor(private readonly profilesService: LoadProfilesService) {}

  /**
   * Parse a YAML string into load test entries.
   */
  parseYaml(yamlContent: string): LoadYamlEntry[] {
    const lines = yamlContent.split("\n");
    const entries: LoadYamlEntry[] = [];
    let current: any = null;
    let currentStage: any = null;
    let currentTarget: any = null;
    let context: "root" | "entry" | "stages" | "stage" | "targets" | "target" | "measures" | "labels" = "root";

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indent = line.search(/\S/);

      if (trimmed === "load_profiles:" || trimmed === "profiles:") {
        context = "root";
        continue;
      }

      if (indent <= 2 && trimmed.startsWith("- name:")) {
        if (currentStage && current) {
          if (!current.stages) current.stages = [];
          current.stages.push(currentStage);
          currentStage = null;
        }
        if (currentTarget && current) {
          if (!current.ui_server_targets) current.ui_server_targets = [];
          current.ui_server_targets.push(currentTarget);
          currentTarget = null;
        }
        if (current) entries.push(current);
        current = { name: this.extractValue(trimmed, "name"), stages: [] };
        context = "entry";
        continue;
      }

      if (!current) continue;

      if (context === "entry" || context === "stages" || context === "stage" || context === "targets" || context === "target" || context === "measures" || context === "labels") {
        if (trimmed === "stages:") {
          if (currentStage) { current.stages.push(currentStage); currentStage = null; }
          context = "stages";
          continue;
        }
        if (trimmed === "ui_server_targets:" || trimmed === "targets:") {
          if (currentTarget && current) {
            if (!current.ui_server_targets) current.ui_server_targets = [];
            current.ui_server_targets.push(currentTarget);
            currentTarget = null;
          }
          context = "targets";
          continue;
        }
        if (trimmed === "measures:") {
          context = "measures";
          continue;
        }
        if (trimmed === "labels:") {
          context = "labels";
          continue;
        }

        if (context === "stages") {
          if (trimmed.startsWith("- ")) {
            if (currentStage) current.stages.push(currentStage);
            currentStage = {};
            const kvPart = trimmed.slice(2);
            this.parseKeyValue(kvPart, currentStage);
            context = "stage";
            continue;
          }
        }

        if (context === "stage") {
          if (trimmed.startsWith("- ")) {
            if (currentStage) current.stages.push(currentStage);
            currentStage = {};
            this.parseKeyValue(trimmed.slice(2), currentStage);
            continue;
          }
          if (indent > 4) {
            this.parseKeyValue(trimmed, currentStage!);
            continue;
          }
          // Back to entry level
          if (currentStage) { current.stages.push(currentStage); currentStage = null; }
          context = "entry";
        }

        if (context === "targets") {
          if (trimmed.startsWith("- ")) {
            if (currentTarget) {
              if (!current.ui_server_targets) current.ui_server_targets = [];
              current.ui_server_targets.push(currentTarget);
            }
            currentTarget = {};
            this.parseKeyValue(trimmed.slice(2), currentTarget);
            context = "target";
            continue;
          }
        }

        if (context === "target") {
          if (trimmed.startsWith("- ")) {
            if (currentTarget) {
              if (!current.ui_server_targets) current.ui_server_targets = [];
              current.ui_server_targets.push(currentTarget);
            }
            currentTarget = {};
            this.parseKeyValue(trimmed.slice(2), currentTarget);
            continue;
          }
          if (context === "target" && trimmed === "labels:") {
            context = "labels";
            continue;
          }
          if (indent > 4) {
            this.parseKeyValue(trimmed, currentTarget!);
            continue;
          }
          if (currentTarget) {
            if (!current.ui_server_targets) current.ui_server_targets = [];
            current.ui_server_targets.push(currentTarget);
            currentTarget = null;
          }
          context = "entry";
        }

        if (context === "measures") {
          if (trimmed.startsWith("- ")) {
            if (!current.measures) current.measures = [];
            current.measures.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
            continue;
          }
          context = "entry";
        }

        if (context === "labels") {
          if (trimmed.includes(":")) {
            const [k, ...rest] = trimmed.split(":");
            if (!currentTarget) currentTarget = {};
            if (!currentTarget.labels) currentTarget.labels = {};
            currentTarget.labels[k.trim()] = rest.join(":").trim();
            continue;
          }
          context = "entry";
        }

        if (context === "entry") {
          this.parseKeyValue(trimmed, current);
        }
      }
    }

    // Flush remaining
    if (currentStage && current) current.stages.push(currentStage);
    if (currentTarget && current) {
      if (!current.ui_server_targets) current.ui_server_targets = [];
      current.ui_server_targets.push(currentTarget);
    }
    if (current) entries.push(current);

    return entries;
  }

  /**
   * Convert a parsed YAML stage to a LoadStage.
   */
  convertStage(yamlStage: LoadYamlStage): LoadStage {
    let durationS = 60;

    if (yamlStage.duration) {
      durationS = this.parseDuration(yamlStage.duration);
    } else if (yamlStage.hold_for) {
      durationS = this.parseDuration(yamlStage.hold_for);
    } else if (yamlStage.ramp_down) {
      durationS = this.parseDuration(yamlStage.ramp_down);
    }

    const targetVus = yamlStage.ramp_to ?? yamlStage.target_vus ?? 0;

    return {
      duration_s: durationS,
      target_vus: targetVus,
      ramp_type: yamlStage.ramp_type ?? "linear",
    };
  }

  /**
   * Convert a parsed YAML entry to a CreateLoadProfileDto.
   */
  toCreateDto(entry: LoadYamlEntry, projectId: string): CreateLoadProfileDto {
    return {
      project_id: projectId,
      name: entry.name,
      description: entry.description,
      stages: (entry.stages || []).map((s) => this.convertStage(s)),
      target_vus: entry.target_vus,
      cache_state: entry.cache_state ?? "warm",
      ui_server_targets: entry.ui_server_targets as UiServerTarget[],
      network_profile: entry.network_profile,
      device: entry.device ?? "desktop",
      concurrency_cap: entry.concurrency_cap ?? 10,
    };
  }

  /**
   * Sync load profiles from YAML to DB.
   */
  async syncFromYaml(projectId: string, yamlContent: string): Promise<LoadYamlSyncResult> {
    const entries = this.parseYaml(yamlContent);
    const result: LoadYamlSyncResult = { created: 0, updated: 0, unchanged: 0, errors: [], profiles: [] };

    const existing = await this.profilesService.findAll(projectId);
    const existingByName = new Map(existing.map((p) => [p.name, p]));

    for (const entry of entries) {
      try {
        const dto = this.toCreateDto(entry, projectId);
        const existingProfile = existingByName.get(entry.name);

        if (existingProfile) {
          await this.profilesService.update(existingProfile.id, dto);
          result.updated++;
        } else {
          await this.profilesService.create(dto);
          result.created++;
        }
        result.profiles.push(entry.name);
      } catch (err: any) {
        result.errors.push(`${entry.name}: ${err.message}`);
      }
    }

    this.logger.log(
      `Synced load profiles for project ${projectId}: ` +
      `${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Parse duration string like "2m", "30s", "1m30s" to seconds.
   */
  parseDuration(duration: string): number {
    if (typeof duration === "number") return duration;
    const str = String(duration).trim();

    // Pure number = seconds
    if (/^\d+$/.test(str)) return parseInt(str, 10);

    let total = 0;
    const mins = str.match(/(\d+)\s*m(?!s)/);
    const secs = str.match(/(\d+)\s*s/);
    if (mins) total += parseInt(mins[1], 10) * 60;
    if (secs) total += parseInt(secs[1], 10);
    return total || 60;
  }

  private extractValue(line: string, key: string): string {
    const match = line.match(new RegExp(`${key}:\\s*(.*)`));
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
  }

  private parseKeyValue(text: string, target: any): void {
    const match = text.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (!match) return;
    const [, key, rawVal] = match;
    const val = rawVal.trim().replace(/^["']|["']$/g, "");

    if (val === "true") target[key] = true;
    else if (val === "false") target[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(val)) target[key] = Number(val);
    else target[key] = val;
  }
}
