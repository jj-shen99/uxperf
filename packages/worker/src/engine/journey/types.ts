/**
 * Journey test definition types (E-01 through E-05).
 *
 * A journey is a multi-step user flow defined in YAML that compiles
 * to executable Playwright actions. Each step produces timing data
 * and an optional screenshot.
 */

// ── YAML Schema Types ──────────────────────────────────────────

export interface JourneyDefinition {
  name: string;
  target: string;
  device?: "desktop" | "mobile";
  viewport?: { width: number; height: number };
  throttling?: {
    cpu_slowdown?: number;
    download_kbps?: number;
    upload_kbps?: number;
    latency_ms?: number;
  };
  screenshots?: boolean;       // default true
  stages: JourneyStage[];
}

export type JourneyStage =
  | { visit: string }
  | { click: string }
  | { fill: [string, string] }  // [selector, value]
  | { scroll: string }          // "bottom" | "top" | selector
  | { wait_for: string }        // selector or URL path
  | { hover: string }
  | { select: [string, string] } // [selector, value]
  | { press: string }           // key name
  | { measure: true | string }; // capture vitals; optional label

// ── Parsed / Compiled Types ────────────────────────────────────

export type StepAction =
  | "visit"
  | "click"
  | "fill"
  | "scroll"
  | "wait_for"
  | "hover"
  | "select"
  | "press"
  | "measure";

export interface CompiledStep {
  index: number;
  action: StepAction;
  target: string;           // URL path, selector, key, or "measure"
  value?: string;           // fill/select value
  label: string;            // human-readable label for reporting
}

// ── Result Types ───────────────────────────────────────────────

export interface StepResult {
  index: number;
  action: StepAction;
  label: string;
  started_at: string;       // ISO timestamp (E-05)
  finished_at: string;      // ISO timestamp (E-05)
  duration_ms: number;      // E-05: inter-stage timing
  screenshot_base64?: string; // E-04: per-step screenshot
  error?: string;
}

export interface MeasureResult {
  label: string;
  step_index: number;
  web_vitals: {
    lcp_ms?: number;
    fcp_ms?: number;
    inp_ms?: number;
    cls?: number;
    ttfb_ms?: number;
  };
  dom_content_loaded_ms?: number;
  load_event_ms?: number;
  total_requests?: number;
  total_transfer_size_bytes?: number;
}

export interface JourneyResult {
  name: string;
  target: string;
  device: string;
  success: boolean;
  steps: StepResult[];
  measurements: MeasureResult[];
  total_duration_ms: number;
  started_at: string;
  finished_at: string;
  error?: string;
}
