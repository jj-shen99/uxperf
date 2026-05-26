# User Guide — Frontend Performance Testing Framework

This guide covers how to set up, configure, and use the performance testing framework for day-to-day work.

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
9. [Trends & Analysis](#trends--analysis)
10. [GitHub Integration](#github-integration)
11. [API Reference](#api-reference)
12. [Troubleshooting](#troubleshooting)

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start Postgres

Use Docker Compose or your own Postgres instance:

```bash
docker compose up -d postgres
```

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Start the services

```bash
# Terminal 1: API server (http://localhost:4000)
npm run dev:api

# Terminal 2: Dashboard (http://localhost:3000)
npm run dev:dashboard
```

### 5. Open the dashboard

Navigate to **http://localhost:3000** in your browser.

---

## Dashboard Overview

The dashboard sidebar provides navigation to all sections:

| Section | Description |
|---------|-------------|
| **Dashboard** | Home / overview |
| **Runs** | View all test runs, launch manual runs, view run details |
| **Scripts** | Manage test scripts (create, edit, delete) |
| **Trends** | Time-series charts of performance metrics across runs |
| **Gates** | Configure quality gates with thresholds |
| **Schedules** | Set up cron-based scheduled performance tests |

---

## Managing Projects

Projects are the top-level organizational unit. Each project has scripts, runs, gates, and schedules.

### Create a project

```bash
curl -X POST http://localhost:4000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "My App", "owner_team": "frontend"}'
```

### List projects

```bash
curl http://localhost:4000/api/v1/projects
```

---

## Managing Scripts

Scripts define what pages and actions to test. They use a canonical JSON format that supports multiple authoring modes.

### Create a script via API

```bash
curl -X POST http://localhost:4000/api/v1/scripts \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<project-uuid>",
    "name": "Homepage Load Test",
    "canonical_json": {
      "steps": [
        {"action": "navigate", "url": "https://example.com"},
        {"action": "wait", "selector": "#main-content"}
      ]
    },
    "authoring_mode": "manual"
  }'
```

### Create via dashboard

1. Navigate to **Scripts** in the sidebar
2. Click **New Script**
3. Fill in the project ID, name, and JSON steps
4. Click **Create**

### Authoring modes

| Mode | Description |
|------|-------------|
| `manual` | Hand-written JSON script steps |
| `describe` | Natural language prompt converted to steps |
| `record` | Browser session recording (future) |
| `template` | Pre-built templates with variable substitution (future) |

---

## Running Performance Tests

### Manual run from dashboard

1. Navigate to **Runs**
2. Click **New Run**
3. Enter:
   - **Project ID** — UUID of the project
   - **URL** — The page URL to test
   - **N runs** — Number of iterations (default: 5, recommended for stable medians)
4. Click **Launch**

The run will be queued and picked up by the next available worker.

### Manual run via API

```bash
curl -X POST http://localhost:4000/api/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<project-uuid>",
    "config": {
      "url": "https://example.com",
      "n_runs": 5,
      "device": "desktop"
    }
  }'
```

### Run lifecycle

```
queued → running → completed | failed
```

1. **Queued** — Run is created and waiting for a worker
2. **Running** — Worker has claimed the run and is executing
3. **Completed** — Metrics collected, gates evaluated, artifacts stored
4. **Failed** — An error occurred during execution

---

## Understanding Run Results

Click any run in the **Runs** list to view its details:

### Lighthouse Scores

Four category scores (0-100):
- **Performance** — Core web vitals and loading metrics
- **Accessibility** — WCAG compliance checks
- **Best Practices** — Modern web development practices
- **SEO** — Search engine optimization basics

Color coding: 🟢 90+ (good), 🟡 50-89 (needs improvement), 🔴 <50 (poor)

### Web Vitals

| Metric | Good | Poor | Description |
|--------|------|------|-------------|
| **LCP** | ≤ 2500ms | > 4000ms | Largest Contentful Paint — when the main content loads |
| **FCP** | ≤ 1800ms | > 3000ms | First Contentful Paint — when first content appears |
| **INP** | ≤ 200ms | > 500ms | Interaction to Next Paint — input responsiveness |
| **CLS** | ≤ 0.1 | > 0.25 | Cumulative Layout Shift — visual stability |
| **TTFB** | ≤ 800ms | > 1800ms | Time to First Byte — server response time |
| **TBT** | ≤ 200ms | > 600ms | Total Blocking Time — main thread blocking |

### Gate Results

If quality gates are configured, the run detail page shows which gates passed, failed, or were skipped, along with the quorum status.

---

## Quality Gates

Gates enforce performance standards. A gate defines a metric threshold and a failure policy.

### Create a gate

```bash
curl -X POST http://localhost:4000/api/v1/gates \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<project-uuid>",
    "name": "LCP must be under 2.5s",
    "definition": {
      "type": "threshold",
      "metric": "lcp",
      "operator": "lte",
      "threshold": 2500
    },
    "policy": "block"
  }'
```

### Gate definition fields

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `threshold` | Comparison type (more types in Phase 2) |
| `metric` | `lcp`, `fcp`, `inp`, `cls`, `ttfb`, `tbt`, `lighthouse_performance`, etc. | Which metric to evaluate |
| `operator` | `lte`, `gte`, `lt`, `gt` | Comparison operator |
| `threshold` | number | The threshold value |

### Gate policies

| Policy | Behavior |
|--------|----------|
| `block` | Fails the CI check — blocks merge |
| `warn` | Shows a warning but doesn't block |
| `page` | Sends a notification (future) |

### 3-of-5 Quorum

To avoid flaky failures, a gate only triggers if the metric fails in **at least 3 of the last 5 runs**. A single bad run won't block your pipeline.

### Manage gates in the dashboard

1. Navigate to **Gates**
2. View existing gates with toggle switches to enable/disable
3. Click **New Gate** to create one with the form
4. Delete gates with the trash button

---

## Scheduled Runs

Set up automated recurring performance tests using cron expressions.

### Create a schedule

```bash
curl -X POST http://localhost:4000/api/v1/schedules \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "<project-uuid>",
    "name": "Nightly homepage check",
    "cron_expression": "0 0 * * *",
    "config": {"url": "https://example.com", "n_runs": 5},
    "environment": "production"
  }'
```

### Cron expression format

```
┌───────── minute (0-59)
│ ┌─────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─ day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

### Common schedules

| Expression | Description |
|------------|-------------|
| `0 0 * * *` | Every day at midnight |
| `0 */6 * * *` | Every 6 hours |
| `30 9 * * 1-5` | Weekdays at 9:30 AM |
| `0 0 * * 0` | Every Sunday at midnight |

### Manage in dashboard

Navigate to **Schedules** to create, enable/disable, and delete schedules.

---

## Trends & Analysis

The **Trends** page shows time-series charts of your performance metrics across runs.

- Select metrics to display (LCP, FCP, CLS, Lighthouse scores, etc.)
- Identify regressions by spotting upward trends in timing metrics
- Compare before/after deployments

---

## GitHub Integration

Gate results can be automatically posted to GitHub as check runs or commit statuses.

### How it works

When completing a run via the API, include `git` metadata in the completion payload:

```bash
curl -X POST http://localhost:4000/api/v1/runs/<run-id>/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "success": true,
    "metrics": {"lcp_ms": 2100, "fcp_ms": 900},
    "git": {
      "owner": "my-org",
      "repo": "my-app",
      "sha": "abc123def456",
      "token": "ghp_xxxxx"
    }
  }'
```

### Check run conclusions

| Conclusion | Meaning |
|------------|---------|
| ✅ `success` | All blocking gates passed |
| ⚠️ `neutral` | Warning gates failed, no blockers |
| ❌ `failure` | One or more blocking gates failed |

### Required permissions

The GitHub token needs `checks:write` permission (for Check Runs) or `repo:status` (for commit statuses).

---

## API Reference

See the full API endpoint table in [README.md](../README.md#api-endpoints).

### Common patterns

**Filter by project:**
```
GET /api/v1/runs?project_id=<uuid>
GET /api/v1/scripts?project_id=<uuid>
GET /api/v1/gates?project_id=<uuid>
```

**Error responses:**
```json
{"statusCode": 404, "message": "Run <id> not found"}
```

---

## Troubleshooting

### API won't start

- Check that Postgres is running: `docker compose ps`
- Verify `DATABASE_URL` is set correctly
- Run migrations: `npm run db:migrate`

### Dashboard shows "Loading..." forever

- Verify the API is running on port 4000
- Check browser console for CORS or network errors
- Ensure `NEXT_PUBLIC_API_URL` matches the API port

### Run stays in "queued" status

- A worker must be running to claim queued runs
- Check worker logs: `npm run worker:run`
- Verify the worker can reach the API endpoint

### Gate results not showing

- Gates are only evaluated for **completed** runs with metrics
- Verify gates are **enabled** for the project
- Check that the gate metric name matches available metrics (e.g., `lcp` maps to `lcp_ms`)

### Path traversal error

- Run IDs and artifact filenames are validated against directory traversal
- Legitimate UUIDs and alphanumeric filenames always work
- If you see "Path traversal denied", check for special characters in run IDs
