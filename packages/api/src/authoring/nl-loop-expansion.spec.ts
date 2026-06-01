/**
 * Tests for NL authoring loop expansion & page reconnaissance integration (E-07).
 * Covers: expandLoopSteps, extractFilterKeywords, loop detection in parseIntent,
 * and multi-link Playwright code generation.
 */
import { Test } from "@nestjs/testing";
import { NlAuthoringService } from "./nl-authoring.service";
import { DatabaseService } from "../database/database.service";

describe("NL Authoring — Loop Expansion", () => {
  let service: NlAuthoringService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        NlAuthoringService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(NlAuthoringService);
  });

  // === Equivalence Partitioning ===

  describe("loop detection in intent parsing", () => {
    it("detects loop when prompt uses 'each link'", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "loop-1" }] });
      const result = await service.generate({
        project_id: "p-1",
        prompt: "click on each link and measure performance",
        target_url: "https://example.com",
      });
      const intentStage = result.pipeline_stages.find((s) => s.name === "intent_parse");
      expect((intentStage?.output as any).has_loop).toBe(true);
      expect((intentStage?.output as any).wants_metrics).toBe(true);
    });

    it("detects loop with 'all book links'", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "loop-2" }] });
      const result = await service.generate({
        project_id: "p-1",
        prompt: "visit all book links and measure LCP",
        target_url: "https://example.com",
      });
      const intentStage = result.pipeline_stages.find((s) => s.name === "intent_parse");
      expect((intentStage?.output as any).has_loop).toBe(true);
      expect((intentStage?.output as any).wants_metrics).toBe(true);
    });

    it("detects loop with 'every button'", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "loop-3" }] });
      const result = await service.generate({
        project_id: "p-1",
        prompt: "click every button",
      });
      const intentStage = result.pipeline_stages.find((s) => s.name === "intent_parse");
      expect((intentStage?.output as any).has_loop).toBe(true);
      expect((intentStage?.output as any).wants_metrics).toBe(false);
    });

    it("does NOT detect loop for normal prompts", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "loop-4" }] });
      const result = await service.generate({
        project_id: "p-1",
        prompt: "click login, enter password, submit form",
      });
      const intentStage = result.pipeline_stages.find((s) => s.name === "intent_parse");
      expect((intentStage?.output as any).has_loop).toBe(false);
    });

    it("does NOT detect loop with 'each' but no element type", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "loop-5" }] });
      const result = await service.generate({
        project_id: "p-1",
        prompt: "do something for each day",
      });
      const intentStage = result.pipeline_stages.find((s) => s.name === "intent_parse");
      expect((intentStage?.output as any).has_loop).toBe(false);
    });
  });

  // === Boundary Value Analysis ===

  describe("loop expansion boundary cases", () => {
    it("handles empty links array (no expansion)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "bnd-1" }] });
      const result = await service.generate({
        project_id: "p-1",
        prompt: "click on each link",
        // No target_url → recon produces empty links
      });
      // Without links, expansion doesn't happen — original steps remain
      const scriptSteps = (result.generated_script as any)?.steps ?? [];
      expect(scriptSteps.length).toBeGreaterThanOrEqual(1);
    });

    it("caps link expansion at 20", async () => {
      // expandLoopSteps internally caps at 20. We test this via the
      // private method's effect: generate with a target that has 25 links
      // should still produce a bounded number of steps.
      // Since recon is mocked (no real HTTP), we trust the cap logic.
      // Direct unit test of the cap follows.
      const links = Array.from({ length: 25 }, (_, i) => ({
        href: `https://example.com/page-${i}`,
        text: `Link ${i}`,
      }));
      // Access private method via any cast
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [{ step: 1, intent: "click on each link" }],
          has_loop: true,
          wants_metrics: true,
        },
        { links, target_url: "https://example.com" },
      );
      // Each link generates 3 steps (click, measure, go back)
      // 20 links * 3 = 60 steps
      expect(expanded.length).toBe(60);
    });

    it("expands exactly 1 link correctly", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [{ step: 1, intent: "click on each link" }],
          has_loop: true,
          wants_metrics: false,
        },
        { links: [{ href: "/about", text: "About" }], target_url: "https://example.com" },
      );
      // 1 link, no metrics: click + go back = 2 steps
      expect(expanded.length).toBe(2);
      expect(expanded[0].intent).toContain("About");
      expect(expanded[1].intent).toContain("navigate back");
    });
  });

  // === Decision Tables ===

  describe("expansion with/without metrics", () => {
    it("includes measure steps when wants_metrics is true", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [{ step: 1, intent: "click on each link" }],
          has_loop: true,
          wants_metrics: true,
        },
        {
          links: [{ href: "/a", text: "Page A" }, { href: "/b", text: "Page B" }],
          target_url: "https://example.com",
        },
      );
      // 2 links * 3 (click + measure + go back) = 6 steps
      expect(expanded.length).toBe(6);
      expect(expanded[1].intent).toMatch(/^measure:/);
      expect(expanded[4].intent).toMatch(/^measure:/);
    });

    it("omits measure steps when wants_metrics is false", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [{ step: 1, intent: "click on each link" }],
          has_loop: true,
          wants_metrics: false,
        },
        {
          links: [{ href: "/a", text: "Page A" }, { href: "/b", text: "Page B" }],
          target_url: "https://example.com",
        },
      );
      // 2 links * 2 (click + go back) = 4 steps
      expect(expanded.length).toBe(4);
      const measureSteps = expanded.filter((s: any) => s.intent.startsWith("measure:"));
      expect(measureSteps.length).toBe(0);
    });
  });

  // === Filter Keywords ===

  describe("extractFilterKeywords", () => {
    it("extracts content-relevant words from loop intent", () => {
      const keywords = (service as any).extractFilterKeywords("click on each book link");
      expect(keywords).toContain("book");
    });

    it("removes structural words", () => {
      const keywords = (service as any).extractFilterKeywords(
        "click on each link and then go to the page",
      );
      // "page" has more than 2 chars and isn't in the denylist
      expect(keywords).not.toContain("click");
      expect(keywords).not.toContain("each");
      expect(keywords).not.toContain("link");
      expect(keywords).not.toContain("and");
      expect(keywords).not.toContain("the");
    });

    it("returns empty array for generic loop intent", () => {
      const keywords = (service as any).extractFilterKeywords("click on each link");
      expect(keywords).toEqual([]);
    });

    it("handles short words (< 3 chars are filtered)", () => {
      const keywords = (service as any).extractFilterKeywords("click on each a b link");
      expect(keywords).toEqual([]);
    });
  });

  // === Link filtering ===

  describe("link filtering in expansion", () => {
    it("filters links by keyword when present", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [{ step: 1, intent: "click on each product link" }],
          has_loop: true,
          wants_metrics: false,
        },
        {
          links: [
            { href: "/product/1", text: "Product A" },
            { href: "/about", text: "About Us" },
            { href: "/product/2", text: "Product B" },
          ],
          target_url: "https://example.com",
        },
      );
      // Only 2 product links should match, each produces 2 steps
      expect(expanded.length).toBe(4);
      expect(expanded[0].intent).toContain("Product A");
      expect(expanded[2].intent).toContain("Product B");
    });

    it("falls back to all links when filter matches nothing", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [{ step: 1, intent: "click on each zzzzz link" }],
          has_loop: true,
          wants_metrics: false,
        },
        {
          links: [
            { href: "/a", text: "Link A" },
            { href: "/b", text: "Link B" },
          ],
          target_url: "https://example.com",
        },
      );
      // "zzzzz" matches nothing → falls back to all 2 links
      expect(expanded.length).toBe(4);
    });
  });

  // === Integration: Playwright code generation for multi-link ===

  describe("Playwright code generation for expanded scripts", () => {
    it("generates measure blocks for each link in expanded script", () => {
      const script = {
        steps: [
          { step: 1, intent: 'click on "Book A"', locators: null },
          { step: 2, intent: 'measure: "Book A"', locators: null },
          { step: 3, intent: "navigate back to https://example.com", locators: null },
          { step: 4, intent: 'click on "Book B"', locators: null },
          { step: 5, intent: 'measure: "Book B"', locators: null },
          { step: 6, intent: "navigate back to https://example.com", locators: null },
        ],
        target_url: "https://example.com",
        device: "desktop",
        source_prompt: "click on each book link and measure performance",
        metrics: { assertions: [] },
      };

      const code = service.generatePlaywrightCode(script);
      expect(code).toContain("Book A");
      expect(code).toContain("Book B");
      expect(code).toContain("Capture performance metrics: ");
      // Should have multiple measure blocks
      const measureCount = (code.match(/Capture performance metrics/g) ?? []).length;
      expect(measureCount).toBe(2);
    });

    it("generates go-back navigation between links", () => {
      const script = {
        steps: [
          { step: 1, intent: 'click on "Link 1"', locators: null },
          { step: 2, intent: "navigate back to https://example.com", locators: null },
        ],
        target_url: "https://example.com",
        device: "desktop",
        source_prompt: "test",
        metrics: { assertions: [] },
      };

      const code = service.generatePlaywrightCode(script);
      // go-back generates goto target_url
      expect(code).toContain("page.goto('https://example.com')");
    });
  });

  // === Regression: preserves before/after steps ===

  describe("preserves steps before and after the loop", () => {
    it("keeps pre-loop and post-loop steps intact", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [
            { step: 1, intent: "navigate to homepage" },
            { step: 2, intent: "click on each link" },
            { step: 3, intent: "scroll down" },
          ],
          has_loop: true,
          wants_metrics: false,
        },
        {
          links: [{ href: "/a", text: "A" }],
          target_url: "https://example.com",
        },
      );
      // Step 1 (navigate) + 2 (click A, go back) + 1 (scroll) = 4
      expect(expanded[0].intent).toBe("navigate to homepage");
      expect(expanded[expanded.length - 1].intent).toBe("scroll down");
    });

    it("filters out metric-related after-steps (folded into loop)", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [
            { step: 1, intent: "click on each link" },
            { step: 2, intent: "measure performance" },
          ],
          has_loop: true,
          wants_metrics: true,
        },
        {
          links: [{ href: "/a", text: "A" }],
          target_url: "https://example.com",
        },
      );
      // "measure performance" after-step is filtered because it's metric-related
      // and metrics are already included in per-link expansion
      const afterMetric = expanded.filter((s: any) => s.intent === "measure performance");
      expect(afterMetric.length).toBe(0);
    });
  });

  // === Step numbering ===

  describe("step numbering is sequential", () => {
    it("assigns sequential step numbers to expanded steps", () => {
      const expanded = (service as any).expandLoopSteps(
        {
          steps: [
            { step: 1, intent: "navigate to homepage" },
            { step: 2, intent: "click on each link" },
          ],
          has_loop: true,
          wants_metrics: true,
        },
        {
          links: [
            { href: "/a", text: "A" },
            { href: "/b", text: "B" },
          ],
          target_url: "https://example.com",
        },
      );
      for (let i = 0; i < expanded.length; i++) {
        expect(expanded[i].step).toBe(i + 1);
      }
    });
  });
});
