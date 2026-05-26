import { parseArgs } from "node:util";
import { runPlaywrightLighthouse } from "./engine/index";
import type { EngineRunRequest } from "./engine/types";

const { values } = parseArgs({
  options: {
    url: { type: "string", short: "u" },
    runs: { type: "string", short: "n", default: "3" },
    device: { type: "string", short: "d", default: "desktop" },
    width: { type: "string", default: "1920" },
    height: { type: "string", default: "1080" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help || !values.url) {
  console.log(`
Frontend Performance Testing Framework — Engine PoC (Playwright + Lighthouse)

Usage:
  npm run worker:run -- --url <URL> [options]

Options:
  -u, --url <url>       Target URL to test (required)
  -n, --runs <count>    Number of runs for N-run median (default: 3)
  -d, --device <type>   Device profile: desktop | mobile (default: desktop)
  --width <px>          Viewport width (default: 1920)
  --height <px>         Viewport height (default: 1080)
  --json                Output raw JSON result
  -h, --help            Show this help
`);
  process.exit(values.help ? 0 : 1);
}

const device = values.device === "mobile" ? "mobile" : "desktop";
const viewport =
  device === "mobile"
    ? { width: 375, height: 812 }
    : { width: parseInt(values.width!, 10), height: parseInt(values.height!, 10) };

const request: EngineRunRequest = {
  url: values.url!,
  n_runs: parseInt(values.runs!, 10),
  device,
  viewport,
};

console.log("=".repeat(60));
console.log("Frontend Performance Testing Framework — Engine PoC");
console.log("=".repeat(60));
console.log(`URL:    ${request.url}`);
console.log(`Device: ${request.device}`);
console.log(`Runs:   ${request.n_runs}`);
console.log(`Viewport: ${request.viewport.width}x${request.viewport.height}`);
console.log("=".repeat(60));
console.log();

const result = await runPlaywrightLighthouse(request);

if (values.json) {
  // Strip large lighthouse reports from individual runs for JSON output
  const cleaned = {
    ...result,
    individual_runs: result.individual_runs.map(
      ({ lighthouse_report_json, ...rest }) => rest
    ),
  };
  console.log(JSON.stringify(cleaned, null, 2));
} else {
  console.log();
  console.log("=".repeat(60));
  console.log(result.success ? "RESULTS (median)" : "RUN FAILED");
  console.log("=".repeat(60));

  if (result.error) {
    console.error(`Error: ${result.error}`);
  }

  const m = result.metrics;
  console.log();
  console.log("Core Web Vitals:");
  console.log(`  LCP:   ${m.lcp_ms?.toFixed(0) ?? "n/a"} ms`);
  console.log(`  FCP:   ${m.fcp_ms?.toFixed(0) ?? "n/a"} ms`);
  console.log(`  INP:   ${m.inp_ms?.toFixed(0) ?? "n/a"} ms`);
  console.log(`  CLS:   ${m.cls?.toFixed(3) ?? "n/a"}`);
  console.log(`  TTFB:  ${m.ttfb_ms?.toFixed(0) ?? "n/a"} ms`);

  console.log();
  console.log("Lighthouse Timings:");
  console.log(`  SI:    ${m.si_ms?.toFixed(0) ?? "n/a"} ms`);
  console.log(`  TTI:   ${m.tti_ms?.toFixed(0) ?? "n/a"} ms`);
  console.log(`  TBT:   ${m.tbt_ms?.toFixed(0) ?? "n/a"} ms`);

  console.log();
  console.log("Lighthouse Scores:");
  console.log(
    `  Performance:    ${m.lighthouse_performance_score !== undefined ? (m.lighthouse_performance_score * 100).toFixed(0) : "n/a"}`
  );
  console.log(
    `  Accessibility:  ${m.lighthouse_accessibility_score !== undefined ? (m.lighthouse_accessibility_score * 100).toFixed(0) : "n/a"}`
  );
  console.log(
    `  Best Practices: ${m.lighthouse_best_practices_score !== undefined ? (m.lighthouse_best_practices_score * 100).toFixed(0) : "n/a"}`
  );
  console.log(
    `  SEO:            ${m.lighthouse_seo_score !== undefined ? (m.lighthouse_seo_score * 100).toFixed(0) : "n/a"}`
  );

  console.log();
  console.log("Page Load:");
  console.log(`  Requests:           ${m.total_requests ?? "n/a"}`);
  console.log(
    `  Transfer Size:      ${m.total_transfer_size_bytes !== undefined ? (m.total_transfer_size_bytes / 1024).toFixed(1) + " KB" : "n/a"}`
  );
  console.log(
    `  DOMContentLoaded:   ${m.dom_content_loaded_ms?.toFixed(0) ?? "n/a"} ms`
  );
  console.log(`  Load Event:         ${m.load_event_ms?.toFixed(0) ?? "n/a"} ms`);

  console.log();
  console.log(`Duration: ${(result.duration_ms / 1000).toFixed(1)}s`);
  console.log("=".repeat(60));
}

process.exit(result.success ? 0 : 1);
