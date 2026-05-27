# User Guide — UI Performance Testing & Analysis Framework

Comprehensive guide for setting up, configuring, and using the framework for day-to-day performance testing and analysis.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Managing Projects](#managing-projects)
4. [Managing Scripts](#managing-scripts)
5. [Running Performance Tests](#running-performance-tests)
6. [Understanding Run Results](#understanding-run-results)
7. [Quality Gates](#quality-gates)
8. [Scheduled Runs](#scheduled-runs)
9. [Load Testing](#load-testing)
10. [Trends & Analysis](#trends--analysis)
11. [Anomalies & Intelligence](#anomalies--intelligence)
12. [User Management & RBAC](#user-management--rbac)
13. [Settings & Notifications](#settings--notifications)
14. [GitHub Integration](#github-integration)
15. [Troubleshooting](#troubleshooting)

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

### 4. Start the services

```bash
# Terminal 1: API server
npm run dev:api          # → http://localhost:4000

# Terminal 2: Dashboard
npm run dev:dashboard    # → http://localhost:4200
```

### 5. Open the dashboard

Navigate to **http://localhost:4200**. The first registered user is auto-selected.

---

## Dashboard Overview

The sidebar organizes 18 pages into four groups:

### Overview
- **Dashboard** — Home with overview counters, Core Web Vitals, active runs, KPI averages, script/run statistics
- **Results** — Detailed run results with Lighthouse scores and metric breakdowns
- **Trends** — Time-series charts with environment filtering
- **Reports** — Executive performance summaries (7/30/90-day)
- **Knowledge** — Documentation and reference

### Testing
- **Runs** — Run list, manual launcher, run detail with gate results
- **Scripts** — Script CRUD with template creation
- **Author** — Natural-language test authoring with pipeline visualization
- **Load Test** — Load profiles, summary stats, status filtering, completed-run metrics
- **Schedules** — Cron-based schedule management

### Analysis
- **Gates** — Quality gate configuration (threshold, baseline, statistical, VU-tiered)
- **Compare** — Side-by-side run comparison with bar charts and diff table
- **Anomalies** — Anomaly feed with filters (project, time range, metric), trend charts, resolution actions
- **Intelligence** — SHAP attribution, forecasting, RUM summary, CrUX snapshots, capacity planning

### Admin
- **Users** — User management (admin-only, sortable columns)
- **Settings** — Project management, notification channels, environments, user profile

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

### Intelligence page (tabbed)

| Tab | Feature |
|-----|---------|
| **Attribution** | SHAP-based feature importance for regression root-cause |
| **Forecasting** | Prophet-style time-series decomposition with prediction intervals |
| **RUM** | Real User Monitoring p75 summary and trends |
| **CrUX** | Chrome UX Report snapshots with CWV rating |
| **Capacity** | Saturation detection, headroom estimation, infrastructure recommendations |

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
| **Admin** | Full access — manage users, projects, channels, all settings |
| **Editor** | Run tests, create scripts, view all data |
| **Viewer** | Read-only dashboard and results access |

### Admin-only features

- **Users page** — only visible to admins
- **Settings** — project create/delete, channel management restricted to admins
- **User management** — create, update, delete users

### User profile

Go to **Settings** → **My Profile** to update display name, email, and password.

### Logout

Click **Logout** in the sidebar user switcher area (bottom of sidebar).

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
- Verify worker can reach the API

### Gate results not showing
- Gates evaluate only for **completed** runs with metrics
- Verify gates are **enabled** for the project

### Empty user profile or missing logout button
- Hard refresh the browser (`Cmd+Shift+R`)
- Ensure the API is reachable at `/api/v1/rbac/users`

### Scripts page shows "No scripts yet" after creating
- Verify the API returned the script: `curl http://localhost:4000/api/v1/scripts`
- If non-admin, ensure project memberships are configured or check project access
