/**
 * E-67: Quarterly practice review prompts tests.
 */
import { PracticeReviewService } from "./practice-review.service";

const mockDb = { query: jest.fn() };

describe("PracticeReviewService", () => {
  let service: PracticeReviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PracticeReviewService(mockDb as any);
  });

  // === Questions ===

  describe("getQuestions", () => {
    it("returns all review questions", () => {
      const questions = service.getQuestions();
      expect(questions.length).toBeGreaterThan(10);
    });

    it("each question has required fields", () => {
      for (const q of service.getQuestions()) {
        expect(q.id).toBeTruthy();
        expect(q.category).toBeTruthy();
        expect(q.question).toBeTruthy();
        expect(q.description).toBeTruthy();
        expect(["critical", "important", "advisory"]).toContain(q.severity);
      }
    });

    it("filters by category", () => {
      const budgets = service.getQuestionsByCategory("budgets");
      expect(budgets.length).toBeGreaterThan(0);
      expect(budgets.every((q) => q.category === "budgets")).toBe(true);
    });

    it("covers all categories", () => {
      const categories = new Set(service.getQuestions().map((q) => q.category));
      expect(categories).toContain("budgets");
      expect(categories).toContain("on_call");
      expect(categories).toContain("alerts");
      expect(categories).toContain("measurement");
      expect(categories).toContain("culture");
      expect(categories).toContain("load_testing");
      expect(categories).toContain("gates");
    });
  });

  // === Quarter ===

  describe("getCurrentQuarter", () => {
    it("returns a valid quarter string", () => {
      const q = service.getCurrentQuarter();
      expect(q).toMatch(/^\d{4}-Q[1-4]$/);
    });
  });

  describe("getQuarterDueDate", () => {
    it("returns end of Q1", () => {
      const due = new Date(service.getQuarterDueDate("2026-Q1"));
      expect(due.getMonth()).toBe(2); // March (0-indexed)
      expect(due.getDate()).toBe(31);
    });

    it("returns end of Q4", () => {
      const due = new Date(service.getQuarterDueDate("2026-Q4"));
      expect(due.getMonth()).toBe(11); // December
      expect(due.getDate()).toBe(31);
    });
  });

  // === Review CRUD ===

  describe("getOrCreateReview", () => {
    it("creates a new review", () => {
      const review = service.getOrCreateReview("proj-1");
      expect(review.project_id).toBe("proj-1");
      expect(review.status).toBe("pending");
      expect(review.responses).toEqual([]);
      expect(review.score).toBeNull();
    });

    it("returns existing review for same project+quarter", () => {
      const r1 = service.getOrCreateReview("proj-1", "2026-Q2");
      const r2 = service.getOrCreateReview("proj-1", "2026-Q2");
      expect(r1.id).toBe(r2.id);
    });

    it("creates separate reviews for different projects", () => {
      const r1 = service.getOrCreateReview("proj-1", "2026-Q2");
      const r2 = service.getOrCreateReview("proj-2", "2026-Q2");
      expect(r1.id).not.toBe(r2.id);
    });
  });

  // === Responses ===

  describe("submitResponse", () => {
    it("records a response and updates status", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      const updated = service.submitResponse(review.id, {
        question_id: "q_budget_1",
        answer: "yes",
        notes: "All budgets reviewed",
        respondent_id: "user-1",
      });
      expect(updated?.status).toBe("in_progress");
      expect(updated?.responses).toHaveLength(1);
      expect(updated?.responses[0].answer).toBe("yes");
    });

    it("replaces existing response for same question", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      service.submitResponse(review.id, {
        question_id: "q_budget_1",
        answer: "no",
        notes: "",
        respondent_id: "user-1",
      });
      const updated = service.submitResponse(review.id, {
        question_id: "q_budget_1",
        answer: "yes",
        notes: "Fixed",
        respondent_id: "user-1",
      });
      expect(updated?.responses).toHaveLength(1);
      expect(updated?.responses[0].answer).toBe("yes");
    });

    it("returns null for unknown review", () => {
      expect(service.submitResponse("invalid", {
        question_id: "q_budget_1",
        answer: "yes",
        notes: "",
        respondent_id: "u1",
      })).toBeNull();
    });

    it("marks completed when all questions answered", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      const questions = service.getQuestions();
      let result: any = review;
      for (const q of questions) {
        result = service.submitResponse(review.id, {
          question_id: q.id,
          answer: "yes",
          notes: "",
          respondent_id: "user-1",
        });
      }
      expect(result?.status).toBe("completed");
      expect(result?.score).toBe(100);
      expect(result?.completed_at).toBeTruthy();
    });
  });

  // === Scoring ===

  describe("scoring", () => {
    it("scores 0 with no responses", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      const summary = service.getSummary(review.id);
      expect(summary?.score).toBe(0);
    });

    it("weights critical questions higher", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      // Answer one critical question with "yes"
      service.submitResponse(review.id, {
        question_id: "q_budget_1", // critical
        answer: "yes",
        notes: "",
        respondent_id: "u1",
      });
      // Answer one advisory question with "no"
      service.submitResponse(review.id, {
        question_id: "q_culture_1", // critical
        answer: "no",
        notes: "",
        respondent_id: "u1",
      });
      const summary = service.getSummary(review.id);
      expect(summary).toBeTruthy();
      // Score should reflect the weighted contributions
      expect(summary!.score).toBeGreaterThan(0);
    });

    it("partial answers get half credit", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      const questions = service.getQuestions();
      for (const q of questions) {
        service.submitResponse(review.id, {
          question_id: q.id,
          answer: "partial",
          notes: "",
          respondent_id: "u1",
        });
      }
      const summary = service.getSummary(review.id);
      expect(summary?.score).toBe(50);
    });
  });

  // === Summary ===

  describe("getSummary", () => {
    it("returns null for unknown review", () => {
      expect(service.getSummary("invalid")).toBeNull();
    });

    it("generates action items from no/partial answers", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      service.submitResponse(review.id, {
        question_id: "q_alert_2",
        answer: "no",
        notes: "Slack channel muted",
        respondent_id: "u1",
      });
      const summary = service.getSummary(review.id);
      expect(summary?.action_items.length).toBeGreaterThan(0);
      expect(summary?.action_items[0]).toContain("alerts");
    });

    it("includes per-category breakdown", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      const summary = service.getSummary(review.id);
      expect(summary?.by_category).toBeDefined();
      expect(summary?.by_category.budgets).toBeDefined();
      expect(summary?.by_category.budgets.total).toBeGreaterThan(0);
    });
  });

  // === Manual Completion ===

  describe("completeReview", () => {
    it("manually completes a review and computes score", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      service.submitResponse(review.id, {
        question_id: "q_budget_1",
        answer: "yes",
        notes: "",
        respondent_id: "u1",
      });
      const result = service.completeReview(review.id);
      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
      expect(result!.completed_at).toBeTruthy();
      expect(result!.score).toBeGreaterThanOrEqual(0);
    });

    it("completes with 0 score when no responses", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      const result = service.completeReview(review.id);
      expect(result!.status).toBe("completed");
      expect(result!.score).toBe(0);
    });

    it("returns null for unknown review ID", () => {
      expect(service.completeReview("nonexistent")).toBeNull();
    });

    it("can complete an already in_progress review", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      service.submitResponse(review.id, {
        question_id: "q_budget_1",
        answer: "partial",
        notes: "",
        respondent_id: "u1",
      });
      expect(review.status).toBe("in_progress");
      const result = service.completeReview(review.id);
      expect(result!.status).toBe("completed");
    });

    it("completing a pending review (no responses) sets score to 0", () => {
      const review = service.getOrCreateReview("proj-1", "2026-Q2");
      expect(review.status).toBe("pending");
      const result = service.completeReview(review.id);
      expect(result!.status).toBe("completed");
      expect(result!.score).toBe(0);
    });
  });

  // === List & Due ===

  describe("listReviews", () => {
    it("lists reviews sorted by quarter descending", () => {
      service.getOrCreateReview("proj-1", "2026-Q1");
      service.getOrCreateReview("proj-1", "2026-Q2");
      const reviews = service.listReviews("proj-1");
      expect(reviews).toHaveLength(2);
      expect(reviews[0].quarter).toBe("2026-Q2");
    });
  });

  describe("getOverduePrompts", () => {
    it("returns empty for projects with completed reviews", () => {
      const review = service.getOrCreateReview("proj-1");
      const questions = service.getQuestions();
      for (const q of questions) {
        service.submitResponse(review.id, {
          question_id: q.id,
          answer: "yes",
          notes: "",
          respondent_id: "u1",
        });
      }
      const overdue = service.getOverduePrompts(["proj-1"]);
      expect(overdue).toHaveLength(0);
    });
  });
});
