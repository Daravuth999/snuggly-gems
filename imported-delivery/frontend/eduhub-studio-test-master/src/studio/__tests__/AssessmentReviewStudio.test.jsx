/**
 * AssessmentReviewStudio.test.jsx — Author Studio's Assessment Lab panel.
 * Covers the answer-key extraction -> save flow, the submissions list, and
 * the individual + bulk award actions (the bulk-select UI has no
 * precedent elsewhere in this codebase, so it's exercised end-to-end here).
 */
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import AssessmentReviewStudio from "../AssessmentReviewStudio";
import {
  extractAssessmentAnswerKey, createAssessment, listAssessments, listAssessmentSubmissions,
  awardAssessmentSubmission, bulkAwardAssessmentSubmissions, retryAssessmentGasSync,
  correctAssessmentSubmission, deleteAssessmentSubmission, runAssessmentExtractionCheck,
  applyAssessmentCorrection, listAssessmentCorrections, updateAssessment, deleteAssessment,
} from "../api";

jest.mock("../api", () => ({
  extractAssessmentAnswerKey: jest.fn(),
  createAssessment: jest.fn(),
  listAssessments: jest.fn(),
  listAssessmentSubmissions: jest.fn(),
  awardAssessmentSubmission: jest.fn(),
  bulkAwardAssessmentSubmissions: jest.fn(),
  retryAssessmentGasSync: jest.fn(),
  correctAssessmentSubmission: jest.fn(),
  deleteAssessmentSubmission: jest.fn(),
  runAssessmentExtractionCheck: jest.fn(),
  applyAssessmentCorrection: jest.fn(),
  listAssessmentCorrections: jest.fn(),
  updateAssessment: jest.fn(),
  deleteAssessment: jest.fn(),
}));

const ASSESSMENT = {
  assessmentId: "asmt_1", title: "Long & Short Sound Listening Challenge", status: "published", totalPoints: 15,
  questions: [
    { qid: "q1", prompt: "sheep", correctAnswer: "LONG", points: 0.5 },
    { qid: "q2", prompt: "ship", correctAnswer: "SHORT", points: 0.5 },
  ],
};
const SUBMISSIONS = [
  {
    submissionId: "s1", cleanId: "stu094", status: "scored", studentName: "Alice Chan",
    mediaRef: "https://r2.example/assessment-media/stu094/abc123.jpg",
    score: {
      correct: 15, total: 30, scorePct: 50, pointsEarned: 7.5,
      details: [
        { qid: "q1", prompt: "sheep", givenAnswer: "LONG", correctAnswer: "LONG", correct: true, answerState: "answered", confidence: 0.95 },
        { qid: "q2", prompt: "ship", givenAnswer: null, correctAnswer: "SHORT", correct: false, answerState: "uncertain", confidence: 0.31 },
      ],
    },
    extraction: { engine: "gemini", model: "gemini-2.5-pro", rawAnswerCount: 30, normalizedAnswerCount: 30 },
  },
  { submissionId: "s2", cleanId: "stu095", status: "needs_review", score: { correct: 20, total: 30, scorePct: 66.7, pointsEarned: 10 } },
  {
    submissionId: "s3", cleanId: "stu021", status: "awarded",
    score: {
      correct: 30, total: 30, scorePct: 100, pointsEarned: 15,
      details: [
        { qid: "q1", prompt: "sheep", givenAnswer: "LONG", correctAnswer: "LONG", correct: true, points: 0.5, pointsEarned: 0.5, answerState: "answered", confidence: 0.95 },
        { qid: "q2", prompt: "ship", givenAnswer: null, correctAnswer: "SHORT", correct: false, points: 0.5, pointsEarned: 0, answerState: "uncertain", confidence: 0.3 },
      ],
    },
    award: {
      pointsCredited: 15, balanceAfter: 115, creditedAt: "2026-08-12T15:00:00Z",
      notifiedAt: "2026-08-12T15:00:01Z", gasSynced: false, gasSyncError: "GAS unreachable",
    },
    correctionVersion: 0,
    correctionState: "none",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  listAssessments.mockResolvedValue({ assessments: [ASSESSMENT] });
  listAssessmentSubmissions.mockResolvedValue({ submissions: SUBMISSIONS });
  listAssessmentCorrections.mockResolvedValue({ corrections: [] });
});

async function expandAwardedRow(submissions = SUBMISSIONS) {
  listAssessmentSubmissions.mockResolvedValue({ submissions });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu021");
  const expandButtons = screen.getAllByTestId("assessment-submission-expand-button");
  fireEvent.click(expandButtons[2]); // s3 is the third (index 2) submission row
  await screen.findByTestId("assessment-submission-detail");
}

// A self-consistent variant of s3 (award.pointsCredited matches the sum
// of its own score.details, unlike the shared SUBMISSIONS fixture above
// whose s3.award.pointsCredited=15 is deliberately unrelated to its
// 2-question detail array — fine for the wallet-proof-display tests,
// but Before/After math needs real numbers to mean anything).
const SUBMISSIONS_CONSISTENT_S3 = SUBMISSIONS.map((s) =>
  s.submissionId === "s3" ? { ...s, award: { ...s.award, pointsCredited: 0.5, balanceAfter: 100.5 } } : s);

async function renderPanel() {
  await act(async () => { render(<AssessmentReviewStudio />); });
  await waitFor(() => expect(listAssessments).toHaveBeenCalled());
}

test("extracting an answer key populates the editable question list", async () => {
  extractAssessmentAnswerKey.mockResolvedValue({
    ok: true,
    questions: [
      { qid: "q1", prompt: "sheep", correctAnswer: "LONG", points: 0.5 },
      { qid: "q2", prompt: "ship", correctAnswer: "SHORT", points: 0.5 },
    ],
  });
  await renderPanel();
  const file = new File(["fake"], "key.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  fireEvent.change(screen.getByTestId("assessment-key-file-input"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId("assessment-question-editor")).toBeInTheDocument());
  expect(extractAssessmentAnswerKey).toHaveBeenCalledWith(file);
  expect(screen.getAllByDisplayValue("sheep")).toHaveLength(1);
});

test("Save & Publish sends the edited questions and refreshes the assessment list", async () => {
  extractAssessmentAnswerKey.mockResolvedValue({
    ok: true, questions: [{ qid: "q1", prompt: "sheep", correctAnswer: "LONG", points: 0.5 }],
  });
  createAssessment.mockResolvedValue({ ok: true, assessment: { ...ASSESSMENT, assessmentId: "asmt_2" } });
  await renderPanel();
  const file = new File(["fake"], "key.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByTestId("assessment-key-file-input"), { target: { files: [file] } });
  await screen.findByTestId("assessment-question-editor");

  fireEvent.change(screen.getByTestId("assessment-title-input"), { target: { value: "Listening Challenge" } });
  await act(async () => { fireEvent.click(screen.getByTestId("assessment-save-publish-button")); });

  expect(createAssessment).toHaveBeenCalledWith(expect.objectContaining({
    title: "Listening Challenge",
    publish: true,
    questions: [{ qid: "q1", prompt: "sheep", correctAnswer: "LONG", points: 0.5 }],
  }));
  await waitFor(() => expect(listAssessments).toHaveBeenCalledTimes(2));
});

test("selecting an assessment loads its submissions with status + score", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await waitFor(() => expect(listAssessmentSubmissions).toHaveBeenCalledWith("asmt_1", undefined));
  expect(await screen.findByText("stu094")).toBeInTheDocument();
  const badges = screen.getAllByTestId("assessment-submission-status-badge");
  expect(badges[0]).toHaveTextContent("scored");
  expect(badges[1]).toHaveTextContent("needs_review");
});

// A teacher must always be able to tell whose worksheet a row is —
// resolved from the backend's real studentName (assessment_tools.py's
// db.students join) when available, with the raw id always visible too so
// the exact account can still be cross-referenced.
test("every submission row shows whose worksheet it is — a real name when known, the raw id honestly when not", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  const names = await screen.findAllByTestId("assessment-submission-student-name");
  const ids = screen.getAllByTestId("assessment-submission-student-id");

  // s1 has a resolved studentName — it's the headline, id stays visible.
  expect(names[0]).toHaveTextContent("Alice Chan");
  expect(ids[0]).toHaveTextContent("stu094");

  // s2/s3 have no resolved name — the raw id is the honest fallback
  // headline, never a fabricated name.
  expect(names[1]).toHaveTextContent("stu095");
  expect(ids[1]).toHaveTextContent(/no name on file/i);
  expect(names[2]).toHaveTextContent("stu021");
});

test("individual award calls the single-award endpoint and refreshes the row", async () => {
  awardAssessmentSubmission.mockResolvedValue({ ok: true, duplicate: false, points: 15 });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");

  const awardButtons = screen.getAllByTestId("assessment-award-button");
  await act(async () => { fireEvent.click(awardButtons[0]); });
  expect(awardAssessmentSubmission).toHaveBeenCalledWith("s1");
  await waitFor(() => expect(listAssessmentSubmissions).toHaveBeenCalledTimes(2));
});

test("bulk-select shows a 'N selected' bar and bulk-awards only the checked rows", async () => {
  bulkAwardAssessmentSubmissions.mockResolvedValue({ ok: true, awarded: 1, failed: 0, results: [] });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");

  const checkboxes = screen.getAllByTestId("assessment-submission-checkbox");
  // Every submission with a persisted calculated score is selectable —
  // including needs_review (never a dead end): s1 (scored) AND s2 (needs_review).
  expect(checkboxes[0]).not.toBeDisabled();
  expect(checkboxes[1]).not.toBeDisabled();

  fireEvent.click(checkboxes[0]);
  expect(screen.getByTestId("assessment-bulk-award-bar")).toHaveTextContent("1 selected");

  await act(async () => { fireEvent.click(screen.getByTestId("assessment-bulk-award-button")); });
  expect(bulkAwardAssessmentSubmissions).toHaveBeenCalledWith(["s1"]);
  await waitFor(() => expect(screen.queryByTestId("assessment-bulk-award-bar")).not.toBeInTheDocument());
});

// Regression: assessment_tools.py now persists the real AssessmentAiError
// reason code on a failed extraction — this is never an anti-cheat
// rejection (no such mechanism exists in the pipeline), always a genuine
// technical outcome, and a teacher/admin needs to see it, not a bare
// unexplained "failed" badge with no score and no diagnostic.
test("a failed extraction shows the real persisted reason so a teacher can tell it apart from an anti-cheat rejection (there is none)", async () => {
  listAssessmentSubmissions.mockResolvedValue({
    submissions: [
      { submissionId: "s9", cleanId: "stu094", status: "failed", extractionError: "provider_rejected: Gemini HTTP 500" },
    ],
  });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  const reason = await screen.findByTestId("assessment-submission-failure-reason");
  expect(reason).toHaveTextContent("provider_rejected: Gemini HTTP 500");
  // A failed submission has no score — no Award button must appear.
  expect(screen.queryByTestId("assessment-award-button")).not.toBeInTheDocument();
});

test("empty submissions list renders the honest empty state", async () => {
  listAssessmentSubmissions.mockResolvedValue({ submissions: [] });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await waitFor(() => expect(screen.getByText(/No submissions yet/i)).toBeInTheDocument());
});

test("a scored submission shows 'not yet awarded'; an awarded one shows 'points awarded'", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");
  expect(screen.getByText(/7\.5 pts.*not yet awarded/)).toBeInTheDocument();
});

test("expanding a submission row reveals the per-question given-vs-correct detail from the persisted score", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");

  expect(screen.queryByTestId("assessment-submission-detail")).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByTestId("assessment-submission-expand-button")[0]);

  const detail = await screen.findByTestId("assessment-submission-detail");
  expect(detail).toHaveTextContent("Gemini returned 30 answer(s)");
  expect(detail).toHaveTextContent("30 matched a known question");
  const rows = screen.getAllByTestId("assessment-submission-detail-row");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("LONG");
  expect(rows[1]).toHaveTextContent("SHORT");
});

test("the submission detail has no extraction meta line when the submission predates that field", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu095");
  fireEvent.click(screen.getAllByTestId("assessment-submission-expand-button")[1]);
  const detail = await screen.findByTestId("assessment-submission-detail");
  expect(screen.queryByTestId("assessment-submission-extraction-meta")).not.toBeInTheDocument();
  expect(detail).toHaveTextContent("No extracted-answer detail available.");
});

test("View answer key reveals the assessment's persisted correctAnswer values, letting a teacher self-diagnose the source of truth", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));

  expect(screen.queryByTestId("assessment-answer-key-view")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("assessment-view-answer-key-button"));

  const view = await screen.findByTestId("assessment-answer-key-view");
  const rows = screen.getAllByTestId("assessment-answer-key-row");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("sheep");
  expect(rows[0]).toHaveTextContent("LONG");
  expect(rows[1]).toHaveTextContent("ship");
  expect(rows[1]).toHaveTextContent("SHORT");

  fireEvent.click(screen.getByTestId("assessment-view-answer-key-button"));
  expect(view).not.toBeInTheDocument();
});

test("an awarded submission shows real wallet-credit proof, not just a status label", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu021");

  const proof = screen.getByTestId("assessment-award-proof");
  expect(proof).toHaveTextContent("15 pts credited");
  expect(proof).toHaveTextContent("115");
  expect(proof).toHaveTextContent("Notification sent");
});

test("a failed legacy points-pill sync is shown honestly, with a working retry that never re-credits the wallet", async () => {
  retryAssessmentGasSync.mockResolvedValue({ ok: true, gasSynced: true });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu021");

  const failedNote = screen.getByTestId("assessment-award-gas-sync-failed");
  expect(failedNote).toHaveTextContent("Legacy points-pill sync failed");
  expect(failedNote).toHaveTextContent("GAS unreachable");
  expect(failedNote).toHaveTextContent("unaffected");

  await act(async () => {
    fireEvent.click(screen.getByTestId("assessment-retry-gas-sync-button"));
  });
  expect(retryAssessmentGasSync).toHaveBeenCalledWith("s3");
  // Retrying the sync must never call the award endpoint again.
  expect(awardAssessmentSubmission).not.toHaveBeenCalled();
  await waitFor(() => expect(listAssessmentSubmissions).toHaveBeenCalledTimes(2));
});

test("a needs_review submission is actionable — it has its own Award button (never a dead end)", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu095");
  const awardButtons = screen.getAllByTestId("assessment-award-button");
  // s1 (scored, 7.5 pts) AND s2 (needs_review, 10 pts) both awardable.
  expect(awardButtons).toHaveLength(2);
  expect(awardButtons[1]).toHaveTextContent("Award 10 pts");
});

test("teacher can correct a Gemini misreading inline; the correction hits the backend and refreshes", async () => {
  correctAssessmentSubmission.mockResolvedValue({ ok: true, score: { correct: 16 }, correctedQids: ["q2"] });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");
  fireEvent.click(screen.getAllByTestId("assessment-submission-expand-button")[0]);
  await screen.findByTestId("assessment-submission-detail");

  // q2 was read as uncertain — open its correction editor and fix it.
  fireEvent.click(screen.getAllByTestId("assessment-correct-toggle-button")[1]);
  const input = screen.getByTestId("assessment-correction-input");
  fireEvent.change(input, { target: { value: "SHORT" } });
  await act(async () => { fireEvent.click(screen.getByTestId("assessment-apply-correction-button")); });

  expect(correctAssessmentSubmission).toHaveBeenCalledWith("s1", [{ qid: "q2", answer: "SHORT" }]);
  await waitFor(() => expect(listAssessmentSubmissions).toHaveBeenCalledTimes(2));
});

test("the original R2 paper is one click away as evidence, and the model used is shown", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");
  fireEvent.click(screen.getAllByTestId("assessment-submission-expand-button")[0]);
  const link = await screen.findByTestId("assessment-view-original-paper");
  expect(link).toHaveAttribute("href", "https://r2.example/assessment-media/stu094/abc123.jpg");
  expect(screen.getByTestId("assessment-submission-extraction-meta")).toHaveTextContent("gemini-2.5-pro");
});

test("deleting a non-awarded submission asks for confirmation and calls the delete endpoint; awarded rows have no delete control", async () => {
  deleteAssessmentSubmission.mockResolvedValue({ ok: true, mediaDeleted: true });
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");

  const deleteButtons = screen.getAllByTestId("assessment-delete-submission-button");
  expect(deleteButtons).toHaveLength(2); // s1 + s2 — never s3 (awarded, audit trail)
  await act(async () => { fireEvent.click(deleteButtons[0]); });
  expect(confirmSpy).toHaveBeenCalled();
  expect(deleteAssessmentSubmission).toHaveBeenCalledWith("s1");
  confirmSpy.mockRestore();
});

test("confidence pills are heat-colored so weak readings jump out before awarding", async () => {
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");
  fireEvent.click(screen.getAllByTestId("assessment-submission-expand-button")[0]);
  await screen.findByTestId("assessment-submission-detail");
  const pills = screen.getAllByTestId("assessment-confidence-pill");
  expect(pills[0]).toHaveAttribute("data-confidence-band", "high");     // 0.95
  expect(pills[1]).toHaveAttribute("data-confidence-band", "critical"); // 0.31
});

test("teachers can open a correction-history timeline showing who changed what and when", async () => {
  const withCorrections = SUBMISSIONS.map((s) =>
    s.submissionId === "s1"
      ? {
          ...s,
          teacherCorrections: [
            { qid: "q2", previousAnswer: null, previousState: "uncertain", answer: "SHORT",
              correctedBy: "teacher@eduhub.app", correctedAt: "2026-06-01T09:30:00+00:00" },
            "q9", // legacy record shape must not crash the timeline
          ],
        }
      : s);
  listAssessmentSubmissions.mockResolvedValue({ ok: true, submissions: withCorrections });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByText("stu094");
  fireEvent.click(screen.getAllByTestId("assessment-submission-expand-button")[0]);
  await screen.findByTestId("assessment-submission-detail");

  fireEvent.click(screen.getByTestId("assessment-correction-history-toggle"));
  const history = screen.getByTestId("assessment-correction-history");
  expect(history).toHaveTextContent("q2");
  expect(history).toHaveTextContent("→ SHORT");
  expect(history).toHaveTextContent("teacher@eduhub.app");
  expect(history).toHaveTextContent("2026-06-01T09:30:00+00:00");
  const items = screen.getAllByTestId("assessment-correction-history-item");
  expect(items).toHaveLength(2);
  expect(items[1]).toHaveTextContent(/legacy record/i);
});

test("the staging extraction check uploads a worksheet and reports the real-vs-baseline comparison", async () => {
  runAssessmentExtractionCheck.mockResolvedValue({
    ok: true, engine: "gemini", model: "gemini-2.5-pro", total: 30, matches: 28,
    verification: { checkedQids: ["q1"] },
    mismatches: [{ qid: "q3", prompt: "cheap", baseline: "LONG", real: "SHORT", confidence: 0.8 }],
    unreadable: [{ qid: "q1", prompt: "sheep", answerState: "uncertain", confidence: 0.31 }],
    scorePreview: { correct: 28, total: 30, scorePct: 93.3, pointsEarned: 14, needsReview: true },
  });
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  await screen.findByTestId("assessment-extraction-check-panel");

  fireEvent.click(screen.getByTestId("assessment-extraction-check-toggle"));
  const file = new File(["fake"], "worksheet.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByTestId("assessment-extraction-check-file-input"), { target: { files: [file] } });
  await act(async () => { fireEvent.click(screen.getByTestId("assessment-extraction-check-run-button")); });

  expect(runAssessmentExtractionCheck).toHaveBeenCalledWith(ASSESSMENT.assessmentId, file);
  const result = await screen.findByTestId("assessment-extraction-check-result");
  expect(result).toHaveTextContent("28 / 30");
  expect(result).toHaveTextContent("gemini-2.5-pro");
  expect(screen.getByTestId("assessment-extraction-check-mismatch")).toHaveTextContent("cheap");
  expect(screen.getByTestId("assessment-extraction-check-unreadable")).toHaveTextContent("sheep");
});

test("an unavailable real credential surfaces the backend's honest 503 message", async () => {
  runAssessmentExtractionCheck.mockRejectedValue(new Error("Real Gemini extraction is not configured in this environment"));
  await renderPanel();
  fireEvent.click(screen.getByText(ASSESSMENT.title));
  fireEvent.click(await screen.findByTestId("assessment-extraction-check-toggle"));
  const file = new File(["fake"], "worksheet.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("assessment-extraction-check-file-input"), { target: { files: [file] } });
  await act(async () => { fireEvent.click(screen.getByTestId("assessment-extraction-check-run-button")); });
  expect(await screen.findByTestId("assessment-extraction-check-error")).toHaveTextContent(/not configured/i);
});

// ── post-award correction (reverse review) ────────────────────────────────
describe("post-award correction workspace", () => {
  test("an awarded row shows a distinctly-styled 'Review & Correct' action, never a plain edit control", async () => {
    await expandAwardedRow();
    expect(screen.getByTestId("assessment-reopen-correction-button")).toHaveTextContent("Review & Correct");
    // The pre-award pencil-edit toggle must be absent for an awarded row.
    expect(screen.queryByTestId("assessment-correct-toggle-button")).not.toBeInTheDocument();
  });

  test("edge case A: reopen -> no changes -> cancel makes zero API calls", async () => {
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    const confirm = screen.getByTestId("assessment-reopen-confirm");
    expect(confirm).toHaveTextContent(/already been awarded/i);
    expect(confirm).toHaveTextContent(/may change the student's score and points/i);

    fireEvent.click(screen.getByTestId("assessment-reopen-cancel-button"));
    expect(screen.queryByTestId("assessment-correction-workspace")).not.toBeInTheDocument();
    expect(applyAssessmentCorrection).not.toHaveBeenCalled();
  });

  test("teacher can distinguish ORIGINAL (before any correction) from CURRENT — for a submission already corrected once", async () => {
    const alreadyCorrected = SUBMISSIONS.map((s) => s.submissionId === "s3" ? {
      ...s,
      score: { correct: 30, total: 30, scorePct: 100, pointsEarned: 15, details: s.score.details },
      award: { ...s.award, pointsCredited: 15 },
      originalAward: { score: { correct: 29, total: 30 }, pointsCredited: 14.5 },
      correctionState: "applied",
    } : s);
    await expandAwardedRow(alreadyCorrected);
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    const compare = await screen.findByTestId("assessment-correction-original-vs-current");
    expect(compare).toHaveTextContent("29/30");
    expect(compare).toHaveTextContent("14.5 pts");
    expect(compare).toHaveTextContent("30/30");
    expect(compare).toHaveTextContent("15 pts");
    expect(compare).toHaveTextContent(/before any correction/i);
  });

  test("for a submission's FIRST correction, original and current are shown as identical, honestly labeled", async () => {
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    const compare = await screen.findByTestId("assessment-correction-original-vs-current");
    expect(compare).toHaveTextContent(/this is the first correction/i);
  });

  test("reopening requires explicit confirmation, then shows every question with an override control", async () => {
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));

    const workspace = await screen.findByTestId("assessment-correction-workspace");
    expect(workspace).toBeInTheDocument();
    const rows = screen.getAllByTestId("assessment-correction-override-row");
    expect(rows).toHaveLength(2); // q1, q2

    // No overrides opened yet -> cannot proceed to review.
    expect(screen.getByTestId("assessment-correction-review-button")).toBeDisabled();
  });

  test("opening a question's override defaults to its CURRENT correctness/points, editable independent of the raw answer text", async () => {
    await expandAwardedRow(SUBMISSIONS_CONSISTENT_S3);
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");

    // q2 was originally incorrect (uncertain, 0 pts) — student evidence
    // now shows it should be accepted.
    fireEvent.click(screen.getAllByTestId("assessment-override-open-button")[1]);
    const editor = screen.getAllByTestId("assessment-override-editor")[0];
    const checkbox = screen.getByTestId("assessment-override-correct-checkbox");
    expect(checkbox).not.toBeChecked(); // defaults to current (incorrect)

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    const pointsInput = screen.getByTestId("assessment-override-points-input");
    fireEvent.change(pointsInput, { target: { value: "0.5" } });
    fireEvent.change(screen.getByTestId("assessment-override-note-input"),
      { target: { value: "Handwriting legible on the original paper." } });

    // Review is now enabled since a change is staged.
    expect(screen.getByTestId("assessment-correction-review-button")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("assessment-correction-review-button"));

    const before = screen.getByTestId("assessment-correction-before");
    const after = screen.getByTestId("assessment-correction-after");
    expect(before).toHaveTextContent("0.5"); // pointsCredited before (q1 only)
    expect(after).toHaveTextContent("1"); // q1 (0.5) + newly-corrected q2 (0.5)
    expect(screen.getByTestId("assessment-correction-change-summary")).toHaveTextContent("+0.5");
  });

  test("applying a correction sends exactly the staged change with a reason, and refreshes on success", async () => {
    applyAssessmentCorrection.mockResolvedValue({
      ok: true, duplicate: false, score: { correct: 2, total: 2, pointsEarned: 1 },
      award: { pointsCredited: 1 }, correctionVersion: 1,
      correction: { correctionId: "acor_1", walletAdjustment: 0.5 },
    });
    await expandAwardedRow(SUBMISSIONS_CONSISTENT_S3);
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");

    fireEvent.click(screen.getAllByTestId("assessment-override-open-button")[1]);
    fireEvent.click(screen.getByTestId("assessment-override-correct-checkbox"));
    fireEvent.click(screen.getByTestId("assessment-correction-review-button"));

    fireEvent.change(screen.getByTestId("assessment-correction-reason-select"),
      { target: { value: "student_evidence_accepted" } });
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-apply-button")); });

    expect(applyAssessmentCorrection).toHaveBeenCalledTimes(1);
    const [subId, payload] = applyAssessmentCorrection.mock.calls[0];
    expect(subId).toBe("s3");
    expect(payload.reason).toBe("student_evidence_accepted");
    expect(payload.expectedVersion).toBe(0);
    expect(payload.corrections).toEqual([{ qid: "q2", correct: true, points: 0.5, note: undefined }]);
    expect(typeof payload.clientToken).toBe("string");
    expect(payload.clientToken.length).toBeGreaterThan(0);

    // Workspace resets and the submissions list is refreshed.
    await waitFor(() => expect(screen.queryByTestId("assessment-correction-workspace")).not.toBeInTheDocument());
    await waitFor(() => expect(listAssessmentSubmissions).toHaveBeenCalledTimes(2));
  });

  test("Apply is blocked without a reason, and 'Other' additionally requires a note", async () => {
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");
    fireEvent.click(screen.getAllByTestId("assessment-override-open-button")[1]);
    fireEvent.click(screen.getByTestId("assessment-override-correct-checkbox"));
    fireEvent.click(screen.getByTestId("assessment-correction-review-button"));

    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-apply-button")); });
    expect(applyAssessmentCorrection).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("assessment-correction-reason-select"), { target: { value: "other" } });
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-apply-button")); });
    expect(applyAssessmentCorrection).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("assessment-correction-reason-note"), { target: { value: "Special case" } });
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-apply-button")); });
    expect(applyAssessmentCorrection).toHaveBeenCalledTimes(1);
  });

  test("edge case F: a stale-version (409) response shows a refresh prompt, never silently retries", async () => {
    // The real backend detail (which version numbers actually mismatched)
    // must reach the banner verbatim — never collapsed to a generic
    // string that hides whether this is a genuine concurrent edit or a
    // version-tracking bug. See the false-stale-conflict regression below
    // for the case this distinction actually matters.
    applyAssessmentCorrection.mockRejectedValue(
      new Error("409: This submission was corrected since you opened it (you have version 0, current is 1). Refresh and review the latest state before correcting again."),
    );
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");
    fireEvent.click(screen.getAllByTestId("assessment-override-open-button")[1]);
    fireEvent.click(screen.getByTestId("assessment-override-correct-checkbox"));
    fireEvent.click(screen.getByTestId("assessment-correction-review-button"));
    fireEvent.change(screen.getByTestId("assessment-correction-reason-select"), { target: { value: "teacher_grading_mistake" } });
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-apply-button")); });

    const staleBanner = await screen.findByTestId("assessment-correction-stale-error");
    expect(staleBanner).toHaveTextContent(/corrected since you opened it/i);
    // The real numbers from the backend, not a hardcoded generic message.
    expect(staleBanner).toHaveTextContent(/version 0, current is 1/i);
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-refresh-button")); });
    expect(screen.queryByTestId("assessment-correction-workspace")).not.toBeInTheDocument();
  });

  test("a message-less 409 (network layer stripped the detail) still shows the friendly fallback copy", async () => {
    // The real backend route always includes a full sentence (see the
    // primary stale-conflict test above) — this only covers the
    // defensive fallback for the pathological case where e.message comes
    // back empty, e.g. a proxy/network layer between client and server
    // swallowed the response body.
    const err = new Error("");
    applyAssessmentCorrection.mockRejectedValue(err);
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");
    fireEvent.click(screen.getAllByTestId("assessment-override-open-button")[1]);
    fireEvent.click(screen.getByTestId("assessment-override-correct-checkbox"));
    fireEvent.click(screen.getByTestId("assessment-correction-review-button"));
    fireEvent.change(screen.getByTestId("assessment-correction-reason-select"), { target: { value: "teacher_grading_mistake" } });
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-correction-apply-button")); });

    // An empty e.message never matches the stale-conflict regex, so this
    // falls into the generic error banner instead — proving the workspace
    // never silently hangs when the true message is unavailable.
    await screen.findByText(/correction failed/i);
    expect(screen.queryByTestId("assessment-correction-stale-error")).not.toBeInTheDocument();
  });

  test("correction history is fetched and rendered on demand, distinct from the pre-award correction timeline", async () => {
    listAssessmentCorrections.mockResolvedValue({
      corrections: [{
        correctionId: "acor_1", originalPoints: 14.5, correctedPoints: 15, walletAdjustment: 0.5,
        reason: "student_evidence_accepted", reasonNote: "", teacherEmail: "teacher@example.com",
        createdAt: "2026-08-14T10:00:00Z", notifiedAt: "2026-08-14T10:00:01Z",
      }],
    });
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");

    fireEvent.click(screen.getByTestId("assessment-postaward-history-toggle"));
    const item = await screen.findByTestId("assessment-postaward-history-item");
    expect(item).toHaveTextContent("14.5");
    expect(item).toHaveTextContent("15");
    expect(item).toHaveTextContent("Student evidence accepted");
    expect(item).toHaveTextContent("teacher@example.com");
  });

  test("a correction with an unrecovered wallet shortfall shows it explicitly, never silently drops it", async () => {
    listAssessmentCorrections.mockResolvedValue({
      corrections: [{
        correctionId: "acor_2", originalPoints: 15, correctedPoints: 14.5,
        walletAdjustment: -0.2, walletShortfall: 0.3,
        reason: "question_key_error", reasonNote: "", teacherEmail: "teacher@example.com",
        createdAt: "2026-08-14T10:00:00Z", notifiedAt: null,
      }],
    });
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");

    fireEvent.click(screen.getByTestId("assessment-postaward-history-toggle"));
    const shortfall = await screen.findByTestId("assessment-postaward-history-shortfall");
    expect(shortfall).toHaveTextContent("0.3");
    expect(shortfall).toHaveTextContent(/could not be recovered/i);
  });

  test("a fully-recovered correction shows no shortfall note", async () => {
    listAssessmentCorrections.mockResolvedValue({
      corrections: [{
        correctionId: "acor_3", originalPoints: 14.5, correctedPoints: 15,
        walletAdjustment: 0.5, walletShortfall: 0,
        reason: "student_evidence_accepted", reasonNote: "", teacherEmail: "teacher@example.com",
        createdAt: "2026-08-14T10:00:00Z", notifiedAt: "2026-08-14T10:00:01Z",
      }],
    });
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");

    fireEvent.click(screen.getByTestId("assessment-postaward-history-toggle"));
    await screen.findByTestId("assessment-postaward-history-item");
    expect(screen.queryByTestId("assessment-postaward-history-shortfall")).not.toBeInTheDocument();
  });

  test("a submission that has never been corrected only ever calls the /correction routes, never a second award", async () => {
    await expandAwardedRow();
    fireEvent.click(screen.getByTestId("assessment-reopen-correction-button"));
    fireEvent.click(screen.getByTestId("assessment-reopen-confirm-button"));
    await screen.findByTestId("assessment-correction-workspace");
    expect(awardAssessmentSubmission).not.toHaveBeenCalled();
    expect(bulkAwardAssessmentSubmissions).not.toHaveBeenCalled();
  });
});

// ── item 2: delete / edit / schedule-targeted assignment ───────────────────
describe("Assessment management controls (delete/edit/schedule)", () => {
  beforeEach(() => {
    deleteAssessment.mockResolvedValue({ ok: true });
    updateAssessment.mockResolvedValue({ ok: true, assessment: { ...ASSESSMENT, title: "Updated Title" } });
  });

  test("a schedule-targeted assessment shows its group as a badge in the list", async () => {
    listAssessments.mockResolvedValue({ assessments: [{ ...ASSESSMENT, group: "A" }] });
    await renderPanel();
    expect(screen.getByTestId("assessment-group-badge")).toHaveTextContent("A");
  });

  test("an untargeted assessment (no group) shows no badge", async () => {
    await renderPanel(); // ASSESSMENT has no group field
    expect(screen.queryByTestId("assessment-group-badge")).not.toBeInTheDocument();
  });

  test("delete asks for confirmation before calling the endpoint", async () => {
    await renderPanel();
    fireEvent.click(screen.getByTestId("assessment-delete-button"));
    expect(deleteAssessment).not.toHaveBeenCalled();
    expect(screen.getByTestId("assessment-delete-confirm")).toBeInTheDocument();
  });

  test("cancelling the delete confirmation never calls the endpoint", async () => {
    await renderPanel();
    fireEvent.click(screen.getByTestId("assessment-delete-button"));
    fireEvent.click(screen.getByTestId("assessment-delete-confirm-cancel"));
    expect(screen.queryByTestId("assessment-delete-confirm")).not.toBeInTheDocument();
    expect(deleteAssessment).not.toHaveBeenCalled();
  });

  test("confirming delete calls the real endpoint and refreshes the list", async () => {
    await renderPanel();
    fireEvent.click(screen.getByTestId("assessment-delete-button"));
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-delete-confirm-confirm")); });

    expect(deleteAssessment).toHaveBeenCalledWith(ASSESSMENT.assessmentId);
    await waitFor(() => expect(listAssessments).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("assessment-delete-confirm")).not.toBeInTheDocument();
  });

  test("deleting the currently-selected assessment clears the selection", async () => {
    await renderPanel();
    fireEvent.click(screen.getByText(ASSESSMENT.title));
    await screen.findByTestId("assessment-view-answer-key-button");

    fireEvent.click(screen.getByTestId("assessment-delete-button"));
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-delete-confirm-confirm")); });

    expect(screen.queryByTestId("assessment-view-answer-key-button")).not.toBeInTheDocument();
  });

  test("clicking Edit opens the edit panel pre-filled with the assessment's real data", async () => {
    listAssessments.mockResolvedValue({ assessments: [{ ...ASSESSMENT, subject: "Phonics", group: "B" }] });
    await renderPanel();
    fireEvent.click(screen.getByTestId("assessment-edit-button"));

    expect(screen.getByTestId("assessment-edit-title-input")).toHaveValue(ASSESSMENT.title);
    expect(screen.getByTestId("assessment-edit-subject-input")).toHaveValue("Phonics");
    expect(screen.getByTestId("assessment-edit-group-select")).toHaveValue("B");
    expect(screen.getByTestId("assessment-edit-status-select")).toHaveValue("published");
  });

  test("saving an edit sends title/subject/group/status and refreshes", async () => {
    await renderPanel();
    fireEvent.click(screen.getByTestId("assessment-edit-button"));
    fireEvent.change(screen.getByTestId("assessment-edit-title-input"), { target: { value: "New Title" } });
    fireEvent.change(screen.getByTestId("assessment-edit-group-select"), { target: { value: "A" } });

    await act(async () => { fireEvent.click(screen.getByTestId("assessment-edit-save-button")); });

    expect(updateAssessment).toHaveBeenCalledWith(ASSESSMENT.assessmentId, expect.objectContaining({
      title: "New Title", group: "A", status: "published",
    }));
    await waitFor(() => expect(listAssessments).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("assessment-edit-panel")).not.toBeInTheDocument();
  });

  test("cancelling the edit panel never calls updateAssessment", async () => {
    await renderPanel();
    fireEvent.click(screen.getByTestId("assessment-edit-button"));
    fireEvent.click(screen.getByTestId("assessment-edit-cancel-button"));
    expect(screen.queryByTestId("assessment-edit-panel")).not.toBeInTheDocument();
    expect(updateAssessment).not.toHaveBeenCalled();
  });

  test("creating an assessment lets a teacher target it at a specific schedule", async () => {
    extractAssessmentAnswerKey.mockResolvedValue({
      ok: true, questions: [{ qid: "q1", prompt: "sheep", correctAnswer: "LONG", points: 0.5 }],
    });
    createAssessment.mockResolvedValue({ ok: true, assessment: ASSESSMENT });
    await renderPanel();
    const file = new File(["fake"], "key.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("assessment-key-file-input"), { target: { files: [file] } });
    await screen.findByTestId("assessment-question-editor");

    fireEvent.change(screen.getByTestId("assessment-title-input"), { target: { value: "Group A Quiz" } });
    fireEvent.change(screen.getByTestId("assessment-group-select"), { target: { value: "A" } });
    await act(async () => { fireEvent.click(screen.getByTestId("assessment-save-publish-button")); });

    expect(createAssessment).toHaveBeenCalledWith(expect.objectContaining({ group: "A" }));
  });
});
