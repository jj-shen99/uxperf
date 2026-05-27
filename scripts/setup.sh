#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────
# UI Performance Testing Framework — First-Time Setup Script
# ───────────────────────────────────────────────────────────
# Usage:  bash scripts/setup.sh
#
# This script installs all dependencies, runs database
# migrations, seeds demo users, and installs Playwright
# browsers so you can start developing immediately.
# ───────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════╗"
echo "║  UI Performance Testing Framework — Setup           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 1. Check prerequisites
echo "▸ Checking prerequisites..."

if ! command -v node &>/dev/null; then
  echo "✘ Node.js is required (>= 20). Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "✘ Node.js >= 20 required (found v$(node -v))"
  exit 1
fi
echo "  Node.js $(node -v) ✓"

if ! command -v npm &>/dev/null; then
  echo "✘ npm is required"
  exit 1
fi
echo "  npm $(npm -v) ✓"

# Check Postgres connectivity (optional — needed for migrations)
DB_URL="${DATABASE_URL:-postgresql://perf:perf@localhost:5432/perf_framework}"
if command -v pg_isready &>/dev/null; then
  if pg_isready -d "$DB_URL" &>/dev/null; then
    echo "  PostgreSQL ✓"
    PG_READY=true
  else
    echo "  ⚠ PostgreSQL not reachable. Run: docker compose up -d postgres"
    PG_READY=false
  fi
else
  echo "  ⚠ pg_isready not found — skipping Postgres check"
  PG_READY=false
fi

echo ""

# 2. Install npm dependencies
echo "▸ Installing npm dependencies..."
npm install
echo ""

# 3. Install Playwright browsers
echo "▸ Installing Playwright browsers (Chromium)..."
npx playwright install chromium
echo ""

# 4. Run database migrations (if Postgres is available)
if [ "$PG_READY" = true ]; then
  echo "▸ Running database migrations..."
  npm run db:migrate
  echo ""

  echo "▸ Seeding demo users..."
  npm run db:seed
  echo ""
else
  echo "▸ Skipping migrations & seed (Postgres not available)"
  echo "  Start Postgres, then run:"
  echo "    npm run db:migrate"
  echo "    npm run db:seed"
  echo ""
fi

# 5. Summary
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Setup complete!                                    ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Start services:                                    ║"
echo "║    npm run dev:api         → http://localhost:4000  ║"
echo "║    npm run dev:dashboard   → http://localhost:4200  ║"
echo "║    npm run worker:poll     → Worker poll loop       ║"
echo "║                                                     ║"
echo "║  Demo accounts:                                     ║"
echo "║    admin@perftest.io / admin123!    (admin)         ║"
echo "║    editor@perftest.io / editor123!  (editor)        ║"
echo "║    viewer@perftest.io / viewer123!  (viewer)        ║"
echo "╚══════════════════════════════════════════════════════╝"
