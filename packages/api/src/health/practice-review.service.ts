/**
 * E-67: Quarterly practice review prompts service.
 *
 * Scheduled prompts asking: "Are budgets still right? Is the on-call rotation
 * working? Is the alert channel muted?" — surfaces drift in the performance practice.
 *
 * Book Ch 16, p277: "Quarterly practice review prompts that surface drift."
 */
import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface ReviewQuestion {
  id: string;
  category: ReviewCategory;
  question: string;
  description: string;
  severity: "critical" | "important" | "advisory";
}

export type ReviewCategory =
  | "budgets"
  | "on_call"
  | "alerts"
  | "measurement"
  | "culture"
  | "load_testing"
  | "gates";

export interface ReviewResponse {
  question_id: string;
  answer: "yes" | "no" | "partial" | "not_applicable";
  notes: string;
  respondent_id: string;
  responded_at: string;
}

export interface PracticeReview {
  id: string;
  project_id: string;
  quarter: string; // e.g., "2026-Q2"
  status: "pending" | "in_progress" | "completed";
  responses: ReviewResponse[];
  score: number | null; // 0-100
  created_at: string;
  completed_at: string | null;
  due_at: string;
}

export interface ReviewSummary {
  total_questions: number;
  answered: number;
  score: number;
  by_category: Record<ReviewCategory, { answered: number; total: number; passing: number }>;
  action_items: string[];
}

const REVIEW_QUESTIONS: ReviewQuestion[] = [
  // Budgets
  {
    id: "q_budget_1",
    category: "budgets",
    question: "Are performance budgets still appropriate for current traffic levels?",
    description: "Budgets should be reviewed quarterly to ensure they reflect real user expectations and current infrastructure capacity.",
    severity: "critical",
  },
  {
    id: "q_budget_2",
    category: "budgets",
    question: "Has the budget ratchet been triggered in the last quarter?",
    description: "If budgets haven't tightened, either performance hasn't improved or the ratchet isn't wired up.",
    severity: "important",
  },
  {
    id: "q_budget_3",
    category: "budgets",
    question: "Are there routes without budgets that should have them?",
    description: "New routes and critical user flows should be covered by performance budgets.",
    severity: "important",
  },
  // On-Call
  {
    id: "q_oncall_1",
    category: "on_call",
    question: "Is the on-call rotation staffed and rotating correctly?",
    description: "Verify that the rotation has enough members and that handoffs are happening on schedule.",
    severity: "critical",
  },
  {
    id: "q_oncall_2",
    category: "on_call",
    question: "Has every on-call member been paged at least once this quarter?",
    description: "If someone hasn't been paged, they may not be familiar with the incident process.",
    severity: "advisory",
  },
  {
    id: "q_oncall_3",
    category: "on_call",
    question: "Are on-call escalation timeouts still appropriate?",
    description: "Review whether 15-minute escalation windows are too short or too long based on recent incidents.",
    severity: "important",
  },
  // Alerts
  {
    id: "q_alert_1",
    category: "alerts",
    question: "Are all notification channels active and delivering?",
    description: "Test each channel (Slack, email, webhook) to confirm alerts are reaching the right people.",
    severity: "critical",
  },
  {
    id: "q_alert_2",
    category: "alerts",
    question: "Is alert fatigue manageable? Are any channels being muted or ignored?",
    description: "Too many alerts causes important ones to be missed. Review volume and signal-to-noise ratio.",
    severity: "critical",
  },
  {
    id: "q_alert_3",
    category: "alerts",
    question: "Are anomaly detection thresholds calibrated?",
    description: "Too sensitive = noise; too lenient = missed regressions. Review the last quarter's anomaly rate.",
    severity: "important",
  },
  // Measurement
  {
    id: "q_measure_1",
    category: "measurement",
    question: "Is synthetic monitoring covering all critical user journeys?",
    description: "New features and flows may need additional test scripts.",
    severity: "critical",
  },
  {
    id: "q_measure_2",
    category: "measurement",
    question: "Are RUM and synthetic results aligned (lab vs. field agreement)?",
    description: "Significant disagreement indicates a measurement or environment problem.",
    severity: "important",
  },
  {
    id: "q_measure_3",
    category: "measurement",
    question: "Are test environments representative of production?",
    description: "Dedicated test infrastructure should match production CPU, memory, and network characteristics.",
    severity: "important",
  },
  // Culture
  {
    id: "q_culture_1",
    category: "culture",
    question: "Is performance discussed in sprint planning and retrospectives?",
    description: "Performance should be a regular part of the development process, not an afterthought.",
    severity: "advisory",
  },
  {
    id: "q_culture_2",
    category: "culture",
    question: "Do engineers have authority to block deploys on performance regressions?",
    description: "Without enforcement authority, budgets become suggestions.",
    severity: "important",
  },
  // Load Testing
  {
    id: "q_load_1",
    category: "load_testing",
    question: "Has load testing been performed against current peak traffic levels?",
    description: "Traffic patterns change. Last quarter's load test may not reflect this quarter's reality.",
    severity: "important",
  },
  {
    id: "q_load_2",
    category: "load_testing",
    question: "Is the saturation point documented and current?",
    description: "Infrastructure changes can shift the saturation point. Re-validate after major changes.",
    severity: "advisory",
  },
  // Gates
  {
    id: "q_gate_1",
    category: "gates",
    question: "Are CI gate results being reviewed, or are failures routinely overridden?",
    description: "High override rates indicate gates are too strict or not being taken seriously.",
    severity: "critical",
  },
  {
    id: "q_gate_2",
    category: "gates",
    question: "Are gate thresholds aligned with budget values?",
    description: "Gates and budgets should reference the same thresholds to avoid confusion.",
    severity: "important",
  },
];

@Injectable()
export class PracticeReviewService {
  private readonly logger = new Logger(PracticeReviewService.name);
  private reviews: Map<string, PracticeReview> = new Map();
  private idCounter = 0;

  constructor(private readonly db: DatabaseService) {}

  private nextId(): string {
    return `review_${++this.idCounter}_${Date.now()}`;
  }

  /**
   * Get the current quarter string.
   */
  getCurrentQuarter(): string {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${q}`;
  }

  /**
   * Get the due date for a quarterly review (end of quarter).
   */
  getQuarterDueDate(quarter: string): string {
    const [year, q] = quarter.split("-Q").map(Number);
    const endMonth = q * 3;
    const dueDate = new Date(year, endMonth, 0); // last day of quarter
    return dueDate.toISOString();
  }

  /**
   * Get all standard review questions.
   */
  getQuestions(): ReviewQuestion[] {
    return [...REVIEW_QUESTIONS];
  }

  /**
   * Get questions filtered by category.
   */
  getQuestionsByCategory(category: ReviewCategory): ReviewQuestion[] {
    return REVIEW_QUESTIONS.filter((q) => q.category === category);
  }

  /**
   * Create or get the current quarterly review for a project.
   */
  getOrCreateReview(projectId: string, quarter?: string): PracticeReview {
    const q = quarter ?? this.getCurrentQuarter();
    const key = `${projectId}:${q}`;

    // Check for existing review
    for (const review of this.reviews.values()) {
      if (review.project_id === projectId && review.quarter === q) {
        return review;
      }
    }

    // Create new review
    const review: PracticeReview = {
      id: this.nextId(),
      project_id: projectId,
      quarter: q,
      status: "pending",
      responses: [],
      score: null,
      created_at: new Date().toISOString(),
      completed_at: null,
      due_at: this.getQuarterDueDate(q),
    };
    this.reviews.set(review.id, review);
    this.logger.log(`Created quarterly review for project ${projectId}, ${q}`);
    return review;
  }

  /**
   * Submit a response to a review question.
   */
  submitResponse(
    reviewId: string,
    data: {
      question_id: string;
      answer: "yes" | "no" | "partial" | "not_applicable";
      notes: string;
      respondent_id: string;
    },
  ): PracticeReview | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    // Replace existing response for the same question, or add new
    const existingIdx = review.responses.findIndex((r) => r.question_id === data.question_id);
    const response: ReviewResponse = {
      ...data,
      responded_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      review.responses[existingIdx] = response;
    } else {
      review.responses.push(response);
    }

    // Update status
    if (review.status === "pending") {
      review.status = "in_progress";
    }

    // Check if all questions are answered
    if (review.responses.length >= REVIEW_QUESTIONS.length) {
      review.status = "completed";
      review.completed_at = new Date().toISOString();
      review.score = this.computeScore(review.responses);
    }

    return review;
  }

  /**
   * Manually complete/save a review, computing the score from current responses.
   */
  completeReview(reviewId: string): PracticeReview | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    review.status = "completed";
    review.completed_at = new Date().toISOString();
    review.score = this.computeScore(review.responses);
    return review;
  }

  /**
   * Compute review score (0-100).
   */
  private computeScore(responses: ReviewResponse[]): number {
    if (responses.length === 0) return 0;

    let totalWeight = 0;
    let earnedWeight = 0;

    for (const response of responses) {
      const question = REVIEW_QUESTIONS.find((q) => q.id === response.question_id);
      const weight = question?.severity === "critical" ? 3 : question?.severity === "important" ? 2 : 1;

      totalWeight += weight;
      if (response.answer === "yes") {
        earnedWeight += weight;
      } else if (response.answer === "partial") {
        earnedWeight += weight * 0.5;
      }
      // "no" = 0 points, "not_applicable" = excluded
      if (response.answer === "not_applicable") {
        totalWeight -= weight;
      }
    }

    return totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  }

  /**
   * Get a summary of a review.
   */
  getSummary(reviewId: string): ReviewSummary | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    const byCategory: Record<string, { answered: number; total: number; passing: number }> = {};
    const categories: ReviewCategory[] = ["budgets", "on_call", "alerts", "measurement", "culture", "load_testing", "gates"];

    for (const cat of categories) {
      const questions = REVIEW_QUESTIONS.filter((q) => q.category === cat);
      const answered = review.responses.filter((r) =>
        questions.some((q) => q.id === r.question_id),
      );
      const passing = answered.filter((r) => r.answer === "yes" || r.answer === "not_applicable");
      byCategory[cat] = {
        total: questions.length,
        answered: answered.length,
        passing: passing.length,
      };
    }

    // Generate action items from "no" and "partial" responses
    const actionItems: string[] = [];
    for (const response of review.responses) {
      if (response.answer === "no" || response.answer === "partial") {
        const question = REVIEW_QUESTIONS.find((q) => q.id === response.question_id);
        if (question) {
          actionItems.push(`[${question.category}] ${question.question}${response.notes ? ` — ${response.notes}` : ""}`);
        }
      }
    }

    return {
      total_questions: REVIEW_QUESTIONS.length,
      answered: review.responses.length,
      score: review.score ?? this.computeScore(review.responses),
      by_category: byCategory as ReviewSummary["by_category"],
      action_items: actionItems,
    };
  }

  /**
   * List reviews for a project.
   */
  listReviews(projectId: string): PracticeReview[] {
    return Array.from(this.reviews.values())
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => b.quarter.localeCompare(a.quarter));
  }

  /**
   * Check if a review is due (within 30 days of quarter end).
   */
  isReviewDue(projectId: string): boolean {
    const quarter = this.getCurrentQuarter();
    const dueDate = new Date(this.getQuarterDueDate(quarter));
    const now = new Date();
    const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Due if within 30 days of quarter end and not yet completed
    if (daysUntilDue > 30) return false;

    const existing = Array.from(this.reviews.values()).find(
      (r) => r.project_id === projectId && r.quarter === quarter,
    );
    return !existing || existing.status !== "completed";
  }

  /**
   * Get overdue projects that need a review.
   */
  getOverduePrompts(projectIds: string[]): { project_id: string; quarter: string; days_remaining: number }[] {
    const quarter = this.getCurrentQuarter();
    const dueDate = new Date(this.getQuarterDueDate(quarter));
    const now = new Date();
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining > 30) return [];

    return projectIds
      .filter((pid) => this.isReviewDue(pid))
      .map((project_id) => ({ project_id, quarter, days_remaining: Math.max(0, daysRemaining) }));
  }
}
