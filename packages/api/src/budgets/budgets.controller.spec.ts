import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { BudgetsController } from "./budgets.controller";
import { BudgetsService } from "./budgets.service";

/**
 * BudgetsController — route integration tests.
 *
 * Validates that the HTTP routes match the expected URL patterns used
 * by the dashboard API client.
 */

const mockBudgetsService = {
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue({ id: "b-1", metric: "lcp_ms", threshold: 2500 }),
  create: jest.fn().mockResolvedValue({ id: "b-new" }),
  update: jest.fn().mockResolvedValue({ id: "b-1", threshold: 2000 }),
  delete: jest.fn().mockResolvedValue(undefined),
  evaluateRoute: jest.fn().mockResolvedValue([{ passed: true }]),
  ratchetBudgets: jest.fn().mockResolvedValue([{ ratcheted: true, new_threshold: 2100 }]),
};

describe("BudgetsController (routes)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BudgetsController],
      providers: [{ provide: BudgetsService, useValue: mockBudgetsService }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── CRUD routes ──

  it("GET /budgets — lists all", async () => {
    const res = await request(app.getHttpServer()).get("/budgets").expect(200);
    expect(mockBudgetsService.findAll).toHaveBeenCalledWith(undefined);
  });

  it("GET /budgets?project_id=p1 — lists by project", async () => {
    await request(app.getHttpServer()).get("/budgets?project_id=p1").expect(200);
    expect(mockBudgetsService.findAll).toHaveBeenCalledWith("p1");
  });

  it("GET /budgets/:id — get by id", async () => {
    await request(app.getHttpServer()).get("/budgets/b-1").expect(200);
    expect(mockBudgetsService.findById).toHaveBeenCalledWith("b-1");
  });

  it("POST /budgets — create", async () => {
    const dto = { project_id: "p-1", route: "/", metric: "lcp_ms", threshold: 2500 };
    await request(app.getHttpServer())
      .post("/budgets")
      .send(dto)
      .expect(201);
    expect(mockBudgetsService.create).toHaveBeenCalledWith(dto);
  });

  it("PUT /budgets/:id — update", async () => {
    await request(app.getHttpServer())
      .put("/budgets/b-1")
      .send({ threshold: 2000 })
      .expect(200);
    expect(mockBudgetsService.update).toHaveBeenCalledWith("b-1", { threshold: 2000 });
  });

  it("DELETE /budgets/:id — delete", async () => {
    await request(app.getHttpServer()).delete("/budgets/b-1").expect(200);
    expect(mockBudgetsService.delete).toHaveBeenCalledWith("b-1");
  });

  // ── Evaluate route (path param for projectId) ──

  it("POST /budgets/evaluate/:projectId — evaluates budgets", async () => {
    const projectId = "ab793bc5-8f59-4512-89e9-af48897108a0";
    await request(app.getHttpServer())
      .post(`/budgets/evaluate/${projectId}`)
      .send({ metrics: { lcp_ms: 2000 }, route: "/" })
      .expect(201);
    expect(mockBudgetsService.evaluateRoute).toHaveBeenCalledWith(
      projectId, "/", { lcp_ms: 2000 }, undefined,
    );
  });

  it("POST /budgets/evaluate/:projectId — accepts route via query param", async () => {
    await request(app.getHttpServer())
      .post("/budgets/evaluate/p-1?route=/products&device_class=mobile")
      .send({ metrics: { fcp_ms: 1200 } })
      .expect(201);
    expect(mockBudgetsService.evaluateRoute).toHaveBeenCalledWith(
      "p-1", "/products", { fcp_ms: 1200 }, "mobile",
    );
  });

  // ── Ratchet route (path param for projectId) — was 404 before fix ──

  it("POST /budgets/ratchet/:projectId — ratchets budgets", async () => {
    const projectId = "ab793bc5-8f59-4512-89e9-af48897108a0";
    await request(app.getHttpServer())
      .post(`/budgets/ratchet/${projectId}`)
      .expect(201);
    expect(mockBudgetsService.ratchetBudgets).toHaveBeenCalledWith(projectId);
  });

  it("POST /budgets/ratchet/:projectId — returns ratchet results", async () => {
    const projectId = "p-1";
    const res = await request(app.getHttpServer())
      .post(`/budgets/ratchet/${projectId}`)
      .expect(201);
    expect(res.body).toEqual([{ ratcheted: true, new_threshold: 2100 }]);
  });

  // ── Regression: old body-based ratchet route should NOT match ──

  it("POST /budgets/ratchet (no path param) — returns 404", async () => {
    await request(app.getHttpServer())
      .post("/budgets/ratchet")
      .send({ project_id: "p-1" })
      .expect(404);
  });
});
