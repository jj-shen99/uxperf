# Frontend Performance Testing Framework

An end-to-end platform for authoring, executing, analyzing, and acting on frontend performance tests. Unifies synthetic performance testing — from script authoring through CI/CD quality gates — behind a single web dashboard.

## Architecture

```
packages/
  api/          — NestJS API (port 4000): orchestrator, gates, scripts, schedules, REST
  dashboard/    — Next.js web dashboard (port 3000)
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

# Start the dashboard (port 3000)
npm run dev:dashboard

# Run a performance test (Engine PoC)
npm run worker:run -- --url https://example.com
```

### Run Tests

```bash
# All packages
npm test

# API only (Jest — 178 tests)
npm test --workspace=packages/api

# Shared validators (Vitest — 135 tests)
npm test --workspace=packages/shared

# Worker stats (Vitest — 33 tests)
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | `postgresql://perf:perf@localhost:5432/perf_framework` | Postgres connection string |
| `ARTIFACTS_DIR` | `./artifacts` | Local directory for artifact storage |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | API URL for dashboard |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide |
| Backend | Node.js (NestJS 10), TypeScript 5 |
| Engine | Playwright + Lighthouse |
| Database | PostgreSQL 16 |
| Testing | Jest (API — 178 tests), Vitest (shared/worker — 168 tests) |
| Metrics DB | ClickHouse (planned Phase 2) |
| Object Store | S3-compatible (planned Phase 2) |

## License

Internal — see design document for details.
