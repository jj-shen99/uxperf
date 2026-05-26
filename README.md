# Frontend Performance Testing Framework

An end-to-end platform for authoring, executing, analyzing, and acting on frontend performance tests. Unifies synthetic performance testing — from script authoring through CI/CD quality gates — behind a single web dashboard.

## Architecture

```
packages/
  api/          — NestJS API (port 4000): orchestrator, gates, scripts, schedules, REST
  dashboard/    — Next.js web dashboard (port 4200)
  worker/       — Playwright + Lighthouse engine (containerized)
  db/           — Postgres migrations and schema
  shared/       — Shared TypeScript types and validators
docker/         — Dockerfiles per service
```

## Current Status

### Phase 0 — Foundations ✅

- **Repo scaffolding** — monorepo with npm workspaces, TypeScript, linting, CI
- **Data-model draft** — Postgres schema for projects, scripts, runs, baselines, gates, audit log
- **Engine PoC** — Playwright + Lighthouse runner emitting structured metrics (LCP, FCP, INP, CLS, TTFB, Lighthouse scores)
- **API scaffold** — NestJS service with CRUD for projects and runs
- **Dashboard scaffold** — Next.js shell with Tailwind CSS

### Phase 1 — MVP ✅

- **Scripts CRUD** — API and dashboard for managing test scripts (manual, describe, record, template authoring modes)
- **Quality Gates** — Threshold-based gates with 3-of-5 quorum gating (a metric must fail 3 of the last 5 runs to trigger a gate failure)
- **Run Orchestrator** — Job dispatch via poll-based claim, result ingestion, automatic gate evaluation on completion
- **Scheduled Runs** — Cron-based scheduling with `next_run_at` tracking and due-schedule querying
- **Artifact Storage** — Local filesystem storage for Lighthouse reports, HAR files, and traces (S3-ready abstraction)
- **GitHub Integration** — Gate results posted as GitHub Check Runs and commit statuses
- **Dashboard Pages** — Runs list + detail, trends chart, scripts CRUD, gates CRUD, schedules CRUD, manual run launcher

### Phase 2 — Depth ✅

- **Baselines Service** — Automatic statistical baseline computation (p50, p75, p95, p99, mean, stddev) from last N completed runs; auto-refresh after each run completion
- **Baseline-relative Gates** — Gate type that compares metrics against baseline percentiles (e.g., fail if LCP exceeds p75 by >10%)
- **Statistical Gates** — Gate type using mean ± N×stddev thresholds from baseline data
- **Schedule Dispatcher** — Background service that polls for due schedules and auto-creates runs (configurable interval)
- **Worker Poll Loop** — Worker auto-claims queued runs from the API and executes them end-to-end
- **Trends API** — Time-series metrics endpoint for charting with environment filtering and project summary stats
- **Projects Update** — PATCH endpoint for updating project metadata
- **WPT Integration** — WebPageTest private-instance adapter (opt-in, rate-limited) behind multi-engine TestRunner abstraction
- **Multi-engine TestRunner** — Pluggable engine registry: Playwright+Lighthouse (built-in), WPT, sitespeed.io (placeholder)
- **Compare View** — Dashboard page for side-by-side run comparison with bar charts, diff table, and waterfall/filmstrip placeholders
- **RBAC** — Users, global roles (admin/editor/viewer), project membership with role-based access control
- **Script Versioning** — Version history for scripts with commit SHA tracking and diff support
- **Slack Notifications** — Notification channels (Slack webhooks, generic webhooks, email placeholder) dispatched on gate failures and run completions
- **Per-request Data** — ClickHouse-ready per-request metrics storage with cardinality-controlled aggregation (PG-backed, migration-ready)

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker & Docker Compose (optional — for Postgres)
- PostgreSQL 16

### Development

```bash
# Install dependencies
npm install

# Start infrastructure (Postgres)
docker compose up -d postgres

# Run database migrations
npm run db:migrate

# Start the API server (port 4000)
npm run dev:api

# Start the dashboard (port 4200)
npm run dev:dashboard

# Run a performance test (Engine PoC)
npm run worker:run -- --url https://example.com

# Start the worker poll loop (auto-executes queued runs)
npm run worker:poll
```

### Run Tests

```bash
# All packages
npm test

# API only (Jest — 304 tests)
npm test --workspace=packages/api

# Shared validators (Vitest — 135 tests)
npm test --workspace=packages/shared

# Worker engine + stats (Vitest — 44 tests)
npm test --workspace=packages/worker
```

### Docker (full stack)

```bash
docker compose up --build
```

## API Endpoints

All endpoints are prefixed with `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/runs` | List runs (filter: `?project_id=`) |
| POST | `/runs` | Create (queue) a run |
| POST | `/runs/claim` | Worker claims next queued run |
| GET | `/runs/:id` | Get run details |
| GET | `/runs/:id/gates` | Get gate results for run |
| POST | `/runs/:id/complete` | Worker reports run completion |
| PATCH | `/runs/:id` | Update run |
| GET | `/scripts` | List scripts (filter: `?project_id=`) |
| POST | `/scripts` | Create script |
| GET | `/scripts/:id` | Get script |
| PATCH | `/scripts/:id` | Update script |
| DELETE | `/scripts/:id` | Delete script |
| GET | `/gates` | List gates (filter: `?project_id=`) |
| POST | `/gates` | Create gate |
| GET | `/gates/:id` | Get gate |
| PATCH | `/gates/:id` | Update gate |
| DELETE | `/gates/:id` | Delete gate |
| GET | `/gates/results/:runId` | Get gate results for a run |
| GET | `/schedules` | List schedules (filter: `?project_id=`) |
| POST | `/schedules` | Create schedule |
| GET | `/schedules/:id` | Get schedule |
| PATCH | `/schedules/:id` | Update schedule |
| DELETE | `/schedules/:id` | Delete schedule |
| GET | `/baselines` | List baselines (filter: `?project_id=`) |
| GET | `/baselines/active` | Get active baseline (`?project_id=&metric=`) |
| GET | `/baselines/:id` | Get baseline |
| POST | `/baselines/compute` | Compute baseline for a metric |
| POST | `/baselines/refresh` | Recompute all baselines for project |
| DELETE | `/baselines/:id` | Delete baseline |
| GET | `/trends` | Metric time-series (`?project_id=&metric=&limit=`) |
| GET | `/trends/summary` | Project summary stats (`?project_id=`) |
| PATCH | `/projects/:id` | Update project |
| GET | `/scripts/:id/versions` | List script versions |
| GET | `/scripts/:id/versions/:ver` | Get specific version |
| POST | `/scripts/:id/versions` | Create script version |
| GET | `/rbac/users` | List users |
| POST | `/rbac/users` | Create user |
| GET | `/rbac/users/:id` | Get user |
| PATCH | `/rbac/users/:id` | Update user |
| DELETE | `/rbac/users/:id` | Delete user |
| GET | `/rbac/projects/:id/members` | List project members |
| POST | `/rbac/projects/:id/members` | Add project member |
| DELETE | `/rbac/projects/:id/members/:uid` | Remove member |
| GET | `/notifications/channels` | List notification channels |
| POST | `/notifications/channels` | Create channel |
| PATCH | `/notifications/channels/:id` | Update channel |
| DELETE | `/notifications/channels/:id` | Delete channel |
| POST | `/notifications/test` | Send test notification |
| POST | `/per-request/ingest` | Bulk ingest per-request data |
| GET | `/per-request/:runId` | Get per-request data |
| GET | `/per-request/:runId/summary` | Aggregated per-request summary |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | `postgresql://perf:perf@localhost:5432/perf_framework` | Postgres connection string |
| `ARTIFACTS_DIR` | `./artifacts` | Local directory for artifact storage |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | API URL for dashboard |
| `SCHEDULE_POLL_INTERVAL_MS` | `30000` | Schedule dispatcher poll interval |
| `API_URL` | `http://localhost:4000/api/v1` | Worker API URL |
| `POLL_INTERVAL_MS` | `5000` | Worker poll interval |
| `WPT_SERVER` | | WebPageTest server URL (opt-in) |
| `WPT_API_KEY` | | WebPageTest API key |
| `SITESPEED_ENABLED` | `false` | Enable sitespeed.io engine |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide |
| Backend | Node.js (NestJS 10), TypeScript 5 |
| Engine | Playwright + Lighthouse |
| Database | PostgreSQL 16 |
| Testing | Jest (API — 304 tests), Vitest (shared — 135, worker — 44 tests) |
| Engines | Playwright + Lighthouse, WebPageTest (opt-in), sitespeed.io (placeholder) |
| Metrics DB | PostgreSQL (ClickHouse-ready schema) |
| Object Store | Local filesystem (S3-ready abstraction) |

## License

Internal — see design document for details.
