import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://perf:perf@localhost:5432/perf_framework",
});

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations() {
  const res = await client.query(
    "SELECT name FROM _migrations ORDER BY id ASC"
  );
  return new Set(res.rows.map((r) => r.name));
}

async function migrate() {
  await client.connect();
  await ensureMigrationsTable();

  const direction = process.argv[2]; // "down" or undefined

  if (direction === "down") {
    const applied = await getAppliedMigrations();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".down.sql"))
      .sort()
      .reverse();
    for (const file of files) {
      const baseName = file.replace(".down.sql", "");
      if (!applied.has(baseName)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`Rolling back: ${baseName}`);
      await client.query(sql);
      await client.query("DELETE FROM _migrations WHERE name = $1", [baseName]);
    }
  } else {
    const applied = await getAppliedMigrations();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".up.sql"))
      .sort();
    for (const file of files) {
      const baseName = file.replace(".up.sql", "");
      if (applied.has(baseName)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`Applying: ${baseName}`);
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
        baseName,
      ]);
    }
  }

  await client.end();
  console.log("Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
