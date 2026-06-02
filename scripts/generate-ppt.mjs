#!/usr/bin/env node
import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches

// ── Brand palette ──
const BG = "0F172A";       // slate-900
const ACCENT = "6366F1";   // indigo-500
const ACCENT2 = "818CF8";  // indigo-400
const GREEN = "22C55E";
const YELLOW = "EAB308";
const RED = "EF4444";
const CYAN = "06B6D4";
const TEAL = "14B8A6";
const PURPLE = "A855F7";
const EMERALD = "10B981";
const WHITE = "F8FAFC";
const GRAY = "94A3B8";
const DARK_CARD = "1E293B";

function addBackground(slide) {
  slide.background = { color: BG };
}

function sectionDivider(title, subtitle) {
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: BG } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.2, w: "100%", h: 0.06, fill: { color: ACCENT } });
  slide.addText(title, { x: 0.8, y: 2.2, w: 11.7, h: 1.0, fontSize: 36, bold: true, color: WHITE, fontFace: "Arial" });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.8, y: 3.5, w: 11.7, h: 0.6, fontSize: 16, color: GRAY, fontFace: "Arial" });
  }
  return slide;
}

function contentSlide(title, bullets, opts = {}) {
  const slide = pptx.addSlide();
  addBackground(slide);
  // Title bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.0, fill: { color: DARK_CARD } });
  slide.addText(title, { x: 0.8, y: 0.15, w: 11.7, h: 0.7, fontSize: 24, bold: true, color: WHITE, fontFace: "Arial" });
  // Accent line
  slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.0, w: 2.0, h: 0.04, fill: { color: ACCENT } });

  const startY = opts.startY || 1.3;
  const bodyText = bullets.map((b) => ({
    text: b,
    options: { fontSize: 14, color: GRAY, fontFace: "Arial", bullet: { code: "2022", color: ACCENT2 }, paraSpaceAfter: 6 },
  }));
  slide.addText(bodyText, { x: 0.8, y: startY, w: 11.7, h: 5.5, valign: "top" });
  return slide;
}

function tableSlide(title, headers, rows, opts = {}) {
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.0, fill: { color: DARK_CARD } });
  slide.addText(title, { x: 0.8, y: 0.15, w: 11.7, h: 0.7, fontSize: 24, bold: true, color: WHITE, fontFace: "Arial" });
  slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.0, w: 2.0, h: 0.04, fill: { color: ACCENT } });

  const headerRow = headers.map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: ACCENT }, fontSize: 11, fontFace: "Arial" } }));
  const dataRows = rows.map((row) =>
    row.map((cell) => ({ text: cell, options: { color: GRAY, fill: { color: DARK_CARD }, fontSize: 11, fontFace: "Arial", border: { pt: 0.5, color: "334155" } } }))
  );

  const colW = opts.colW || headers.map(() => 11.7 / headers.length);
  slide.addTable([headerRow, ...dataRows], { x: 0.8, y: 1.3, colW, border: { pt: 0.5, color: "334155" }, autoPage: false });
  return slide;
}

// ════════════════════════════════════════════════════════════════
// SLIDE 1 — Title
// ════════════════════════════════════════════════════════════════
const s1 = pptx.addSlide();
addBackground(s1);
s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: BG } });
// Large gradient accent bar
s1.addShape(pptx.ShapeType.rect, { x: 0, y: 3.8, w: "100%", h: 0.08, fill: { color: ACCENT } });
s1.addText("UI Performance Testing\n& Analysis Framework", {
  x: 0.8, y: 1.4, w: 11.7, h: 2.2,
  fontSize: 42, bold: true, color: WHITE, fontFace: "Arial", lineSpacingMultiple: 1.1,
});
s1.addText("An end-to-end platform for authoring, executing, analyzing, and acting on\nfrontend performance tests", {
  x: 0.8, y: 4.1, w: 11.7, h: 0.9,
  fontSize: 16, color: GRAY, fontFace: "Arial", lineSpacingMultiple: 1.3,
});
s1.addText("Synthetic Testing  •  Load Testing  •  ML Intelligence  •  Quality Gates", {
  x: 0.8, y: 5.4, w: 11.7, h: 0.5,
  fontSize: 13, color: ACCENT2, fontFace: "Arial",
});

// ════════════════════════════════════════════════════════════════
// SLIDE 2 — Agenda
// ════════════════════════════════════════════════════════════════
contentSlide("Agenda", [
  "Platform Overview & Capabilities",
  "Architecture & Tech Stack",
  "Testing Engines (Synthetic + Load)",
  "Lighthouse Scoring Methodology",
  "Quality Gates & Gating Strategy",
  "ML Intelligence & Analytics",
  "Dashboard Pages & UX",
  "Authentication & Role-Based Access",
  "Deployment & CI/CD",
  "Demo & Q&A",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE 3 — Platform Overview
// ════════════════════════════════════════════════════════════════
sectionDivider("Platform Overview", "What does the framework do?");

tableSlide("Key Capabilities", ["Capability", "Description"], [
  ["Synthetic Testing", "Playwright + Lighthouse collects Core Web Vitals (LCP, FCP, INP, CLS, TTFB, TBT) and Lighthouse audit scores"],
  ["Concurrent Load Testing", "k6 browser adapter with staged VU ramp, server telemetry correlation, saturation detection"],
  ["Quality Gates", "Threshold, baseline-relative, statistical, VU-tiered, and server-resource gates with 3-of-5 quorum"],
  ["ML Intelligence", "SHAP feature attribution, Prophet forecasting, CUSUM/EWMA change-point detection, anomaly feed"],
  ["Real-User Monitoring", "RUM event pipeline with p75 aggregation and CrUX snapshot integration"],
  ["NL Test Authoring", "Six-stage pipeline: intent parse → page recon → locator synthesis → script assembly → validation → scoring"],
  ["CI/CD Integration", "GitHub Check Runs, commit statuses, Slack/webhook notifications"],
  ["Multi-Geo Testing", "Fan-out dispatch across WPT agents and k6 browser instances with cross-region comparison"],
], { colW: [2.5, 9.2] });

// ════════════════════════════════════════════════════════════════
// SLIDE 5 — Architecture
// ════════════════════════════════════════════════════════════════
sectionDivider("Architecture", "Monorepo with 5 packages, Docker Compose orchestration");

{
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.0, fill: { color: DARK_CARD } });
  slide.addText("System Architecture", { x: 0.8, y: 0.15, w: 11.7, h: 0.7, fontSize: 24, bold: true, color: WHITE, fontFace: "Arial" });
  slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.0, w: 2.0, h: 0.04, fill: { color: ACCENT } });

  // Draw architecture boxes
  const boxes = [
    { label: "Dashboard\n(Next.js 15)\nPort 4200", x: 0.8, y: 1.6, w: 3.0, h: 1.5, color: ACCENT },
    { label: "API Server\n(NestJS 10)\nPort 4000", x: 5.1, y: 1.6, w: 3.0, h: 1.5, color: TEAL },
    { label: "Worker\n(Playwright +\nLighthouse)", x: 9.4, y: 1.6, w: 3.0, h: 1.5, color: PURPLE },
    { label: "PostgreSQL 16\nDatabase", x: 3.0, y: 4.2, w: 3.0, h: 1.2, color: EMERALD },
    { label: "Shared Types\n& Validators", x: 7.5, y: 4.2, w: 3.0, h: 1.2, color: CYAN },
  ];

  for (const b of boxes) {
    slide.addShape(pptx.ShapeType.roundRect, { x: b.x, y: b.y, w: b.w, h: b.h, fill: { color: DARK_CARD }, line: { color: b.color, width: 2 }, rectRadius: 0.1 });
    slide.addText(b.label, { x: b.x, y: b.y, w: b.w, h: b.h, fontSize: 12, color: WHITE, fontFace: "Arial", align: "center", valign: "middle", lineSpacingMultiple: 1.2 });
  }

  // Arrows (simple text arrows)
  slide.addText("→", { x: 3.8, y: 1.9, w: 1.3, h: 0.6, fontSize: 28, color: GRAY, align: "center" });
  slide.addText("→", { x: 8.1, y: 1.9, w: 1.3, h: 0.6, fontSize: 28, color: GRAY, align: "center" });
  slide.addText("↓", { x: 5.9, y: 3.1, w: 1.0, h: 0.8, fontSize: 28, color: GRAY, align: "center" });

  // Footer note
  slide.addText("Docker Compose orchestrates all services  •  npm workspaces monorepo  •  Shared TypeScript config", {
    x: 0.8, y: 6.2, w: 11.7, h: 0.4, fontSize: 11, color: GRAY, fontFace: "Arial", italic: true,
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE — Tech Stack
// ════════════════════════════════════════════════════════════════
tableSlide("Tech Stack", ["Layer", "Technology"], [
  ["Frontend", "Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide React"],
  ["Backend", "NestJS 10, TypeScript 5, Node.js 20"],
  ["Database", "PostgreSQL 16 (11 migration sets)"],
  ["Test Engines", "Playwright + Lighthouse, k6 Browser, WebPageTest, sitespeed.io"],
  ["Containerization", "Docker, Docker Compose (Postgres, API, Dashboard, Worker services)"],
  ["CI/CD", "GitHub Actions — test → lint → build → migration verification"],
  ["Object Storage", "Local filesystem (S3-ready abstraction)"],
], { colW: [2.5, 9.2] });

// ════════════════════════════════════════════════════════════════
// SLIDE — Testing Engines
// ════════════════════════════════════════════════════════════════
sectionDivider("Testing Engines", "Synthetic testing with Playwright + Lighthouse, load testing with k6");

contentSlide("Synthetic Testing — Playwright + Lighthouse", [
  "Worker launches headless Chrome via chrome-launcher",
  "Google Lighthouse runs audits for: performance, accessibility, best-practices, seo",
  "Extracts Core Web Vitals: LCP, FCP, CLS, TTFB, TBT, Speed Index, TTI",
  "Supports desktop mode (no throttling) and mobile mode (4× CPU, simulated 4G)",
  "Multiple iterations per run — results aggregated by median for stability",
  "Lighthouse reports stored as artifacts for drill-down analysis",
  "Pluggable engine interface — WebPageTest and sitespeed.io adapters ready",
]);

contentSlide("Load Testing — k6 Browser", [
  "Concurrent virtual users (VUs) with staged ramp profiles (e.g., 10 → 50 → 100 → peak)",
  "Server telemetry correlation — CPU, memory, event-loop lag captured per snapshot",
  "Saturation detection — identifies the VU count where metrics degrade significantly",
  "Capacity planning — headroom estimation and infrastructure recommendations",
  "Cost estimation per load run",
  "VU-tiered quality gates that scale thresholds with concurrency level",
  "Results include per-host telemetry summaries and load-correlation analysis",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE — Lighthouse Scoring
// ════════════════════════════════════════════════════════════════
sectionDivider("Lighthouse Scoring", "How Performance, Accessibility, Best Practices & SEO scores are determined");

{
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.0, fill: { color: DARK_CARD } });
  slide.addText("Performance Score Breakdown", { x: 0.8, y: 0.15, w: 11.7, h: 0.7, fontSize: 24, bold: true, color: WHITE, fontFace: "Arial" });
  slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.0, w: 2.0, h: 0.04, fill: { color: ACCENT } });

  slide.addText("Weighted average of 5 lab metrics, each scored on a log-normal curve from HTTP Archive data", {
    x: 0.8, y: 1.2, w: 11.7, h: 0.4, fontSize: 13, color: GRAY, fontFace: "Arial",
  });

  const perfRows = [
    ["FCP (First Contentful Paint)", "10%", "≤ 1.8s"],
    ["Speed Index (SI)", "10%", "≤ 3.4s"],
    ["LCP (Largest Contentful Paint)", "25%", "≤ 2.5s"],
    ["TBT (Total Blocking Time)", "30%", "≤ 200ms"],
    ["CLS (Cumulative Layout Shift)", "25%", "≤ 0.1"],
  ];
  const hdr = [
    { text: "Metric", options: { bold: true, color: WHITE, fill: { color: ACCENT }, fontSize: 12, fontFace: "Arial" } },
    { text: "Weight", options: { bold: true, color: WHITE, fill: { color: ACCENT }, fontSize: 12, fontFace: "Arial", align: "center" } },
    { text: "Good Threshold", options: { bold: true, color: WHITE, fill: { color: ACCENT }, fontSize: 12, fontFace: "Arial", align: "center" } },
  ];
  const dRows = perfRows.map((r) => [
    { text: r[0], options: { color: WHITE, fill: { color: DARK_CARD }, fontSize: 12, fontFace: "Arial", border: { pt: 0.5, color: "334155" } } },
    { text: r[1], options: { color: ACCENT2, fill: { color: DARK_CARD }, fontSize: 12, fontFace: "Arial", align: "center", bold: true, border: { pt: 0.5, color: "334155" } } },
    { text: r[2], options: { color: GREEN, fill: { color: DARK_CARD }, fontSize: 12, fontFace: "Arial", align: "center", border: { pt: 0.5, color: "334155" } } },
  ]);
  slide.addTable([hdr, ...dRows], { x: 0.8, y: 1.8, colW: [5.0, 2.0, 3.0], border: { pt: 0.5, color: "334155" } });

  // Score thresholds legend
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 5.0, w: 3.0, h: 0.6, fill: { color: "16A34A" }, rectRadius: 0.05 });
  slide.addText("≥ 90  Good", { x: 0.8, y: 5.0, w: 3.0, h: 0.6, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Arial" });
  slide.addShape(pptx.ShapeType.roundRect, { x: 4.2, y: 5.0, w: 3.0, h: 0.6, fill: { color: "CA8A04" }, rectRadius: 0.05 });
  slide.addText("50–89  Needs Improvement", { x: 4.2, y: 5.0, w: 3.0, h: 0.6, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Arial" });
  slide.addShape(pptx.ShapeType.roundRect, { x: 7.6, y: 5.0, w: 3.0, h: 0.6, fill: { color: "DC2626" }, rectRadius: 0.05 });
  slide.addText("< 50  Poor", { x: 7.6, y: 5.0, w: 3.0, h: 0.6, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Arial" });
}

tableSlide("Other Lighthouse Categories", ["Category", "Audits", "Scoring"], [
  ["Accessibility", "~50 axe-core + WCAG 2.1 audits", "passing ÷ applicable × 100, equally weighted"],
  ["Best Practices", "~15 modern web & security audits", "passing ÷ applicable × 100, equally weighted"],
  ["SEO", "~13 technical SEO audits", "passing ÷ applicable × 100, equally weighted"],
], { colW: [2.0, 4.0, 5.7] });

contentSlide("Parameters That Influence Scores", [
  "Device: desktop (no throttling) vs. mobile (4× CPU, simulated 4G) — switching to desktop typically +10–30 Performance pts",
  "Number of iterations (n_runs): median across 5–10 runs reduces variance; single runs fluctuate ±5–8 pts",
  "Viewport size: affects which element is LCP, image loading, CLS measurement",
  "Network conditions: Lighthouse simulates throttling but actual network speed also matters",
  "Server warm/cold state: cold caches on first run after deploy degrade TTFB and scores",
  "Third-party scripts: ads, analytics, chat widgets add 500ms–2s TBT — blocking them isolates own code performance",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE — Quality Gates
// ════════════════════════════════════════════════════════════════
sectionDivider("Quality Gates", "Automated pass/fail gating with configurable quorum");

tableSlide("Gate Types", ["Gate Type", "Description"], [
  ["Threshold", "Static metric limits (e.g., LCP ≤ 2500ms, Performance ≥ 90)"],
  ["Baseline-Relative", "Compare against baseline percentiles (e.g., fail if LCP > p75 + 10%)"],
  ["Statistical", "Mean ± N × stddev from historical baseline data"],
  ["VU-Tiered", "Thresholds that scale with virtual user concurrency level"],
  ["Server-Resource Floor", "CPU, memory, event-loop lag conditions from telemetry"],
  ["Capacity-Floor", "Minimum sustainable VUs with headroom calculation"],
], { colW: [2.5, 9.2] });

contentSlide("Gating Strategy: Configurable Quorum", [
  "Default: 3-of-5 — a metric must fail 3 of the last 5 runs to trigger",
  "Per-severity defaults: warn/advisory = 1-of-3, block = 3-of-5, page = 4-of-5",
  "Gate-level overrides for window_size and required_failures",
  "Gate overrides with audit trail — engineers can acknowledge and proceed",
  "CI/CD integration: gate results posted as GitHub Check Runs and commit statuses",
  "PR gate-summary comments with collapsible blocking/warning/passed sections",
  "Slack/webhook notifications on gate failures for immediate visibility",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE — Intelligence & Analytics
// ════════════════════════════════════════════════════════════════
sectionDivider("ML Intelligence & Analytics", "Automated insights, anomaly detection, and forecasting");

contentSlide("Intelligence Features", [
  "SHAP Attribution — permutation-based feature importance for regression root-cause analysis",
  "Prophet Forecasting — trend + weekly seasonality decomposition with prediction intervals",
  "Change-Point Detection — CUSUM and EWMA algorithms on metric time series",
  "Root-Cause Attribution — phase-level and request-level timing distribution comparison",
  "Anomaly Management — severity workflow: open → acknowledged → resolved with feedback loop",
  "Capacity Planning — saturation detection, headroom estimation, infrastructure recommendations",
  "Executive Reports — automated 7/30/90-day performance digests via Slack/webhook",
  "RUM Integration — real-user monitoring p75 aggregation and CrUX snapshot support",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE — Dashboard Pages
// ════════════════════════════════════════════════════════════════
sectionDivider("Dashboard", "20 pages organized into 4 navigation groups");

tableSlide("Overview Pages", ["Page", "Description"], [
  ["Dashboard", "Home view — overview counters, recent runs, KPI averages, metric relationship diagram"],
  ["Results", "Per-run detail — Lighthouse scores, CWV gauges, radar chart, time waterfall, score breakdown"],
  ["Trends", "Time-series charts of performance metrics with environment filtering"],
  ["Reports", "Executive reports (7/30/90-day summaries), CWV p75, pass rates, anomaly counts"],
  ["Knowledge", "Metrics glossary, optimization guide, testing methodology, threshold reference"],
], { colW: [2.0, 9.7] });

tableSlide("Testing & Analysis Pages", ["Page", "Description"], [
  ["Runs", "Run list, manual launcher, run detail with gate results"],
  ["Scripts", "Script management with templates (Lighthouse Audit, Multi-Page Flow, SPA Nav, etc.)"],
  ["Author", "Natural-language test authoring with pipeline visualization"],
  ["Load Test", "Load profile launcher, VU-minutes, cost, status filter, completed run metrics"],
  ["Schedules", "Cron-based schedule management with enable/disable toggles"],
  ["Gates", "Quality gate configuration (threshold, baseline, statistical, VU-tiered)"],
  ["Compare", "Side-by-side run comparison with bar charts, diff table, waterfall/filmstrip"],
  ["Anomalies", "Anomaly feed with filters, trend chart, severity badges, resolution actions"],
  ["Intelligence", "SHAP, Prophet forecasting, RUM, CrUX, capacity, mobile-vs-desktop, multi-geo"],
  ["Investigation", "Regression timeline, attribution panel, gate status, baseline comparison"],
  ["Audit", "Interactive Appendix C checklist with auto-evaluation and KPI reference guide"],
], { colW: [2.0, 9.7] });

// ════════════════════════════════════════════════════════════════
// SLIDE — Auth & RBAC
// ════════════════════════════════════════════════════════════════
sectionDivider("Authentication & Security", "JWT auth with security hardening");

contentSlide("Authentication & Security", [
  "JWT-based authentication — global AuthGuard on all API endpoints",
  "Passwords hashed with scryptSync (64-byte key, 32-byte random salt)",
  "Rate limiting: auth endpoints 5 req/60s, session-upgrade 2 req/60s",
  "Helmet security headers (X-Frame-Options, CSP, HSTS)",
  "Token encryption: GitHub tokens encrypted at rest with AES-256-GCM",
  "Startup warnings when JWT_SECRET or TOKEN_ENCRYPTION_KEY use insecure defaults",
  "Reset tokens suppressed in production (NODE_ENV=production)",
  "Unified login errors — never reveal whether an account exists",
  "Parameterized SQL throughout — no string interpolation",
  "UUID validation on session-upgrade to prevent enumeration",
]);

tableSlide("Role-Based Access Control", ["Role", "Permissions"], [
  ["Admin", "Full access — manage users, projects, channels, environments, all CRUD. See all scripts/runs across all users."],
  ["Editor", "Run tests, create scripts, view all data within assigned projects"],
  ["Viewer", "Read-only access to dashboards and results within assigned projects. Own scripts/runs only."],
], { colW: [2.0, 9.7] });

// ════════════════════════════════════════════════════════════════
// SLIDE — Deployment
// ════════════════════════════════════════════════════════════════
sectionDivider("Deployment & CI/CD", "Docker Compose, GitHub Actions, environment configuration");

contentSlide("Deployment", [
  "Docker Compose orchestrates 4 services: Postgres, API, Dashboard, Worker",
  "Individual Dockerfiles per service in /docker/ directory",
  "One-command setup: docker compose up --build",
  "Worker runs as optional profile: docker compose --profile worker up",
  "Manual dev setup: 3 terminals — API (port 4000), Dashboard (port 4200), Worker (poll loop)",
  "CI pipeline: GitHub Actions runs tests → lint → build → DB migration verification on every push/PR",
  "Environment variables control ports, database URL, API endpoints, polling intervals",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE — API Reference Summary
// ════════════════════════════════════════════════════════════════
tableSlide("API Endpoint Summary", ["Resource Group", "Endpoints", "Key Operations"], [
  ["Core", "Projects, Runs, Scripts", "CRUD, claim, complete, versions"],
  ["Gates & Schedules", "Gates, Schedules, Baselines", "Create, evaluate, refresh, cron management"],
  ["Analytics", "Trends, Anomalies, Attribution", "Time-series, change-point detection, root-cause"],
  ["Intelligence", "SHAP, Forecast, RUM, CrUX, Capacity", "Attribution, prediction, monitoring, planning"],
  ["Load Testing", "Profiles, Runs, Telemetry, Correlation", "Staged ramp, VU gates, cost estimation"],
  ["Auth & RBAC", "Auth, Users, Members, Notifications", "Register, login, roles, channels, audit log"],
], { colW: [2.5, 3.5, 5.7] });

// ════════════════════════════════════════════════════════════════
// SLIDE — Testing
// ════════════════════════════════════════════════════════════════
contentSlide("Testing & Quality", [
  "API: Jest — 87 suites, 1050 tests (controllers, services, guards, security)",
  "Dashboard: Jest — 24 suites, 771 tests (page logic, anomalies, trends, auth)",
  "Worker: Vitest — 10 suites, 205 tests (engine, stats, adapters, journey)",
  "Shared: Vitest — 1 suite, 135 tests (validators, shared utilities)",
  "Total: 122 suites, 2161 tests across all packages",
  "CI: GitHub Actions — test → lint → build → DB migration verification",
  "Security audit: session-upgrade hardened, startup warnings, UUID validation, parameterized SQL",
]);

// ════════════════════════════════════════════════════════════════
// SLIDE — Core Web Vitals Reference
// ════════════════════════════════════════════════════════════════
tableSlide("Core Web Vitals — Threshold Reference", ["Metric", "Good", "Needs Improvement", "Poor"], [
  ["LCP (Largest Contentful Paint)", "≤ 2.5s", "2.5s – 4.0s", "> 4.0s"],
  ["FCP (First Contentful Paint)", "≤ 1.8s", "1.8s – 3.0s", "> 3.0s"],
  ["INP (Interaction to Next Paint)", "≤ 200ms", "200ms – 500ms", "> 500ms"],
  ["CLS (Cumulative Layout Shift)", "≤ 0.1", "0.1 – 0.25", "> 0.25"],
  ["TTFB (Time to First Byte)", "≤ 800ms", "800ms – 1.8s", "> 1.8s"],
  ["TBT (Total Blocking Time)", "≤ 200ms", "200ms – 600ms", "> 600ms"],
  ["SI (Speed Index)", "≤ 3.4s", "3.4s – 5.8s", "> 5.8s"],
  ["TTI (Time to Interactive)", "≤ 3.8s", "3.8s – 7.3s", "> 7.3s"],
  ["Lighthouse Score", "≥ 90", "50 – 89", "< 50"],
], { colW: [3.5, 2.7, 2.8, 2.7] });

// ════════════════════════════════════════════════════════════════
// SLIDE — End
// ════════════════════════════════════════════════════════════════
{
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.2, w: "100%", h: 0.06, fill: { color: ACCENT } });
  slide.addText("Thank You", { x: 0.8, y: 2.0, w: 11.7, h: 1.0, fontSize: 42, bold: true, color: WHITE, fontFace: "Arial", align: "center" });
  slide.addText("Questions & Demo", { x: 0.8, y: 3.5, w: 11.7, h: 0.6, fontSize: 20, color: ACCENT2, fontFace: "Arial", align: "center" });
  slide.addText("github.com/jj-shen99/uxperf", {
    x: 0.8, y: 5.5, w: 11.7, h: 0.4, fontSize: 13, color: GRAY, fontFace: "Arial", align: "center",
  });
}

// ── Write file ──
const outPath = "docs/UI_Performance_Framework_Presentation.pptx";
await pptx.writeFile({ fileName: outPath });
console.log(`✅ Presentation generated: ${outPath}`);
console.log(`   ${pptx.slides.length} slides created`);
