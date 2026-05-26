import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";

// ============================================================
// Health Controller — Structural Test (primary path)
// ============================================================

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("returns status ok with a timestamp (primary path)", () => {
    const result = controller.check();
    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe("string");
    // Verify it's a valid ISO timestamp
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
