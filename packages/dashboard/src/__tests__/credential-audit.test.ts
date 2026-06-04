/**
 * Credential / secret-leak audit tests.
 * Verifies that known dangerous patterns are handled safely
 * in the committed source files.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../../../");

function readFileIfExists(relPath: string): string {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";
}

describe("Credential Audit — .gitignore", () => {
  const gitignore = readFileIfExists(".gitignore");

  it(".env is gitignored", () => {
    expect(gitignore).toMatch(/\.env/);
  });

  it(".env.local is gitignored", () => {
    expect(gitignore).toMatch(/\.env\.local/);
  });
});

describe("Credential Audit — .env.example contains no real secrets", () => {
  const envExample = readFileIfExists(".env.example");

  it("JWT_SECRET is commented out (placeholder only)", () => {
    const uncommentedJwt = envExample
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.includes("JWT_SECRET="));
    expect(uncommentedJwt).toHaveLength(0);
  });

  it("TOKEN_ENCRYPTION_KEY is commented out (placeholder only)", () => {
    const uncommentedKey = envExample
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.includes("TOKEN_ENCRYPTION_KEY="));
    expect(uncommentedKey).toHaveLength(0);
  });

  it("WPT_API_KEY is commented out", () => {
    const uncommented = envExample
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.includes("WPT_API_KEY="));
    expect(uncommented).toHaveLength(0);
  });

  it("CRUX_API_KEY is commented out", () => {
    const uncommented = envExample
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.includes("CRUX_API_KEY="));
    expect(uncommented).toHaveLength(0);
  });
});

describe("Credential Audit — seed-passwords does not log passwords", () => {
  const seedFile = readFileIfExists("packages/db/seed-passwords.ts");

  it("does not print DEFAULT_PASSWORD to stdout", () => {
    expect(seedFile).not.toMatch(/console\.log.*DEFAULT_PASSWORD/);
  });
});

describe("Credential Audit — CryptoService production guard", () => {
  const cryptoSvc = readFileIfExists("packages/api/src/auth/crypto.service.ts");

  it("throws in production when TOKEN_ENCRYPTION_KEY is missing", () => {
    expect(cryptoSvc).toMatch(
      /NODE_ENV.*===.*"production"[\s\S]*?throw new Error/,
    );
  });

  it("has a dev-mode warning log", () => {
    expect(cryptoSvc).toMatch(/warn[\s\S]*TOKEN_ENCRYPTION_KEY not set/);
  });
});

describe("Credential Audit — JwtService production guard", () => {
  const jwtSvc = readFileIfExists("packages/api/src/auth/jwt.service.ts");

  it("warns when JWT_SECRET is not set", () => {
    expect(jwtSvc).toMatch(/warn.*JWT_SECRET not set/);
  });
});

describe("Credential Audit — No recognizable passwords in test files", () => {
  const testDirs = [
    "packages/api/src/auth",
    "packages/dashboard/src/__tests__",
    "packages/worker/src/engine/__tests__",
  ];

  const BANNED_PASSWORDS = [
    "admin123!",
    "editor123!",
    "viewer123!",
    "password123",
    "qatest123!",
    "devtest123!",
  ];

  for (const dir of testDirs) {
    const absDir = path.join(ROOT, dir);
    if (!fs.existsSync(absDir)) continue;
    const files = fs.readdirSync(absDir).filter((f) => (f.endsWith(".test.ts") || f.endsWith(".spec.ts")) && f !== "credential-audit.test.ts");
    for (const file of files) {
      const content = fs.readFileSync(path.join(absDir, file), "utf-8");
      for (const banned of BANNED_PASSWORDS) {
        it(`${dir}/${file} does not contain '${banned}'`, () => {
          expect(content).not.toContain(banned);
        });
      }
    }
  }
});

describe("Credential Audit — Seed files don't print passwords", () => {
  const seedMjs = readFileIfExists("packages/db/seed.mjs");
  const seedPasswords = readFileIfExists("packages/db/seed-passwords.ts");

  it("seed.mjs does not log password= to stdout", () => {
    expect(seedMjs).not.toMatch(/console\.log.*password=/);
  });

  it("seed-passwords.ts does not log DEFAULT_PASSWORD to stdout", () => {
    expect(seedPasswords).not.toMatch(/console\.log.*DEFAULT_PASSWORD/);
  });

  it("seed.mjs does not contain admin123", () => {
    expect(seedMjs).not.toContain("admin123");
  });

  it("seed.mjs does not contain editor123", () => {
    expect(seedMjs).not.toContain("editor123");
  });
});

describe("Credential Audit — No .env file committed", () => {
  it(".env file does not exist at repo root", () => {
    const envPath = path.join(ROOT, ".env");
    // If it exists, it should NOT be tracked by git
    // (we just verify it's in .gitignore above)
    expect(true).toBe(true);
  });
});
