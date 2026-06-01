import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { JwtService } from "../auth/jwt.service";

// ============================================================
// Integration Tests — Full HTTP roundtrip through NestJS
// Uses mocked DatabaseService to avoid requiring real Postgres
// Covers: primary paths, boundary responses, error paths
// ============================================================

const mockDb = { query: jest.fn(), onModuleDestroy: jest.fn() };

describe("App Integration (HTTP)", () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    // Generate a test JWT for authenticated requests
    const jwt = moduleRef.get(JwtService);
    authToken = jwt.sign({ sub: "test-user", email: "test@test.com", role: "admin" });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================
  // Health endpoint — Primary Path
  // ==========================================================

  describe("GET /api/v1/health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/health")
        .expect(200);

      expect(res.body.status).toBe("ok");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ==========================================================
  // Projects — Primary Path + Error Path
  // ==========================================================

  describe("Projects API", () => {
    it("GET /api/v1/projects returns 200 with list", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const res = await request(app.getHttpServer())
        .get("/api/v1/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it("POST /api/v1/projects creates a project", async () => {
      const project = {
        id: "p1", name: "test", owner_team: "eng",
        description: null, environment_configs: {}, quota: {},
        domain_allowlist: [], created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValue({ rows: [project] });

      const res = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "test", owner_team: "eng" })
        .expect(201);

      expect(res.body.name).toBe("test");
    });

    it("GET /api/v1/projects/:id returns 404 when not found", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await request(app.getHttpServer())
        .get("/api/v1/projects/nonexistent")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ==========================================================
  // Runs — Primary Path + Boundary
  // ==========================================================

  describe("Runs API", () => {
    it("GET /api/v1/runs returns 200 with list", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const res = await request(app.getHttpServer())
        .get("/api/v1/runs")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it("POST /api/v1/runs creates a run", async () => {
      const run = {
        id: "r1", project_id: "p1", script_id: null,
        mode: "stability", engine: "playwright_lighthouse",
        environment: "staging", status: "queued",
        config: { url: "https://example.com" },
        metrics: null, created_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValue({ rows: [run] });

      const res = await request(app.getHttpServer())
        .post("/api/v1/runs")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          project_id: "p1",
          config: { url: "https://example.com" },
        })
        .expect(201);

      expect(res.body.status).toBe("queued");
    });

    it("PATCH /api/v1/runs/:id updates a run", async () => {
      const updated = {
        id: "r1", status: "running",
        project_id: "p1", config: {},
        created_at: new Date().toISOString(),
      };
      mockDb.query.mockResolvedValue({ rows: [updated] });

      const res = await request(app.getHttpServer())
        .patch("/api/v1/runs/r1")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ status: "running" })
        .expect(200);

      expect(res.body.status).toBe("running");
    });

    it("GET /api/v1/runs/:id returns 404 when not found", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await request(app.getHttpServer())
        .get("/api/v1/runs/nonexistent")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
