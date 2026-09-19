/**
 * MediaPanel.test.jsx — real rendered coverage for the §3 manual
 * transcript-import choice UI: upload completes -> a real choice
 * ("Auto-generate" vs "Import transcript") is presented BEFORE any
 * processing starts, mirroring VoiceProductionPanel.test.jsx's mock
 * convention for ../../videoLibraryApi.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MediaPanel from "../MediaPanel";

jest.mock("../../videoLibraryApi", () => ({
  uploadLessonMedia: jest.fn(),
  uploadThumbnail: jest.fn(),
  deleteMedia: jest.fn(),
  runPipeline: jest.fn(),
  importTranscript: jest.fn(),
  resolveMediaSrc: (ref) => (ref ? `https://resolved/${ref}` : ""),
}));

import { uploadLessonMedia, runPipeline, importTranscript } from "../../videoLibraryApi";

const LESSON = { lessonId: "vid_1", title: "Pchum Ben Ceremony", contentType: "video/mp4", mediaRef: "" };

function makeFile(name = "lesson.mp4", type = "video/mp4") {
  return new File(["fake-bytes"], name, { type });
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("upload completion shows the choice UI, not an immediate 'processing started' message", async () => {
  uploadLessonMedia.mockResolvedValue({ ok: true, lesson: { ...LESSON, mediaRef: "gridfs://x/y.mp4" }, pipelineScheduled: false });
  const onChanged = jest.fn();
  const onPipelineStarted = jest.fn();
  render(<MediaPanel lesson={LESSON} onChanged={onChanged} onPipelineStarted={onPipelineStarted} />);

  fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [makeFile()] } });

  await screen.findByTestId("transcript-choice");
  expect(screen.getByTestId("transcript-choice-auto")).toBeInTheDocument();
  expect(screen.getByTestId("transcript-choice-import")).toBeInTheDocument();
  // The old unconditional "processing started automatically" copy must
  // NOT appear yet — no choice has been made, so nothing has actually
  // started.
  expect(screen.queryByText(/processing started automatically/i)).not.toBeInTheDocument();
  expect(onPipelineStarted).not.toHaveBeenCalled();
  // uploadLessonMedia must have been called in "await choice" mode.
  expect(uploadLessonMedia).toHaveBeenCalledWith(
    "vid_1", expect.anything(), expect.objectContaining({ awaitTranscriptChoice: true }),
  );
});

test("choosing Auto-generate calls runPipeline and completes the flow", async () => {
  uploadLessonMedia.mockResolvedValue({ ok: true, lesson: LESSON, pipelineScheduled: false });
  runPipeline.mockResolvedValue({ ok: true, scheduled: true });
  const onPipelineStarted = jest.fn();
  render(<MediaPanel lesson={LESSON} onChanged={() => {}} onPipelineStarted={onPipelineStarted} />);

  fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [makeFile()] } });
  await screen.findByTestId("transcript-choice");
  fireEvent.click(screen.getByTestId("transcript-choice-auto"));

  await waitFor(() => expect(runPipeline).toHaveBeenCalledWith("vid_1"));
  await waitFor(() => expect(onPipelineStarted).toHaveBeenCalled());
  expect(importTranscript).not.toHaveBeenCalled();
  await screen.findByText(/AI processing started automatically/i);
});

test("uploading an SRT file into the import picker fills the textarea and selects the SRT format", async () => {
  uploadLessonMedia.mockResolvedValue({ ok: true, lesson: LESSON, pipelineScheduled: false });
  render(<MediaPanel lesson={LESSON} onChanged={() => {}} onPipelineStarted={() => {}} />);

  fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [makeFile()] } });
  await screen.findByTestId("transcript-choice");

  const srtFile = new File(
    ["1\n00:00:00,000 --> 00:00:01,000\nHello there.\n"], "captions.srt", { type: "text/plain" },
  );
  fireEvent.change(screen.getByTestId("transcript-import-file-input"), { target: { files: [srtFile] } });

  await waitFor(() => expect(screen.getByTestId("transcript-import-textarea").value).toContain("Hello there."));
  expect(screen.getByTestId("transcript-import-format").value).toBe("srt");
});

test("submitting a valid pasted transcript calls importTranscript and completes the flow", async () => {
  uploadLessonMedia.mockResolvedValue({ ok: true, lesson: LESSON, pipelineScheduled: false });
  importTranscript.mockResolvedValue({ ok: true, scheduled: true, cueCount: 1 });
  const onPipelineStarted = jest.fn();
  render(<MediaPanel lesson={LESSON} onChanged={() => {}} onPipelineStarted={onPipelineStarted} />);

  fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [makeFile()] } });
  await screen.findByTestId("transcript-choice");

  fireEvent.change(screen.getByTestId("transcript-import-textarea"), {
    target: { value: "1\n00:00:00,000 --> 00:00:01,000\nHello there.\n" },
  });
  fireEvent.click(screen.getByTestId("transcript-import-submit"));

  await waitFor(() => expect(importTranscript).toHaveBeenCalledWith(
    "vid_1", "srt", "1\n00:00:00,000 --> 00:00:01,000\nHello there.\n",
  ));
  await waitFor(() => expect(onPipelineStarted).toHaveBeenCalled());
  expect(runPipeline).not.toHaveBeenCalled();
  await screen.findByText(/Transcript imported — processing started/i);
});

test("the submit button is disabled until there is real content to import", async () => {
  uploadLessonMedia.mockResolvedValue({ ok: true, lesson: LESSON, pipelineScheduled: false });
  render(<MediaPanel lesson={LESSON} onChanged={() => {}} onPipelineStarted={() => {}} />);

  fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [makeFile()] } });
  await screen.findByTestId("transcript-choice");

  expect(screen.getByTestId("transcript-import-submit")).toBeDisabled();
  fireEvent.change(screen.getByTestId("transcript-import-textarea"), { target: { value: "some text" } });
  expect(screen.getByTestId("transcript-import-submit")).not.toBeDisabled();
});

test("a backend parse failure shows a clear inline error and never fires onPipelineStarted", async () => {
  uploadLessonMedia.mockResolvedValue({ ok: true, lesson: LESSON, pipelineScheduled: false });
  const err = new Error("Could not parse — check the SRT format");
  importTranscript.mockRejectedValue(err);
  const onPipelineStarted = jest.fn();
  render(<MediaPanel lesson={LESSON} onChanged={() => {}} onPipelineStarted={onPipelineStarted} />);

  fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [makeFile()] } });
  await screen.findByTestId("transcript-choice");
  fireEvent.change(screen.getByTestId("transcript-import-textarea"), { target: { value: "not a real transcript" } });
  fireEvent.click(screen.getByTestId("transcript-import-submit"));

  await screen.findByTestId("transcript-import-error");
  expect(screen.getByTestId("transcript-import-error")).toHaveTextContent(/Could not parse/i);
  expect(onPipelineStarted).not.toHaveBeenCalled();
  // The choice UI must still be usable afterward — not stuck.
  expect(screen.getByTestId("transcript-choice-auto")).toBeInTheDocument();
});
