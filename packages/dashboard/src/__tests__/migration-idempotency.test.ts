/**
 * E-27: Database migrations versioning — idempotency verification tests.
 *
 * Scans all *.up.sql migration files and verifies that every DDL statement
 * uses idempotent patterns (IF NOT EXISTS, IF EXISTS, CREATE OR REPLACE, etc.)
 * so that re-running a migration on an already-applied schema won't error.
 */

import { readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";

const migrationsDir = resolve(__dirname, "../../../../packages/db/migrations");

function getUpMigrations(): { name: string; content: string }[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".up.sql"))
    .sort()
    .map((f) => ({
      name: f,
      content: readFileSync(join(migrationsDir, f), "utf-8"),
    }));
}

function getDownMigrations(): { name: string; content: string }[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".down.sql"))
    .sort()
    .map((f) => ({
      name: f,
      content: readFileSync(join(migrationsDir, f), "utf-8"),
    }));
}

describe("Migration file structure", () => {
  const upFiles = getUpMigrations();
  const downFiles = getDownMigrations();

  it("has at least 1 migration", () => {
    expect(upFiles.length).toBeGreaterThan(0);
  });

  it("every up migration has a matching down migration", () => {
    for (const up of upFiles) {
      const downName = up.name.replace(".up.sql", ".down.sql");
      expect(downFiles.some((d) => d.name === downName)).toBe(true);
    }
  });

  it("migration files are numbered sequentially", () => {
    const numbers = upFiles.map((f) => parseInt(f.name.split("_")[0], 10));
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });

  it("migration files use consistent naming", () => {
    for (const f of upFiles) {
      expect(f.name).toMatch(/^\d{3}_[a-z0-9_]+\.up\.sql$/);
    }
  });
});

describe("Migration idempotency — CREATE TABLE", () => {
  const upFiles = getUpMigrations();

  for (const file of upFiles) {
    const tables = file.content.match(/CREATE TABLE\b[^(]*/gi) ?? [];
    for (const stmt of tables) {
      it(`${file.name}: "${stmt.trim()}" uses IF NOT EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF NOT EXISTS");
      });
    }
  }
});

describe("Migration idempotency — CREATE INDEX", () => {
  const upFiles = getUpMigrations();

  for (const file of upFiles) {
    const indexes = file.content.match(/CREATE INDEX\b[^;]*/gi) ?? [];
    for (const stmt of indexes) {
      it(`${file.name}: index uses IF NOT EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF NOT EXISTS");
      });
    }
  }
});

describe("Migration idempotency — CREATE EXTENSION", () => {
  const upFiles = getUpMigrations();

  for (const file of upFiles) {
    const extensions = file.content.match(/CREATE EXTENSION\b[^;]*/gi) ?? [];
    for (const stmt of extensions) {
      it(`${file.name}: extension uses IF NOT EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF NOT EXISTS");
      });
    }
  }
});

describe("Migration idempotency — CREATE TRIGGER", () => {
  const upFiles = getUpMigrations();

  for (const file of upFiles) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/CREATE TRIGGER\b/i.test(lines[i])) {
        const triggerName = lines[i].match(/CREATE TRIGGER\s+(\S+)/i)?.[1] ?? "unknown";
        it(`${file.name}: trigger "${triggerName}" has DROP IF EXISTS guard`, () => {
          // Look for DROP TRIGGER IF EXISTS in the 3 lines before
          const preceding = lines.slice(Math.max(0, i - 3), i).join("\n");
          expect(preceding.toUpperCase()).toContain("DROP TRIGGER IF EXISTS");
        });
      }
    }
  }
});

describe("Migration idempotency — CREATE TYPE", () => {
  const upFiles = getUpMigrations();

  for (const file of upFiles) {
    const types = file.content.match(/CREATE TYPE\b[^;]*/gi) ?? [];
    for (const stmt of types) {
      // Should be wrapped in DO $$ block with IF NOT EXISTS check
      // Look for the pattern around the CREATE TYPE
      const idx = file.content.indexOf(stmt);
      const context = file.content.slice(Math.max(0, idx - 200), idx + stmt.length);
      it(`${file.name}: type uses IF NOT EXISTS guard`, () => {
        expect(context.toUpperCase()).toContain("IF NOT EXISTS");
      });
    }
  }
});

describe("Migration idempotency — ALTER TABLE ADD COLUMN", () => {
  const upFiles = getUpMigrations();

  for (const file of upFiles) {
    const alters = file.content.match(/ALTER TABLE\b[^;]*ADD COLUMN\b[^;]*/gi) ?? [];
    for (const stmt of alters) {
      it(`${file.name}: ALTER TABLE ADD COLUMN uses IF NOT EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF NOT EXISTS");
      });
    }
  }
});

describe("Migration idempotency — DROP statements in down files", () => {
  const downFiles = getDownMigrations();

  for (const file of downFiles) {
    const drops = file.content.match(/DROP TABLE\b[^;]*/gi) ?? [];
    for (const stmt of drops) {
      it(`${file.name}: DROP TABLE uses IF EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF EXISTS");
      });
    }

    const typeDrops = file.content.match(/DROP TYPE\b[^;]*/gi) ?? [];
    for (const stmt of typeDrops) {
      it(`${file.name}: DROP TYPE uses IF EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF EXISTS");
      });
    }

    const funcDrops = file.content.match(/DROP FUNCTION\b[^;]*/gi) ?? [];
    for (const stmt of funcDrops) {
      it(`${file.name}: DROP FUNCTION uses IF EXISTS`, () => {
        expect(stmt.toUpperCase()).toContain("IF EXISTS");
      });
    }
  }
});

describe("Migration runner — tracking table", () => {
  const migratePath = resolve(__dirname, "../../../../packages/db/migrate.mjs");
  const migrateContent = readFileSync(migratePath, "utf-8");

  it("creates _migrations tracking table", () => {
    expect(migrateContent).toContain("_migrations");
    expect(migrateContent).toContain("CREATE TABLE IF NOT EXISTS _migrations");
  });

  it("tracks applied migrations by name", () => {
    expect(migrateContent).toContain("SELECT name FROM _migrations");
  });

  it("skips already-applied migrations", () => {
    expect(migrateContent).toContain("applied.has(baseName)");
  });

  it("supports down direction", () => {
    expect(migrateContent).toContain(".down.sql");
    expect(migrateContent).toContain("DELETE FROM _migrations");
  });

  it("records newly applied migrations", () => {
    expect(migrateContent).toContain("INSERT INTO _migrations");
  });
});
