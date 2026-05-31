/**
 * E-22: Database module tests
 *
 * Unit tests for DatabaseService — validates Pool construction,
 * query delegation, and module shutdown behavior.
 */
import { Test } from "@nestjs/testing";
import { DatabaseService } from "./database.service";

// Mock pg Pool
const mockQuery = jest.fn();
const mockEnd = jest.fn();

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: mockEnd,
  })),
}));

describe("DatabaseService", () => {
  let service: DatabaseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();
    service = module.get(DatabaseService);
  });

  // --- Construction ---

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("creates Pool with DATABASE_URL or default connection string", () => {
    const { Pool } = require("pg");
    expect(Pool).toHaveBeenCalledWith({
      connectionString: expect.any(String),
      max: 20,
    });
  });

  // --- query() ---

  it("delegates query to pool.query", async () => {
    const fakeResult = { rows: [{ id: 1 }], rowCount: 1 };
    mockQuery.mockResolvedValueOnce(fakeResult);

    const result = await service.query("SELECT 1");
    expect(mockQuery).toHaveBeenCalledWith("SELECT 1", undefined);
    expect(result).toBe(fakeResult);
  });

  it("passes params to pool.query", async () => {
    const fakeResult = { rows: [], rowCount: 0 };
    mockQuery.mockResolvedValueOnce(fakeResult);

    await service.query("SELECT * FROM t WHERE id = $1", ["abc"]);
    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM t WHERE id = $1", ["abc"]);
  });

  it("propagates query errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    await expect(service.query("SELECT 1")).rejects.toThrow("connection refused");
  });

  it("supports generic type parameter", async () => {
    interface Row { id: string; name: string }
    const fakeResult = { rows: [{ id: "1", name: "test" }], rowCount: 1 };
    mockQuery.mockResolvedValueOnce(fakeResult);

    const result = await service.query<Row>("SELECT * FROM t");
    expect(result.rows[0].name).toBe("test");
  });

  it("handles empty result sets", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.query("SELECT * FROM empty_table");
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  // --- onModuleDestroy() ---

  it("calls pool.end on module destroy", async () => {
    mockEnd.mockResolvedValueOnce(undefined);
    await service.onModuleDestroy();
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it("propagates pool.end errors", async () => {
    mockEnd.mockRejectedValueOnce(new Error("end failed"));
    await expect(service.onModuleDestroy()).rejects.toThrow("end failed");
  });
});

describe("DatabaseModule", () => {
  it("exports DatabaseService as global", async () => {
    const { DatabaseModule } = await import("./database.module");
    const module = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();
    const svc = module.get(DatabaseService);
    expect(svc).toBeInstanceOf(DatabaseService);
  });
});
