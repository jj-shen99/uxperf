# Enhancement Backlog

## Status Legend
- **🔴 Not Started** — Feature does not exist in the codebase
- **🟡 Scaffold** — Partial/stub implementation exists
- **🟢 Done** — Fully implemented and tested

---

## Engine & Runner

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-01 | YAML test definition format | � | `journey/parser.ts`: built-in YAML parser, `validateDefinition()`, `compileSteps()`. Supports name, target, device, stages. 24 unit tests. |
| E-02 | Multi-step journey execution | � | `journey/executor.ts`: 9 action types (visit, click, fill, scroll, wait_for, hover, select, press, measure). Smart locator resolution (CSS, text, XPath). 24 unit tests. |
| E-03 | `measure` directive | � | Captures Web Vitals, page timings, and resource summary on demand. Supports multiple measure points per journey with labels. |
| E-04 | Per-step screenshots | � | Base64 PNG screenshot after each non-measure step. Configurable via `screenshots: true/false`. Graceful failure handling. |
| E-05 | Inter-stage timing | � | ISO timestamps (`started_at`, `finished_at`) and `duration_ms` per step. `total_duration_ms` for entire journey. |
| E-06 | Full network waterfall | 🟡 | Only `total_requests` and `total_transfer_size_bytes`. Need per-resource HAR capture via `page.on('response')`. |
| E-07 | NL → executable Playwright | 🟡 | `nl-authoring.service.ts` has 6-stage pipeline scaffold but generates JSON script objects, not runnable Playwright code. |

## Quality Gates

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-08 | Duplicate gate prevention | 🟢 | API rejects same name+project with 409. Batch endpoint skips duplicates. |
| E-09 | Gates grouped by project | 🟢 | UI shows project sections with filter dropdown. |
| E-10 | Template batch apply with dedup | 🟢 | Select/deselect templates, apply all at once, shows created/skipped feedback. |
| E-11 | VU-tiered gates | 🟡 | Schema supports `vu_thresholds` column but no evaluation logic. |
| E-12 | Resource floor gates | 🟡 | Schema supports `resource_floor_conditions` column but no evaluation logic. |
| E-13 | Capacity floor gates | 🟡 | Schema supports `capacity_floor` column but no evaluation logic. |

## Dashboard & UX

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-14 | Knowledge page — Quality Gates tab | 🟢 | Detailed gate type explanations, quorum visual, policy descriptions. |
| E-15 | Knowledge page — Browser Rendering tab | 🟢 | Critical rendering path, pipeline stages, metric mapping. |
| E-16 | Knowledge page — Glossary filter | 🟢 | Text search across metric names, descriptions. |
| E-17 | Quorum-saved status in evaluation UI | 🟢 | Shows "missed" (yellow) when single run fails but quorum not reached. |
| E-18 | Compare page improvements | 🔴 | Side-by-side run comparison could show diff charts. |
| E-19 | Trend sparklines on dashboard | 🔴 | Mini charts showing metric trends on project overview. |

## Testing

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-20 | Gates batch/dedup tests | 🔴 | New `batchCreate` and duplicate rejection in `create` need spec coverage. |
| E-21 | Environments module tests | 🔴 | 3 source files, 0 test files. |
| E-22 | Database module tests | 🔴 | 2 source files, 0 test files. |
| E-23 | Worker metrics-collector tests | 🔴 | `metrics-collector.ts` has no test file. |
| E-24 | Dashboard page-level tests | 🟡 | 9 test files cover logic/helpers but no page-component tests for gates, knowledge, schedules, etc. |

## Infrastructure

| # | Enhancement | Status | Notes |
|---|-------------|--------|-------|
| E-25 | Docker Compose orchestration | 🟡 | Individual Dockerfiles exist but no `docker-compose.yml` for full-stack local dev. |
| E-26 | CI pipeline (GitHub Actions) | 🟡 | `.github/workflows/ci.yml` exists but triggers are disabled. |
| E-27 | Database migrations versioning | 🟡 | `db:migrate` script exists; need to verify idempotency and rollback support. |

---

_Last updated: 2026-05-30 (E-01–E-05 implemented)_
