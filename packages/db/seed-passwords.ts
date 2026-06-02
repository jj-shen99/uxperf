/**
 * One-shot migration: set password_hash for all demo users that don't have one.
 * Usage: npx ts-node packages/db/seed-passwords.ts
 */
import { randomBytes, scryptSync } from "crypto";
import { Pool } from "pg";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

// Default password for demo accounts — override via DEMO_PASSWORD env var
const DEFAULT_PASSWORD = process.env.DEMO_PASSWORD || "admin123!";

async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://perf:perf@localhost:5432/perf_framework",
  });

  // Find users without a password_hash
  const { rows } = await pool.query(
    "SELECT id, email FROM users WHERE password_hash IS NULL OR password_hash = ''",
  );

  if (rows.length === 0) {
    console.log("All users already have passwords set.");
    await pool.end();
    return;
  }

  console.log(`Setting password for ${rows.length} user(s):`);
  for (const user of rows) {
    const hash = hashPassword(DEFAULT_PASSWORD);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hash,
      user.id,
    ]);
    console.log(`  ✓ ${user.email}`);
  }

  console.log(`\nDone. Default password: ${DEFAULT_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
