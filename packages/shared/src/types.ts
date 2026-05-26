// ============================================================
// Core domain types — mirrors the Postgres schema and engine output
// ============================================================

// -- Enums --

export type AuthoringMode = "record" | "template" | "describe" | "manual";

export type RunMode = "stability" | "load" | "deep" | "scheduled";

export type RunEngine =
  | "playwright_lighthouse"
  | "k6_browser"
  | "wpt"
  | "sitespeed";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type GatePolicy = "block" | "warn" | "page";

export type GateResultStatus = "passed" | "failed" | "skipped" | "overridden";

// -- Entity types --

export interface Project {
  id: string;
  name: string;
  owner_team: string;
  description?: string;
  environment_configs: Record<string, unknown>;
  quota: ProjectQuota;
  domain_allowlist: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectQuota {
  max_runs_per_day: number;
  max_vu_minutes_per_day: number;
  max_llm_tokens_per_day: number;
  max_artifact_storage_mb: number;
}

export interface Script {
  id: string;
  project_id: string;
  name: string;
  canonical_json: CanonicalScript;
  source_prompt?: string;
  version_ref?: string;
  authoring_mode: AuthoringMode;
  created_at: string;
  updated_at: string;
}

export interface CanonicalScript {
  id: string;
  source_prompt?: string;
  steps: ScriptStep[];
  metrics?: {
    page: string;
    assertions: MetricAssertion[];
  };
}

export interface ScriptStep {
  intent: string;
  locators: {
    primary: Record<string, string>;
    fallbacks: Record<string, string>[];
  };
  post_conditions?: {
    url_pattern?: string;
    expect_xhr?: { method: string; url_pattern: string };
  };
}

export interface MetricAssertion {
  metric: string;
  p95_max_ms?: number;
  max_score?: number;
}

export interface Run {
  id: string;
  script_id?: string;
  project_id: string;
  mode: RunMode;
  engine: RunEngine;
  environment: string;
  status: RunStatus;
  config: RunConfig;
  metrics?: RunMetrics;
  lighthouse_report_path?: string;
  trace_path?: string;
  har_path?: string;
  cost_estimate?: number;
  cost_actual?: number;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  error?: string;
}

export interface RunConfig {
  url: string;
  device?: string;
  network?: string;
  n_runs?: number;
  viewport?: { width: number; height: number };
  throttling?: {
    cpu_slowdown?: number;
    download_kbps?: number;
    upload_kbps?: number;
    latency_ms?: number;
  };
}

export interface RunMetrics {
  lcp_ms?: number;
  fcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
  si_ms?: number;
  tti_ms?: number;
  tbt_ms?: number;
  lighthouse_performance_score?: number;
  lighthouse_accessibility_score?: number;
  lighthouse_best_practices_score?: number;
  lighthouse_seo_score?: number;
  total_requests?: number;
  total_transfer_size_bytes?: number;
  dom_content_loaded_ms?: number;
  load_event_ms?: number;
  individual_runs?: SingleRunMetrics[];
}

export interface SingleRunMetrics {
  run_index: number;
  lcp_ms?: number;
  fcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
  lighthouse_performance_score?: number;
}

export interface Baseline {
  id: string;
  project_id: string;
  script_id?: string;
  metric: string;
  environment: string;
  p50?: number;
  p75?: number;
  p95?: number;
  p99?: number;
  mean?: number;
  stddev?: number;
  sample_size: number;
  confidence: number;
  seasonality_profile: Record<string, unknown>;
  computed_at: string;
  valid_from: string;
  valid_to?: string;
  is_active: boolean;
}

export interface Gate {
  id: string;
  project_id: string;
  name: string;
  definition: GateDefinition;
  policy: GatePolicy;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface GateDefinition {
  type: "threshold" | "baseline_relative" | "statistical" | "load_aware";
  metric: string;
  threshold?: number;
  regression_pct?: number;
  vu_tiers?: { max_vus: number; threshold: number }[];
}

export interface GateResult {
  id: string;
  gate_id: string;
  run_id: string;
  status: GateResultStatus;
  details?: Record<string, unknown>;
  evaluated_at: string;
}

export interface AuditLogEntry {
  id: number;
  actor: string;
  action: string;
  target_type?: string;
  target_id?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

// -- Engine PoC types --

export interface EngineRunRequest {
  url: string;
  n_runs?: number;
  device?: "desktop" | "mobile";
  throttling?: RunConfig["throttling"];
  viewport?: RunConfig["viewport"];
}

export interface EngineRunResult {
  success: boolean;
  metrics: RunMetrics;
  lighthouse_report?: unknown;
  trace_events?: unknown[];
  har?: unknown;
  error?: string;
  duration_ms: number;
}
