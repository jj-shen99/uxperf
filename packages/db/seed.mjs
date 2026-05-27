import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://perf:perf@localhost:5432/perf_framework";

const SEED_USERS = [
  { email: "admin@perftest.io",  display_name: "Admin User",  role: "admin",  password: "admin123!" },
  { email: "editor@perftest.io", display_name: "Jane Editor", role: "editor", password: "editor123!" },
  { email: "viewer@perftest.io", display_name: "Bob Viewer",  role: "viewer", password: "viewer123!" },
  { email: "qa@perftest.io",     display_name: "Alice QA",    role: "editor", password: "qatest123!" },
  { email: "dev@perftest.io",    display_name: "Charlie Dev", role: "viewer", password: "devtest123!" },
];

async function seed() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("Seeding users...\n");

  for (const user of SEED_USERS) {
    const passwordHash = hashPassword(user.password);
    await client.query(
      `INSERT INTO users (email, display_name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash,
         is_active = true`,
      [user.email, user.display_name, user.role, passwordHash],
    );
    console.log(`  ✓ ${user.email.padEnd(22)} role=${user.role.padEnd(6)}  password=${user.password}`);
  }

  console.log("\n✅ All seed users created. You can log in with any of the above credentials.\n");

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
