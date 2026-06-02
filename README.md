<p align="center">
  <img src="docs/assets/logo.svg" alt="UX Perf" width="80" />
</p>

<h1 align="center">UX Perf — UI Performance Testing &amp; Analysis Framework</h1>

<p align="center">
  An end-to-end platform for authoring, executing, analyzing, and acting on frontend performance tests.<br/>
  Unifies synthetic testing, real-user monitoring, concurrent load testing, and ML-powered intelligence behind a single web dashboard.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/USER_GUIDE.md">User Guide</a> ·
  <a href="#api-reference">API Reference</a> ·
  <a href="docs/CONTRIBUTING.md">Contributing</a>
</p>

---

## Highlights

| Capability | What it does |
|------------|--------------|
| **Synthetic Testing** | Playwright + Lighthouse engine collects Core Web Vitals (LCP, FCP, INP, CLS, TTFB, TBT) and Lighthouse scores per run |
| **Concurrent Load Testing** | k6 browser adapter with staged VU ramp, server telemetry correlation, and saturation detection |
| **Quality Gates** | Threshold, baseline-relative, statistical, VU-tiered, and server-resource gates with configurable quorum gating |
| **ML Intelligence** | SHAP feature attribution, Prophet-style forecasting, CUSUM/EWMA change-point detection, anomaly feed |
| **Real-User Monitoring** | RUM event pipeline with hourly/daily aggregation, p75 reporting, and CrUX snapshot integration |
| **NL Test Authoring** | Six-stage pipeline: intent parse → page recon → locator synthesis → script assembly → validation → confidence scoring |
| **CI/CD Integration** | GitHub Check Runs, commit statuses, PR gate-summary comments, Slack/webhook notifications |
| **Authentication & RBAC** | JWT auth, scrypt password hashing, role-based access (admin/editor/viewer), project-level membership |
| **Audit Checklist** | Interactive Appendix C audit checklist with auto-evaluation and per-project scoring |
| **Multi-Geo Testing** | Fan-out dispatch across WPT agents and k6 browser instances with cross-region TTFB comparison |

---

## Repository Structure

```
uxperf/
├── packages/
│   ├── api/            NestJS REST API — orchestrator, gates, intelligence (port 4000)
│   ├── dashboard/      Next.js 15 web dashboard with Tailwind CSS 4 (port 4200)
│   ├── worker/         Playwright + Lighthouse execution engine
│   ├── db/             PostgreSQL 16 migrations (11 migration sets)
│   └── shared/         Shared TypeScript types and validators
├── docker/             Dockerfiles + docker-compose.yml
├── docs/               Architecture, User Guide, Engine Guide, Enhancement Backlog
├── scripts/            Setup script, presentation generator
├── .github/workflows/  CI pipeline (test → lint → build → db migration test)
└── tsconfig.base.json  Shared TypeScript configuration
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **PostgreSQL** 16 (or use Docker)
- **Docker & Docker Compose** (optional, recommended)

### One-Command Setup

```bash
git clone https://github.com/jj-shen99/uxperf.git
cd uxperf
cp .env.example .env          # Review and set JWT_SECRET for production
docker compose up -d postgres  # Start Postgres
npm run setup                  # Install deps, migrate DB, seed users, install Playwright
```

### Manual Development Setup

```bash
# 1. Clone and install
git clone https://github.com/jj-shen99/uxperf.git
cd uxperf
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set JWT_SECRET and TOKEN_ENCRYPTION_KEY for production

# 3. Start Postgres
docker compose up -d postgres

# 4. Run database migrations
npm run db:migrate

# 5. Seed demo users
npm run db:seed

# 6. Install Playwright browsers (required for test execution)
npx playwright install chromium --with-deps

# 7. Start services (three terminals)
npm run dev:api          # Terminal 1: API server → http://localhost:4000
npm run dev:dashboard    # Terminal 2: Dashboard  → http://localhost:4200
npm run worker:poll      # Terminal 3: Worker poll loop (executes queued runs)
```

### Docker (full stack)

```bash
docker compose up --build
# API:       http://localhost:4000 (auto-runs migrations)
# Dashboard: http://localhost:4200

# Include the worker (needed for test execution)
docker compose --profile worker up --build

# Full stack including Redis
docker compose --profile full up --build
```

### Demo Accounts

After `npm run db:seed`, these accounts are available (local dev only — override via `DEMO_*_PASSWORD` env vars):

| Email | Default Password | Role |
|-------|------------------|------|
| `admin@perftest.io` | `admin123!` | admin |
| `editor@perftest.io` | `editor123!` | editor |
| `viewer@perftest.io` | `viewer123!` | viewer |
| `qa@perftest.io` | `qatest123!` | editor |
| `dev@perftest.io` | `devtest123!` | viewer |

> **Note:** Demo passwords are defaults for local development. Set `DEMO_ADMIN_PASSWORD`, `DEMO_EDITOR_PASSWORD`, `DEMO_VIEWER_PASSWORD`, or `DEMO_PASSWORD` env vars to override.

---

## Authentication & Security

### Login Flow

1. Navigate to `http://localhost:4200` — unauthenticated users are redirected to `/login`
2. Enter email and password → `POST /api/v1/auth/login`
3. API returns a **JWT token** — stored in `localStorage`, sent as `Authorization: Bearer <token>` on every request
4. On 401 (expired/missing token), the dashboard clears the session and redirects to `/login`
5. The sidebar shows the current user's name, email, and role
6. Admin users see a **Switch User** dropdown to impersonate other accounts

### Auth Endpoints

| Action | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| Register | `POST /auth/register` | Public | Create account (default: `viewer` role) |
| Login | `POST /auth/login` | Public | Authenticate → JWT + profile |
| Forgot password | `POST /auth/forgot-password` | Public | Request reset token (dev: shown in response) |
| Reset password | `POST /auth/reset-password` | Public | Set new password via reset token |
| Change password | `POST /auth/change-password` | Bearer | Change password for current user |
| Session upgrade | `POST /auth/session-upgrade` | Public | Migrate pre-JWT sessions (rate-limited, deprecated) |

### Security Hardening

| Feature | Details |
|---------|--------|
| **Global JWT auth guard** | All endpoints require `Bearer` token unless marked `@Public()` |
| **Rate limiting** | Auth endpoints: 5 req/60s; session-upgrade: 2 req/60s (`@nestjs/throttler`) |
| **Security headers** | Helmet middleware (X-Frame-Options, CSP, HSTS, X-Content-Type-Options) |
| **Password hashing** | `scryptSync` with 32-byte random salt, 64-byte derived key |
| **Token encryption** | GitHub tokens encrypted at rest with AES-256-GCM (`CryptoService`) |
| **Startup warnings** | Logs warnings if `JWT_SECRET` or `TOKEN_ENCRYPTION_KEY` use insecure defaults |
| **Reset token suppression** | Reset tokens hidden from API responses in production |
| **Input validation** | Global `ValidationPipe` with `class-validator` DTOs |
| **Body size limit** | JSON body limited to 1 MB |
| **Unified error messages** | Login errors never reveal whether an account exists |
| **UUID validation** | Session-upgrade validates UUID format to prevent enumeration |
| **DB credentials** | `DATABASE_URL` required in production — no hardcoded fallback |
| **Parameterized SQL** | All database queries use parameterized statements — no string interpolation |

---

## Dashboard Pages

20 pages organized into four navigation groups:

### Overview
| Page | Description |
|------|-------------|
| **Dashboard** | Home: overview counters, recent runs, KPI averages, metric relationship diagram |
| **Results** | Run results with Lighthouse scores, metric breakdowns, "no metrics" diagnostics |
| **Trends** | Time-series metric charts with IQR error bands and environment filtering |
| **Reports** | Executive summaries (7/30/90-day: CWV p75, pass rates, anomaly counts, trends) |
| **Knowledge** | Tabbed knowledge base: Metrics Glossary, Lighthouse Scores, Optimization Guide, Testing Methodology, Thresholds, Network Fundamentals |

### Testing
| Page | Description |
|------|-------------|
| **Runs** | Run list, manual launcher, run detail with gate results |
| **Scripts** | Script CRUD with template creation (Lighthouse Audit, Multi-Page Flow, SPA Navigation, etc.) |
| **Author** | Natural-language test authoring with pipeline visualization |
| **Load Test** | Load profiles, summary stats, status filter, completed-run metrics |
| **Schedules** | Cron-based schedule management with enable/disable toggles |

### Analysis
| Page | Description |
|------|-------------|
| **Gates** | Gate configuration (threshold, baseline, statistical, VU-tiered) with on-demand evaluation |
| **Compare** | Side-by-side run comparison with bar charts and diff table |
| **Anomalies** | Anomaly feed with filters, trend charts, severity badges, resolution workflow |
| **Intelligence** | SHAP attribution, forecasting, RUM summary, CrUX snapshots, capacity planning, mobile-vs-desktop, multi-geo |
| **Investigation** | Regression timeline, attribution panel, gate status, baseline comparison |
| **Audit** | Interactive Appendix C checklist with auto-evaluation and KPI reference guide |

### Admin
| Page | Description |
|------|-------------|
| **Users** | User management (admin-only): create, update roles, activate/deactivate, delete |
| **Settings** | Projects, notification channels, environments, WPT config, user profile |
| **Platform Health** | Platform self-monitoring, on-call rotation, quarterly practice reviews |

---

## Testing Engines

| Engine | Status | Description |
|--------|--------|-------------|
| Playwright + Lighthouse | ✅ Built-in | Core engine — headless Chrome, CWV metrics, Lighthouse audit |
| k6 Browser | ✅ Built-in | Concurrent load testing with staged VU ramp and saturation detection |
| WebPageTest | ✅ Opt-in | Private WPT instance adapter with rate limiting |
| sitespeed.io | ✅ Implemented | CLI/Docker execution, JSON parsing, metric aggregation |

See [Engine Guide](docs/ENGINE_GUIDE.md) for detailed setup and selection guidance.

---

## Quality Gates

| Gate Type | Description |
|-----------|-------------|
| **Threshold** | Static metric thresholds (e.g., LCP ≤ 2500ms) |
| **Baseline-relative** | Compare against baseline percentiles with CI-aware evaluation |
| **Statistical** | Mean ± N×stddev from baseline data with confidence intervals |
| **VU-tiered** | Thresholds that scale with concurrency level |
| **Server-resource floor** | CPU, memory, event-loop lag conditions from telemetry |
| **Capacity-floor** | Minimum sustainable VUs with headroom calculation |

Gates support **configurable quorum** (default: 3-of-5) with per-severity defaults. Gate overrides include an audit trail.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TanStack Query, Tailwind CSS 4, Recharts, Lucide React |
| **Backend** | NestJS 10, TypeScript 5, Node.js 20 |
| **Database** | PostgreSQL 16 (ClickHouse-ready per-request schema) |
| **Test Engines** | Playwright + Lighthouse, k6 Browser, WebPageTest, sitespeed.io |
| **Object Storage** | Local filesystem (S3-ready abstraction) |
| **CI/CD** | GitHub Actions (test → lint → build → migration verification) |
| **Containerization** | Docker, Docker Compose (multi-profile) |

---

## Testing

```bash
# Run all tests
npm test

# API unit tests (Jest)
npm test --workspace=packages/api       # 87 suites, 1050 tests

# Dashboard logic tests (Jest)
npm test --workspace=packages/dashboard  # 24 suites, 771 tests

# Worker engine + stats (Vitest)
npm test --workspace=packages/worker     # 10 suites, 205 tests

# Shared validators (Vitest)
npm test --workspace=packages/shared     # 1 suite, 135 tests

# Total: 122 suites, 2161 tests
```

---

## API Reference

All endpoints are prefixed with `/api/v1`. Authentication required unless noted.

<details>
<summary><strong>Core Resources</strong> (click to expand)</summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public) |
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/runs` | List runs (`?project_id=&user_id=&is_admin=`) |
| POST | `/runs` | Create (queue) a run |
| POST | `/runs/claim` | Worker claims next queued run (public) |
| GET | `/runs/:id` | Get run details |
| GET | `/runs/:id/gates` | Gate results for run |
| POST | `/runs/:id/complete` | Worker reports completion (public) |
| PATCH | `/runs/:id` | Update run |
| GET | `/scripts` | List scripts |
| POST | `/scripts` | Create script |
| GET | `/scripts/:id` | Get script |
| PATCH | `/scripts/:id` | Update script |
| DELETE | `/scripts/:id` | Delete script |

</details>

<details>
<summary><strong>Gates, Schedules &amp; Baselines</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gates` | List gates |
| POST | `/gates` | Create gate |
| PATCH | `/gates/:id` | Update gate |
| DELETE | `/gates/:id` | Delete gate |
| POST | `/gates/evaluate` | Evaluate gates against a run |
| GET | `/gates/results/:runId` | Gate results for a run |
| POST | `/gates/batch` | Batch create gates |
| GET | `/gates/yaml/export` | Export gates as YAML |
| POST | `/gates/yaml/sync` | Sync gates from YAML |
| GET | `/schedules` | List schedules |
| POST | `/schedules` | Create schedule |
| PATCH | `/schedules/:id` | Update schedule |
| DELETE | `/schedules/:id` | Delete schedule |
| GET | `/baselines` | List baselines |
| GET | `/baselines/active` | Active baseline |
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
| POST | `/analytics/canary` | Canary analysis (Mann-Whitney U) |
| GET | `/analytics/attribution` | Root-cause attribution |
| POST | `/reports/executive` | Generate executive report |
| GET | `/reports` | List reports |
| POST | `/authoring/generate` | NL test authoring |
| POST | `/intelligence/attribution` | SHAP attribution |
| POST | `/intelligence/forecast` | Prophet-style forecast |
| POST | `/intelligence/forecast/breach` | Forecast budget breach |
| POST | `/intelligence/rum/ingest` | Ingest RUM event (public) |
| GET | `/intelligence/rum/summary` | RUM p75 summary |
| GET | `/intelligence/rum/hourly` | RUM hourly aggregates |
| POST | `/intelligence/crux/fetch` | Fetch CrUX snapshot |
| POST | `/intelligence/capacity/report` | Capacity report |

</details>

<details>
<summary><strong>Load Testing</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/load/profiles` | List load profiles |
| POST | `/load/profiles` | Create load profile |
| PATCH | `/load/profiles/:id` | Update profile |
| DELETE | `/load/profiles/:id` | Delete profile |
| GET | `/load/runs` | List load runs |
| POST | `/load/runs` | Create load run |
| POST | `/load/runs/:id/cancel` | Cancel load run |
| GET | `/load/telemetry/:id` | Server resource snapshots |
| GET | `/load/correlation/:id` | Load-correlation analysis |
| POST | `/load/gates/evaluate` | Evaluate VU-parameterized gates |

</details>

<details>
<summary><strong>Auth, RBAC &amp; Admin</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register user (public) |
| POST | `/auth/login` | Login (public) |
| POST | `/auth/change-password` | Change password |
| POST | `/auth/forgot-password` | Forgot password (public) |
| POST | `/auth/reset-password` | Reset password (public) |
| GET | `/rbac/users` | List users |
| POST | `/rbac/users` | Create user |
| PATCH | `/rbac/users/:id` | Update user |
| DELETE | `/rbac/users/:id` | Delete user |
| GET | `/notifications/channels` | List channels |
| POST | `/notifications/channels` | Create channel |
| POST | `/notifications/test` | Send test notification |
| GET | `/intelligence/api-keys` | List API keys |
| POST | `/intelligence/api-keys` | Create API key |
| GET | `/platform-health` | Platform health check (public) |
| GET | `/budgets` | List performance budgets |
| POST | `/budgets` | Create budget |
| POST | `/budgets/ratchet/:projectId` | Ratchet budgets |

</details>

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `4000` | No | API server port |
| `DATABASE_URL` | dev fallback | **Production** | PostgreSQL connection string |
| `JWT_SECRET` | auto-generated | **Production** | HMAC secret for JWT signing (`openssl rand -hex 32`) |
| `TOKEN_ENCRYPTION_KEY` | auto-generated | **Production** | AES-256-GCM key for token encryption (`openssl rand -hex 32`) |
| `JWT_EXPIRES_SECONDS` | `86400` | No | JWT token lifetime (default: 24 hours) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | No | Dashboard → API URL |
| `API_URL` | `http://localhost:4000/api/v1` | No | Worker → API URL |
| `ARTIFACTS_DIR` | `./artifacts` | No | Artifact storage directory |
| `SCHEDULE_POLL_INTERVAL_MS` | `30000` | No | Schedule dispatcher interval |
| `POLL_INTERVAL_MS` | `5000` | No | Worker poll interval |
| `NODE_ENV` | `development` | No | `production` enforces `DATABASE_URL`, hides reset tokens |
| `WPT_SERVER` | — | No | WebPageTest server URL |
| `WPT_API_KEY` | — | No | WebPageTest API key |
| `CRUX_API_KEY` | — | No | Chrome UX Report API key |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System architecture, component diagrams, data flow |
| [User Guide](docs/USER_GUIDE.md) | Setup, configuration, and day-to-day usage |
| [Engine Guide](docs/ENGINE_GUIDE.md) | When to use each testing engine |
| [Enhancements](docs/ENHANCEMENTS.md) | Enhancement backlog v1 (E-01 to E-37) |
| [Enhancements V2](docs/ENHANCEMENTS_V2.md) | Enhancement backlog v2 (E-38 to E-73) |
| [Contributing](docs/CONTRIBUTING.md) | Development workflow and guidelines |

---

## License

MIT — see [LICENSE](LICENSE) for details.
