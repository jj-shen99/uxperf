# Enhancement Backlog

Sourced from: *Measured: A Field Guide to UI Performance Testing and Analysis* (JJ Shen, 2026) — Chapters 12–16 and Appendices.

## Status Legend
- **🔴 Not Started** — Feature does not exist in the codebase
- **🟡 Scaffold** — Partial/stub implementation exists
- **🟢 Done** — Fully implemented and tested

---

## Priority 1 — Book-Driven (Ch 12–16): Intelligence & Budgets

These are the highest-impact gaps between the book's prescriptions and the current codebase.

| # | Enhancement | Status | Book Ref | Notes |
|---|-------------|--------|----------|-------|
| E-28 | **Performance budget service** — route-level budgets with ratcheting | � | Ch 12, p145–156 | `budgets/budgets.service.ts`: full CRUD, per-route budget entity, policy (block/warn/info), REST controller + module. 28 unit tests. |
| E-29 | **Budget ratchet-on-improvement** — auto-tighten thresholds when wins ship | � | Ch 12, p153 | `ratchetBudgets()`: compares baseline p75 + ratchet_pct cushion; only tightens, never loosens. POST `/budgets/ratchet`. |
| E-30 | **Variance-aware gate thresholds** — noise-tolerant budget enforcement | � | Ch 12, p149–151 | `evaluate()` with `variance_tolerance * stddev` band. Reports `within_noise_band` when value exceeds raw threshold but is within effective. |
| E-31 | **Device-class-specific budgets** — separate mobile/desktop thresholds | � | Ch 12, p154–155 | `device_class` column (`desktop`/`mobile`/`all`). Same metric can have separate thresholds per device class. Dedup per route+metric+device. |
| E-32 | **HAR capture (full network waterfall)** — per-resource timing data | � | Ch 6, 14 | `har-collector.ts`: per-resource entries via `page.on('request'/'response')`, third-party detection, timing estimates, summary with by-type/slowest/largest. 10 tests. |

## Priority 2 — Book-Driven (Ch 13–14): CI/CD & Platform Pattern

| # | Enhancement | Status | Book Ref | Notes |
|---|-------------|--------|----------|-------|
| E-33 | **PR bot / GitHub Check Run integration** — single-comment gate summary | � | Ch 13, p167 | `upsertPrComment()`: marker-based upsert of single PR comment with collapsible `<details>` sections for blocking/warnings/passed. 9 tests. |
| E-34 | **Gate override with audit trail** — engineer can acknowledge + proceed | � | Ch 12, p155; Ch 13, p168 | `gate-overrides.service.ts`: CRUD, approve/reject workflow, TTL expiry, `hasActiveOverride()`, audit trail endpoint. DB migration 011. 10 tests. |
| E-35 | **Canary deployment analysis** — compare canary vs baseline RUM cohorts | � | Ch 13, p162–164 | `canary-analysis.service.ts`: Mann-Whitney U test, multi-metric analysis, cohort stats (mean/median/p75/p95/stddev). POST `/analytics/canary`. 12 tests. |
| E-36 | **Anomaly → notification wiring** — auto-dispatch on change-point detection | � | Ch 14, p181–182 | `analyzeProject()` now dispatches `anomaly_detected` via `NotificationsService.dispatch()` for each new anomaly. Graceful failure on dispatch error. 5 tests. |
| E-37 | **Forecasting breach warnings** — "budget breach in N weeks" alerts | � | Ch 14, p179; App G, p237 | `projectBreach()`: forecast + threshold crossing detection with confidence levels. `checkAllBudgetBreaches()` for batch. POST `/intelligence/forecast/breach`. 6 tests. |

## Priority 3 — Engine & Runner (E-01–E-07)

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-01 | YAML test definition format | 🟢 | `journey/parser.ts`: YAML parser, validator, step compiler. 24 tests. |
| E-02 | Multi-step journey execution | � | `journey/executor.ts`: 9 action types, smart locators. 24 tests. |
| E-03 | `measure` directive | 🟢 | On-demand Web Vitals capture with labels. |
| E-04 | Per-step screenshots | 🟢 | Base64 PNG, configurable, graceful failure. |
| E-05 | Inter-stage timing | 🟢 | ISO timestamps + `duration_ms` per step. |
| E-06 | Full network waterfall | � | HAR collector wired into journey executor. `captureHar` option (default true). HAR entries + summary included in `JourneyResult`. 4 tests. |
| E-07 | NL → executable Playwright | � | `generatePlaywrightCode()`: converts JSON script to runnable Playwright TS with intent-based action mapping, mobile device config, and perf assertions. POST `/authoring/generate-code`. 11 tests. |

## Priority 4 — Quality Gates (E-08–E-13)

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-08 | Duplicate gate prevention | 🟢 | 409 on duplicate name+project. Batch skips. |
| E-09 | Gates grouped by project | 🟢 | UI project sections with filter. |
| E-10 | Template batch apply with dedup | 🟢 | Batch apply with created/skipped feedback. |
| E-11 | VU-tiered gates | � | `evaluateVuTiered()`: sorted tiers matched by VU count, per-tier operator override, fallback to basic threshold. 9 tests. |
| E-12 | Resource floor gates | � | `evaluateResourceFloor()`: CPU/memory/disk/network floor enforcement with alternative metric key lookup. 7 tests. |
| E-13 | Capacity floor gates | � | `evaluateCapacityFloor()`: RPS/concurrent-users/throughput minimum enforcement. 7 tests. |

## Priority 5 — Dashboard & UX (E-14–E-19)

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-14 | Knowledge — Quality Gates tab | 🟢 | Done. |
| E-15 | Knowledge — Browser Rendering tab | 🟢 | Done. |
| E-16 | Knowledge — Glossary filter | 🟢 | Done. |
| E-17 | Quorum-saved status in eval UI | 🟢 | Done. |
| E-18 | Compare page improvements | � | Diff summary badges, regression/improvement indicators, horizontal diff bars, HAR waterfall comparison, `compare-utils.ts` with 21 tests. |
| E-19 | Trend sparklines on dashboard | � | SVG polyline sparklines on KPI cards, trend detection (up/down/flat), `sparkline-utils.ts` with 19 tests. |

## Priority 6 — Testing & Infrastructure (E-20–E-27)

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-20 | Gates batch/dedup tests | � | 10 tests added. |
| E-21 | Environments module tests | � | 6 tests added. |
| E-22 | Database module tests | � | 10 tests: Pool construction, query delegation, param passing, error propagation, generic types, module destroy, module export. |
| E-23 | Worker metrics-collector tests | � | 7 tests added. |
| E-24 | Dashboard page-level tests | � | 74 page-logic tests: anomalies detection/severity/trend, trends stats/filtering/toggle, schedules cron/form/script-filter, author pipeline/form/device, reports direction/CWV, users role/sort, intelligence tabs/forecast, time range. |
| E-25 | Docker Compose orchestration | � | Full compose with migrate service, healthchecks, restart policies, resource limits, networks, env var defaults, Redis (opt-in), profiles. 16 infra tests. |
| E-26 | CI pipeline (GitHub Actions) | � | Enabled push/PR triggers, split into parallel jobs (test-api, test-worker, test-dashboard, test-shared, lint-and-build, db-migration-test), concurrency control, migration idempotency check. 14 infra tests. |
| E-27 | Database migrations versioning | � | All 11 migrations made idempotent (IF NOT EXISTS for tables/indexes/types/columns, DROP IF EXISTS guards for triggers). 56 idempotency verification tests scanning every .up.sql and .down.sql file. |

## Priority 7 — Recent Enhancements (E-74–E-80)

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-74 | **Knowledge tab restructure** — Glossary moved to Terminology tab | Done | Renamed "Metrics & Glossary" tab to "Metrics". Performance Metrics Glossary section relocated to the Terminology tab with filtering. Tests updated. |
| E-75 | **EWMA terminology fix** — formula and detailed explanation | Done | EWMA entry now includes the formula EWMA_t = alpha * x_t + (1 - alpha) * EWMA_{t-1} and explains z-score anomaly triggering. |
| E-76 | **Script-level intelligence** — per-script analysis across all tabs | Done | Script picker dropdown on `/intelligence`. Filters `completed` runs by `script_id` so all tabs (overview, trends, slowest pages, environments, scores, recommendations, decisions, mobile vs desktop) show script-filtered data. Script Analysis panel with aggregated metrics vs project average. |
| E-77 | **Budgets page** — route-level budget management UI | Done | `/budgets` page with project selector, create/delete budgets, route grouping, ratchet-on-improvement action. Wired to budgets API. |
| E-78 | **Load Results page** — separate page for load test results | Done | `/load-results` page with detailed load run results, VU ramp visualization, telemetry data. |
| E-79 | **Audit checklist page** — interactive Appendix C audit | Done | `/audit` page with 7 audit categories, auto-evaluation, per-item status tracking, weighted scoring, KPI reference guide. |
| E-80 | **Platform Health page** — self-monitoring and on-call | Done | `/platform-health` page with platform self-monitoring, on-call rotation management, quarterly practice reviews. |

## Backlog — Not Yet Started

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-81 | **Script-level intelligence API queries** — filter SHAP/forecast/RUM/CrUX/capacity by script | Not Started | API-backed tabs (Attribution, Forecast, RUM, CrUX, Capacity) fetch by `projectId` only; script filter not forwarded to API calls. |
| E-82 | **RUM SDK distribution** — npm-publishable `@uxperf/rum-sdk` package | Not Started | SDK exists but has no `package.json` build pipeline or npm publish workflow. |
| E-83 | **Pluggable engine adapter protocol** — typed interface + adapter registry | Scaffold | Adapters exist as files but don't share a formal `EngineAdapter` interface. Need typed protocol + registration. |
| E-84 | **Load test correlation tests** — Pearson correlation accuracy tests | Not Started | Tests for Pearson correlation between VU ramp and server metrics, saturation point detection accuracy. |
| E-85 | **E2E Playwright tests for dashboard** — browser-based integration tests | Not Started | No Playwright E2E tests for the dashboard; only unit/logic tests exist. |
| E-86 | **Dark/light theme toggle** — user-selectable theme | Not Started | Dashboard is dark-only; no theme toggle or system preference detection. |
| E-87 | **Export reports as PDF** — executive report PDF generation | Not Started | Reports page shows data in HTML only; no PDF export capability. |
| E-88 | **Webhook retry with backoff** — notification delivery reliability | Not Started | Webhook notifications fire once with no retry on failure. |
| E-89 | **Run artifact viewer** — view screenshots, HAR, Lighthouse JSON in-app | Scaffold | Artifacts are stored on disk; no in-app viewer beyond raw JSON links. |
| E-90 | **Script version diffing** — visual diff between script versions | Not Started | Script versioning exists but no diff UI between versions. |

---

_Last updated: 2026-06-05. 80 enhancements implemented (E-01–E-80). 88 API suites (1094 tests), 29 dashboard suites (1153 tests), 10 worker suites (222 tests), 1 shared suite (135 tests) — **2604 tests total**._
