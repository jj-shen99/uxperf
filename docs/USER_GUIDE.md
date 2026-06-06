# User Guide — UI Performance Testing & Analysis Framework

Comprehensive guide for setting up, configuring, and using the framework for day-to-day performance testing and analysis.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Dashboard Overview](#dashboard-overview)
4. [Managing Projects](#managing-projects)
5. [Managing Scripts](#managing-scripts)
6. [Running Performance Tests](#running-performance-tests)
7. [Understanding Run Results](#understanding-run-results)
8. [Quality Gates](#quality-gates)
9. [Scheduled Runs](#scheduled-runs)
10. [Load Testing](#load-testing)
11. [Trends & Analysis](#trends--analysis)
12. [Anomalies & Intelligence](#anomalies--intelligence)
13. [User Management & RBAC](#user-management--rbac)
14. [Settings & Notifications](#settings--notifications)
15. [GitHub Integration](#github-integration)
16. [Troubleshooting](#troubleshooting)

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start Postgres

```bash
docker compose up -d postgres
```

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Seed demo users

```bash
npm run db:seed
```

This creates 5 accounts with passwords:

| Email | Password | Role |
|-------|----------|------|
| `admin@perftest.io` | `admin123!` | admin |
| `editor@perftest.io` | `editor123!` | editor |
| `viewer@perftest.io` | `viewer123!` | viewer |
| `qa@perftest.io` | `qatest123!` | editor |
| `dev@perftest.io` | `devtest123!` | viewer |

### 5. Install Playwright browsers

```bash
npx playwright install chromium --with-deps
```

Required for the worker to execute real performance tests.

### 6. Start the services

```bash
# Terminal 1: API server
npm run dev:api          # → http://localhost:4000

# Terminal 2: Dashboard
npm run dev:dashboard    # → http://localhost:4200

# Terminal 3: Worker (executes queued test runs)
npm run worker:poll
```

### 7. Open the dashboard

Navigate to **http://localhost:4200**. You will be redirected to the **login page**.
Sign in with one of the seed accounts above (e.g., `admin@perftest.io` / `admin123!`).

---

## Authentication

The framework uses **JWT-based authentication**. All API endpoints require a `Bearer` token unless explicitly marked public. All dashboard pages (except login, register, forgot-password, and reset-password) require an active session.

### Logging in

1. Navigate to `http://localhost:4200` — you are redirected to `/login`
2. Enter email and password, then click **Sign In**
3. The login page shows demo credentials for convenience
4. On success, you are redirected to the dashboard home

### Registering a new account

1. Click **Create an account** on the login page
2. Enter email, display name, and password (min 8 characters)
3. On success, you are redirected to login with a confirmation banner
4. New accounts are created with the **viewer** role by default

### Forgot / reset password

1. Click **Forgot password?** on the login page
2. Enter your email → a reset token is generated
3. In development mode, the token and a direct reset link are shown on screen
4. On the reset page, enter the token and your new password

### Changing your password

Go to **Settings** → **My Profile** → **Change Password**. Enter your current password and the new password.

### Logging out

Click the **Logout** button at the bottom of the sidebar. This clears your session and redirects to `/login`.

### Session management

- Sessions are stored in `localStorage` as `perf_user` (profile) and `auth_token` (JWT)
- The JWT token is sent as `Authorization: Bearer <token>` on every API request
- If the API returns 401 (expired/missing token), the dashboard clears the session and redirects to `/login`
- If the API reports updated user data (e.g., role change by admin), the session auto-refreshes
- JWT tokens expire after 24 hours by default (configurable via `JWT_EXPIRES_SECONDS`)

### Security notes

- **Production:** Set `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` in your `.env` file. The API logs warnings at startup if these are missing.
- **Demo passwords** (`admin123!`, etc.) are for local development only. Override via `DEMO_ADMIN_PASSWORD`, `DEMO_EDITOR_PASSWORD`, `DEMO_VIEWER_PASSWORD` env vars.
- Auth endpoints are rate-limited to **5 requests per 60 seconds**. Session-upgrade is limited to **2 per 60s**.

---

## Dashboard Overview

The sidebar organizes 23 pages into five groups:

### Overview
- **Dashboard** — Home with overview counters, Core Web Vitals, active runs, KPI averages, script/run statistics
- **Results** — Detailed run results with Lighthouse scores and metric breakdowns
- **Trends** — Time-series charts with environment filtering
- **Reports** — Executive performance summaries (7/30/90-day)
- **Knowledge** — Tabbed knowledge base: Metrics, Terminology, Lighthouse Scores, Optimization Guide, Testing Methodology, Thresholds, Network Fundamentals, Quality Gates, Browser Rendering

### Testing
- **Runs** — Run list, manual launcher, run detail with gate results
- **Scripts** — Script CRUD with template creation
- **Author** — Natural-language test authoring with pipeline visualization
- **Schedules** — Cron-based schedule management

### Load Testing
- **Load Test** — Load profiles, summary stats, status filtering, completed-run metrics
- **Load Results** — Detailed load test results with VU ramp visualization and telemetry

### Analysis
- **Gates** — Quality gate configuration (threshold, baseline, statistical, VU-tiered) with on-demand "Check Against Run" evaluation
- **Budgets** — Route-level performance budgets with ratchet-on-improvement and device-class thresholds
- **Compare** — Side-by-side run comparison with bar charts and diff table
- **Anomalies** — Anomaly feed with filters (project, time range, metric), trend charts, resolution actions
- **Intelligence** — Script-level analysis, SHAP attribution, forecasting, RUM summary, CrUX snapshots, capacity planning, decisions, mobile-vs-desktop, multi-geo
- **Investigation** — Regression timeline, attribution panel, gate status, baseline comparison
- **Audit** — Interactive Appendix C checklist with auto-evaluation and KPI reference guide

### Admin
- **Users** — User management (admin-only, sortable columns)
- **Settings** — Project management, notification channels, environments, WPT configuration, user profile
- **Platform Health** — Platform self-monitoring, on-call rotation management, quarterly practice reviews

---

## Managing Projects

Projects are the top-level organizational unit.

### Via dashboard

Go to **Settings** → create, edit, or delete projects (admin only).

### Via API

```bash
# Create
curl -X POST http://localhost:4000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "My App", "owner_team": "frontend"}'

# List
curl http://localhost:4000/api/v1/projects
```

---

## Managing Scripts

Scripts define test steps using a canonical JSON format.

### Create from template (dashboard)

1. Go to **Scripts** → **Create from Template**
2. Pick a template (Lighthouse Audit, Multi-Page Flow, SPA Navigation, API + UI, Mobile Viewport)
3. Enter a name, select a project, and provide a target URL
4. Click **Create**

### Authoring modes

| Mode | Description |
|------|-------------|
| `manual` | Hand-written JSON script steps |
| `describe` | Natural language prompt → generated steps |
| `record` | Browser session recording |
| `template` | Pre-built templates with variable substitution |

### Via API

```bash
curl -X POST http://localhost:4000/api/v1/scripts \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<project-uuid>",
    "name": "Homepage Audit",
    "canonical_json": {
      "steps": [
        {"action": "navigate", "url": "https://example.com"},
        {"action": "audit", "categories": ["performance", "accessibility"]}
      ]
    }
  }'
```

---

## Running Performance Tests

### From dashboard

1. Go to **Runs** → **New Run**
2. Enter Project ID, URL, number of iterations
3. Click **Launch** — the run is queued for the next available worker

### Via API

```bash
curl -X POST http://localhost:4000/api/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<project-uuid>",
    "config": {"url": "https://example.com", "n_runs": 5, "device": "desktop"}
  }'
```

### Run lifecycle

```
queued → running → completed | failed
```

---

## Understanding Run Results

### Core Web Vitals

| Metric | Good | Poor | Description |
|--------|------|------|-------------|
| **LCP** | ≤ 2500ms | > 4000ms | Largest Contentful Paint |
| **FCP** | ≤ 1800ms | > 3000ms | First Contentful Paint |
| **INP** | ≤ 200ms | > 500ms | Interaction to Next Paint |
| **CLS** | ≤ 0.1 | > 0.25 | Cumulative Layout Shift |
| **TTFB** | ≤ 800ms | > 1800ms | Time to First Byte |
| **TBT** | ≤ 200ms | > 600ms | Total Blocking Time |

### Lighthouse Scores

Four category scores (0-100): Performance, Accessibility, Best Practices, SEO.

Color coding: 🟢 90+ (good) · 🟡 50-89 (needs improvement) · 🔴 <50 (poor)

---

## Quality Gates

### Gate types

| Type | Description |
|------|-------------|
| `threshold` | Static value (e.g., LCP ≤ 2500ms) |
| `baseline_relative` | Compare against baseline percentiles (e.g., p75 + 10%) |
| `statistical` | Mean ± N×stddev from baseline |
| `vu_tiered` | Thresholds that scale with concurrency level |
| `resource_floor` | Server resource conditions (CPU, memory, event-loop lag) |
| `capacity_floor` | Minimum sustainable VUs |

### 3-of-5 Quorum

A gate only triggers if the metric fails in **at least 3 of the last 5 runs**.

### Policies

| Policy | Behavior |
|--------|----------|
| `block` | Fails CI check — blocks merge |
| `warn` | Warning only |
| `page` | Sends notification |

### Check Against Run

You can evaluate all enabled gates against a specific completed test run:

1. On the **Gates** page, click **Check Against Run**
2. Select a completed run from the dropdown
3. Click **Evaluate Gates** — results show pass/fail status, actual vs. threshold values, and quorum details

Via API:

```bash
curl -X POST http://localhost:4000/api/v1/gates/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"run_id": "<run-uuid>"}'
```

### Create via API

```bash
curl -X POST http://localhost:4000/api/v1/gates \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<uuid>",
    "name": "LCP under 2.5s",
    "definition": {"type": "threshold", "metric": "lcp", "operator": "lte", "threshold": 2500},
    "policy": "block"
  }'
```

---

## Scheduled Runs

### Cron format

```
┌───────── minute (0-59)
│ ┌─────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─ day of week (0-6)
* * * * *
```

| Expression | Description |
|------------|-------------|
| `0 0 * * *` | Daily at midnight |
| `0 */6 * * *` | Every 6 hours |
| `30 9 * * 1-5` | Weekdays at 9:30 AM |

Navigate to **Schedules** to create, enable/disable, and manage scheduled runs.

---

## Load Testing

### Overview

Load testing uses the **k6 browser adapter** with staged virtual user (VU) ramp.

### Load profiles

Configure reusable profiles with:
- **Stages** — VU count, duration, ramp type
- **Cache state** — cold, warm, or production-replay
- **Scrape targets** — Server metrics endpoints for telemetry

### Dashboard features

The **Load Test** page shows:
- **Summary stats** — Total, active, completed, failed runs, total VU-minutes, estimated cost
- **Status filter** — Filter runs by status
- **Completed run metrics** — Aggregated performance metrics from finished runs

### Cost estimation

VU-minutes are calculated from stage profiles. Per-project daily quotas can be enforced.

### Server telemetry

During load runs, the system scrapes CPU, memory, disk I/O, network, event-loop lag, and nginx metrics, then correlates them with the VU ramp curve.

---

## Trends & Analysis

### Trends page

- Time-series charts of any metric across runs
- Environment filtering
- Identify regressions by spotting upward trends

### Compare page

Side-by-side comparison of two runs:
- Bar charts for metric differences
- Diff table with color-coded deltas
- Waterfall and filmstrip placeholders

---

## Anomalies & Intelligence

### Anomalies

The **Anomalies** page shows detected performance regressions:
- **Filters** — by project, time range (7/14/30/90 days), metric
- **Severity** — info, warning, critical
- **Workflow** — open → acknowledged → resolved
- **Trend chart** — visual anomaly trend over time

### Intelligence page (tabbed, script-level filtering)

The Intelligence page supports **script-level analysis**: select a script from the dropdown to filter all tabs by that script's runs.

| Tab | Feature |
|-----|---------|
| **Health Overview** | Core Web Vitals health cards with script-level filtering and analysis |
| **Trends** | Metric trends across last 30 runs with regression/improvement detection |
| **Slowest Pages** | Top 10 slowest pages by LCP with per-URL aggregation |
| **Environments** | Environment-segmented performance comparison |
| **Score Distribution** | Lighthouse score histogram with avg/median/p90 |
| **Recommendations** | Auto-generated optimization recommendations based on metric health |
| **SHAP Attribution** | SHAP-based feature importance for regression root-cause |
| **Forecast** | Prophet-style time-series decomposition with prediction intervals |
| **RUM** | Real User Monitoring p75 summary and trends |
| **CrUX** | Chrome UX Report snapshots with CWV rating |
| **Capacity** | Saturation detection, headroom estimation, infrastructure recommendations |
| **Decisions** | Executive decision-driving dashboard with metric deltas and team KPIs |
| **Mobile vs Desktop** | Device-segmented comparison with mobile-aware thresholds |
| **Multi-Geo** | Cross-region performance comparison with TTFB physics-floor matrix |

### Executive reports

Generate rolling 7/30/90-day performance summaries including:
- Core Web Vitals p75 values
- Run/gate pass rates
- Anomaly counts
- Trend direction analysis

Reports can be scheduled as daily/weekly/monthly digests via Slack or webhooks.

---

## User Management & RBAC

### Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access — manage users, projects, channels, all settings. Can switch between user accounts via sidebar. |
| **Editor** | Run tests, create scripts, view all data within assigned projects |
| **Viewer** | Read-only dashboard and results access within assigned projects |

### Admin-only features

- **Users page** — only visible to admins; create users, assign roles, activate/deactivate, delete
- **Settings** — project create/delete, channel management restricted to admins
- **Switch User** — admin-only dropdown in the sidebar to impersonate other accounts

### Assigning roles

1. Log in as an admin user
2. Navigate to **Users** in the sidebar
3. Click the role dropdown next to any user
4. Select the new role (admin, editor, viewer) — changes take effect immediately

### User profile

Go to **Settings** → **My Profile** to:
- Update your display name
- View your email and role
- Change your password (requires current password)

### Logout

Click **Logout** at the bottom of the sidebar. This clears your session and redirects to the login page.

---

## Settings & Notifications

### Settings tabs

| Tab | Contents |
|-----|----------|
| **General** | Projects (sortable, admin create/delete), notification channels, environments |
| **My Profile** | Display name, email, password change |

### Notification channels

| Type | Description |
|------|-------------|
| Slack webhook | Posts to a Slack channel URL |
| Generic webhook | HTTP POST to any endpoint |
| Email | Placeholder for email integration |

Notifications are dispatched on gate failures and run completions.

---

## GitHub Integration

Include `git` metadata when completing a run to post results as GitHub Check Runs:

```bash
curl -X POST http://localhost:4000/api/v1/runs/<run-id>/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "success": true,
    "metrics": {"lcp_ms": 2100, "fcp_ms": 900},
    "git": {"owner": "org", "repo": "app", "sha": "abc123", "token": "ghp_xxx"}
  }'
```

| Conclusion | Meaning |
|------------|---------|
| ✅ `success` | All blocking gates passed |
| ⚠️ `neutral` | Warning gates failed, no blockers |
| ❌ `failure` | Blocking gates failed |

Token requires `checks:write` or `repo:status` permission.

---

## Troubleshooting

### API won't start
- Check Postgres is running: `docker compose ps`
- Verify `DATABASE_URL` is set
- Run migrations: `npm run db:migrate`

### Dashboard shows "Loading..." forever
- Verify API is running on port 4000
- Check browser console for network errors
- Ensure `NEXT_PUBLIC_API_URL` matches API port

### Run stays in "queued" status
- Start the worker: `npm run worker:poll`
- Verify worker can reach the API (`API_URL` env var)
- Ensure Playwright browsers are installed: `npx playwright install chromium`

### Login page shows but credentials don't work
- Run `npm run db:seed` to create/reset demo users with passwords
- Verify the API is running: `curl http://localhost:4000/api/v1/health`

### Redirected to /login repeatedly
- Clear `localStorage` in browser DevTools and try again
- Verify the API returns user data: `curl -X POST http://localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@perftest.io","password":"admin123!"}'`

### Gate results not showing
- Gates evaluate only for **completed** runs with metrics
- Verify gates are **enabled** for the project

### Empty user profile or missing logout button
- Hard refresh the browser (`Cmd+Shift+R`)
- Ensure the API is reachable at `/api/v1/rbac/users`

### Scripts page shows "No scripts yet" after creating
- Verify the API returned the script: `curl http://localhost:4000/api/v1/scripts`
- If non-admin, ensure project memberships are configured or check project access

### "JWT_SECRET not set" warning at startup
- This is expected in development — a random secret is auto-generated
- In production, set `JWT_SECRET` in your `.env` file: `openssl rand -hex 32`

### "TOKEN_ENCRYPTION_KEY not set" warning
- Same as above — set `TOKEN_ENCRYPTION_KEY` in `.env` for production
- Without it, GitHub token encryption uses a known default key
