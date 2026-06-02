/**
 * Reset passwords for demo accounts to their expected values.
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

// Override demo passwords via env vars; defaults are for local development only
const DEMO_ACCOUNTS: { email: string; password: string; role: string }[] = [
  { email: "admin@perftest.io", password: process.env.DEMO_ADMIN_PASSWORD || "admin123!", role: "admin" },
  { email: "editor@perftest.io", password: process.env.DEMO_EDITOR_PASSWORD || "editor123!", role: "editor" },
  { email: "viewer@perftest.io", password: process.env.DEMO_VIEWER_PASSWORD || "viewer123!", role: "viewer" },
];

async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://perf:perf@localhost:5432/perf_framework",
  });

  for (const acct of DEMO_ACCOUNTS) {
    const hash = hashPassword(acct.password);
    const res = await pool.query(
      "UPDATE users SET password_hash = $1, role = $2 WHERE email = $3 RETURNING id, email, role",
      [hash, acct.role, acct.email],
    );
    if (res.rows.length > 0) {
      console.log(`  ✓ ${acct.email} (${acct.role}) — password reset`);
    } else {
      console.log(`  ✗ ${acct.email} — not found in DB`);
    }
  }

  // Also set admin123! for all other users that have NULL password_hash
  const { rows } = await pool.query(
    "SELECT id, email FROM users WHERE password_hash IS NULL OR password_hash = ''",
  );
  for (const user of rows) {
    const hash = hashPassword(process.env.DEMO_PASSWORD || "admin123!");
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
    console.log(`  ✓ ${user.email} — set default password`);
  }

  console.log("\nDone.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
