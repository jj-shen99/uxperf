# Contributing — UI Performance Testing & Analysis Framework

## Development Setup

```bash
# Clone and install
git clone https://github.com/jj-shen99/ui_performance_testing_and_analysis.git
cd ui_performance_testing_and_analysis
npm install

# Start Postgres
docker compose up -d postgres

# Run migrations
npm run db:migrate

# Start development servers
npm run dev:api          # Terminal 1 → http://localhost:4000
npm run dev:dashboard    # Terminal 2 → http://localhost:4200
```

## Project Structure

| Package | Path | Tech | Description |
|---------|------|------|-------------|
| API | `packages/api` | NestJS 10 | REST API, orchestration, gates, intelligence |
| Dashboard | `packages/dashboard` | Next.js 15 | Web UI with React 19 + Tailwind CSS 4 |
| Worker | `packages/worker` | Playwright + Lighthouse | Test execution engine |
| DB | `packages/db` | PostgreSQL 16 | Migrations and schema |
| Shared | `packages/shared` | TypeScript | Shared types and validators |

## Development Workflow

### Branch Strategy

- `main` — production-ready code
- `develop` — integration branch
- Feature branches — `feature/<description>`
- Bug fixes — `fix/<description>`

### Making Changes

1. Create a feature branch from `develop`
2. Make your changes
3. Write or update tests
4. Run the full test suite: `npm test`
5. Run linting: `npm run lint`
6. Submit a pull request to `develop`

### Code Style

- **TypeScript** throughout all packages
- **NestJS conventions** for API modules (controller → service → entity)
- **React functional components** with hooks for the dashboard
- **Tailwind CSS** for styling (no custom CSS unless necessary)
- No comments or documentation should be added or removed unless explicitly requested

## Testing

### Running Tests

```bash
# All packages
npm test

# Individual packages
npm test --workspace=packages/api         # Jest (56 spec files)
npm test --workspace=packages/shared      # Vitest (135 tests)
npm test --workspace=packages/worker      # Vitest (52 tests)
npm test --workspace=packages/dashboard   # Vitest (6 test suites)
```

### Test Conventions

- **API**: Jest with `.spec.ts` files co-located with source
- **Shared/Worker/Dashboard**: Vitest with `__tests__/` directories
- New features must include tests
- Tests should not be deleted or weakened without explicit approval

## Database Migrations

Migrations live in `packages/db/migrations/`. Each migration has an `up.sql` and `down.sql`.

```bash
# Run migrations
npm run db:migrate

# Roll back
npm run db:migrate -- down
```

### Adding a migration

1. Create `NNN_description.up.sql` and `NNN_description.down.sql`
2. Ensure the down migration fully reverses the up migration
3. Test both directions: `npm run db:migrate && npm run db:migrate -- down`

## API Module Structure

Each API feature follows this NestJS pattern:

```
feature/
├── feature.controller.ts     Route handlers
├── feature.service.ts        Business logic
├── feature.controller.spec.ts  Tests
├── feature.service.spec.ts     Tests
└── feature.module.ts         Module registration
```

## CI Pipeline

The GitHub Actions CI pipeline (`.github/workflows/ci.yml`) runs:

1. **Test** — Jest (API) + Vitest (Shared, Worker)
2. **Lint + Build** — Lint all packages, build API and Dashboard
3. **DB Migration Test** — Run migrations up and down against a fresh Postgres

All three jobs must pass before merging.

## Environment Variables

See `README.md` → [Environment Variables](../README.md#environment-variables) for the full list.

For local development, copy `.env.example` to `.env` and adjust as needed.
