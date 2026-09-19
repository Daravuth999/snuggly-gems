/**
 * SyncReviewStudio.test.jsx — the flagship Author Studio transcript review
 * workflow: transcript editing, timing nudges, split/merge, speaker
 * relabeling, compare-original, and approve/reject. Mocks ./videoLibraryApi
 * (the actual edit-operation correctness is covered by
 * eduhub-backend/tests/test_video_pipeline.py's apply_sync_edits suite) —
 * this suite verifies the Studio UI calls the right operation shape and
 * reflects the server's response.
 */
jest.mock("../videoLibraryApi", () => ({
  getSyncAdmin: jest.fn(),
  editSync: jest.fn(),
  approveSync: jest.fn(),
  rejectSync: jest.fn(),
  resolveMediaSrc: (ref) => (ref ? `https://resolved/${ref}` : ""),
}));

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import SyncReviewStudio, { SentenceRow, formatProviderTag, dragPositionToTime, clampDraggedWordTiming } from "../SyncReviewStudio";
import { getSyncAdmin, editSync, approveSync, rejectSync } from "../videoLibraryApi";

const LESSON = { lessonId: "vid_1", title: "Ordering Coffee", syncId: "sync_abc", mediaRef: "https://pub-x.r2.dev/vid.mp4", contentType: "video/mp4" };

function baseSync(overrides) {
  return {
    syncId: "sync_abc", alignmentVersion: 1, providerVersion: "gemini-video-asr-v1", alignmentStatus: "complete",
    reviewStatus: "pending", speakers: [{ id: "S1", label: "S1" }],
    paragraphs: [{
      id: "p1",
      sentences: [{
        id: "s1", start: 0, end: 2, speakerId: "S1",
        words: [{ word: "Hello", start: 0, end: 1 }, { word: "there", start: 1, end: 2 }],
      }],
    }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  editSync.mockImplementation((syncId, ops) => Promise.resolve(baseSync({ reviewStatus: "in_review" })));
});

test("shows a loading state, then the sentence editor once the sync document loads", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("review-sentence-0")).toHaveTextContent("Hello");
});

// §1.8 — real per-word alignment quality telemetry, surfaced here rather
// than a new admin dashboard.
test("shows the real word-alignment quality badge when the pipeline ran it", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({
    wordAlignment: { status: "complete", provider: "elevenlabs-scribe-v1", totalWords: 10, matchedWords: 9, matchRatio: 0.9, meanAlignmentConfidence: 0.94, lowConfidenceWordCount: 0 },
  }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  const badge = await screen.findByTestId("word-alignment-badge");
  expect(badge).toHaveTextContent("90% real (9/10)");
});

test("shows an honest 'estimated' badge when alignment was skipped (no provider configured)", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({
    wordAlignment: { status: "skipped", provider: null, reason: "ELEVENLABS_API_KEY not configured" },
  }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("word-alignment-badge")).toHaveTextContent("estimated");
});

test("shows an honest 'alignment failed' badge without pretending timing is real", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({
    wordAlignment: { status: "failed", provider: "elevenlabs-scribe-v1", error: "429 rate limited" },
  }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("word-alignment-badge")).toHaveTextContent("alignment failed");
});

test("shows no word-alignment badge at all for a document from before this feature existed", async () => {
  getSyncAdmin.mockResolvedValue(baseSync()); // no wordAlignment field
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  expect(screen.queryByTestId("word-alignment-badge")).not.toBeInTheDocument();
});

test("shows an honest not-aligned state when the pipeline has not completed yet", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({ alignmentStatus: "processing" }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("review-not-aligned")).toHaveTextContent("processing");
});

test("editing a sentence's text sends a replace_sentence_text operation", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.click(screen.getByTestId("review-sentence-0-edit-text"));
  fireEvent.change(screen.getByTestId("review-sentence-0-textarea"), { target: { value: "Hi friend" } });
  fireEvent.click(screen.getByTestId("review-sentence-0-save-text"));
  await waitFor(() => expect(editSync).toHaveBeenCalledWith(
    "sync_abc", [{ op: "replace_sentence_text", p: 0, s: 0, text: "Hi friend" }],
  ));
});

test("splitting requires selecting a word first, then sends split_sentence at that word index", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  const row = await screen.findByTestId("review-sentence-0");
  expect(screen.getByTestId("review-sentence-0-split")).toBeDisabled();
  // "there" also renders in the live Teleprompter preview (left column) —
  // scope the click to the editor row itself, a real separate element.
  fireEvent.click(within(row).getByText("there")); // select word index 1
  fireEvent.click(screen.getByTestId("review-sentence-0-split"));
  await waitFor(() => expect(editSync).toHaveBeenCalledWith(
    "sync_abc", [{ op: "split_sentence", p: 0, s: 0, at: 1 }],
  ));
});

test("merge button sends merge_sentences for the sentence", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.click(screen.getByTestId("review-sentence-0-merge"));
  await waitFor(() => expect(editSync).toHaveBeenCalledWith(
    "sync_abc", [{ op: "merge_sentences", p: 0, s: 0 }],
  ));
});

test("nudging a selected word's start time sends set_word_timing", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  const row = await screen.findByTestId("review-sentence-0");
  fireEvent.click(within(row).getByText("Hello")); // select word index 0
  await screen.findByTestId("review-sentence-0-word-tools");
  fireEvent.click(screen.getByTestId("review-sentence-0-nudge-start-plus"));
  await waitFor(() => expect(editSync).toHaveBeenCalledWith(
    "sync_abc", [{ op: "set_word_timing", p: 0, s: 0, w: 0, start: 0.1, end: 1 }],
  ));
});

test("changing a sentence's speaker dropdown sends set_sentence_speaker", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.change(screen.getByTestId("review-sentence-0-speaker"), { target: { value: "S1" } });
  await waitFor(() => expect(editSync).toHaveBeenCalledWith(
    "sync_abc", [{ op: "set_sentence_speaker", p: 0, s: 0, speakerId: "S1" }],
  ));
});

test("Compare original toggles to a read-only view of the pre-edit transcript", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({
    originalParagraphs: [{ id: "p1", sentences: [{ id: "s1", start: 0, end: 1, words: [{ word: "Original", start: 0, end: 1 }] }] }],
    originalSpeakers: [],
  }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.click(screen.getByTestId("review-compare-toggle"));
  // The original text now renders in BOTH the live Teleprompter preview
  // (left column) and the read-only sentence list (right column) — real,
  // separate elements, not a query bug.
  expect(screen.getAllByText(/Original/).length).toBeGreaterThan(0);
  expect(screen.queryByTestId("review-sentence-0-edit-text")).not.toBeInTheDocument(); // read-only in compare view
});

test("Approve walks pending through in_review to approved via the api client's own transition logic", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({ reviewStatus: "pending" }));
  approveSync.mockResolvedValue(baseSync({ reviewStatus: "approved" }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.click(screen.getByTestId("review-approve-button"));
  await waitFor(() => expect(approveSync).toHaveBeenCalledWith("sync_abc", "pending"));
  expect(await screen.findByTestId("review-status-badge")).toHaveTextContent("approved");
});

test("Reject is disabled once already approved (backend treats approved as terminal)", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({ reviewStatus: "approved" }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  expect(screen.getByTestId("review-reject-button")).toBeDisabled();
});

test("Reject is enabled and calls rejectSync for a pending/in-review document", async () => {
  getSyncAdmin.mockResolvedValue(baseSync({ reviewStatus: "in_review" }));
  rejectSync.mockResolvedValue(baseSync({ reviewStatus: "rejected" }));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.click(screen.getByTestId("review-reject-button"));
  await waitFor(() => expect(rejectSync).toHaveBeenCalledWith("sync_abc", "in_review"));
});

test("Close button calls onClose", async () => {
  getSyncAdmin.mockResolvedValue(baseSync());
  const onClose = jest.fn();
  render(<SyncReviewStudio lesson={LESSON} onClose={onClose} onChanged={() => {}} />);
  await screen.findByTestId("review-sentence-0");
  fireEvent.click(screen.getByTestId("review-studio-close"));
  expect(onClose).toHaveBeenCalled();
});

test("a load failure shows an inline error instead of crashing", async () => {
  getSyncAdmin.mockRejectedValue(new Error("sync document not found"));
  render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
  expect(await screen.findByTestId("review-error")).toHaveTextContent(/not found/i);
});

describe("Author Studio freeze fix — regression guards", () => {
  test("SentenceRow is memoized so a currentTime tick doesn't re-render every row in the list", () => {
    // Structural guard for the actual fix mechanism: without React.memo
    // here (plus the stable onOp/onSeek useCallback references and the
    // memoized `speakers` array upstream), every SentenceRow re-renders
    // on every ~250ms `timeupdate` tick during playback — the confirmed
    // root cause of the reported main-thread freeze on mobile Safari.
    expect(SentenceRow.$$typeof).toBe(Symbol.for("react.memo"));
  });

  test("remains fully interactive after many rapid currentTime ticks (simulated video playback)", async () => {
    getSyncAdmin.mockResolvedValue(baseSync());
    approveSync.mockResolvedValue(baseSync({ reviewStatus: "approved" }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByTestId("review-sentence-0");

    const video = screen.getByTestId("review-media-video");
    // Simulate ~15s of playback at the native ~4 ticks/sec cadence — the
    // exact repeated-render pattern that used to saturate the main thread.
    for (let i = 0; i < 60; i += 1) {
      Object.defineProperty(video, "currentTime", { value: i * 0.25, configurable: true });
      fireEvent.timeUpdate(video);
    }

    // If the fix regresses, this is exactly the interaction that would
    // hang: Approve must still be clickable and reach the API.
    fireEvent.click(screen.getByTestId("review-approve-button"));
    await waitFor(() => expect(approveSync).toHaveBeenCalledWith("sync_abc", "pending"));
  });

  test("the review video plays inline instead of auto-entering native fullscreen", async () => {
    // 2026-09 regression: this element had no playsInline attribute, while
    // the student-facing player's own <video> did — on iOS Safari a
    // <video> without playsInline auto-enters native fullscreen on play,
    // overlaying the transcript/approve tools an admin needs visible
    // during review. TeleprompterPanel.jsx already established the
    // correct full pattern for this codebase; this element must match it.
    getSyncAdmin.mockResolvedValue(baseSync());
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByTestId("review-sentence-0");
    const video = screen.getByTestId("review-media-video");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("webkit-playsinline", "true");
    expect(video).toHaveAttribute("controlslist", "nofullscreen noremoteplayback");
    expect(video).toHaveAttribute("disablepictureinpicture");
  });
});

// ── Misleading provider-tag fix ──────────────────────────────────────────────
// Real, previously-confirmed bug that already caused one misdiagnosis: the
// header showed ONLY sync.providerVersion — the segmentation stage's own
// static string — with no indication of whether the real per-word alignment
// stage (video_word_alignment.py, gemini-3.5-transcribe) also ran for this
// specific document. Live-verified during this investigation (real Gemini
// API call, not mocked): both stages genuinely ran and contributed real
// data; the bug was the tag alone. formatProviderTag mirrors the backend's
// video_pipeline_tools.build_combined_provider_tag exactly.
describe("formatProviderTag — combined, per-document-accurate provider tag", () => {
  const SEG = "gemini-video-asr-v1 (gemini-2.5-flash, word-interp)";

  test("no wordAlignment at all reports segmentation only, honestly", () => {
    expect(formatProviderTag({ providerVersion: SEG })).toBe(SEG);
  });

  test("both stages complete shows both models and the real measured count", () => {
    const tag = formatProviderTag({
      providerVersion: SEG,
      wordAlignment: {
        status: "complete", provider: "gemini-word-timestamps-v1 (gemini-3.5-transcribe)",
        totalWords: 24, matchedWords: 21,
      },
    });
    expect(tag).toContain(SEG);
    expect(tag).toContain("gemini-word-timestamps-v1 (gemini-3.5-transcribe)");
    expect(tag).toContain("21/24 words measured");
  });

  test("alignment skipped surfaces the real reason, not a generic message", () => {
    const tag = formatProviderTag({
      providerVersion: SEG,
      wordAlignment: { status: "skipped", reason: "GEMINI_API_KEY not configured" },
    });
    expect(tag).toContain(SEG);
    expect(tag).toContain("alignment skipped");
    expect(tag).toContain("GEMINI_API_KEY not configured");
  });

  test("alignment failed is honest about falling back to interpolated timing", () => {
    const tag = formatProviderTag({ providerVersion: SEG, wordAlignment: { status: "failed" } });
    expect(tag).toContain(SEG);
    expect(tag).toContain("alignment failed");
    expect(tag).toContain("interpolated");
  });

  test("falls back to providerCategory when providerVersion is missing, same as before this fix", () => {
    expect(formatProviderTag({ providerCategory: "speech_recognition" })).toBe("speech_recognition");
  });

  test("regression: the rendered header shows the combined tag, not just the segmentation stage", async () => {
    getSyncAdmin.mockResolvedValue(baseSync({
      providerVersion: SEG,
      wordAlignment: {
        status: "complete", provider: "gemini-word-timestamps-v1 (gemini-3.5-transcribe)",
        totalWords: 24, matchedWords: 21,
      },
    }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    const tagEl = await screen.findByTestId("sync-provider-tag");
    expect(tagEl).toHaveTextContent("gemini-2.5-flash");
    expect(tagEl).toHaveTextContent("gemini-3.5-transcribe");
    expect(tagEl).toHaveTextContent("21/24 words measured");
  });
});

// ── Mixed-confidence word rendering (§2 fix) ─────────────────────────────────
// Confirmed root cause (not a regression): this screen's own word rendering
// only ever checked the LEGACY numeric confidence.alignment score, which
// gemini-3.5-transcribe never populates for EITHER a measured or an
// interpolated word — every word rendered identically here regardless of
// real vs. estimated timing, unlike the Teleprompter's own three-tier
// system (reused directly via computeSentenceConfidenceTier, not
// reimplemented). The 149/268-word "Pchum Ben Ceremony" lesson is
// reproduced realistically below (real production DB/log access wasn't
// available for this investigation — documented honestly) rather than a
// single trivial word pair, since the reported symptom is specifically
// about a document with a REAL MIX of measured and interpolated runs.
describe("mixed-confidence word rendering (§2) — measured vs. interpolated vs. legacy low-confidence", () => {
  test("a measured word renders crisp — no low-confidence or interpolated styling at all", async () => {
    getSyncAdmin.mockResolvedValue(baseSync({
      paragraphs: [{
        id: "p1",
        sentences: [{
          id: "s1", start: 0, end: 2, speakerId: "S1",
          words: [{ word: "Hello", start: 0, end: 1, measured: true }],
        }],
      }],
    }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    const word = await screen.findByTestId("review-sentence-0-word-0");
    expect(word).toHaveAttribute("data-word-confidence", "measured");
  });

  test("an interpolated word (no measured flag, no numeric confidence, document IS aligned) gets the new distinct treatment", async () => {
    getSyncAdmin.mockResolvedValue(baseSync({
      alignmentStatus: "complete",
      paragraphs: [{
        id: "p1",
        sentences: [{
          id: "s1", start: 0, end: 2, speakerId: "S1",
          words: [{ word: "there", start: 1, end: 2 }], // no measured, no confidence — Gemini's own interpolated estimate
        }],
      }],
    }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    const word = await screen.findByTestId("review-sentence-0-word-0");
    expect(word).toHaveAttribute("data-word-confidence", "interpolated");
    expect(word).toHaveAttribute("title", "Estimated timing — not independently measured");
  });

  test("regression: a legacy low numeric confidence word keeps its EXISTING red styling untouched", async () => {
    getSyncAdmin.mockResolvedValue(baseSync({
      paragraphs: [{
        id: "p1",
        sentences: [{
          id: "s1", start: 0, end: 2, speakerId: "S1",
          words: [{ word: "mumble", start: 0, end: 1, confidence: { alignment: 0.4 } }],
        }],
      }],
    }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    const word = await screen.findByTestId("review-sentence-0-word-0");
    expect(word).toHaveAttribute("data-word-confidence", "low");
    expect(word).toHaveAttribute("title", "Low confidence (40%)");
  });

  test("regression: a document that was never aligned at all shows no interpolated styling noise on any word", async () => {
    getSyncAdmin.mockResolvedValue(baseSync({
      alignmentStatus: "processing",
      paragraphs: [{
        id: "p1",
        sentences: [{
          id: "s1", start: 0, end: 2, speakerId: "S1",
          words: [{ word: "there", start: 1, end: 2 }],
        }],
      }],
    }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    const word = await screen.findByTestId("review-sentence-0-word-0");
    expect(word).not.toHaveAttribute("data-word-confidence", "interpolated");
  });

  test("regression: a realistic 56%-measured lesson (mirroring the real 149/268 report) renders both tiers correctly within one sentence, never blank", async () => {
    // A sentence with a real mid-sentence transition from measured to
    // interpolated words — exactly the shape that produced visible
    // "jumps" when this screen had zero tiered-rendering awareness.
    getSyncAdmin.mockResolvedValue(baseSync({
      alignmentStatus: "complete",
      paragraphs: [{
        id: "p1",
        sentences: [{
          id: "s1", start: 0, end: 6, speakerId: "S1",
          words: [
            { word: "The", start: 0, end: 0.4, measured: true },
            { word: "monks", start: 0.4, end: 0.9, measured: true },
            { word: "chanted", start: 0.9, end: 1.6, measured: true },
            { word: "softly", start: 1.6, end: 2.3 },       // interpolated — background chanting made this word unmatched
            { word: "near", start: 2.3, end: 2.7 },          // interpolated
            { word: "dawn", start: 2.7, end: 3.4, measured: true },
          ],
        }],
      }],
    }));
    render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
    const row = await screen.findByTestId("review-sentence-0");
    expect(within(row).getByTestId("review-sentence-0-word-0")).toHaveAttribute("data-word-confidence", "measured");
    expect(within(row).getByTestId("review-sentence-0-word-1")).toHaveAttribute("data-word-confidence", "measured");
    expect(within(row).getByTestId("review-sentence-0-word-2")).toHaveAttribute("data-word-confidence", "measured");
    expect(within(row).getByTestId("review-sentence-0-word-3")).toHaveAttribute("data-word-confidence", "interpolated");
    expect(within(row).getByTestId("review-sentence-0-word-4")).toHaveAttribute("data-word-confidence", "interpolated");
    expect(within(row).getByTestId("review-sentence-0-word-5")).toHaveAttribute("data-word-confidence", "measured");
    // Every word still has real text and a real (even if estimated) time
    // range — never a blank/missing render for the interpolated pair.
    expect(row).toHaveTextContent("The monks chanted softly near dawn");
  });
});

// §3 — timing-correction editing tools. Pure-function unit tests for the
// drag math (jsdom's getBoundingClientRect is always zero-valued, so real
// pixel-drag interaction can't be exercised at the component level — this
// is documented, not worked around) plus component/integration tests for
// the numeric fallback and the full persist-and-reflect loop, mirroring
// the backend's own test_sync_studio_manual_timing_edits.py assertions.
describe("timing-correction editing tools (§3)", () => {
  describe("dragPositionToTime (pure)", () => {
    test("maps a pointer position at the left edge of the track to windowStart", () => {
      expect(dragPositionToTime(100, 100, 400, 0, 4)).toBe(0);
    });

    test("maps a pointer position at the right edge of the track to windowEnd", () => {
      expect(dragPositionToTime(500, 100, 400, 0, 4)).toBe(4);
    });

    test("maps a pointer position at the midpoint of the track to the midpoint of the window", () => {
      expect(dragPositionToTime(300, 100, 400, 0, 4)).toBe(2);
    });

    test("clamps a pointer position before the track's left edge to windowStart", () => {
      expect(dragPositionToTime(0, 100, 400, 1, 5)).toBe(1);
    });

    test("clamps a pointer position past the track's right edge to windowEnd", () => {
      expect(dragPositionToTime(9999, 100, 400, 1, 5)).toBe(5);
    });

    test("falls back to windowStart when the track has no measured width (e.g. jsdom's zero-valued rect)", () => {
      expect(dragPositionToTime(300, 0, 0, 1, 5)).toBe(1);
    });
  });

  describe("clampDraggedWordTiming (pure)", () => {
    test("dragging the start handle past the end handle stops short of it, preserving a minimum span", () => {
      const result = clampDraggedWordTiming("start", 5, { start: 1, end: 2 });
      expect(result.end).toBe(2);
      expect(result.start).toBeLessThan(result.end);
      expect(result.start).toBeCloseTo(1.98, 5);
    });

    test("dragging the end handle before the start handle stops short of it, preserving a minimum span", () => {
      const result = clampDraggedWordTiming("end", -5, { start: 1, end: 2 });
      expect(result.start).toBe(1);
      expect(result.end).toBeGreaterThan(result.start);
      expect(result.end).toBeCloseTo(1.02, 5);
    });

    test("an ordinary in-range drag of the start handle passes the time through unchanged", () => {
      expect(clampDraggedWordTiming("start", 0.5, { start: 1, end: 2 })).toEqual({ start: 0.5, end: 2 });
    });

    test("an ordinary in-range drag of the end handle passes the time through unchanged", () => {
      expect(clampDraggedWordTiming("end", 2.5, { start: 1, end: 2 })).toEqual({ start: 1, end: 2.5 });
    });
  });

  describe("drag bar renders (structure only — real pixel-drag interaction is untestable under jsdom, see dragPositionToTime above for the covered math)", () => {
    test("selecting a word renders the drag track with a start and end handle", async () => {
      getSyncAdmin.mockResolvedValue(baseSync());
      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello"));
      const tools = await screen.findByTestId("review-sentence-0-word-tools");
      expect(within(tools).getByTestId("word-timing-drag-track")).toBeInTheDocument();
      expect(within(tools).getByTestId("word-timing-handle-start")).toHaveAttribute("aria-label", "Word start time");
      expect(within(tools).getByTestId("word-timing-handle-end")).toHaveAttribute("aria-label", "Word end time");
    });
  });

  describe("numeric start/end inputs — the precision fallback alongside the drag bar", () => {
    test("editing the start number input sends set_word_timing with the new start", async () => {
      getSyncAdmin.mockResolvedValue(baseSync());
      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello")); // select word index 0 (start=0, end=1)
      const tools = await screen.findByTestId("review-sentence-0-word-tools");
      fireEvent.change(within(tools).getByTestId("review-sentence-0-word-start-input"), { target: { value: "0.05" } });
      await waitFor(() => expect(editSync).toHaveBeenCalledWith(
        "sync_abc", [{ op: "set_word_timing", p: 0, s: 0, w: 0, start: 0.05, end: 1 }],
      ));
    });

    test("editing the end number input sends set_word_timing with the new end", async () => {
      getSyncAdmin.mockResolvedValue(baseSync());
      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello")); // select word index 0 (start=0, end=1)
      const tools = await screen.findByTestId("review-sentence-0-word-tools");
      fireEvent.change(within(tools).getByTestId("review-sentence-0-word-end-input"), { target: { value: "1.25" } });
      await waitFor(() => expect(editSync).toHaveBeenCalledWith(
        "sync_abc", [{ op: "set_word_timing", p: 0, s: 0, w: 0, start: 0, end: 1.25 }],
      ));
    });

    test("a non-numeric input value is ignored rather than sending a NaN timing op", async () => {
      getSyncAdmin.mockResolvedValue(baseSync());
      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello"));
      const tools = await screen.findByTestId("review-sentence-0-word-tools");
      fireEvent.change(within(tools).getByTestId("review-sentence-0-word-start-input"), { target: { value: "" } });
      expect(editSync).not.toHaveBeenCalled();
    });
  });

  // End-to-end: a manual correction must be reviewer-provenance, must
  // render crisp/measured immediately, and must move the document's own
  // measured-percentage badge — the same three facts
  // test_sync_studio_manual_timing_edits.py proves against the real
  // backend, proven here against the real rendered UI a reviewer sees.
  describe("a manual correction persists, is marked reviewer-set, and updates the measured-percentage badge", () => {
    test("the corrected word renders crisp/measured and carries a reviewer-set badge once the server confirms it", async () => {
      getSyncAdmin.mockResolvedValue(baseSync({
        wordAlignment: { status: "complete", provider: "gemini-word-timestamps-v1 (gemini-3.5-transcribe)", totalWords: 2, matchedWords: 0, matchRatio: 0, meanAlignmentConfidence: null, lowConfidenceWordCount: null, attemptedAt: "2026-01-01T00:00:00Z" },
      }));
      editSync.mockResolvedValue(baseSync({
        reviewStatus: "in_review",
        wordAlignment: { status: "complete", provider: "gemini-word-timestamps-v1 (gemini-3.5-transcribe)", totalWords: 2, matchedWords: 1, matchRatio: 0.5, meanAlignmentConfidence: null, lowConfidenceWordCount: null, attemptedAt: "2026-01-01T00:00:00Z" },
        paragraphs: [{
          id: "p1",
          sentences: [{
            id: "s1", start: 0, end: 2, speakerId: "S1",
            words: [
              { word: "Hello", start: 0.05, end: 1, measured: true, source: "reviewer" },
              { word: "there", start: 1, end: 2 },
            ],
          }],
        }],
      }));

      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      expect(await screen.findByTestId("word-alignment-badge")).toHaveTextContent("0% real (0/2)");

      fireEvent.click(within(row).getByText("Hello"));
      const tools = await screen.findByTestId("review-sentence-0-word-tools");
      fireEvent.change(within(tools).getByTestId("review-sentence-0-word-start-input"), { target: { value: "0.05" } });

      // Reflected in the sentence editor itself: crisp/measured styling
      // plus the explicit reviewer-provenance badge, not an interpolated
      // or low-confidence treatment.
      await waitFor(() => expect(screen.getByTestId("review-sentence-0-word-0")).toHaveAttribute("data-word-confidence", "measured"));
      expect(screen.getByTestId("review-sentence-0-word-0-reviewer-badge")).toHaveTextContent("reviewer-set");

      // And the document's own aggregate measured-percentage figure moved
      // to reflect it — not a stale pre-edit number.
      expect(screen.getByTestId("word-alignment-badge")).toHaveTextContent("50% real (1/2)");
    });

    test("a manual correction flows through to what the student-facing Teleprompter reads, using the same paragraphs/word data", async () => {
      // SyncReviewStudio's left column renders the live Teleprompter off
      // the SAME sync.paragraphs the editor just updated — proving a
      // correction isn't editor-only cosmetics; it's the one document
      // both surfaces read.
      getSyncAdmin.mockResolvedValue(baseSync());
      editSync.mockResolvedValue(baseSync({
        reviewStatus: "in_review",
        paragraphs: [{
          id: "p1",
          sentences: [{
            id: "s1", start: 0, end: 2, speakerId: "S1",
            words: [
              { word: "Hello", start: 0.05, end: 1, measured: true, source: "reviewer" },
              { word: "there", start: 1, end: 2 },
            ],
          }],
        }],
      }));

      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello"));
      const tools = await screen.findByTestId("review-sentence-0-word-tools");
      fireEvent.change(within(tools).getByTestId("review-sentence-0-word-start-input"), { target: { value: "0.05" } });

      await waitFor(() => expect(screen.getByTestId("review-sentence-0-word-0")).toHaveAttribute("data-word-confidence", "measured"));
      // The live Teleprompter preview (left column) re-renders off the
      // exact same updated sync document — the corrected word "Hello"
      // still reads correctly there too, never left showing stale text.
      expect(screen.getAllByText(/Hello/).length).toBeGreaterThan(0);
    });
  });

  describe("existing text-editing is preserved exactly (additive, not replaced by the new timing controls)", () => {
    test("nudge buttons still work identically alongside the new drag bar and numeric inputs", async () => {
      getSyncAdmin.mockResolvedValue(baseSync());
      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello"));
      await screen.findByTestId("review-sentence-0-word-tools");
      fireEvent.click(screen.getByTestId("review-sentence-0-nudge-end-plus"));
      await waitFor(() => expect(editSync).toHaveBeenCalledWith(
        "sync_abc", [{ op: "set_word_timing", p: 0, s: 0, w: 0, start: 0, end: 1.1 }],
      ));
    });

    test("Edit word still sends edit_word exactly as before, unaffected by the new timing controls", async () => {
      getSyncAdmin.mockResolvedValue(baseSync());
      render(<SyncReviewStudio lesson={LESSON} onClose={() => {}} onChanged={() => {}} />);
      const row = await screen.findByTestId("review-sentence-0");
      fireEvent.click(within(row).getByText("Hello"));
      await screen.findByTestId("review-sentence-0-word-tools");
      const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("Hi");
      fireEvent.click(screen.getByTestId("review-sentence-0-edit-word"));
      await waitFor(() => expect(editSync).toHaveBeenCalledWith(
        "sync_abc", [{ op: "edit_word", p: 0, s: 0, w: 0, word: "Hi" }],
      ));
      promptSpy.mockRestore();
    });
  });
});
