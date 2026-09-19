import { STAGES, stageStatus, currentStage } from "../productionStages";

const BASE_LESSON = { title: "x", category: "conversation", mediaRef: "https://x/y.mp4", status: "draft" };
const APPROVED_SYNC = { reviewStatus: "approved" };

test("voice stage is active (not pending) once media exists, even with no narration job yet", () => {
  const statuses = stageStatus(BASE_LESSON, APPROVED_SYNC, undefined);
  expect(statuses.voice).toBe("active");
  expect(statuses.review).toBe("complete"); // unaffected by voice being untouched
});

test("voice stage is pending only when the lesson has no media yet", () => {
  const noMediaLesson = { title: "x", category: "conversation", status: "draft" };
  const statuses = stageStatus(noMediaLesson, null, undefined);
  expect(statuses.voice).toBe("pending");
});

test("voice stage is active regardless of AI Processing pipeline state — the real bug fix", () => {
  // Story Analysis only needs mediaRef/syncId (both set at upload time)
  // and tolerates an empty transcript — it must never look unavailable
  // just because the separate ASR pipeline is stuck, blocked, or was
  // honestly skipped for a silent video.
  for (const pipeline of [
    undefined,
    { state: "running" },
    { state: "failed" },
    { state: "complete" },
  ]) {
    const lesson = { ...BASE_LESSON, pipeline };
    const statuses = stageStatus(lesson, null, undefined);
    expect(statuses.voice).toBe("active");
  }
});

test("voice stage becomes active once story analysis has started", () => {
  const job = { storyAnalysis: { state: "completed" }, assembly: { state: "pending" }, published: false };
  const statuses = stageStatus(BASE_LESSON, APPROVED_SYNC, job);
  expect(statuses.voice).toBe("active");
});

test("voice stage becomes complete only once published", () => {
  const job = { storyAnalysis: { state: "completed" }, assembly: { state: "completed" }, published: true };
  const statuses = stageStatus(BASE_LESSON, APPROVED_SYNC, job);
  expect(statuses.voice).toBe("complete");
});

test("a lesson can reach published status having never touched voice production", () => {
  const publishedLesson = { ...BASE_LESSON, status: "published" };
  const statuses = stageStatus(publishedLesson, APPROVED_SYNC, undefined);
  expect(statuses.voice).not.toBe("complete"); // never touched, so never falsely "complete"
  expect(statuses.publish).toBe("complete");
});

test("currentStage never auto-jumps into an untouched voice stage", () => {
  const statuses = stageStatus(BASE_LESSON, null, undefined);
  expect(currentStage(statuses)).not.toBe("voice");
});

test("currentStage accepts a filtered stage list so a hidden stage can never be auto-selected", () => {
  const job = { storyAnalysis: { state: "completed" }, assembly: { state: "pending" }, published: false };
  const statuses = stageStatus(BASE_LESSON, APPROVED_SYNC, job); // voice would be "active" here
  const filtered = STAGES.filter((s) => s.key !== "voice");
  expect(currentStage(statuses, filtered)).not.toBe("voice");
});

test("STAGES declares voice between pipeline and review, matching the approved workflow order", () => {
  const keys = STAGES.map((s) => s.key);
  expect(keys.indexOf("voice")).toBe(keys.indexOf("pipeline") + 1);
  expect(keys.indexOf("review")).toBe(keys.indexOf("voice") + 1);
});

// 2026-09 production regression: real admins never saw MediaPanel's
// Auto-generate vs. Import-transcript choice screen. `mediaRef` becomes
// truthy the instant upload finishes, well before any pipeline run has
// been scheduled (MediaPanel intentionally waits for the admin's choice).
// `media`/`pipeline` must NOT flip to "complete"/"active" on `hasMedia`
// alone, or `currentStage()` auto-navigates the studio off the choice
// screen before it can ever be used — see ProductionStudio.jsx's
// auto-advance effect.
test("media stage stays active (not complete) while media is attached but no pipeline run has been scheduled yet", () => {
  const awaitingChoice = { ...BASE_LESSON }; // mediaRef set, no `pipeline` field at all
  const statuses = stageStatus(awaitingChoice, null, undefined);
  expect(statuses.media).toBe("active");
  expect(statuses.pipeline).toBe("pending");
  expect(currentStage(statuses)).toBe("media");
});

test("media/pipeline stages advance correctly once a pipeline run has genuinely been scheduled", () => {
  for (const pipeline of [{ state: "running" }, { state: "complete" }, { state: "failed" }]) {
    const lesson = { ...BASE_LESSON, pipeline };
    const statuses = stageStatus(lesson, null, undefined);
    expect(statuses.media).toBe("complete");
  }
  const running = stageStatus({ ...BASE_LESSON, pipeline: { state: "running" } }, null, undefined);
  expect(running.pipeline).toBe("active");
  expect(currentStage(running)).toBe("pipeline");
  const failed = stageStatus({ ...BASE_LESSON, pipeline: { state: "failed" } }, null, undefined);
  expect(failed.pipeline).toBe("blocked");
  expect(currentStage(failed)).toBe("pipeline");
});
