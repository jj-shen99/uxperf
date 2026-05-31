/**
 * YAML Journey Parser (E-01).
 *
 * Parses YAML test definitions into compiled step sequences.
 * Uses a built-in YAML subset parser (no external dependency)
 * that handles the simple key-value structure of journey files.
 */

import type {
  JourneyDefinition,
  JourneyStage,
  CompiledStep,
  StepAction,
} from "./types";

// ── Minimal YAML parser ────────────────────────────────────────
// Handles the flat + array-of-objects structure used by journey files.
// For production, swap with `yaml` npm package.

export function parseYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let currentKey = "";
  let currentArray: unknown[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.replace(/\r$/, "");

    // Skip empty lines and comments
    if (trimmed.trim() === "" || trimmed.trim().startsWith("#")) continue;

    // Top-level key: value
    const topMatch = trimmed.match(/^([a-z_]+):\s*(.*)/);
    if (topMatch) {
      // Flush previous array
      if (currentArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const key = topMatch[1];
      const val = topMatch[2].trim();

      if (val === "" || val === "|") {
        // Start of a block/array
        currentKey = key;
        currentArray = [];
      } else {
        result[key] = parseValue(val);
        currentKey = key;
      }
      continue;
    }

    // Array item: "  - something"
    const arrayMatch = trimmed.match(/^\s+-\s+(.*)/);
    if (arrayMatch && currentArray) {
      const item = arrayMatch[1].trim();

      // Check if item is "key: value" (object-style)
      const kvMatch = item.match(/^([a-z_]+)\s+(.*)/);
      if (kvMatch && !item.includes(":")) {
        // Simple string "visit /products"
        const action = kvMatch[1];
        const target = kvMatch[2].trim().replace(/^["']|["']$/g, "");
        const obj: Record<string, unknown> = {};
        obj[action] = target;
        currentArray.push(obj);
      } else if (item.includes(":")) {
        // "key: value" pair
        const colonIdx = item.indexOf(":");
        const k = item.slice(0, colonIdx).trim();
        const v = item.slice(colonIdx + 1).trim();
        const obj: Record<string, unknown> = {};
        obj[k] = parseValue(v);
        currentArray.push(obj);
      } else {
        // Bare string like "measure"
        const obj: Record<string, unknown> = {};
        obj[item] = true;
        currentArray.push(obj);
      }
      continue;
    }
  }

  // Flush final array
  if (currentArray && currentKey) {
    result[currentKey] = currentArray;
  }

  return result;
}

function parseValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "") return null;
  const num = Number(v);
  if (!isNaN(num) && v !== "") return num;
  return v.replace(/^["']|["']$/g, "");
}

// ── Journey Definition Validation ──────────────────────────────

export interface ParseError {
  message: string;
  line?: number;
}

export function validateDefinition(
  raw: Record<string, unknown>,
): { valid: true; definition: JourneyDefinition } | { valid: false; errors: ParseError[] } {
  const errors: ParseError[] = [];

  if (!raw.name || typeof raw.name !== "string") {
    errors.push({ message: "Missing or invalid 'name' field" });
  }
  if (!raw.target || typeof raw.target !== "string") {
    errors.push({ message: "Missing or invalid 'target' field (URL required)" });
  }
  if (!raw.stages || !Array.isArray(raw.stages)) {
    errors.push({ message: "Missing or invalid 'stages' array" });
  }

  if (raw.stages && Array.isArray(raw.stages)) {
    for (let i = 0; i < raw.stages.length; i++) {
      const stage = raw.stages[i] as Record<string, unknown>;
      const keys = Object.keys(stage);
      if (keys.length !== 1) {
        errors.push({ message: `Stage ${i + 1}: must have exactly one action, got: ${keys.join(", ")}` });
        continue;
      }
      const action = keys[0];
      const validActions = ["visit", "click", "fill", "scroll", "wait_for", "hover", "select", "press", "measure"];
      if (!validActions.includes(action)) {
        errors.push({ message: `Stage ${i + 1}: unknown action '${action}'` });
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    definition: {
      name: raw.name as string,
      target: raw.target as string,
      device: (raw.device as "desktop" | "mobile") ?? "desktop",
      screenshots: raw.screenshots !== false,
      stages: raw.stages as JourneyStage[],
    },
  };
}

// ── Compile to Executable Steps ────────────────────────────────

export function compileSteps(definition: JourneyDefinition): CompiledStep[] {
  return definition.stages.map((stage, i) => {
    const entry = Object.entries(stage as Record<string, unknown>)[0];
    const [action, rawTarget] = entry;

    let target: string;
    let value: string | undefined;
    let label: string;

    switch (action) {
      case "visit":
        target = resolveUrl(definition.target, rawTarget as string);
        label = `visit ${rawTarget}`;
        break;
      case "click":
        target = rawTarget as string;
        label = `click "${target}"`;
        break;
      case "fill":
        if (Array.isArray(rawTarget)) {
          target = rawTarget[0] as string;
          value = rawTarget[1] as string;
        } else {
          target = rawTarget as string;
          value = "";
        }
        label = `fill "${target}" with "${value ?? ""}"`;
        break;
      case "scroll":
        target = rawTarget as string;
        label = `scroll to ${target}`;
        break;
      case "wait_for":
        target = rawTarget as string;
        label = target.startsWith("/") ? `wait for ${target}` : `wait for "${target}"`;
        break;
      case "hover":
        target = rawTarget as string;
        label = `hover "${target}"`;
        break;
      case "select":
        if (Array.isArray(rawTarget)) {
          target = rawTarget[0] as string;
          value = rawTarget[1] as string;
        } else {
          target = rawTarget as string;
          value = "";
        }
        label = `select "${value}" in "${target}"`;
        break;
      case "press":
        target = rawTarget as string;
        label = `press ${target}`;
        break;
      case "measure":
        target = "measure";
        label = typeof rawTarget === "string" ? `measure: ${rawTarget}` : "measure";
        break;
      default:
        target = String(rawTarget);
        label = `${action} ${target}`;
    }

    return {
      index: i,
      action: action as StepAction,
      target,
      value,
      label,
    };
  });
}

function resolveUrl(base: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const baseClean = base.replace(/\/$/, "");
  const pathClean = path.startsWith("/") ? path : `/${path}`;
  return `${baseClean}${pathClean}`;
}

// ── Top-level parse function ───────────────────────────────────

export function parseJourney(
  yaml: string,
): { definition: JourneyDefinition; steps: CompiledStep[] } | { errors: ParseError[] } {
  const raw = parseYaml(yaml);
  const validation = validateDefinition(raw);
  if (!validation.valid) return { errors: validation.errors };
  const steps = compileSteps(validation.definition);
  return { definition: validation.definition, steps };
}
