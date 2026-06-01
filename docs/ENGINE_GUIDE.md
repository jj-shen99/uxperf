# Testing Engine Guide

Which engine to use, when, how, and where to configure it.

---

## Engine Overview

| Engine | Purpose | Status | Best For |
|--------|---------|--------|----------|
| **Playwright + Lighthouse** | Synthetic single-user performance testing | ✅ Built-in (default) | CWV measurement, Lighthouse audits, CI gates, regression detection |
| **k6 Browser** | Concurrent load testing with real browsers | ✅ Built-in (opt-in) | Load testing, VU ramp, saturation detection, capacity planning |
| **WebPageTest (WPT)** | Synthetic testing via private WPT instance | ✅ Built-in (opt-in) | Waterfall analysis, filmstrip comparison, multi-location testing, third-party validation |
| **sitespeed.io** | Alternative synthetic runner | 🔲 Placeholder | Future — Docker-based testing alternative |

---

## 1. Playwright + Lighthouse

### When to use

- **Default engine** for all synthetic performance testing
- Core Web Vitals measurement (LCP, FCP, INP, CLS, TTFB, TBT)
- Full Lighthouse audit (Performance, Accessibility, Best Practices, SEO scores)
- CI/CD quality gates — fast feedback on every PR
- Regression detection baselines
- Single-page and multi-page flow testing
- Desktop and mobile device emulation

### What it measures

| Metric | Source |
|--------|--------|
| LCP, FCP, CLS, TTFB, INP | Chrome DevTools Protocol (via Playwright) |
| TBT, SI (Speed Index), TTI | Lighthouse audit |
| Performance / Accessibility / SEO / Best Practices scores | Lighthouse |
| Total requests, transfer size, DOM load time | Navigation timing |

### How to use

**No setup required** — Playwright + Chromium is installed with `npx playwright install chromium --with-deps`.

#### From the Dashboard

1. Go to **Runs** → click **New Run**
2. Select a project, enter a URL, pick device (desktop/mobile), set iteration count
3. Click **Run** — the worker picks it up and executes via Playwright + Lighthouse

#### From the CLI

```bash
# One-off test
cd packages/worker
npm run run -- --url https://example.com

# Poll loop (continuously claims and executes queued runs)
npm run poll
```

#### From the API

```bash
curl -X POST http://localhost:4000/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "config": { "url": "https://example.com", "device": "desktop", "n_runs": 3 },
    "engine": "playwright_lighthouse",
    "mode": "single",
    "environment": "production"
  }'
```

### Where to configure

- **Environment variables**: none required (built-in)
- **Dashboard**: Runs page → New Run form
- **Throttling**: optional `throttling` object in run config (CPU slowdown, network)

---

## 2. k6 Browser

### When to use

- **Concurrent load testing** — how does your app perform under real browser load?
- VU (virtual user) ramp scenarios: gradual ramp-up, hold, ramp-down
- Saturation point detection — find when the app breaks under load
- Server resource correlation — correlate VU count with CPU, memory, latency
- Capacity planning — estimate maximum sustainable load
- VU-tiered quality gates — thresholds that scale with concurrency

### What it measures

| Metric | Source |
|--------|--------|
| LCP, FCP, CLS, TTFB, INP | k6 browser module (Chrome) |
| HTTP request duration (avg, p95, p99, median) | k6 HTTP metrics |
| Request count and rate | k6 HTTP metrics |
| VU count, iteration rate | k6 execution metrics |
| Saturation signals | Derived: p95 latency spike, throughput plateau, dropped iterations |

### How to use

**Prerequisites**: Install [k6](https://k6.io/docs/get-started/installation/) with browser support.

```bash
# macOS
brew install k6

# Enable the adapter
export K6_BROWSER_ENABLED=true
export K6_BINARY=k6          # default; set if k6 is elsewhere
```

#### From the Dashboard

1. Go to **Load Test** → click **New Profile**
2. Select a project, configure:
   - **URL** to test
   - **VU count** (target virtual users)
   - **Stages** (ramp-up/hold/ramp-down durations and target VUs)
   - **Cache state** (`warm`, `cold`, `production_replay`)
   - **Engine**: select `k6_browser` from the dropdown
3. Click **Create Profile**, then **Start Run**

#### From the API

```bash
# Create a load profile
curl -X POST http://localhost:4000/api/v1/load/profiles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "name": "Ramp to 50 VUs",
    "url": "https://example.com",
    "engine": "k6_browser",
    "target_vus": 50,
    "cache_state": "warm",
    "stages": [
      { "duration_s": 30, "target_vus": 10 },
      { "duration_s": 60, "target_vus": 50 },
      { "duration_s": 30, "target_vus": 0 }
    ]
  }'

# Start a load run
curl -X POST http://localhost:4000/api/v1/load/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "profile_id": "PROFILE_ID" }'
```

#### From YAML

```yaml
load_profiles:
  - name: "Homepage ramp"
    url: https://example.com
    stages:
      - ramp_to: 10
        duration: 30s
      - hold_for: 60s
      - ramp_down: 30s
    measures:
      - lcp
      - fcp
      - ttfb
```

### Where to configure

| Setting | Location |
|---------|----------|
| Enable k6 | `K6_BROWSER_ENABLED=true` env var on the worker |
| k6 binary path | `K6_BINARY` env var (default: `k6`) |
| Load profiles | Dashboard → Load Test page, or API |
| VU-tiered gates | Dashboard → Gates page (gate type: `vu_tiered`) |
| Saturation detection | Automatic — `SaturationDetectorService` analyzes after each load run |

---

## 3. WebPageTest (WPT)

### When to use

- **Waterfall analysis** — detailed request-level timing breakdown
- **Filmstrip comparison** — visual rendering timeline frame-by-frame
- **Multi-location testing** — test from geographically distributed WPT agents
- **Third-party validation** — independent measurement to cross-check Playwright results
- **Repeat-view testing** — measure cached vs. uncached performance
- When your organization runs a **private WPT instance**

### What it measures

| Metric | Source |
|--------|--------|
| TTFB, FCP, LCP, CLS, TBT | WPT median first-view results |
| Speed Index | WPT visual progress analysis |
| DOM content loaded, load event | Navigation timing |
| Total requests, bytes transferred | WPT resource count |
| Waterfall, filmstrip, video | WPT detailed artifacts |

### How to use

**Prerequisites**: A private WebPageTest instance with API access.

#### Configure via Dashboard UI (Recommended)

1. Go to **Settings** (admin only) → **Engine Configuration — WebPageTest**
2. Enter your **WPT Server URL** (e.g., `https://wpt.yourcompany.com`)
3. Enter your **WPT API Key**
4. Click **Save WPT Config** — a green "Configured" badge confirms it's active

#### Configure via Environment Variables

```bash
export WPT_SERVER=https://wpt.yourcompany.com
export WPT_API_KEY=your-api-key-here
```

#### From the Dashboard

1. Go to **Load Test** → create a new profile
2. Select **Engine**: `wpt` from the dropdown
3. Configure URL, device (desktop/mobile), iteration count
4. Run the test

#### From the API

```bash
curl -X POST http://localhost:4000/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "config": { "url": "https://example.com", "device": "desktop", "n_runs": 3 },
    "engine": "wpt",
    "mode": "single",
    "environment": "production"
  }'
```

### How it works internally

1. Worker submits test via `WPT_SERVER/runtest.php` with API key
2. Polls `WPT_SERVER/jsonResult.php` every 10 seconds (up to 5 minute timeout)
3. Extracts median first-view metrics from WPT response
4. Returns normalized `EngineRunResult` with standard CWV metrics

### Where to configure

| Setting | Location |
|---------|----------|
| WPT Server URL | Dashboard → Settings → Engine Configuration, or `WPT_SERVER` env var |
| WPT API Key | Dashboard → Settings → Engine Configuration, or `WPT_API_KEY` env var |
| Poll interval | Hardcoded: 10 seconds |
| Max wait time | Hardcoded: 5 minutes (300 seconds) |
| Mobile emulation | Automatic — sends `mobile=1&mobileDevice=Pixel5` when device is `mobile` |

---

## 4. sitespeed.io (Placeholder)

### When to use

- Alternative open-source synthetic runner
- Docker-based testing for containerized CI environments
- HAR-based analysis and Coach recommendations

### Status

Currently a **placeholder adapter**. The adapter interface exists but `run()` returns an error:

```
sitespeed.io adapter not yet implemented
```

### How to enable (future)

```bash
export SITESPEED_ENABLED=true
export SITESPEED_DOCKER_IMAGE=sitespeedio/sitespeed.io:latest  # optional
```

---

## Engine Selection Decision Tree

```
Is this a load/capacity test?
├── Yes → Use k6 Browser
│   ├── Need VU ramp scenarios? → k6 Browser
│   ├── Need saturation detection? → k6 Browser
│   └── Need server resource correlation? → k6 Browser
│
└── No → Synthetic (single-user) test
    ├── Need Lighthouse audit scores? → Playwright + Lighthouse
    ├── Need waterfall / filmstrip? → WebPageTest
    ├── Need multi-location? → WebPageTest (with geo dispatch)
    ├── Need CI/CD gate checks? → Playwright + Lighthouse (fastest)
    └── Default → Playwright + Lighthouse
```

## Quick Comparison

| Feature | Playwright+LH | k6 Browser | WPT | sitespeed.io |
|---------|:---:|:---:|:---:|:---:|
| Core Web Vitals | ✅ | ✅ | ✅ | 🔲 |
| Lighthouse scores | ✅ | — | ✅ (if enabled) | — |
| Concurrent VUs | — | ✅ | — | — |
| VU ramp stages | — | ✅ | — | — |
| Saturation detection | — | ✅ | — | — |
| Waterfall analysis | — | — | ✅ | 🔲 |
| Filmstrip / video | — | — | ✅ | 🔲 |
| Multi-location | — | — | ✅ | — |
| Repeat-view (cached) | — | — | ✅ | — |
| No external deps | ✅ | — | — | — |
| Setup required | None | Install k6 | Private WPT instance | Docker |
| Typical run time | 15–30s | 30s–10min | 30s–5min | 30s–2min |
| Best for CI gates | ✅ | — | — | — |
| Best for load tests | — | ✅ | — | — |

---

## Running the Worker

All engines execute through the **worker poll loop**. The worker must be running to process queued tests:

```bash
# Terminal 3 (alongside API on port 4000 and Dashboard on port 4200)
cd packages/worker
npm run poll
```

The worker:
1. Polls `POST /api/v1/runs/claim` every 5 seconds
2. Claims the next queued run
3. Routes to the appropriate engine adapter based on `run.engine`
4. Posts logs via `POST /api/v1/runs/:id/log`
5. Reports results via `POST /api/v1/runs/:id/complete`

### Environment Variables Summary

| Variable | Default | Engine | Description |
|----------|---------|--------|-------------|
| `K6_BROWSER_ENABLED` | `false` | k6 Browser | Enable k6 browser adapter |
| `K6_BINARY` | `k6` | k6 Browser | Path to k6 binary |
| `WPT_SERVER` | — | WPT | WebPageTest server URL |
| `WPT_API_KEY` | — | WPT | WebPageTest API key |
| `SITESPEED_ENABLED` | `false` | sitespeed.io | Enable sitespeed adapter |
| `SITESPEED_DOCKER_IMAGE` | `sitespeedio/sitespeed.io:latest` | sitespeed.io | Docker image |
| `POLL_INTERVAL_MS` | `5000` | All | Worker poll interval |
| `API_URL` | `http://localhost:4000/api/v1` | All | API base URL for worker |
