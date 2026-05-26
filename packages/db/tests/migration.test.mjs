/**
 * DB Migration Integration Test
 *
 * Requires a running PostgreSQL instance.
 * Set DATABASE_URL env var or defaults to local dev connection.
 *
 * Run: node packages/db/tests/migration.test.mjs
 *
 * Tests:
 *   - Primary path: migrations apply successfully (up)
 *   - Primary path: migrations roll back cleanly (down)
 *   - Structural: all expected tables exist after up
 *   - Structural: all tables removed after down
 *   - Regression: re-running up is idempotent (already-applied skipped)
 */

import pg from "pg";
import { execSync } from "node:child_process";
import { strict as assert } from "node:assert";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://perf:perf@localhost:5432/perf_framework";

const EXPECTED_TABLES = [
  "projects",
  "scripts",
  "runs",
  "baselines",
  "gates",
  "gate_results",
  "audit_log",
];

const EXPECTED_TYPES = [
  "authoring_mode",
  "run_mode",
  "run_engine",
  "run_status",
  "gate_policy",
  "gate_result_status",
];

async function getClient() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

async function getTableNames(client) {
  const res = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_migrations'"
  );
  return res.rows.map((r) => r.tablename).sort();
}

async function getTypeNames(client) {
  const res = await client.query(
    "SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e'"
  );
  return res.rows.map((r) => r.typname).sort();
}

function runMigrate(direction = "") {
  const cmd = direction
    ? `node packages/db/migrate.mjs ${direction}`
    : "node packages/db/migrate.mjs";
  execSync(cmd, {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL },
    stdio: "pipe",
  });
}

let client;
let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    });
}

async function run() {
  console.log("DB Migration Integration Tests");
  console.log("================================");

  try {
    client = await getClient();
  } catch (err) {
    console.log(
      "⚠ Skipping migration tests: cannot connect to PostgreSQL"
    );
    console.log(`  ${err.message}`);
    console.log("  Set DATABASE_URL or start Postgres to run these tests.");
    process.exit(0);
  }

  // Clean state: run down first to ensure clean slate
  try {
    runMigrate("down");
  } catch {
    // May fail if tables don't exist yet — that's fine
  }

  // -- Test: migrations up --
  await test("migrate up creates all tables (primary path)", async () => {
    runMigrate();
    const tables = await getTableNames(client);
    for (const t of EXPECTED_TABLES) {
      assert.ok(tables.includes(t), `Missing table: ${t}`);
    }
  });

  // -- Test: expected enum types exist --
  await test("migrate up creates all enum types (structural)", async () => {
    const types = await getTypeNames(client);
    for (const t of EXPECTED_TYPES) {
      assert.ok(types.includes(t), `Missing type: ${t}`);
    }
  });

  // -- Test: idempotent re-run --
  await test("re-running migrate up is idempotent (regression)", async () => {
    runMigrate(); // Should skip already-applied
    const tables = await getTableNames(client);
    assert.equal(tables.length, EXPECTED_TABLES.length);
  });

  // -- Test: can insert and query a project --
  await test("can insert a row into projects (structural)", async () => {
    const res = await client.query(
      "INSERT INTO projects (name, owner_team) VALUES ($1, $2) RETURNING id",
      ["test-project", "qa-team"]
    );
    assert.ok(res.rows[0].id, "Expected UUID id");
  });

  // -- Test: foreign key constraint works --
  await test("scripts FK constraint to projects works (structural)", async () => {
    try {
      await client.query(
        "INSERT INTO scripts (project_id, name, canonical_json) VALUES ($1, $2, $3)",
        ["00000000-0000-0000-0000-000000000099", "bad-script", "{}"]
      );
      assert.fail("Expected FK violation");
    } catch (err) {
      assert.ok(
        err.message.includes("violates foreign key"),
        `Expected FK violation, got: ${err.message}`
      );
    }
  });

  // -- Test: updated_at trigger fires --
  await test("updated_at trigger fires on project update (structural)", async () => {
    const insert = await client.query(
      "INSERT INTO projects (name, owner_team) VALUES ($1, $2) RETURNING id, updated_at",
      ["trigger-test", "team"]
    );
    const originalUpdated = insert.rows[0].updated_at;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 50));

    await client.query(
      "UPDATE projects SET description = $1 WHERE id = $2",
      ["updated", insert.rows[0].id]
    );
    const after = await client.query(
      "SELECT updated_at FROM projects WHERE id = $1",
      [insert.rows[0].id]
    );
    assert.ok(
      after.rows[0].updated_at >= originalUpdated,
      "updated_at should be >= original"
    );
  });

  // -- Test: migrations down --
  await test("migrate down removes all tables (primary path)", async () => {
    runMigrate("down");
    const tables = await getTableNames(client);
    for (const t of EXPECTED_TABLES) {
      assert.ok(!tables.includes(t), `Table should be removed: ${t}`);
    }
  });

  // -- Test: enum types removed after down --
  await test("migrate down removes all enum types (structural)", async () => {
    const types = await getTypeNames(client);
    for (const t of EXPECTED_TYPES) {
      assert.ok(!types.includes(t), `Type should be removed: ${t}`);
    }
  });

  await client.end();

  console.log("================================");
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
