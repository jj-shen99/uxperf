import { Test } from "@nestjs/testing";
import { CruxIngestionService } from "./crux-ingestion.service";
import { DatabaseService } from "../database/database.service";

describe("CruxIngestionService", () => {
  let service: CruxIngestionService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CruxIngestionService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(CruxIngestionService);
  });

  describe("parseResponse", () => {
    it("parses a CrUX API response", () => {
      const raw = {
        record: {
          metrics: {
            largest_contentful_paint: {
              percentiles: { p75: 2500 },
              histogram: [{ density: 0.6 }, { density: 0.2 }, { density: 0.2 }],
            },
            first_contentful_paint: {
              percentiles: { p75: 1800 },
              histogram: [{ density: 0.8 }, { density: 0.1 }, { density: 0.1 }],
            },
            interaction_to_next_paint: {
              percentiles: { p75: 200 },
              histogram: [{ density: 0.9 }, { density: 0.05 }, { density: 0.05 }],
            },
            cumulative_layout_shift: {
              percentiles: { p75: 0.08 },
              histogram: [{ density: 0.85 }, { density: 0.1 }, { density: 0.05 }],
            },
          },
          collectionPeriod: {
            firstDate: { year: 2024, month: 1, day: 1 },
            lastDate: { year: 2024, month: 1, day: 28 },
          },
        },
      };

      const snapshot = service.parseResponse("p-1", "https://example.com", "ALL_FORM_FACTORS", raw);

      expect(snapshot.lcp_p75_ms).toBe(2500);
      expect(snapshot.fcp_p75_ms).toBe(1800);
      expect(snapshot.inp_p75_ms).toBe(200);
      expect(snapshot.cls_p75).toBe(0.08);
      expect(snapshot.lcp_rating).toBe("needs-improvement");
      expect(snapshot.fcp_rating).toBe("good");
      expect(snapshot.inp_rating).toBe("good");
      expect(snapshot.collection_period_start).toBe("2024-01-01");
      expect(snapshot.collection_period_end).toBe("2024-01-28");
    });

    it("handles null API response", () => {
      const snapshot = service.parseResponse("p-1", "https://example.com", "PHONE", null);
      expect(snapshot.lcp_p75_ms).toBeNull();
      expect(snapshot.lcp_rating).toBeNull();
    });
  });

  describe("fetchAndStore", () => {
    it("stores snapshot even without API key", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "crux-1" }] });
      const result = await service.fetchAndStore({
        project_id: "p-1",
        origin: "https://example.com",
      });
      expect(result.origin).toBe("https://example.com");
    });
  });

  describe("listSnapshots", () => {
    it("returns snapshots", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "crux-1" }] });
      const result = await service.listSnapshots("p-1");
      expect(result).toHaveLength(1);
    });
  });
});
