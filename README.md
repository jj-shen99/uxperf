<p align="center">
  <img src="docs/assets/logo.svg" alt="Perf Framework" width="80" />
</p>

<h1 align="center">UI Performance Testing &amp; Analysis Framework</h1>

<p align="center">
  An end-to-end platform for authoring, executing, analyzing, and acting on frontend performance tests.<br/>
  Unifies synthetic testing, real-user monitoring, concurrent load testing, and ML-powered intelligence behind a single web dashboard.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/USER_GUIDE.md">User Guide</a> ·
  <a href="#api-reference">API Reference</a>
</p>

---

## Highlights

| Capability | What it does |
|------------|--------------|
| **Synthetic Testing** | Playwright + Lighthouse engine collects Core Web Vitals (LCP, FCP, INP, CLS, TTFB, TBT) and Lighthouse scores per run |
| **Concurrent Load Testing** | k6 browser adapter with staged VU ramp, server telemetry correlation, and saturation detection |
| **Quality Gates** | Threshold, baseline-relative, statistical, VU-tiered, and server-resource gates with 3-of-5 quorum gating |
| **ML Intelligence** | SHAP feature attribution, Prophet-style forecasting, CUSUM/EWMA change-point detection, anomaly feed |
| **Real-User Monitoring** | RUM event pipeline with p75 aggregation and CrUX snapshot integration |
| **NL Test Authoring** | Six-stage pipeline: intent parse → page recon → locator synthesis → script assembly → validation → confidence scoring |
| **CI/CD Integration** | GitHub Check Runs, commit statuses, Slack/webhook notifications |
| **Role-Based Access** | Admin / editor / viewer roles with project-level membership, admin-only controls |
| **Multi-Geo Testing** | Fan-out dispatch across WPT agents and k6 browser instances with cross-region comparison |

---

## Repository Structure

```
ui_performance_testing_and_analysis/
├── packages/
│   ├── api/            NestJS REST API — orchestrator, gates, intelligence (port 4000)
│   ├── dashboard/      Next.js web dashboard with Tailwind CSS (port 4200)
│   ├── worker/         Playwright + Lighthouse execution engine (containerized)
│   ├── db/             PostgreSQL migrations (7 migration sets, 14 files)
│   └── shared/         Shared TypeScript types and validators
├── docker/             Dockerfiles for api, dashboard, worker
├── .github/workflows/  CI pipeline (test → lint → build → db migration test)
├── docker-compose.yml  Full-stack orchestration (Postgres, API, Dashboard, Worker)
└── tsconfig.base.json  Shared TypeScript configuration
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **PostgreSQL** 16 (or use Docker)
- **Docker & Docker Compose** (optional)

### Development Setup

```bash
# 1. Clone and install
git clone https://github.com/jj-shen99/ui_performance_testing_and_analysis.git
cd ui_performance_testing_and_analysis
npm install

# 2. Start Postgres
docker compose up -d postgres

# 3. Run database migrations
npm run db:migrate

# 4. Start services (two terminals)
npm run dev:api          # API server → http://localhost:4000
npm run dev:dashboard    # Dashboard  → http://localhost:4200

# 5. (Optional) Start the worker poll loop
npm run worker:poll

# 6. (Optional) Run a one-off test
npm run worker:run -- --url https://example.com
```

### Docker (full stack)

```bash
docker compose up --build
# API:       http://localhost:4000
# Dashboard: http://localhost:4200
```

---

## Dashboard Pages

The dashboard provides 18 pages organized into four navigation groups:

### Overview
| Page | Description |
|------|-------------|
| **Dashboard** | Home view with overview counters, Core Web Vitals from the latest run, active runs, KPI averages, and script/run statistics |
| **Results** | Detailed run results with Lighthouse scores and metric breakdowns |
| **Trends** | Time-series charts of performance metrics across runs with environment filtering |
| **Reports** | Executive performance reports (7/30/90-day summaries with CWV p75, pass rates, anomaly counts) |
| **Knowledge** | Knowledge base and documentation reference |

### Testing
| Page | Description |
|------|-------------|
| **Runs** | Run list, manual run launcher, run detail with gate results |
| **Scripts** | Script management with template creation (Lighthouse Audit, Multi-Page Flow, SPA Navigation, etc.) |
| **Author** | Natural-language test authoring interface with pipeline visualization |
| **Load Test** | Load profile launcher, summary stats (total/active/completed/failed/VU-minutes/cost), status filter, completed run metrics panel |
| **Schedules** | Cron-based schedule management with enable/disable toggles |

### Analysis
| Page | Description |
|------|-------------|
| **Gates** | Quality gate configuration (threshold, baseline-relative, statistical, VU-tiered) |
| **Compare** | Side-by-side run comparison with bar charts, diff table, waterfall/filmstrip |
| **Anomalies** | Anomaly feed with project/time-range/metric filters, trend chart, severity badges, resolution actions |
| **Intelligence** | Tabbed view: SHAP attribution, Prophet forecasting, RUM summary, CrUX snapshots, capacity planning |

### Admin
| Page | Description |
|------|-------------|
| **Users** | User management (admin-only) with sortable columns |
| **Settings** | Project management (sortable list, admin-only create/delete), notification channels, environments, user profile (My Profile tab) |

---

## Feature Summary

### Testing Engines

| Engine | Status | Description |
|--------|--------|-------------|
| Playwright + Lighthouse | ✅ Built-in | Core engine — headless Chrome, CWV metrics, Lighthouse audit |
| k6 Browser | ✅ Built-in | Concurrent load testing with staged VU ramp and saturation detection |
| WebPageTest | ✅ Opt-in | Private WPT instance adapter with rate limiting |
| sitespeed.io | 🔲 Placeholder | Pluggable adapter interface ready |

### Quality Gates

| Gate Type | Description |
|-----------|-------------|
| **Threshold** | Static metric thresholds (e.g., LCP ≤ 2500ms) |
| **Baseline-relative** | Compare against baseline percentiles (e.g., fail if LCP > p75 + 10%) |
| **Statistical** | Mean ± N×stddev from baseline data |
| **VU-tiered** | Thresholds that scale with concurrency level |
| **Server-resource floor** | CPU, memory, event-loop lag conditions from telemetry |
| **Capacity-floor** | Minimum sustainable VUs with headroom calculation |

All gates use **3-of-5 quorum** — a metric must fail 3 of the last 5 runs to trigger, preventing flaky failures.

### Intelligence & Analytics

- **Change-point detection** — CUSUM and EWMA on metric time series
- **SHAP attribution** — Permutation-based feature importance for regression root-cause
- **Prophet forecasting** — Trend + weekly seasonality decomposition with prediction intervals
- **Root-cause attribution** — Phase-level and request-level timing distribution comparison
- **Anomaly management** — Severity workflow (open → acknowledged → resolved) with feedback loop
- **Executive reports** — Automated 7/30/90-day performance digests via Slack/webhook
- **Capacity planning** — Saturation detection, headroom estimation, infrastructure recommendations

### Access Control

| Role | Permissions |
|------|-------------|
| **Admin** | Full access — manage users, projects, channels, environments, all CRUD operations |
| **Editor** | Run tests, create scripts, view all data |
| **Viewer** | Read-only access to dashboards and results |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide React |
| **Backend** | NestJS 10, TypeScript 5, Node.js 20 |
| **Database** | PostgreSQL 16 (ClickHouse-ready per-request schema) |
| **Test Engines** | Playwright + Lighthouse, k6 Browser, WebPageTest |
| **Object Storage** | Local filesystem (S3-ready abstraction) |
| **CI/CD** | GitHub Actions (test → lint → build → migration verification) |
| **Containerization** | Docker, Docker Compose |

---

## Testing

```bash
# Run all tests
npm test

# API unit tests (Jest)
npm test --workspace=packages/api       # 56 spec files

# Shared validators (Vitest)
npm test --workspace=packages/shared     # 135 tests

# Worker engine + stats (Vitest)
npm test --workspace=packages/worker     # 52 tests

# Dashboard logic tests (Vitest)
npm test --workspace=packages/dashboard  # 6 test suites
```

The CI pipeline (`.github/workflows/ci.yml`) runs all tests, linting, builds, and database migration verification on every push/PR.

---

## API Reference

All endpoints are prefixed with `/api/v1`. See the full endpoint reference below.

<details>
<summary><strong>Core Resources</strong> (click to expand)</summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/runs` | List runs (`?project_id=`) |
| POST | `/runs` | Create (queue) a run |
| POST | `/runs/claim` | Worker claims next queued run |
| GET | `/runs/:id` | Get run details |
| GET | `/runs/:id/gates` | Gate results for run |
| POST | `/runs/:id/complete` | Worker reports completion |
| PATCH | `/runs/:id` | Update run |
| GET | `/scripts` | List scripts (`?project_id=`) |
| POST | `/scripts` | Create script |
| GET | `/scripts/:id` | Get script |
| PATCH | `/scripts/:id` | Update script |
| DELETE | `/scripts/:id` | Delete script |
| GET | `/scripts/:id/versions` | List script versions |
| POST | `/scripts/:id/versions` | Create version |

</details>

<details>
<summary><strong>Gates, Schedules &amp; Baselines</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gates` | List gates (`?project_id=`) |
| POST | `/gates` | Create gate |
| PATCH | `/gates/:id` | Update gate |
| DELETE | `/gates/:id` | Delete gate |
| GET | `/gates/results/:runId` | Gate results for a run |
| GET | `/schedules` | List schedules (`?project_id=`) |
| POST | `/schedules` | Create schedule |
| PATCH | `/schedules/:id` | Update schedule |
| DELETE | `/schedules/:id` | Delete schedule |
| GET | `/baselines` | List baselines |
| GET | `/baselines/active` | Active baseline (`?project_id=&metric=`) |
| POST | `/baselines/compute` | Compute baseline |
| POST | `/baselines/refresh` | Recompute all project baselines |

</details>

<details>
<summary><strong>Analytics &amp; Intelligence</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/trends` | Metric time-series |
| GET | `/trends/summary` | Project summary stats |
| GET | `/analytics/anomalies` | List anomalies |
| PATCH | `/analytics/anomalies/:id/status` | Update anomaly status |
| PATCH | `/analytics/anomalies/:id/feedback` | Provide feedback |
| POST | `/analytics/detect` | Run change-point detection |
| GET | `/analytics/attribution` | Root-cause attribution |
| POST | `/reports/executive` | Generate executive report |
| GET | `/reports` | List reports |
| POST | `/authoring/generate` | NL test authoring |
| POST | `/intelligence/attribution` | SHAP attribution |
| POST | `/intelligence/forecast` | Prophet-style forecast |
| POST | `/intelligence/rum/ingest` | Ingest RUM event |
| GET | `/intelligence/rum/summary` | RUM p75 summary |
| POST | `/intelligence/crux/fetch` | Fetch CrUX snapshot |
| POST | `/intelligence/capacity/report` | Generate capacity report |

</details>

<details>
<summary><strong>Load Testing</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/load/profiles` | List load profiles |
| POST | `/load/profiles` | Create load profile |
| PATCH | `/load/profiles/:id` | Update profile |
| DELETE | `/load/profiles/:id` | Delete profile |
| GET | `/load/runs` | List load runs (`?status=`) |
| POST | `/load/runs` | Create load run |
| POST | `/load/runs/:id/cancel` | Cancel load run |
| POST | `/load/runs/:id/cost-estimate` | Estimate cost |
| GET | `/load/telemetry/:id` | Server resource snapshots |
| GET | `/load/telemetry/:id/summary` | Per-host telemetry summary |
| GET | `/load/correlation/:id` | Load-correlation analysis |
| POST | `/load/gates/evaluate` | Evaluate VU-parameterized gates |

</details>

<details>
<summary><strong>RBAC, Auth &amp; Notifications</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login |
| POST | `/auth/change-password` | Change password |
| POST | `/auth/forgot-password` | Forgot password |
| POST | `/auth/reset-password` | Reset password |
| GET | `/rbac/users` | List users |
| POST | `/rbac/users` | Create user |
| PATCH | `/rbac/users/:id` | Update user |
| DELETE | `/rbac/users/:id` | Delete user |
| GET | `/rbac/projects/:id/members` | List project members |
| POST | `/rbac/projects/:id/members` | Add member |
| DELETE | `/rbac/projects/:id/members/:uid` | Remove member |
| GET | `/notifications/channels` | List channels |
| POST | `/notifications/channels` | Create channel |
| POST | `/notifications/test` | Send test notification |
| GET | `/intelligence/audit` | Query audit log |
| POST | `/intelligence/api-keys` | Create API key |
| GET | `/intelligence/api-keys` | List API keys |

</details>

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | `postgresql://perf:perf@localhost:5432/perf_framework` | Postgres connection |
| `ARTIFACTS_DIR` | `./artifacts` | Artifact storage directory |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Dashboard → API URL |
| `API_URL` | `http://localhost:4000/api/v1` | Worker → API URL |
| `SCHEDULE_POLL_INTERVAL_MS` | `30000` | Schedule dispatcher interval |
| `POLL_INTERVAL_MS` | `5000` | Worker poll interval |
| `WPT_SERVER` | — | WebPageTest server URL (opt-in) |
| `WPT_API_KEY` | — | WebPageTest API key |
| `CRUX_API_KEY` | — | Chrome UX Report API key |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System architecture with component diagrams |
| [User Guide](docs/USER_GUIDE.md) | Setup, configuration, and day-to-day usage |
| [API Reference](#api-reference) | Full REST endpoint listing |
| [Contributing](docs/CONTRIBUTING.md) | Development workflow and guidelines |

---

## License

MIT — see [LICENSE](LICENSE) for details.
