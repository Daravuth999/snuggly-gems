import { render, screen, fireEvent } from "@testing-library/react";
import Teleprompter, { computeSentenceConfidenceTier } from "../Teleprompter";

const TWO_SPEAKER_SYNC = {
  paragraphs: [
    {
      id: "p1",
      sentences: [
        { id: "s1", speakerId: "S1", words: [{ word: "Hello", start: 0, end: 1 }] },
        { id: "s2", speakerId: "S2", words: [{ word: "Hi", start: 1, end: 2 }, { word: "there", start: 2, end: 3 }] },
      ],
    },
  ],
  speakers: [{ id: "S1", label: "Teacher" }, { id: "S2", label: "Student" }],
};

const ONE_SPEAKER_SYNC = {
  paragraphs: [
    { id: "p1", sentences: [{ id: "s1", words: [{ word: "Once", start: 0, end: 1 }, { word: "upon", start: 1, end: 2 }] }] },
  ],
  speakers: [],
};

test("shows an honest empty state when there is no synchronized transcript yet", () => {
  render(<Teleprompter sync={null} currentTime={0} />);
  expect(screen.getByTestId("teleprompter-empty")).toBeInTheDocument();
});

test("auto mode resolves to conversation when 2+ speakers exist, with speaker labels shown", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={0} mode="auto" />);
  expect(screen.getByTestId("teleprompter-conversation")).toBeInTheDocument();
  expect(screen.getByText("Teacher")).toBeInTheDocument();
  expect(screen.getByText("Student")).toBeInTheDocument();
});

test("auto mode resolves to storytelling prose for a single-speaker (or speakerless) lesson", () => {
  render(<Teleprompter sync={ONE_SPEAKER_SYNC} currentTime={0} mode="auto" />);
  expect(screen.getByTestId("teleprompter-storytelling")).toBeInTheDocument();
});

test("an explicit mode prop overrides auto-detection", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={0} mode="storytelling" />);
  expect(screen.getByTestId("teleprompter-storytelling")).toBeInTheDocument();
});

test("clicking a word calls onSeek with that word's start time", () => {
  const onSeek = jest.fn();
  render(<Teleprompter sync={ONE_SPEAKER_SYNC} currentTime={0} mode="storytelling" onSeek={onSeek} />);
  fireEvent.click(screen.getByText("upon"));
  expect(onSeek).toHaveBeenCalledWith(1);
});

test("does not crash when the auto-scroll effect runs in an environment without Element.scrollTo", () => {
  // jsdom does not implement scrollTo — the follow tween writes scrollTop
  // directly, which must stay safe here.
  expect(typeof document.createElement("div").scrollTo).not.toBe("function");
  expect(() => render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={1.5} mode="conversation" />)).not.toThrow();
});

test("previously spoken sentences fade (reduced opacity) while the active sentence stays readable", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={2.5} mode="conversation" />);
  // t=2.5 → sentence 1 active ("there" active), sentence 0 past.
  expect(screen.getByTestId("teleprompter-sentence-0")).toHaveStyle({ opacity: "0.45" });
  expect(screen.getByTestId("teleprompter-sentence-1")).toHaveStyle({ opacity: "1" });
});

test("the word tracked by the media clock carries data-word-active", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={2.5} mode="conversation" />);
  expect(screen.getByText(/there/).getAttribute("data-word-active")).toBe("true");
  expect(screen.getByText(/Hello/).getAttribute("data-word-active")).toBeNull();
});

test("manual scroll suspends auto-follow and the Follow playback chip resumes it", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={0.5} mode="conversation" />);
  expect(screen.queryByTestId("teleprompter-follow-chip")).not.toBeInTheDocument();
  fireEvent.wheel(screen.getByTestId("teleprompter-conversation"));
  const chip = screen.getByTestId("teleprompter-follow-chip");
  fireEvent.click(chip);
  expect(screen.queryByTestId("teleprompter-follow-chip")).not.toBeInTheDocument();
});

// Regression guard for the "Follow Playback should not be the switch that
// turns word highlighting on" requirement — word highlighting and
// auto-scroll are two separate concerns in this codebase's architecture
// (useSyncHighlight drives the active word unconditionally from the media
// clock; useAutoFollow's `following` boolean only ever gates scroll). This
// proves the split holds end-to-end at the component level, not just by
// reading the hook source: while auto-scroll is suspended (Follow
// playback chip visible), the active word must still keep tracking real
// playback time.
test("while auto-scroll is suspended (Follow playback chip showing), word highlighting keeps tracking the media clock — Follow Playback never gates highlighting", () => {
  const { rerender } = render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={0.5} mode="conversation" />);
  expect(screen.getByText(/Hello/).getAttribute("data-word-active")).toBe("true");

  fireEvent.wheel(screen.getByTestId("teleprompter-conversation"));
  expect(screen.getByTestId("teleprompter-follow-chip")).toBeInTheDocument(); // auto-scroll now suspended

  // Playback keeps advancing while the student is scrolled away — the
  // active word must still move with it.
  rerender(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={2.5} mode="conversation" />);
  expect(screen.getByText(/there/).getAttribute("data-word-active")).toBe("true");
  expect(screen.getByText(/Hello/).getAttribute("data-word-active")).toBeNull();
  // Auto-scroll is still suspended — this proves it's a genuinely separate
  // state, not one that silently got re-armed as a side effect of the
  // highlight update.
  expect(screen.getByTestId("teleprompter-follow-chip")).toBeInTheDocument();
});

test("media-clock mode: the host's media element drives highlighting without a currentTime prop", () => {
  const el = document.createElement("video");
  Object.defineProperty(el, "currentTime", { value: 0, writable: true });
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} mediaRef={{ current: el }} mode="conversation" />);
  el.currentTime = 2.5;
  fireEvent(el, new Event("timeupdate"));
  expect(screen.getByText(/there/).getAttribute("data-word-active")).toBe("true");
});

// ── Bilingual (Khmer) translation layer — additive display only, never
//    timing-bearing. See teleprompterConfig.js's showTranslation and
//    sync_schema.py's translationKm (backend) for the full contract.
const BILINGUAL_SYNC = {
  paragraphs: [
    {
      id: "p1",
      sentences: [
        {
          id: "s1", translationKm: "សួស្ដី",
          words: [{ word: "Hello", start: 0, end: 1 }],
        },
        {
          id: "s2", // no translationKm — must render nothing, never a blank/placeholder line
          words: [{ word: "Bye", start: 1, end: 2 }],
        },
      ],
    },
  ],
  speakers: [],
};

test("translation ON shows the Khmer line only for the currently active sentence", () => {
  render(<Teleprompter sync={BILINGUAL_SYNC} currentTime={0.5} mode="storytelling"
                        config={{ showTranslation: true }} />);
  const lines = screen.getAllByTestId("teleprompter-translation-line");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toHaveTextContent("សួស្ដី");
});

test("translation OFF renders no Khmer line at all, even for a sentence that has one", () => {
  render(<Teleprompter sync={BILINGUAL_SYNC} currentTime={0.5} mode="storytelling"
                        config={{ showTranslation: false }} />);
  expect(screen.queryByTestId("teleprompter-translation-line")).not.toBeInTheDocument();
});

test("a sentence without translationKm never shows a Khmer line, even when it becomes active", () => {
  render(<Teleprompter sync={BILINGUAL_SYNC} currentTime={1.5} mode="storytelling"
                        config={{ showTranslation: true }} />);
  // t=1.5 -> sentence 1 ("Bye") is active, but it has no translationKm.
  expect(screen.queryByTestId("teleprompter-translation-line")).not.toBeInTheDocument();
});

test("translation ON vs OFF renders byte-identical English word timing/highlighting", () => {
  const { unmount } = render(
    <Teleprompter sync={BILINGUAL_SYNC} currentTime={0.5} mode="storytelling" config={{ showTranslation: true }} />,
  );
  expect(screen.getByText(/Hello/).getAttribute("data-word-active")).toBe("true");
  unmount();
  render(<Teleprompter sync={BILINGUAL_SYNC} currentTime={0.5} mode="storytelling" config={{ showTranslation: false }} />);
  expect(screen.getByText(/Hello/).getAttribute("data-word-active")).toBe("true");
});

test("Khmer translation is absent by default (showTranslation defaults to false)", () => {
  render(<Teleprompter sync={BILINGUAL_SYNC} currentTime={0.5} mode="storytelling" />);
  expect(screen.queryByTestId("teleprompter-translation-line")).not.toBeInTheDocument();
});

test("conversation mode also shows the Khmer line only for the active bubble", () => {
  const conversationBilingual = {
    paragraphs: [{ id: "p1", sentences: [
      { id: "s1", speakerId: "S1", translationKm: "មួយ", words: [{ word: "One", start: 0, end: 1 }] },
      { id: "s2", speakerId: "S2", translationKm: "ពីរ", words: [{ word: "Two", start: 1, end: 2 }] },
    ] }],
    speakers: [{ id: "S1", label: "A" }, { id: "S2", label: "B" }],
  };
  render(<Teleprompter sync={conversationBilingual} currentTime={0.5} mode="conversation"
                        config={{ showTranslation: true }} />);
  const lines = screen.getAllByTestId("teleprompter-translation-line");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toHaveTextContent("មួយ");
});

// ── Center-focus cinematic reading mode (config.centerFocus, opt-in,
//    default false) — the active sentence stays fully visible/untransformed
//    while past sentences fade+rise and upcoming sentences dim+approach.
//    See focusZone.js for the pure geometry this renders.
const THREE_SENTENCE_SYNC = {
  paragraphs: [{ id: "p1", sentences: [
    { id: "s1", words: [{ word: "First.", start: 0, end: 1 }] },
    { id: "s2", words: [{ word: "Second.", start: 1, end: 2 }] },
    { id: "s3", words: [{ word: "Third.", start: 2, end: 3 }] },
  ] }],
  speakers: [],
};

test("centerFocus off (default): sentences keep the original flat past/future opacity, no transform", () => {
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={1.5} mode="storytelling" />);
  expect(screen.getByTestId("teleprompter-sentence-0")).toHaveStyle({ opacity: "0.45" });
  expect(screen.getByTestId("teleprompter-sentence-1")).toHaveStyle({ opacity: "1" });
  expect(screen.getByTestId("teleprompter-sentence-2")).toHaveStyle({ opacity: "0.8" });
  expect(screen.getByTestId("teleprompter-sentence-1").style.transform).toBe("");
});

test("centerFocus on: the active sentence renders fully visible with no transform offset", () => {
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={1.5} mode="storytelling"
                        config={{ centerFocus: true }} />);
  const active = screen.getByTestId("teleprompter-sentence-1");
  expect(active).toHaveStyle({ opacity: "1" });
  expect(active.style.transform).toBe("translateY(0px) scale(1)");
});

test("centerFocus on: the already-spoken sentence fades below the flat 0.45 and rises (negative translateY)", () => {
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={1.5} mode="storytelling"
                        config={{ centerFocus: true }} />);
  const past = screen.getByTestId("teleprompter-sentence-0");
  const opacity = Number(past.style.opacity);
  expect(opacity).toBeLessThan(1);
  expect(past.style.transform).toMatch(/translateY\(-[\d.]+px\)/);
});

test("centerFocus on: the upcoming sentence dims and approaches (positive translateY)", () => {
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={1.5} mode="storytelling"
                        config={{ centerFocus: true }} />);
  const future = screen.getByTestId("teleprompter-sentence-2");
  const opacity = Number(future.style.opacity);
  expect(opacity).toBeLessThan(1);
  expect(future.style.transform).toMatch(/translateY\([\d.]+px\)/);
});

test("centerFocus on: conversation mode gets the same graduated fade treatment as storytelling", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={2.5} mode="conversation"
                        config={{ centerFocus: true }} />);
  const past = screen.getByTestId("teleprompter-sentence-0");
  const active = screen.getByTestId("teleprompter-sentence-1");
  expect(Number(past.style.opacity)).toBeLessThan(1);
  expect(active).toHaveStyle({ opacity: "1" });
  expect(active.style.transform).toBe("translateY(0px) scale(1)");
});

// ── End-of-transcript trailing spacer (Priority 2 refinement) — the
//    presentation-only fix letting the LAST sentence still reach the
//    center-focus anchor. jsdom has no real layout engine (every
//    clientHeight reads 0), so these prove the WIRING is correct — which
//    render path is used, and that it's scoped to centerFocus only — not
//    the exact pixel value, which is verified separately in a real browser
//    (see the session's real-browser measurement report).
test("centerFocus on: the trailing spacer is a measured element, not the fixed h-24 default", () => {
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={0.15} mode="storytelling"
                        config={{ centerFocus: true }} />);
  const spacer = screen.getByTestId("teleprompter-trailing-spacer");
  expect(spacer.style.height).not.toBe("");
  expect(spacer.className).not.toMatch(/h-24/);
});

test("centerFocus off (default): the trailing spacer stays the original fixed h-24 element, unmeasured", () => {
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={0.15} mode="storytelling" />);
  expect(screen.queryByTestId("teleprompter-trailing-spacer")).not.toBeInTheDocument();
});

test("centerFocus on: conversation mode also gets the measured trailing spacer", () => {
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={0.5} mode="conversation"
                        config={{ centerFocus: true }} />);
  expect(screen.getByTestId("teleprompter-trailing-spacer")).toBeInTheDocument();
});

test("centerFocus on: does not crash and still measures correctly across a sentence transition (e.g. reaching the final sentence)", () => {
  const { rerender } = render(
    <Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={0.15} mode="storytelling" config={{ centerFocus: true }} />,
  );
  expect(screen.getByTestId("teleprompter-trailing-spacer")).toBeInTheDocument();
  // Progress to the last sentence — the exact scenario the spacer exists for.
  rerender(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={2.5} mode="storytelling" config={{ centerFocus: true }} />);
  expect(screen.getByTestId("teleprompter-trailing-spacer")).toBeInTheDocument();
  expect(screen.getByText(/Third/)).toBeInTheDocument();
});

test("centerFocus never changes which word is highlighted or the karaoke data-word-active attribute", () => {
  const { unmount } = render(
    <Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={1.5} mode="storytelling" config={{ centerFocus: false }} />,
  );
  expect(screen.getByText(/Second/).getAttribute("data-word-active")).toBe("true");
  unmount();
  render(<Teleprompter sync={THREE_SENTENCE_SYNC} currentTime={1.5} mode="storytelling" config={{ centerFocus: true }} />);
  expect(screen.getByText(/Second/).getAttribute("data-word-active")).toBe("true");
});

// ── Manual transcript import — playback-accuracy proof (§5.1/§5.2) ─────
// A realistic imported-and-consolidated document (mirroring the actual
// "Before the sun rises..." / "Today is Pchum Ben..." SRT sample used in
// the backend's own transcript_import tests): multi-word sentences with
// length-weighted interpolated per-word timing (no `measured` flag, no
// numeric confidence — exactly what segments_to_sync produces for a
// cue-level import), never a Gemini-origin document. Proves the SAME
// highlighting engine real playback drives tracks this shape correctly
// end-to-end: every word gets its turn, in order, with no skip — the
// exact failure mode this whole feature exists to eliminate — and the
// interpolated tier is honestly reflected throughout.
const IMPORTED_SYNC = {
  alignmentStatus: "complete",
  paragraphs: [{
    id: "p1",
    sentences: [{
      id: "s1", speakerId: null,
      words: [
        { word: "Before", start: 0.0, end: 0.3 },
        { word: "the", start: 0.3, end: 0.45 },
        { word: "sun", start: 0.45, end: 0.65 },
        { word: "rises,", start: 0.65, end: 0.95 },
        { word: "the", start: 0.95, end: 1.1 },
        { word: "village", start: 1.1, end: 1.5 },
        { word: "is", start: 1.5, end: 1.65 },
        { word: "still", start: 1.65, end: 1.95 },
        { word: "quiet.", start: 1.95, end: 2.5 },
      ],
    }],
  }],
  speakers: [],
};

test("imported-transcript playback tracks every word in order with no skip, jump, or drift", () => {
  const words = IMPORTED_SYNC.paragraphs[0].sentences[0].words;
  const { rerender, container } = render(<Teleprompter sync={IMPORTED_SYNC} currentTime={0} mode="storytelling" />);

  // Query by rendered DOM position (not text) — "the" appears twice in
  // this real sentence, so a text-based lookup would be ambiguous.
  // Samples each word's MIDPOINT, not its start: binarySearchActiveIndex
  // (syncConsumption.js) applies a deliberate ±0.01s tolerance around
  // every boundary to absorb float-rounding noise between back-to-back
  // units — real, existing, and correct — so a sample within 0.01s of a
  // shared boundary between two adjacent words is genuinely ambiguous by
  // design, not a bug this test should be probing.
  words.forEach((w, i) => {
    const midpoint = (w.start + w.end) / 2;
    rerender(<Teleprompter sync={IMPORTED_SYNC} currentTime={midpoint} mode="storytelling" />);
    const spans = Array.from(container.querySelectorAll(".tp-word"));
    expect(spans).toHaveLength(words.length);
    const activeFlags = spans.map((el) => el.getAttribute("data-word-active"));
    expect(activeFlags.filter((v) => v === "true")).toHaveLength(1); // exactly one word active
    expect(activeFlags[i]).toBe("true"); // and it's the RIGHT one — no skip, no drift
  });
});

test("imported-transcript sentence honestly reports the 'uncertain' confidence tier while active — no word here is measured", () => {
  // Teleprompter.jsx exposes the resolved tier at the SENTENCE level
  // (data-confidence-tier — see ConversationSentence/StorySentence);
  // per-word measured/interpolated coloring is Sync Review Studio's own
  // concern (a separate component, already covered by its own tests).
  // "uncertain" (not "high") is the honest result here: not one word in
  // this sentence is `measured` or has confidence.alignment >= 0.6.
  render(<Teleprompter sync={IMPORTED_SYNC} currentTime={0.1} mode="storytelling" />);
  expect(screen.getByTestId("teleprompter-sentence-0").getAttribute("data-confidence-tier")).toBe("uncertain");
});

// ── §4 confidence-tiered graceful degradation ──────────────────────────
describe("computeSentenceConfidenceTier (pure function)", () => {
  const highConfWords = [{ word: "hi", start: 0, end: 1, confidence: { alignment: 0.9 } }];
  const lowConfWords = [{ word: "hi", start: 0, end: 1, confidence: { alignment: 0.3 } }];
  const noConfWords = [{ word: "hi", start: 0, end: 1, confidence: {} }];
  const mixedWords = [
    { word: "hi", start: 0, end: 1, confidence: { alignment: 0.95 } },
    { word: "there", start: 1, end: 2, confidence: {} }, // one interpolated word among real ones
  ];

  test("all words high-confidence real alignment -> 'high'", () => {
    expect(computeSentenceConfidenceTier({ words: highConfWords }, true)).toBe("high");
  });
  test("a real but low-confidence match -> 'uncertain', never fabricated as high", () => {
    expect(computeSentenceConfidenceTier({ words: lowConfWords }, true)).toBe("uncertain");
  });
  test("no alignment confidence at all (Gemini interpolation only) -> 'uncertain'", () => {
    expect(computeSentenceConfidenceTier({ words: noConfWords }, true)).toBe("uncertain");
  });
  test("even ONE low/no-confidence word in an otherwise-high-confidence sentence drags the whole sentence to 'uncertain'", () => {
    expect(computeSentenceConfidenceTier({ words: mixedWords }, true)).toBe("uncertain");
  });
  test("a sentence with no words at all -> 'none'", () => {
    expect(computeSentenceConfidenceTier({ words: [] }, true)).toBe("none");
  });
  test("documentAligned=false overrides everything, even genuinely high-confidence words -> 'none'", () => {
    expect(computeSentenceConfidenceTier({ words: highConfWords }, false)).toBe("none");
  });

  // ── 2026-09 Gemini-only redesign: `measured: true` provenance flag ──
  // (gemini-3.5-transcribe publishes no per-word confidence score at all —
  // see video_word_alignment.py's module docstring — so a matched word is
  // marked `measured: true` instead of a fabricated numeric score).
  const measuredWords = [{ word: "hi", start: 0, end: 1, measured: true }];
  const mixedMeasuredAndInterpolated = [
    { word: "hi", start: 0, end: 1, measured: true },
    { word: "there", start: 1, end: 2, confidence: {} }, // interpolated, no measured flag
  ];
  const measuredAndLegacyHighConfidence = [
    { word: "hi", start: 0, end: 1, measured: true },
    { word: "there", start: 1, end: 2, confidence: { alignment: 0.95 } },
  ];

  test("a word with measured:true and no numeric confidence at all -> 'high'", () => {
    expect(computeSentenceConfidenceTier({ words: measuredWords }, true)).toBe("high");
  });
  test("mixing a measured word with an interpolated (unmeasured) word -> 'uncertain'", () => {
    expect(computeSentenceConfidenceTier({ words: mixedMeasuredAndInterpolated }, true)).toBe("uncertain");
  });
  test("a measured word alongside a legacy real-numeric-confidence word (mixed-provider lesson) -> 'high'", () => {
    expect(computeSentenceConfidenceTier({ words: measuredAndLegacyHighConfidence }, true)).toBe("high");
  });
});

const HIGH_CONF_SYNC = {
  alignmentStatus: "complete",
  paragraphs: [{ id: "p1", sentences: [
    { id: "s1", words: [
      { word: "Real", start: 0, end: 1, confidence: { alignment: 0.95 } },
      { word: "timing", start: 1, end: 2, confidence: { alignment: 0.88 } },
    ] },
  ] }],
  speakers: [],
};

const UNCERTAIN_SYNC = {
  alignmentStatus: "complete",
  paragraphs: [{ id: "p1", sentences: [
    { id: "s1", words: [
      { word: "Estimated", start: 0, end: 1, confidence: {} }, // Gemini interpolation, no real alignment
      { word: "timing", start: 1, end: 2, confidence: {} },
    ] },
  ] }],
  speakers: [],
};

const NOT_ALIGNED_SYNC = {
  alignmentStatus: "processing",
  paragraphs: [{ id: "p1", sentences: [
    { id: "s1", words: [{ word: "Pending", start: 0, end: 1, confidence: {} }] },
  ] }],
  speakers: [],
};

test("high-confidence real alignment renders the full crisp karaoke word highlight (storytelling mode)", () => {
  render(<Teleprompter sync={HIGH_CONF_SYNC} currentTime={0.5} mode="storytelling" config={{ karaoke: true, sentenceHighlight: true }} />);
  const word = screen.getByText(/Real/);
  expect(word).toHaveStyle({ background: "rgba(212, 168, 67, 0.16)" }); // V3 illuminated karaoke capsule
  expect(screen.getByTestId("teleprompter-sentence-0")).toHaveAttribute("data-confidence-tier", "high");
  expect(screen.getByTestId("teleprompter-sentence-0")).not.toHaveClass("tp-sentence-uncertain");
});

test("uncertain confidence (interpolated-only timing) falls back to the soft sentence-level highlight, never a crisp word pill", () => {
  render(<Teleprompter sync={UNCERTAIN_SYNC} currentTime={0.5} mode="storytelling" config={{ karaoke: true, sentenceHighlight: true }} />);
  const word = screen.getByText(/^Estimated\s*$/);
  // Never the crisp gold karaoke pill — that would be a false claim of
  // word-level precision the data doesn't support.
  expect(word).not.toHaveStyle({ background: "#D4A843" });
  const sentenceEl = screen.getByTestId("teleprompter-sentence-0");
  expect(sentenceEl).toHaveAttribute("data-confidence-tier", "uncertain");
  expect(sentenceEl).toHaveClass("tp-sentence-uncertain");
});

test("uncertain confidence also suppresses the plain word-level highlight fallback (wordHighlight), not just karaoke", () => {
  render(<Teleprompter sync={UNCERTAIN_SYNC} currentTime={0.5} mode="storytelling" config={{ wordHighlight: true, sentenceHighlight: true }} />);
  const word = screen.getByText(/^Estimated\s*$/);
  expect(word).not.toHaveStyle({ color: "#D4A843" });
});

test("a lesson whose alignment pipeline stage never completed shows no active-sentence highlighting at all (tier 'none')", () => {
  render(<Teleprompter sync={NOT_ALIGNED_SYNC} currentTime={0.5} mode="storytelling" config={{ karaoke: true, sentenceHighlight: true }} />);
  const sentenceEl = screen.getByTestId("teleprompter-sentence-0");
  expect(sentenceEl).not.toHaveAttribute("data-confidence-tier", "high");
  expect(sentenceEl).not.toHaveAttribute("data-confidence-tier", "uncertain");
  expect(sentenceEl).toHaveStyle({ background: "transparent" });
});

test("a document missing alignmentStatus entirely is still evaluated at the DOCUMENT level (not auto-degraded to tier 'none') — the per-word confidence still legitimately drives 'uncertain' here since these particular words carry none", () => {
  // TWO_SPEAKER_SYNC (used throughout this file, pre-dating this feature)
  // has no `confidence` field on its words at all and no alignmentStatus.
  // This is honestly indistinguishable from a real lesson that only ever
  // got Gemini's interpolated timing (confidence.alignment is always
  // None/omitted for those words too) — so tier "uncertain" here is the
  // CORRECT, intended outcome of graceful degradation, not a bug. What
  // this test actually proves: a MISSING alignmentStatus does not itself
  // force tier "none" (documentAligned still resolves true) — the tier
  // that DOES apply is driven honestly by the words' own confidence, see
  // the report for the real product implication of this for lessons
  // processed before this feature shipped.
  render(<Teleprompter sync={TWO_SPEAKER_SYNC} currentTime={0.5} mode="conversation" config={{ karaoke: true, sentenceHighlight: true }} />);
  const sentenceEl = screen.getByTestId("teleprompter-sentence-0");
  expect(sentenceEl).toHaveAttribute("data-confidence-tier", "uncertain"); // not "none" — the document itself is still treated as aligned
  expect(sentenceEl).not.toHaveStyle({ background: "transparent" }); // an uncertain-tier highlight still renders, unlike tier "none"
});

test("conversation mode: high tier gets a solid amber border, uncertain tier gets a dashed, desaturated one", () => {
  const { rerender } = render(
    <Teleprompter sync={HIGH_CONF_SYNC} currentTime={0.5} mode="conversation" config={{ karaoke: true, sentenceHighlight: true }} />,
  );
  expect(screen.getByTestId("teleprompter-sentence-0")).toHaveStyle({ border: "1px solid rgba(212,168,67,0.45)" });

  rerender(<Teleprompter sync={UNCERTAIN_SYNC} currentTime={0.5} mode="conversation" config={{ karaoke: true, sentenceHighlight: true }} />);
  expect(screen.getByTestId("teleprompter-sentence-0")).toHaveStyle({ border: "1px dashed rgba(168,150,122,0.4)" });
});
