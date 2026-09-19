/**
 * AssessmentsPremiumSurface.test.jsx — behaviors added by the premium
 * transformation of the student home: card → detail sheet, real summary
 * counts, AbortError robustness, error retry, and the duplicate (409)
 * submission state in the submit modal.
 */
jest.mock("../assessmentApi", () => ({
  listAssessments: jest.fn(),
  listMySubmissions: jest.fn(),
  submitAssessment: jest.fn(),
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssessmentsListPage from "../AssessmentsListPage";
import SubmitAssessmentModal from "../SubmitAssessmentModal";
import { listAssessments, submitAssessment } from "../assessmentApi";

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:mock-preview");
  global.URL.revokeObjectURL = jest.fn();
});

test("tapping an assessment card opens the introduction sheet", async () => {
  listAssessments.mockResolvedValue([
    { assessmentId: "a1", title: "Listening Challenge", subject: "Phonics", totalPoints: 15, mySubmission: null },
  ]);
  render(<AssessmentsListPage />);
  const card = await screen.findByTestId("assessment-card");
  fireEvent.click(card);
  expect(screen.getByTestId("assessment-detail-sheet")).toBeInTheDocument();
  expect(screen.getByTestId("assessment-detail-how-it-works")).toBeInTheDocument();

  // The intro's primary CTA hands off to the submission journey.
  fireEvent.click(screen.getByTestId("assessment-detail-primary-cta"));
  expect(screen.queryByTestId("assessment-detail-sheet")).not.toBeInTheDocument();
  expect(screen.getByTestId("assessment-submit-modal")).toBeInTheDocument();
});

test("summary strip shows real lifecycle counts", async () => {
  listAssessments.mockResolvedValue([
    { assessmentId: "a1", title: "One", totalPoints: 15, mySubmission: null },
    { assessmentId: "a2", title: "Two", totalPoints: 10, mySubmission: { status: "needs_review" } },
    { assessmentId: "a3", title: "Three", totalPoints: 18, mySubmission: { status: "awarded", score: { correct: 12, total: 12, scorePct: 100, pointsEarned: 18 } } },
  ]);
  render(<AssessmentsListPage />);
  await screen.findByTestId("assessments-summary");
  expect(screen.getByTestId("assessments-summary-todo")).toHaveTextContent("1");
  expect(screen.getByTestId("assessments-summary-inreview")).toHaveTextContent("1");
  expect(screen.getByTestId("assessments-summary-done")).toHaveTextContent("1");
});

test("an aborted request is never shown to the student as an error", async () => {
  const abortError = new DOMException("signal is aborted without reason", "AbortError");
  listAssessments.mockRejectedValue(abortError);
  render(<AssessmentsListPage />);
  await waitFor(() => expect(listAssessments).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByTestId("assessments-error")).not.toBeInTheDocument();
});

test("the error state offers a working retry", async () => {
  listAssessments.mockRejectedValueOnce(new Error("network down"));
  listAssessments.mockResolvedValueOnce([
    { assessmentId: "a1", title: "Back online", totalPoints: 15, mySubmission: null },
  ]);
  render(<AssessmentsListPage />);
  await screen.findByTestId("assessments-error");
  fireEvent.click(screen.getByTestId("assessments-retry-button"));
  expect(await screen.findByText("Back online")).toBeInTheDocument();
});

test("a 409 duplicate submission is a first-class state, not a retry loop", async () => {
  const err = new Error("You already submitted this assessment (status: scored).");
  err.status = 409;
  submitAssessment.mockRejectedValue(err);
  const onDuplicate = jest.fn();

  render(
    <SubmitAssessmentModal open assessment={{ assessmentId: "asmt_1", title: "T", totalPoints: 15 }}
                           onClose={jest.fn()} onDuplicate={onDuplicate} />,
  );
  fireEvent.change(screen.getByTestId("assessment-submit-choose-photos-input"), {
    target: { files: [new File(["x"], "w.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByTestId("assessment-submit-confirm-button"));

  const dup = await screen.findByTestId("assessment-submit-duplicate");
  expect(dup).toHaveTextContent(/already submitted/i);
  // No retry button — retrying a duplicate would 409 forever.
  expect(screen.queryByTestId("assessment-submit-retry-button")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("assessment-submit-view-status-button"));
  expect(onDuplicate).toHaveBeenCalled();
});
