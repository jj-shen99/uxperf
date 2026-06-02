export interface RunAuth {
  type: "none" | "http_header" | "cookie";
  header_name?: string;   // e.g. "Authorization"
  header_value?: string;  // e.g. "Bearer eyJ..."
  cookies?: { name: string; value: string; domain?: string; path?: string }[];
}

export interface EngineRunRequest {
  url: string;
  n_runs: number;
  device: "desktop" | "mobile";
  viewport: { width: number; height: number };
  auth?: RunAuth;
  throttling?: {
    cpu_slowdown?: number;
    download_kbps?: number;
    upload_kbps?: number;
    latency_ms?: number;
  };
}

export interface WebVitals {
  lcp_ms?: number;
  fcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
}

export interface LighthouseScores {
  performance?: number;
  accessibility?: number;
  best_practices?: number;
  seo?: number;
}

export interface LighthouseTimings {
  si_ms?: number;
  tti_ms?: number;
  tbt_ms?: number;
  fcp_ms?: number;
  lcp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
}

export interface SingleRunResult {
  run_index: number;
  web_vitals: WebVitals;
  lighthouse_scores: LighthouseScores;
  lighthouse_timings: LighthouseTimings;
  total_requests: number;
  total_transfer_size_bytes: number;
  dom_content_loaded_ms?: number;
  load_event_ms?: number;
  lighthouse_report_json?: unknown;
}

export interface AggregatedMetrics {
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
}

export interface EngineRunResult {
  success: boolean;
  url: string;
  n_runs: number;
  device: string;
  metrics: AggregatedMetrics;
  individual_runs: SingleRunResult[];
  error?: string;
  duration_ms: number;
  started_at: string;
  finished_at: string;
}
