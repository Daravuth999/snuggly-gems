/**
 * ProductionStudio.test.jsx — the stage-navigation state machine itself
 * (2026-09 auto-advance fix). Every child panel is mocked to a minimal
 * stand-in exposing its own `onChanged` trigger — each panel's REAL
 * internal behavior is already covered by its own test file (and by
 * VideoFactoryStudio.test.jsx's end-to-end coverage of this same screen);
 * this file isolates exactly one thing: does "which stage is showing"
 * correctly follow the live lesson data forward on its own, while still
 * respecting a deliberate manual navigation away from the live edge.
 */
jest.mock("../videoLibraryApi", () => ({
  listLessonsAdmin: jest.fn(),
  getSyncAdmin: jest.fn(),
  getNarration: jest.fn(),
  getVideoFactoryStatus: jest.fn(),
}));

function mockPanel(name) {
  return function MockPanel({ onChanged }) {
    return (
      <div data-testid={`mock-panel-${name}`}>
        <button data-testid={`mock-refresh-${name}`} onClick={() => onChanged?.()}>refresh</button>
      </div>
    );
  };
}

jest.mock("../panels/InfoPanel", () => ({ __esModule: true, default: mockPanel("info") }));
jest.mock("../panels/MediaPanel", () => ({ __esModule: true, default: mockPanel("media") }));
jest.mock("../panels/PipelinePanel", () => ({ __esModule: true, default: mockPanel("pipeline") }));
jest.mock("../panels/VoiceProductionPanel", () => ({ __esModule: true, default: mockPanel("voice") }));
jest.mock("../panels/TeleprompterPanel", () => ({ __esModule: true, default: mockPanel("teleprompter") }));
jest.mock("../panels/PublishPanel", () => ({ __esModule: true, default: mockPanel("publish") }));
jest.mock("../panels/AnalyticsPanel", () => ({ __esModule: true, default: mockPanel("analytics") }));
jest.mock("../SyncReviewStudio", () => ({
  __esModule: true,
  default: function MockSyncReviewStudio({ onClose }) {
    return (
      <div data-testid="mock-sync-review-studio">
        <button data-testid="mock-close-review" onClick={onClose}>close</button>
      </div>
    );
  },
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProductionStudio from "../ProductionStudio";
import { listLessonsAdmin, getSyncAdmin, getNarration, getVideoFactoryStatus } from "../videoLibraryApi";

const BASE_LESSON = {
  lessonId: "vid_1", title: "Ordering Coffee", category: "conversation", difficulty: "beginner",
  status: "draft", mediaRef: null, syncId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  getVideoFactoryStatus.mockResolvedValue({ visible: true, enabled: true });
  getSyncAdmin.mockResolvedValue(null);
  getNarration.mockResolvedValue(null);
});

test("auto-advances to the next stage once the current stage's real status completes, with no further click", async () => {
  // Starts with no media -> live stage is "media" (info is already complete).
  listLessonsAdmin.mockResolvedValue([{ ...BASE_LESSON }]);
  render(<ProductionStudio lesson={BASE_LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("mock-panel-media")).toBeInTheDocument();

  // The ONE click every real studio session requires (opening the screen
  // at all lands here; clicking the already-active tab is the same as any
  // other first click) — this is exactly the moment the OLD code froze
  // `stage` forever and never followed `liveStage` again.
  fireEvent.click(screen.getByTestId("production-stage-media"));

  // The lesson now has media AND a pipeline run has genuinely been
  // scheduled (2026-09: `mediaRef` alone is NOT enough — see
  // productionStages.js's `pipelineStarted` gate — since media can be
  // attached while the transcript-import choice is still pending) ->
  // media becomes complete, pipeline becomes the new live stage. Nothing
  // FURTHER simulates a click.
  listLessonsAdmin.mockResolvedValue([{
    ...BASE_LESSON, mediaRef: "gridfs://sync_media/x.mp4", syncId: "sync_1", contentType: "video/mp4",
    pipeline: { state: "running" },
  }]);
  fireEvent.click(screen.getByTestId("mock-refresh-media"));

  expect(await screen.findByTestId("mock-panel-pipeline")).toBeInTheDocument();
  expect(screen.queryByTestId("mock-panel-media")).not.toBeInTheDocument();
  // A calm signal explains why the view moved, naming both stages.
  const notice = await screen.findByTestId("production-auto-advance-notice");
  expect(notice).toHaveTextContent("Media");
  expect(notice).toHaveTextContent("AI Processing");
  // The rail itself reflects the move too, not just the content panel.
  const pipelineTab = screen.getByTestId("production-stage-pipeline");
  expect(pipelineTab).toHaveTextContent("AI Processing");
});

test("does NOT auto-advance away from Media while a pipeline run is genuinely still pending — 2026-09 production regression (the transcript-import choice screen was being auto-navigated away from before an admin could ever see it)", async () => {
  // Starts with no media -> live stage is "media".
  listLessonsAdmin.mockResolvedValue([{ ...BASE_LESSON }]);
  render(<ProductionStudio lesson={BASE_LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("mock-panel-media")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("production-stage-media"));

  // Upload finishes and attaches real media, but — exactly like
  // MediaPanel's real awaitTranscriptChoice:true flow — NO pipeline run
  // has been scheduled yet, because the admin hasn't chosen Auto-generate
  // vs. Import transcript. `lesson.pipeline` is genuinely absent here,
  // not just incomplete.
  listLessonsAdmin.mockResolvedValue([{
    ...BASE_LESSON, mediaRef: "gridfs://sync_media/x.mp4", syncId: "sync_1", contentType: "video/mp4",
  }]);
  fireEvent.click(screen.getByTestId("mock-refresh-media"));

  // Give any (incorrect) auto-advance a chance to happen before asserting
  // it didn't.
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.getByTestId("mock-panel-media")).toBeInTheDocument();
  expect(screen.queryByTestId("mock-panel-pipeline")).not.toBeInTheDocument();
  expect(screen.queryByTestId("production-auto-advance-notice")).not.toBeInTheDocument();
});

test("manual navigation to a different stage survives an unrelated background status refresh", async () => {
  // Media already exists and the pipeline is actively running -> live
  // stage is "pipeline".
  const running = {
    ...BASE_LESSON, mediaRef: "gridfs://sync_media/x.mp4", syncId: "sync_1", contentType: "video/mp4",
    pipeline: { state: "running" },
  };
  listLessonsAdmin.mockResolvedValue([running]);
  render(<ProductionStudio lesson={running} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("mock-panel-pipeline")).toBeInTheDocument();

  // The admin deliberately navigates away to Publish while it's still running.
  fireEvent.click(screen.getByTestId("production-stage-publish"));
  expect(await screen.findByTestId("mock-panel-publish")).toBeInTheDocument();

  // Now the pipeline finishes in the background (an unrelated refresh
  // fires — e.g. triggered from within the Publish panel the admin is
  // actually looking at) -> the live stage moves on to "voice"/"review"
  // elsewhere, but the admin never asked to follow it there.
  listLessonsAdmin.mockResolvedValue([{ ...running, pipeline: { state: "complete" } }]);
  fireEvent.click(screen.getByTestId("mock-refresh-publish"));

  await waitFor(() => expect(listLessonsAdmin).toHaveBeenCalledTimes(1));
  // Give any (incorrect) auto-advance a chance to happen before asserting
  // it didn't — this must NOT flip away from Publish.
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.getByTestId("mock-panel-publish")).toBeInTheDocument();
  expect(screen.queryByTestId("production-auto-advance-notice")).not.toBeInTheDocument();
  expect(screen.queryByTestId("mock-panel-voice")).not.toBeInTheDocument();
  expect(screen.queryByTestId("mock-panel-pipeline")).not.toBeInTheDocument();
});
