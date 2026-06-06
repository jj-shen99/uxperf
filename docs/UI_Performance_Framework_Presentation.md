# UI Performance Testing & Analysis Framework

**An end-to-end platform for authoring, executing, analyzing, and acting on frontend performance tests**

Synthetic Testing · Load Testing · ML Intelligence · Quality Gates

---

## Agenda

1. Platform Overview & Capabilities
2. Architecture & Tech Stack
3. Testing Engines (Synthetic + Load)
4. Lighthouse Scoring Methodology
5. Quality Gates & Gating Strategy
6. ML Intelligence & Analytics
7. Dashboard Pages & UX
8. Authentication & Role-Based Access
9. Deployment & CI/CD
10. Demo & Q&A

---

## Platform Overview

> What does the framework do?

| Capability | Description |
|------------|-------------|
| **Synthetic Testing** | Playwright + Lighthouse collects Core Web Vitals (LCP, FCP, INP, CLS, TTFB, TBT) and Lighthouse audit scores |
| **Concurrent Load Testing** | k6 browser adapter with staged VU ramp, server telemetry correlation, saturation detection |
| **Quality Gates** | Threshold, baseline-relative, statistical, VU-tiered, and server-resource gates with 3-of-5 quorum |
| **ML Intelligence** | SHAP feature attribution, Prophet forecasting, CUSUM/EWMA change-point detection, anomaly feed |
| **Real-User Monitoring** | RUM event pipeline with p75 aggregation and CrUX snapshot integration |
| **NL Test Authoring** | Six-stage pipeline: intent parse → page recon → locator synthesis → script assembly → validation → scoring |
| **CI/CD Integration** | GitHub Check Runs, commit statuses, Slack/webhook notifications |
| **Multi-Geo Testing** | Fan-out dispatch across WPT agents and k6 browser instances with cross-region comparison |
| **Performance Budgets** | Route-level budgets with ratchet-on-improvement, device-class thresholds, variance-aware enforcement |

---

## Architecture

> Monorepo with 5 packages, Docker Compose orchestration

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard (Next.js 15)  →  API Server (NestJS 10)  →  Worker (Playwright + Lighthouse)  │
│       Port 4200                 Port 4000              Background poll loop            │
│                                    │                                                    │
│                            PostgreSQL 16         Shared Types & Validators              │
└─────────────────────────────────────────────────────────────┘
```

- Docker Compose orchestrates all services
- npm workspaces monorepo
- Shared TypeScript configuration

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide React |
| **Backend** | NestJS 10, TypeScript 5, Node.js 20 |
| **Database** | PostgreSQL 16 (14 migration sets) |
| **Test Engines** | Playwright + Lighthouse, k6 Browser, WebPageTest, sitespeed.io |
| **Containerization** | Docker, Docker Compose (Postgres, API, Dashboard, Worker services) |
| **CI/CD** | GitHub Actions — test → lint → build → migration verification |
| **Object Storage** | Local filesystem (S3-ready abstraction) |

---

## Testing Engines

### Synthetic Testing — Playwright + Lighthouse

- Worker launches headless Chrome via chrome-launcher
- Google Lighthouse runs audits for: performance, accessibility, best-practices, seo
- Extracts Core Web Vitals: LCP, FCP, CLS, TTFB, TBT, Speed Index, TTI
- Supports desktop mode (no throttling) and mobile mode (4× CPU, simulated 4G)
- Multiple iterations per run — results aggregated by median for stability
- Lighthouse reports stored as artifacts for drill-down analysis
- Pluggable engine interface — WebPageTest and sitespeed.io adapters ready

### Load Testing — k6 Browser

- Concurrent virtual users (VUs) with staged ramp profiles (e.g., 10 → 50 → 100 → peak)
- Server telemetry correlation — CPU, memory, event-loop lag captured per snapshot
- Saturation detection — identifies the VU count where metrics degrade significantly
- Capacity planning — headroom estimation and infrastructure recommendations
- Cost estimation per load run
- VU-tiered quality gates that scale thresholds with concurrency level
- Results include per-host telemetry summaries and load-correlation analysis

---

## Lighthouse Scoring Methodology

### Performance Score Breakdown

Weighted average of 5 lab metrics, each scored on a log-normal curve from HTTP Archive data:

| Metric | Weight | Good Threshold |
|--------|:------:|:--------------:|
| FCP (First Contentful Paint) | 10% | ≤ 1.8s |
| Speed Index (SI) | 10% | ≤ 3.4s |
| LCP (Largest Contentful Paint) | 25% | ≤ 2.5s |
| TBT (Total Blocking Time) | 30% | ≤ 200ms |
| CLS (Cumulative Layout Shift) | 25% | ≤ 0.1 |

**Score thresholds:**
- 🟢 **≥ 90** — Good
- 🟡 **50–89** — Needs Improvement
- 🔴 **< 50** — Poor

### Other Lighthouse Categories

| Category | Audits | Scoring |
|----------|--------|---------|
| **Accessibility** | ~50 axe-core + WCAG 2.1 audits | passing ÷ applicable × 100, equally weighted |
| **Best Practices** | ~15 modern web & security audits | passing ÷ applicable × 100, equally weighted |
| **SEO** | ~13 technical SEO audits | passing ÷ applicable × 100, equally weighted |

### Parameters That Influence Scores

- **Device**: desktop (no throttling) vs. mobile (4× CPU, simulated 4G) — switching to desktop typically +10–30 Performance pts
- **Number of iterations** (n_runs): median across 5–10 runs reduces variance; single runs fluctuate ±5–8 pts
- **Viewport size**: affects which element is LCP, image loading, CLS measurement
- **Network conditions**: Lighthouse simulates throttling but actual network speed also matters
- **Server warm/cold state**: cold caches on first run after deploy degrade TTFB and scores
- **Third-party scripts**: ads, analytics, chat widgets add 500ms–2s TBT — blocking them isolates own code performance

---

## Quality Gates

### Gate Types

| Gate Type | Description |
|-----------|-------------|
| **Threshold** | Static metric limits (e.g., LCP ≤ 2500ms, Performance ≥ 90) |
| **Baseline-Relative** | Compare against baseline percentiles (e.g., fail if LCP > p75 + 10%) |
| **Statistical** | Mean ± N × stddev from historical baseline data |
| **VU-Tiered** | Thresholds that scale with virtual user concurrency level |
| **Server-Resource Floor** | CPU, memory, event-loop lag conditions from telemetry |
| **Capacity-Floor** | Minimum sustainable VUs with headroom calculation |

### Gating Strategy: Configurable Quorum

- Default: **3-of-5** — a metric must fail 3 of the last 5 runs to trigger
- Per-severity defaults: warn/advisory = 1-of-3, block = 3-of-5, page = 4-of-5
- Gate-level overrides for window_size and required_failures
- Gate overrides with audit trail — engineers can acknowledge and proceed
- CI/CD integration: gate results posted as GitHub Check Runs and commit statuses
- PR gate-summary comments with collapsible blocking/warning/passed sections
- Slack/webhook notifications on gate failures for immediate visibility

---

## ML Intelligence & Analytics

- **SHAP Attribution** — permutation-based feature importance for regression root-cause analysis
- **Prophet Forecasting** — trend + weekly seasonality decomposition with prediction intervals
- **Change-Point Detection** — CUSUM and EWMA algorithms on metric time series
- **Root-Cause Attribution** — phase-level and request-level timing distribution comparison
- **Anomaly Management** — severity workflow: open → acknowledged → resolved with feedback loop
- **Capacity Planning** — saturation detection, headroom estimation, infrastructure recommendations
- **Executive Reports** — automated 7/30/90-day performance digests via Slack/webhook
- **RUM Integration** — real-user monitoring p75 aggregation and CrUX snapshot support
- **Script-Level Analysis** — filter all intelligence views by script for per-test analysis
- **Decision Dashboard** — executive review with metric deltas since last review and team KPIs
- **Mobile vs Desktop** — device-segmented comparison with mobile-aware thresholds

---

## Dashboard Pages

> 23 pages organized into 5 navigation groups

### Overview Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Home view — overview counters, recent runs, KPI averages, metric relationship diagram |
| **Results** | Per-run detail — Lighthouse scores, CWV gauges, radar chart, time waterfall, score breakdown |
| **Trends** | Time-series charts of performance metrics with IQR error bands and environment filtering |
| **Reports** | Executive reports (7/30/90-day summaries), CWV p75, pass rates, anomaly counts |
| **Knowledge** | Metrics, Terminology, Lighthouse Scores, Optimization Guide, Testing Methodology, Thresholds, Network Fundamentals, Quality Gates, Browser Rendering |

### Testing & Load Testing Pages

| Page | Description |
|------|-------------|
| **Runs** | Run list, manual launcher, run detail with gate results |
| **Scripts** | Script management with templates (Lighthouse Audit, Multi-Page Flow, SPA Nav, etc.) |
| **Author** | Natural-language test authoring with pipeline visualization |
| **Load Test** | Load profile launcher, VU-minutes, cost, status filter, completed run metrics |
| **Load Results** | Detailed load test results with VU ramp visualization and telemetry |
| **Schedules** | Cron-based schedule management with enable/disable toggles |

### Analysis Pages

| Page | Description |
|------|-------------|
| **Gates** | Quality gate configuration (threshold, baseline, statistical, VU-tiered) |
| **Budgets** | Route-level performance budgets with ratchet-on-improvement and device-class thresholds |
| **Compare** | Side-by-side run comparison with bar charts, diff table, waterfall/filmstrip |
| **Anomalies** | Anomaly feed with filters, trend chart, severity badges, resolution actions |
| **Intelligence** | Script-level analysis, SHAP attribution, forecasting, RUM, CrUX, capacity, decisions, mobile vs desktop, multi-geo |
| **Investigation** | Regression timeline, attribution panel, gate status, baseline comparison |
| **Audit** | Interactive Appendix C checklist with auto-evaluation and KPI reference guide |

### Admin Pages

| Page | Description |
|------|-------------|
| **Users** | User management — create, update roles, activate/deactivate, delete (admin-only) |
| **Settings** | Projects, notification channels, environments, WPT config, user profile |
| **Platform Health** | Platform self-monitoring, on-call rotation management, quarterly practice reviews |

---

## Authentication & Security

- JWT-based authentication — global AuthGuard on all API endpoints
- Passwords hashed with scryptSync (64-byte key, 32-byte random salt)
- Rate limiting: auth endpoints 5 req/60s, session-upgrade 2 req/60s
- Helmet security headers (X-Frame-Options, CSP, HSTS)
- Token encryption: GitHub tokens encrypted at rest with AES-256-GCM
- Startup warnings when JWT_SECRET or TOKEN_ENCRYPTION_KEY use insecure defaults
- Reset tokens suppressed in production (NODE_ENV=production)
- Unified login errors — never reveal whether an account exists
- Parameterized SQL throughout — no string interpolation
- UUID validation on session-upgrade to prevent enumeration

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Admin** | Full access — manage users, projects, channels, environments, all CRUD. See all scripts/runs across all users. |
| **Editor** | Run tests, create scripts, view all data within assigned projects |
| **Viewer** | Read-only access to dashboards and results within assigned projects. Own scripts/runs only. |

---

## Deployment & CI/CD

- Docker Compose orchestrates 4 services: Postgres, API, Dashboard, Worker
- Individual Dockerfiles per service in /docker/ directory
- One-command setup: `docker compose up --build`
- Worker runs as optional profile: `docker compose --profile worker up`
- Manual dev setup: 3 terminals — API (port 4000), Dashboard (port 4200), Worker (poll loop)
- CI pipeline: GitHub Actions runs tests → lint → build → DB migration verification on every push/PR
- Environment variables control ports, database URL, API endpoints, polling intervals

### API Endpoint Summary

| Resource Group | Endpoints | Key Operations |
|----------------|-----------|----------------|
| **Core** | Projects, Runs, Scripts | CRUD, claim, complete, versions |
| **Gates & Schedules** | Gates, Schedules, Baselines | Create, evaluate, refresh, cron management |
| **Analytics** | Trends, Anomalies, Attribution | Time-series, change-point detection, root-cause |
| **Intelligence** | SHAP, Forecast, RUM, CrUX, Capacity | Attribution, prediction, monitoring, planning |
| **Load Testing** | Profiles, Runs, Telemetry, Correlation | Staged ramp, VU gates, cost estimation |
| **Auth & RBAC** | Auth, Users, Members, Notifications | Register, login, roles, channels, audit log |
| **Budgets** | Budgets, Ratchet | CRUD, evaluate, ratchet-on-improvement |

---

## Testing & Quality

- **API**: Jest — 88 suites, 1094 tests (controllers, services, guards, security)
- **Dashboard**: Jest — 29 suites, 1153 tests (page logic, anomalies, trends, auth)
- **Worker**: Vitest — 10 suites, 222 tests (engine, stats, adapters, journey)
- **Shared**: Vitest — 1 suite, 135 tests (validators, shared utilities)
- **Total: 128 suites, 2604 tests** across all packages
- CI: GitHub Actions — test → lint → build → DB migration verification
- Security audit: session-upgrade hardened, startup warnings, UUID validation, parameterized SQL

---

## Core Web Vitals — Threshold Reference

| Metric | Good | Needs Improvement | Poor |
|--------|:----:|:-----------------:|:----:|
| LCP (Largest Contentful Paint) | ≤ 2.5s | 2.5s – 4.0s | > 4.0s |
| FCP (First Contentful Paint) | ≤ 1.8s | 1.8s – 3.0s | > 3.0s |
| INP (Interaction to Next Paint) | ≤ 200ms | 200ms – 500ms | > 500ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |
| TTFB (Time to First Byte) | ≤ 800ms | 800ms – 1.8s | > 1.8s |
| TBT (Total Blocking Time) | ≤ 200ms | 200ms – 600ms | > 600ms |
| SI (Speed Index) | ≤ 3.4s | 3.4s – 5.8s | > 5.8s |
| TTI (Time to Interactive) | ≤ 3.8s | 3.8s – 7.3s | > 7.3s |
| Lighthouse Score | ≥ 90 | 50 – 89 | < 50 |

---

## Thank You

**Questions & Demo**

`github.com/jj-shen99/uxperf`
