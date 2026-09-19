/**
 * AssessmentDetailSheet.test.jsx — the assessment introduction / status
 * surface. Everything rendered must come from the assessment object the
 * backend returned (including mySubmission) — never a client guess.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import AssessmentDetailSheet from "../AssessmentDetailSheet";

const BASE = {
  assessmentId: "asmt_1",
  title: "Long & Short Sound Listening Challenge",
  subject: "Phonics",
  totalPoints: 15,
  questions: Array.from({ length: 30 }, (_, i) => ({ qid: `q${i + 1}` })),
  mySubmission: null,
};

test("renders nothing when closed", () => {
  render(<AssessmentDetailSheet open={false} assessment={BASE} onClose={jest.fn()} />);
  expect(screen.queryByTestId("assessment-detail-sheet")).not.toBeInTheDocument();
});

test("unsubmitted: shows the introduction — how it works, file rules, and a Submit CTA", () => {
  const onPrimaryAction = jest.fn();
  render(<AssessmentDetailSheet open assessment={BASE} onClose={jest.fn()} onPrimaryAction={onPrimaryAction} />);

  expect(screen.getByText(BASE.title)).toBeInTheDocument();
  expect(screen.getByTestId("assessment-detail-meta-questions")).toHaveTextContent("30 questions");
  expect(screen.getByTestId("assessment-detail-meta-points")).toHaveTextContent("15 pts");
  expect(screen.getByTestId("assessment-detail-status-badge")).toHaveTextContent("Not submitted");

  const how = screen.getByTestId("assessment-detail-how-it-works");
  expect(how).toHaveTextContent(/photograph your completed worksheet/i);
  expect(how).toHaveTextContent(/teacher reviews and awards points/i);

  const rules = screen.getByTestId("assessment-detail-file-rules");
  expect(rules).toHaveTextContent("PDF");
  expect(rules).toHaveTextContent("25 MB");
  expect(rules).toHaveTextContent(/one submission/i);

  const cta = screen.getByTestId("assessment-detail-primary-cta");
  expect(cta).toHaveTextContent("Submit worksheet");
  fireEvent.click(cta);
  expect(onPrimaryAction).toHaveBeenCalledWith(BASE);
});

test("failed: explains the failure and offers Try again", () => {
  const assessment = { ...BASE, mySubmission: { submissionId: "s1", status: "failed" } };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onPrimaryAction={jest.fn()} />);
  expect(screen.getByTestId("assessment-detail-failed-note")).toHaveTextContent(/couldn't be processed/i);
  expect(screen.getByTestId("assessment-detail-primary-cta")).toHaveTextContent("Try again");
  // No extractionError on this record — no hint fabricated beyond the honest generic copy.
  expect(screen.queryByTestId("assessment-detail-failed-hint")).not.toBeInTheDocument();
});

// Regression: the backend persists the real AssessmentAiError reason code
// (assessment_tools.py) — this is NOT an anti-cheat rejection (no such
// mechanism exists in the pipeline), it's a genuine technical extraction
// outcome, and the UI must say so honestly rather than leaving a bare,
// undiagnosable "couldn't be processed".
test("failed: a provider-side reason surfaces as a temporary-system-issue hint, never blamed on the student", () => {
  const assessment = {
    ...BASE,
    mySubmission: { submissionId: "s1", status: "failed", extractionError: "provider_rejected: Gemini HTTP 500" },
  };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onPrimaryAction={jest.fn()} />);
  expect(screen.getByTestId("assessment-detail-failed-hint")).toHaveTextContent(/temporary system issue/i);
});

test("failed: an unreadable-photo reason surfaces as a read-quality hint", () => {
  const assessment = {
    ...BASE,
    mySubmission: { submissionId: "s1", status: "failed", extractionError: "bad_response: no answers array" },
  };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onPrimaryAction={jest.fn()} />);
  expect(screen.getByTestId("assessment-detail-failed-hint")).toHaveTextContent(/couldn't read your photo clearly/i);
});

test("scored: shows the real score summary, the journey timeline and a View results CTA", () => {
  const assessment = {
    ...BASE,
    mySubmission: {
      submissionId: "s1",
      status: "scored",
      score: { correct: 27, total: 30, scorePct: 90, pointsEarned: 13.5 },
    },
  };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onPrimaryAction={jest.fn()} />);

  const summary = screen.getByTestId("assessment-detail-score-summary");
  expect(summary).toHaveTextContent("27");
  expect(summary).toHaveTextContent("90% correct");
  // Fractional points preserved exactly — 13.5, never 13 or 14.
  expect(summary).toHaveTextContent("13.5 / 15 pts");
  expect(summary).toHaveTextContent(/award pending/i);

  expect(screen.getByTestId("assessment-detail-timeline")).toBeInTheDocument();
  expect(screen.getByTestId("assessment-detail-timeline-step-review")).toHaveAttribute("data-state", "active");
  expect(screen.getByTestId("assessment-detail-primary-cta")).toHaveTextContent("View full results");
});

test("needs_review: explains the provisional state — never a dead end", () => {
  const assessment = {
    ...BASE,
    mySubmission: {
      submissionId: "s1",
      status: "needs_review",
      score: { correct: 28, total: 30, scorePct: 93.3, pointsEarned: 14 },
    },
  };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onPrimaryAction={jest.fn()} />);
  expect(screen.getByTestId("assessment-detail-review-note")).toHaveTextContent(/teacher will check/i);
  expect(screen.getByTestId("assessment-detail-review-note")).toHaveTextContent(/nothing is needed from you/i);
});

test("awarded: shows the credited note and the completed journey", () => {
  const assessment = {
    ...BASE,
    mySubmission: {
      submissionId: "s1",
      status: "awarded",
      score: { correct: 30, total: 30, scorePct: 100, pointsEarned: 15 },
    },
  };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onPrimaryAction={jest.fn()} />);
  expect(screen.getByTestId("assessment-detail-awarded-note")).toHaveTextContent(/points are in your wallet/i);
  expect(screen.getByTestId("assessment-detail-timeline-step-awarded")).toHaveAttribute("data-state", "done");
});

test("processing: honest in-flight state with a refresh action", () => {
  const onRefresh = jest.fn();
  const assessment = { ...BASE, mySubmission: { submissionId: "s1", status: "processing" } };
  render(<AssessmentDetailSheet open assessment={assessment} onClose={jest.fn()} onRefresh={onRefresh} />);
  expect(screen.getByTestId("assessment-detail-processing")).toHaveTextContent(/being read/i);
  fireEvent.click(screen.getByTestId("assessment-detail-refresh-button"));
  expect(onRefresh).toHaveBeenCalled();
});

test("Escape closes the sheet", () => {
  const onClose = jest.fn();
  render(<AssessmentDetailSheet open assessment={BASE} onClose={onClose} />);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

// Regression: without this, the dashboard behind the blur stayed
// scrollable, so a touch meant for the sheet could drag the page
// underneath instead — producing unstable scroll, stray taps landing on
// shifted background elements, and the sheet appearing to "pull left/right".
test("locks background scroll while open and restores it on close", () => {
  const { rerender } = render(<AssessmentDetailSheet open={false} assessment={BASE} onClose={jest.fn()} />);
  expect(document.body.style.overflow).not.toBe("hidden");

  rerender(<AssessmentDetailSheet open assessment={BASE} onClose={jest.fn()} />);
  expect(document.body.style.overflow).toBe("hidden");

  rerender(<AssessmentDetailSheet open={false} assessment={BASE} onClose={jest.fn()} />);
  expect(document.body.style.overflow).toBe("");
});

// Regression: a long, underscore-joined title (e.g. an uploaded filename
// used as a title, with no spaces to wrap at) previously forced the whole
// sheet wider than the viewport instead of wrapping, causing real
// horizontal scroll/overflow on mobile.
test("a long, space-less title wraps instead of overflowing the sheet", () => {
  const longTitle = "Long_Short_Sound_Listening_Challenge_Teacher_Script_IPA_Answer_Key_Extended";
  render(<AssessmentDetailSheet open assessment={{ ...BASE, title: longTitle }} onClose={jest.fn()} />);
  expect(screen.getByText(longTitle).className).toEqual(expect.stringContaining("break-words"));
});
