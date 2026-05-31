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
| E-18 | Compare page improvements | 🔴 | Side-by-side diff charts. |
| E-19 | Trend sparklines on dashboard | 🔴 | Mini charts on project overview. |

## Priority 6 — Testing & Infrastructure (E-20–E-27)

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-20 | Gates batch/dedup tests | � | 10 tests added. |
| E-21 | Environments module tests | � | 6 tests added. |
| E-22 | Database module tests | 🔴 | 2 source files, 0 tests. |
| E-23 | Worker metrics-collector tests | � | 7 tests added. |
| E-24 | Dashboard page-level tests | 🟡 | Logic tests exist, no component tests. |
| E-25 | Docker Compose orchestration | 🟡 | Dockerfiles exist, no compose. |
| E-26 | CI pipeline (GitHub Actions) | 🟡 | Disabled triggers. |
| E-27 | Database migrations versioning | 🟡 | Need idempotency verification. |

---

_Last updated: 2026-05-30 (E-01–E-07, E-11–E-13, E-20–E-21, E-23, E-28–E-37 implemented)_
