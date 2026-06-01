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
| **Authentication** | Password-based login with session persistence, forgot/reset password flow, demo seed accounts |
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
│   ├── db/             PostgreSQL migrations (9 migration sets, 18 files)
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

### One-Command Setup

```bash
git clone https://github.com/jj-shen99/uxperf.git
cd uxperf
docker compose up -d postgres    # Start Postgres
npm run setup                    # Install deps, migrate DB, seed users, install Playwright
```

### Manual Development Setup

```bash
# 1. Clone and install
git clone https://github.com/jj-shen99/uxperf.git
cd uxperf
npm install

# 2. Start Postgres
docker compose up -d postgres

# 3. Run database migrations
npm run db:migrate

# 4. Seed demo users (creates 5 users with passwords)
npm run db:seed

# 5. Install Playwright browsers (required for test execution)
npx playwright install chromium --with-deps

# 6. Start services (three terminals)
npm run dev:api          # Terminal 1: API server → http://localhost:4000
npm run dev:dashboard    # Terminal 2: Dashboard  → http://localhost:4200
npm run worker:poll      # Terminal 3: Worker poll loop (executes queued runs)

# 7. (Optional) Run a one-off test
npm run worker:run -- --url https://example.com
```

### Docker (full stack)

```bash
docker compose up --build
# API:       http://localhost:4000 (auto-runs migrations + seed)
# Dashboard: http://localhost:4200

# Start the worker (optional — needed for test execution)
docker compose --profile worker up --build
```

### Seed Users

After running `npm run db:seed`, these accounts are available:

| Email | Password | Role |
|-------|----------|------|
| `admin@perftest.io` | `admin123!` | admin |
| `editor@perftest.io` | `editor123!` | editor |
| `viewer@perftest.io` | `viewer123!` | viewer |
| `qa@perftest.io` | `qatest123!` | editor |
| `dev@perftest.io` | `devtest123!` | viewer |

---

## Authentication & Security

The framework uses **JWT-based authentication** with a global auth guard on all API endpoints.

### Login flow

1. Navigate to `http://localhost:4200` — unauthenticated users are redirected to `/login`
2. Enter email and password → `POST /api/v1/auth/login`
3. On success, the API returns a **JWT token**. The dashboard stores it in `localStorage` and attaches it as `Authorization: Bearer <token>` on every API request
4. If a 401 is received (expired/missing token), the dashboard clears the session and redirects to `/login`
5. Pre-existing sessions (created before JWT was enabled) are auto-upgraded via `/auth/session-upgrade`
6. The sidebar shows the current user avatar, name, email, and role
7. Admin users see a **Switch User** dropdown to impersonate other accounts

### Available auth endpoints

| Action | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| Register | `POST /auth/register` | Public | Create a new account (default role: `viewer`) |
| Login | `POST /auth/login` | Public | Authenticate and receive JWT + user profile |
| Session upgrade | `POST /auth/session-upgrade` | Public | Exchange existing user ID for a JWT (migration) |
| Forgot password | `POST /auth/forgot-password` | Public | Request a reset token (shown in dev mode) |
| Reset password | `POST /auth/reset-password` | Public | Set new password using reset token |
| Change password | `POST /auth/change-password` | Bearer | Change password for current user |

### Security hardening

| Feature | Details |
|---------|--------|
| **Global JWT auth guard** | `AuthGuard` + `JwtService` — all endpoints require `Bearer` token unless marked `@Public()` |
| **Public endpoints** | Health check, RUM ingest, worker claim/log/complete, all `/auth/*` routes |
| **Rate limiting** | Auth endpoints throttled to 5 requests per 60 seconds (`@nestjs/throttler`) |
| **Security headers** | Helmet middleware (X-Frame-Options, CSP, HSTS, etc.) |
| **Token encryption** | GitHub tokens encrypted at rest with AES-256-GCM (`CryptoService`) |
| **Reset token suppression** | Reset tokens hidden from API responses in production (`NODE_ENV=production`) |
| **Input validation** | Global `ValidationPipe` with `class-validator` DTOs |
| **Body size limit** | JSON body limit reduced to 1 MB |
| **Unified error messages** | Login errors don't reveal whether an account exists or is inactive |
| **DB credentials** | `DATABASE_URL` required in production — no hardcoded fallback |

### Password requirements

- Minimum **8 characters** (API) / **6 characters** (dashboard profile change)
- Passwords are hashed with `scryptSync` (64-byte key, 32-byte random salt)

---

## Dashboard Pages

The dashboard provides 18 pages organized into four navigation groups:

### Overview
| Page | Description |
|------|-------------|
| **Dashboard** | Home view with overview counters, recent runs table, KPI averages, and interactive metric relationship diagram |
| **Results** | Detailed run results with Lighthouse scores and metric breakdowns |
| **Trends** | Time-series charts of performance metrics across runs with environment filtering |
| **Reports** | Executive performance reports (7/30/90-day summaries with CWV p75, pass rates, anomaly counts, trend directions) |
| **Knowledge** | Tabbed knowledge base: Metrics & Glossary, Lighthouse Score Breakdown, Optimization Guide, Testing Methodology, Threshold Reference, Network Fundamentals |

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
| **Gates** | Quality gate configuration (threshold, baseline-relative, statistical, VU-tiered) with on-demand "Check Against Run" evaluation |
| **Compare** | Side-by-side run comparison with bar charts, diff table, waterfall/filmstrip |
| **Anomalies** | Anomaly feed with project/time-range/metric filters, trend chart, severity badges, resolution actions |
| **Intelligence** | Tabbed view: SHAP attribution, Prophet forecasting, RUM summary, CrUX snapshots, capacity planning |

### Admin
| Page | Description |
|------|-------------|
| **Users** | User management (admin-only) — create, update roles, activate/deactivate, delete |
| **Settings** | Project management (sortable list, admin-only create/delete), notification channels, environments, user profile (My Profile tab with email change and password change) |

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
| **Admin** | Full access — manage users, projects, channels, environments, all CRUD operations. Can switch between user accounts via sidebar. Sees all scripts and runs across all users. |
| **Editor** | Run tests, create scripts, view all data within assigned projects |
| **Viewer** | Read-only access to dashboards and results within assigned projects. Sees only own scripts and runs. |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide React |
| **Backend** | NestJS 10, TypeScript 5, Node.js 20 |
| **Database** | PostgreSQL 16 (ClickHouse-ready per-request schema) |
| **Test Engines** | Playwright + Lighthouse, k6 Browser, WebPageTest |
| **Object Storage** | Local filesystem (S3-ready abstraction) |
| **CI/CD** | GitHub Actions (manual dispatch; test → lint → build → migration verification) |
| **Containerization** | Docker, Docker Compose |

---

## Testing

```bash
# Run all tests
npm test

# API unit tests (Jest)
npm test --workspace=packages/api       # 80 suites, 890 tests

# Shared validators (Vitest)
npm test --workspace=packages/shared     # 135 tests

# Worker engine + stats (Vitest)
npm test --workspace=packages/worker     # 52 tests

# Dashboard logic tests (Jest)
npm test --workspace=packages/dashboard  # 18 suites, 660 tests
```

The CI pipeline (`.github/workflows/ci.yml`) is configured for manual dispatch (`workflow_dispatch`). It runs all tests, linting, builds, and database migration verification.

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
| GET | `/runs` | List runs (`?project_id=&user_id=&is_admin=`) |
| POST | `/runs` | Create (queue) a run |
| POST | `/runs/claim` | Worker claims next queued run |
| GET | `/runs/:id` | Get run details |
| GET | `/runs/:id/gates` | Gate results for run |
| POST | `/runs/:id/complete` | Worker reports completion |
| PATCH | `/runs/:id` | Update run |
| GET | `/scripts` | List scripts (`?project_id=&user_id=&is_admin=`) |
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
| POST | `/gates/evaluate` | Evaluate all gates against a specific run |
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
| POST | `/auth/change-password` | Change password (requires Bearer token) |
| POST | `/auth/forgot-password` | Forgot password |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/session-upgrade` | Exchange user ID for JWT (session migration) |
| GET | `/rbac/users` | List users |
| POST | `/rbac/users` | Create user |
| PATCH | `/rbac/users/:id` | Update user (display_name, email, role, is_active) |
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
| `NODE_ENV` | `development` | Set to `production` to hide reset tokens, enforce `DATABASE_URL`, etc. |
| `JWT_SECRET` | auto-generated | Secret for signing JWT tokens (auto-generated with warning if not set) |
| `TOKEN_ENCRYPTION_KEY` | auto-generated | 32-byte hex key for AES-256-GCM encryption of GitHub tokens |
| `WPT_SERVER` | — | WebPageTest server URL (opt-in) |
| `WPT_API_KEY` | — | WebPageTest API key |
| `CRUX_API_KEY` | — | Chrome UX Report API key (server-side only) |

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
