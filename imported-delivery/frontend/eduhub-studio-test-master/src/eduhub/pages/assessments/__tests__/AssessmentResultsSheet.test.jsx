/**
 * AssessmentResultsSheet.test.jsx — the results experience. Everything
 * shown is fetched from GET /api/student/assessments/submissions (mocked
 * here) — the sheet never fabricates a score, a timestamp, or an award.
 */
jest.mock("../assessmentApi", () => ({ listMySubmissions: jest.fn() }));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssessmentResultsSheet from "../AssessmentResultsSheet";
import { listMySubmissions } from "../assessmentApi";

const ASSESSMENT = {
  assessmentId: "asmt_1",
  title: "Long & Short Sound Listening Challenge",
  subject: "Phonics",
  totalPoints: 15,
  mySubmission: { submissionId: "asub_1", status: "scored" },
};

function makeSubmission(overrides = {}) {
  return {
    submissionId: "asub_1",
    assessmentId: "asmt_1",
    status: "scored",
    submittedAt: "2026-08-14T10:00:00Z",
    reviewedAt: null,
    extraction: { extractedAt: "2026-08-14T10:00:20Z" },
    score: {
      correct: 27, total: 30, scorePct: 90, pointsEarned: 13.5, totalPoints: 15,
      needsReview: false, answeredCount: 28, blankCount: 1, uncertainCount: 1,
      details: [
        { qid: "q1", prompt: "cake — long or short?", givenAnswer: "long", correctAnswer: "long", correct: true, points: 0.5, pointsEarned: 0.5, confidence: 0.98, answerState: "answered", source: "gemini" },
        { qid: "q2", prompt: "bed — long or short?", givenAnswer: "long", correctAnswer: "short", correct: false, points: 0.5, pointsEarned: 0, confidence: 0.92, answerState: "answered", source: "gemini" },
        { qid: "q3", prompt: "kite — long or short?", givenAnswer: "", correctAnswer: "long", correct: false, points: 0.5, pointsEarned: 0, confidence: null, answerState: "uncertain", source: "missing" },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

test("renders nothing when closed and never fetches", () => {
  render(<AssessmentResultsSheet open={false} assessment={ASSESSMENT} onClose={jest.fn()} />);
  expect(screen.queryByTestId("assessment-results-sheet")).not.toBeInTheDocument();
  expect(listMySubmissions).not.toHaveBeenCalled();
});

test("shows the real score hero with exact fractional points and honest wallet line", async () => {
  listMySubmissions.mockResolvedValue([makeSubmission()]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  expect(screen.getByTestId("assessment-results-loading")).toBeInTheDocument();

  const hero = await screen.findByTestId("assessment-results-score-hero");
  expect(hero).toHaveTextContent("27");
  expect(hero).toHaveTextContent("/30");
  expect(hero).toHaveTextContent("90% answered correctly");
  // 13.5 stays 13.5 — the fractional-points contract.
  expect(screen.getByTestId("assessment-results-points-calculated")).toHaveTextContent("13.5 / 15 pts");
  expect(screen.getByTestId("assessment-results-points-credited")).toHaveTextContent("0 — after teacher review");
});

test("per-question breakdown renders the server's details, expandable per row", async () => {
  listMySubmissions.mockResolvedValue([makeSubmission()]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);

  await screen.findByTestId("assessment-results-question-list");
  const rows = screen.getAllByTestId("assessment-results-question-row");
  expect(rows).toHaveLength(3);

  fireEvent.click(screen.getByTestId("assessment-results-question-toggle-q2"));
  const detail = screen.getByTestId("assessment-results-question-detail-q2");
  expect(detail).toHaveTextContent("long");   // what the AI read
  expect(detail).toHaveTextContent("short");  // the correct answer

  fireEvent.click(screen.getByTestId("assessment-results-question-toggle-q3"));
  expect(screen.getByTestId("assessment-results-uncertain-badge")).toHaveTextContent(/teacher will check/i);
});

test("reading summary shows the scorer's own answered/blank/unclear counts", async () => {
  listMySubmissions.mockResolvedValue([makeSubmission()]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  const summary = await screen.findByTestId("assessment-results-reading-summary");
  expect(summary).toHaveTextContent("28");
  expect(summary).toHaveTextContent("blank");
  expect(summary).toHaveTextContent("unclear");
});

test("needs_review renders the provisional explanation — never a dead end", async () => {
  listMySubmissions.mockResolvedValue([makeSubmission({ status: "needs_review" })]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  const note = await screen.findByTestId("assessment-results-review-note");
  expect(note).toHaveTextContent(/provisional/i);
  expect(note).toHaveTextContent(/teacher will check/i);
  expect(note).toHaveTextContent(/you'll be notified/i);
});

test("awarded renders the real award record — credited points, time and balance", async () => {
  listMySubmissions.mockResolvedValue([
    makeSubmission({
      status: "awarded",
      reviewedAt: "2026-08-14T12:00:00Z",
      award: { pointsCredited: 13.5, creditedAt: "2026-08-14T12:05:00Z", balanceAfter: 113.5 },
    }),
  ]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  const awarded = await screen.findByTestId("assessment-results-awarded");
  expect(awarded).toHaveTextContent("13.5 points credited to your wallet");
  expect(awarded).toHaveTextContent("113.5 pts");
  expect(screen.getByTestId("assessment-results-points-credited")).toHaveTextContent("13.5 pts");
  expect(screen.getByTestId("assessment-results-timeline-step-awarded")).toHaveAttribute("data-state", "done");
});

test("a corrected award shows the honest 'correction applied' indicator, absent when never corrected", async () => {
  listMySubmissions.mockResolvedValue([
    makeSubmission({
      status: "awarded", correctionState: "applied",
      award: { pointsCredited: 14, creditedAt: "2026-08-14T12:05:00Z", balanceAfter: 114 },
    }),
  ]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  const note = await screen.findByTestId("assessment-results-correction-applied");
  expect(note).toHaveTextContent(/correction applied/i);
  expect(note).toHaveTextContent(/teacher reviewed/i);
});

test("an award that was never corrected shows no correction indicator", async () => {
  listMySubmissions.mockResolvedValue([
    makeSubmission({
      status: "awarded",
      award: { pointsCredited: 13.5, creditedAt: "2026-08-14T12:05:00Z", balanceAfter: 113.5 },
    }),
  ]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  await screen.findByTestId("assessment-results-awarded");
  expect(screen.queryByTestId("assessment-results-correction-applied")).not.toBeInTheDocument();
});

test("failed submission offers resubmission", async () => {
  const onResubmit = jest.fn();
  listMySubmissions.mockResolvedValue([makeSubmission({ status: "failed", score: null, extraction: null })]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} onResubmit={onResubmit} />);
  const btn = await screen.findByTestId("assessment-results-resubmit-button");
  fireEvent.click(btn);
  expect(onResubmit).toHaveBeenCalledWith(ASSESSMENT);
});

test("fetch failure shows an honest error with retry", async () => {
  listMySubmissions.mockRejectedValueOnce(new Error("network down"));
  listMySubmissions.mockResolvedValueOnce([makeSubmission()]);
  render(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);

  const err = await screen.findByTestId("assessment-results-error");
  expect(err).toHaveTextContent("network down");
  fireEvent.click(screen.getByTestId("assessment-results-retry-button"));
  await waitFor(() => expect(screen.getByTestId("assessment-results-score-hero")).toBeInTheDocument());
});

// Regression: without this, the dashboard behind the blur stayed
// scrollable, so a touch meant for the results sheet could drag the page
// underneath instead — producing unstable scroll, dead-feeling taps, and
// the sheet appearing to "pull left/right".
test("locks background scroll while open and restores it on close", async () => {
  listMySubmissions.mockResolvedValue([makeSubmission()]);
  const { rerender } = render(<AssessmentResultsSheet open={false} assessment={ASSESSMENT} onClose={jest.fn()} />);
  expect(document.body.style.overflow).not.toBe("hidden");

  rerender(<AssessmentResultsSheet open assessment={ASSESSMENT} onClose={jest.fn()} />);
  expect(document.body.style.overflow).toBe("hidden");
  await screen.findByTestId("assessment-results-score-hero");

  rerender(<AssessmentResultsSheet open={false} assessment={ASSESSMENT} onClose={jest.fn()} />);
  expect(document.body.style.overflow).toBe("");
});

// Regression: a long, underscore-joined title (e.g. an uploaded filename
// used as a title) previously forced the whole sheet wider than the
// viewport instead of wrapping, causing real horizontal overflow on mobile.
test("a long, space-less title wraps instead of overflowing the sheet", async () => {
  listMySubmissions.mockResolvedValue([makeSubmission()]);
  const longTitle = "Long_Short_Sound_Listening_Challenge_Teacher_Script_IPA_Answer_Key_Extended";
  render(<AssessmentResultsSheet open assessment={{ ...ASSESSMENT, title: longTitle }} onClose={jest.fn()} />);
  expect(await screen.findByText(longTitle)).toHaveClass("break-words");
});
