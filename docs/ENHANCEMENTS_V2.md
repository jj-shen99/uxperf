# Enhancement Backlog — V2

Sourced from: *Measured: A Field Guide to UI Performance Testing and Analysis* (JJ Shen, 2026) — full book audit (Chapters 1–16, Appendices A–G).

This list identifies gaps between the book's prescriptions and the current codebase. Items already completed in ENHANCEMENTS.md (E-01 through E-37) are excluded.

## Status Legend
- **🔴 Not Started** — Feature does not exist in the codebase
- **🟡 Scaffold** — Partial/stub implementation exists
- **🟢 Done** — Fully implemented and tested

---

## Priority 1 — RUM & Field Measurement (Ch 6, 14–15)

The book's strongest architectural argument is that RUM is one of four essential pillars. The backend RUM ingestion service exists, but there is no client-side SDK to send beacons.

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-38 | **RUM SDK (client-side beacon script)** | � | Ch 6, p93–97; Ch 15, p253 | `packages/rum-sdk` with `initRum()`, sendBeacon/fetch transport, sampling, session tracking, build hash, feature flags, batch queue. `web-vitals` integration for LCP/FCP/INP/CLS/TTFB. 17 SDK tests. |
| E-39 | **RUM hourly aggregation (distribution storage)** | � | Ch 14, p236–237 | `RumAggregationService` rolls up raw events into `rum_hourly_aggregates` (p50/p75/p90/p95/p99 per route × device × geo). `purgeRawEvents()` for short retention. Migration 013. API endpoints for hourly/daily trends. 13 tests. |
| E-40 | **RUM dashboard — synthetic vs. field side-by-side** | � | Ch 14, p240; Ch 15, p254 | `SyntheticVsField` component showing lab median vs RUM p75 side-by-side with disagreement highlighting (none/mild/severe). Delta and agreement columns. |
| E-41 | **Custom journey metrics (mark/measure)** | � | Ch 6, p98–100 | `collectCustomMetrics()` and `rumMark()` helper in RUM SDK. Collects `performance.measure()` entries and ships them as `custom_metrics` JSONB in beacons. `build_hash` + `custom_metrics` columns added to `rum_events`. 5 custom metric tests. |

## Priority 2 — Statistical Rigor (Ch 5, 12, Appendix G)

The book emphasizes that comparing two point estimates without confidence intervals is lying with data.

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-42 | **Percentile confidence intervals** | � | App G, p233–235 | Binomial rank CI method in `percentile-ci.ts`. CI stored in baselines (`ci_p75_lower/upper/reliable`). Gate evaluation uses CI upper bound to prevent false positives. `ConfidenceIntervalBar` + `GateResultCI` UI components. 22 CI tests + 20 gate-CI tests. |
| E-43 | **Variance-aware run aggregation** | � | Ch 5, p82–85; Ch 12, p149 | `varianceStats()` (median/IQR/mean/stddev/min/max) and `compareMetric()` (IQR overlap significance test) in worker stats. `percentile()` function. 19 tests covering stats, comparison, and significance detection. |
| E-44 | **Seasonality-aware baselines** | � | Ch 14, p238; App G, p237 | `computeSeasonalBaselines()` generates baselines per DOW (0–6) and optional hour bucket (morning/afternoon/evening/night). `computeBaseline()` adds `EXTRACT(DOW/HOUR)` filters when `day_of_week`/`hour_bucket` provided. `findActive()` prefers seasonal matches over global. 10 seasonality tests. |

## Priority 3 — Gate Enrichment (Ch 12–14)

The book describes a family of gate types; several are missing or only partially wired.

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-45 | **Baseline-relative gates** | � | Ch 14, p239 | CI-aware `evaluateBaselineRelative()` in gates service. Uses CI upper bound + regression_pct when reliable. Supports `baseline_stat` (p50/p75/p95/mean) and configurable `regression_pct`. 9 baseline gate tests. |
| E-46 | **Statistical gates (rolling median ± Nσ)** | � | Ch 14, p239 | CI-aware `evaluateStatistical()` in gates service. Fires when metric > mean + N*stddev (default N=2). Propagates CI info from baselines. Wired into gate evaluation pipeline with quorum. 7 statistical gate tests. |
| E-47 | **Per-severity quorum configuration** | � | Ch 14, p240–241 | `checkQuorum()` now uses policy-driven defaults: warn/advisory=1-of-3, block=3-of-5, page=4-of-5. `QuorumConfig` interface for gate-level `window_size`/`required_failures` overrides. `getQuorumDefaults()` maps policy→thresholds. 6 quorum tests. |
| E-48 | **Gate YAML config file** | � | Ch 15, p258–259 | `GateYamlConfigService` with `parseYaml()` (built-in parser, no ext dep), `toCreateDto()`, and `syncFromYaml()` (create/update/disable gates from YAML). Supports all gate types, quorum config, VU tiers. 10 YAML config tests. |

## Priority 4 — CI/CD Integration (Ch 13, 15)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-49 | **PR comment — single-comment gate summary** | � | Ch 13, p167; Ch 15, p260 | Enhanced `buildDetailsTable()` with baseline comparison, delta-from-baseline (%), CI info, computed thresholds, and per-severity quorum detail. Fixed bug showing `undefined` for baseline/statistical gates. `fmtNum()` helper. |
| E-50 | **Commit status on production deploys** | � | Ch 14, p244; Ch 15, p260 | `DeployWatchService` with `registerDeploy()`, `evaluateDeploy()` (compare RUM p75 vs baseline), `evaluateAllPending()`. Posts GitHub commit status via `reportCommitStatus()`. Expiry at 48h, min 30 RUM samples, 15% regression threshold. Migration 014 for `deploy_watches` table. 9 deploy watch tests. |
| E-51 | **Pre-commit bundle-size check** | 🔴 | Ch 13, p211–212 | Lint-level check: if `package.json` adds a dependency, estimate the bundle-size impact and warn before commit. Not a full gate — a fast pre-commit sanity check. |
| E-52 | **Staging smoke-test gate** | 🔴 | Ch 13, p215 | Run a reduced synthetic suite against staging per deploy (not per PR). Separate from PR gates — this is the "staging as sanity check" pattern. |

## Priority 5 — Load Testing Enhancements (Ch 8, 14–15)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-53 | **Load test YAML definition** | 🔴 | Ch 15, p255–256 | Mirror the synthetic YAML format for load tests: profile (ramp_to, hold_for, ramp_down), stages (same journey DSL), measure list. Currently load profiles are DB-only records. |
| E-54 | **Saturation point auto-detection** | 🟡 | Ch 14, p242; Ch 15, p257 | Detect the VU count at which p95 latency crosses a threshold or throughput plateaus. `saturation_warnings` column exists in `load_runs` but no automated detector is wired. |
| E-55 | **Load + synthetic + RUM correlation view** | 🔴 | Ch 14, p234; Ch 15, p256 | Dashboard view that overlays load test results with synthetic and RUM data for the same route, showing how single-user metrics degrade under concurrency. |

## Priority 6 — Intelligence Layer (Ch 14, App G)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-56 | **Change-point → anomaly auto-creation** | � | Ch 14, p243 | `RunOrchestratorService` calls `AnomaliesService.analyzeProject()` after each successful run. Change-point detection → anomaly creation → notification dispatch fully wired. 6 orchestrator tests. |
| E-57 | **Attribution panel (SHAP + deploy correlation)** | 🟡 | Ch 14, p243–244; Ch 15, p261 | When a regression fires, show a ranked list of changes within the change-point window (PRs, dependency updates, infra changes). SHAP service exists but isn't wired to the anomaly investigation UI. |
| E-58 | **Investigation view (regression timeline)** | 🔴 | Ch 15, p260–261 | A dedicated dashboard page for investigating a regression: change-point timeline, attribution panel, bundle diff, gate status, baseline comparison — all in one view instead of separate tabs. |
| E-59 | **Forecast breach → notification wiring** | � | Ch 14, p179, 244 | `checkAndNotifyBreaches()` in ForecastingService dispatches `forecast_breach` events via NotificationsService. API endpoint at `/intelligence/forecast/breach-notify`. `ForecastBreachPanel` UI component. 6 notification tests. |

## Priority 7 — Dashboard & UX (Ch 14–16)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-60 | **Decision-driving dashboard (Ch 16 "Practice Four")** | 🟡 | Ch 16, p274–276 | The current dashboard shows absolutes. The book prescribes deltas-since-last-review, team-segmented headline numbers, and a small number of actionable KPIs rather than a wall of charts. |
| E-61 | **Mobile-first segment (desktop/mobile side-by-side)** | 🔴 | Ch 14, p247–248; Ch 15, p264 | Default landing page showing desktop and mobile metrics side by side. Mobile baselines stored independently. Device-class-scoped gates (partially done in E-31 for budgets, not for baselines/gates). |
| E-62 | **Multi-geo dashboard view** | 🟡 | Ch 15, p263 | `MultiGeoService` exists but the dashboard has no geo comparison view. Need a page showing side-by-side regional metrics with TTFB physics-floor annotation. |
| E-63 | **Error bars on all metric charts** | 🔴 | Ch 5, p82; App G, p233 | All time-series charts should show confidence intervals / IQR shading, not just point estimates. Currently all charts render single lines. |
| E-64 | **Audit checklist page (Appendix C)** | 🔴 | App C, p221–224 | Interactive version of the book's Appendix C audit checklist: measurement hygiene, load, runtime, memory, network, budgets, culture — with per-item status tracking per project. |

## Priority 8 — Observability & Operations (Ch 14–16)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-65 | **Platform health self-monitoring** | 🔴 | Ch 14, p245 | Health checks on the platform itself — alerts when the platform stops reporting, explicit policy for gate behavior during platform outages (default-safe: pause rather than auto-pass). |
| E-66 | **On-call rotation management** | 🔴 | Ch 16, p270–272 | Support for a perf on-call rotation: cross-team rotation, severity-gated paging, and explicit authority to roll back. Integrates with the notification dispatcher. |
| E-67 | **Quarterly practice review prompts** | 🔴 | Ch 16, p277 | Scheduled prompts (cron-based) asking: "Are budgets still right? Is the on-call rotation working? Is the alert channel muted?" — surfaces drift in the performance practice. |

## Priority 9 — Pluggable Adapters (Ch 14–15)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-68 | **Pluggable engine adapter protocol** | 🟡 | Ch 15, p263 | Formalize the adapter protocol: `run(test_definition) → run_payload`. Playwright, k6, WPT, and Sitespeed adapters exist as files but don't share a formal interface. Need a typed protocol + adapter registry. |
| E-69 | **Sitespeed.io adapter (real implementation)** | 🔴 | Ch 5, p77; Ch 15, p263 | `sitespeed-adapter.ts` is a placeholder. Implement real Sitespeed.io integration as an alternative synthetic runner. |
| E-70 | **RUM adapter protocol** | 🔴 | Ch 15, p263 | Allow swapping the RUM data source (default: own SDK; alternatives: SpeedCurve, Datadog RUM). Requires a common RUM ingestion protocol that normalizes external beacons. |

## Priority 10 — Testing & Quality (Ch 5, 12, App G)

| # | Enhancement | Status | Book Ref | Description |
|---|-------------|--------|----------|-------------|
| E-71 | **End-to-end regression lifecycle test** | 🔴 | Ch 15, p259–262 | Integration test covering the full lifecycle: create test → run → detect regression → fire gate → create anomaly → notify → investigate → fix → baseline update. Currently each piece is tested in isolation. |
| E-72 | **Statistical gate unit tests** | � | App G, p233–238 | 22 percentile CI tests, 20 gate enhancement tests (E-42/E-45/E-46), 6 anomaly wiring tests (E-56), 6 forecast notification tests (E-59). 54 new tests total across 4 test files. |
| E-73 | **Load test correlation tests** | 🔴 | Ch 14, p242 | Tests for Pearson correlation between VU ramp and server metrics, saturation point detection accuracy, and VU-tiered gate evaluation under simulated load curves. |

---

_Last updated: 2026-05-31. E-38–50, E-56, E-59, E-72 implemented. Cross-referenced against existing codebase (E-01–E-50, E-56, E-59, E-72 completed). Bug fixes: RUM ingestion missing custom_metrics/build_hash columns; scheduleFlush one-shot bug; aggregateResults double-pick; SQL interval string interpolation → MAKE_INTERVAL._
