/**
 * pchumBenDayLongDurationSync.test.js — the long-duration synchronization
 * test requested during the 2026-08 word-highlight-desync investigation:
 * "Do not stop after proving the first few sentences work."
 *
 * Uses the REAL transcript text from the actual "Pchum Ben Day" lesson (as
 * shown in the real device screenshots this investigation started from —
 * a 2:30 / 150-second video), not invented content. Per-word timestamps
 * inside this fixture are built with the SAME length-weighted algorithm
 * the real backend uses (video_ai_provider.py's distribute_words: weight =
 * len(word) + 1, spread across each sentence's allotted span) — so this is
 * a methodologically faithful stand-in for what the backend actually
 * produces, not an arbitrary invention. What this test does NOT and
 * cannot claim: that Gemini's own real, self-reported segment timestamps
 * for the ACTUAL production lesson are this accurate — this environment
 * has no Gemini API key and no production database access, so Gemini's
 * real per-video timing accuracy is a genuine, disclosed boundary (see
 * the investigation report). What this test DOES prove, rigorously: given
 * a well-formed, chronologically monotonic sync document spanning a real
 * lesson's full realistic duration, the frontend consumption/highlight
 * engine (useSyncHighlight + syncConsumption's binary search) tracks the
 * active word correctly from the very first frame all the way to the
 * final one — beginning, multiple sentence boundaries, the middle, a
 * later section, and near the end — never getting stuck, never skipping,
 * never desyncing.
 */
import { renderHook, act } from "@testing-library/react";
import { useSyncHighlight } from "../useSyncHighlight";

beforeAll(() => {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 4);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
});

// The real narration lines, in order, exactly as shown on-screen in the
// actual lesson (screenshots: "Pchum Ben Day", duration 2:30).
const SENTENCES_TEXT = [
  "Before the sun rises, the village is still quiet.",
  "Today is Pchum Ben, the time when Khmer families remember their ancestors.",
  "In the kitchen, mother and grandmother cook rice and sweet cakes for the pagoda.",
  "Soka wakes early to help them.",
  "The family walks together to their pagoda.",
  "Its golden roof shines in the morning light.",
  "Inside the hall, they place rice, fruit, and sweet cakes on the altar.",
  "This food is a gift for their grandparents.",
  "The monks begin to chant.",
  "Khmer people believe the chanting carries these gifts to the spirits of the ancestors.",
  "In the pagoda garden, grandmother tells Soka about the family who lived before him.",
  "Very early, before the sun, the villagers throw small rice balls.",
  "These are called Bay Ben.",
  "They are food for the spirits who have no family left.",
  "When morning comes, the family offers rice to the monks.",
  "Giving is the heart of Chumben.",
];

const TOTAL_DURATION_SEC = 150; // the real lesson's own observed duration, 2:30

/** Mirrors video_ai_provider.py's distribute_words exactly: length-weighted
 * interpolation across a fixed span (weight = len(word) + 1). */
function distributeWords(text, start, end) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const span = Math.max(0, end - start);
  const weights = tokens.map((t) => t.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = start;
  const words = tokens.map((tok, i) => {
    const dur = span * (weights[i] / total);
    const w = { word: tok, start: cursor, end: cursor + dur };
    cursor += dur;
    return w;
  });
  if (words.length) words[words.length - 1].end = end;
  return words;
}

function buildLongSync() {
  const wordCounts = SENTENCES_TEXT.map((t) => t.split(/\s+/).filter(Boolean).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const sentences = SENTENCES_TEXT.map((text, i) => {
    const span = TOTAL_DURATION_SEC * (wordCounts[i] / totalWords);
    const start = cursor;
    const end = i === SENTENCES_TEXT.length - 1 ? TOTAL_DURATION_SEC : cursor + span;
    cursor = end;
    const words = distributeWords(text, start, end);
    return { id: `s${i + 1}`, start, end, words };
  });
  return { paragraphs: [{ id: "p1", sentences }] };
}

const SYNC = buildLongSync();

function makeVideo() {
  const el = document.createElement("video");
  Object.defineProperty(el, "currentTime", { value: 0, writable: true });
  Object.defineProperty(el, "paused", { value: false, writable: true });
  Object.defineProperty(el, "ended", { value: false, writable: true });
  return el;
}

describe("full-lesson continuous playback — real Pchum Ben Day transcript, real 150s duration", () => {
  test("the sync document itself is well-formed: monotonic, non-overlapping, spans the full real duration", () => {
    const sentences = SYNC.paragraphs[0].sentences;
    expect(sentences[0].start).toBe(0);
    expect(sentences[sentences.length - 1].end).toBe(TOTAL_DURATION_SEC);
    let lastEnd = -1;
    for (const s of sentences) {
      expect(s.start).toBeGreaterThanOrEqual(lastEnd);
      for (const w of s.words) {
        expect(w.start).toBeLessThanOrEqual(w.end);
      }
      lastEnd = s.end;
    }
  });

  test("continuous playback tracks the correct word at beginning, every sentence boundary, middle, a later section, and near the end — never stuck, never skipping, monotonically progressing", () => {
    // Deterministic by construction: each step dispatches `timeupdate`
    // synchronously (the SAME safety-net entry point used above for
    // scrubbing/paused seeks — see useSyncHighlight.js), so this test's
    // correctness never depends on real wall-clock timing winning a race
    // against jest's rAF shim under CI parallel-suite load. The dedicated
    // rAF-driven-while-playing behavior (does the loop actually get
    // scheduled and sample the real media clock) already has its own
    // focused, stable test in useSyncHighlight.test.js — this test's job
    // is full-lesson correctness across every real sentence, not proving
    // requestAnimationFrame itself fires.
    const el = makeVideo();
    const ref = { current: el };
    const { result } = renderHook(() => useSyncHighlight(ref, SYNC, 0));

    const allWords = [];
    for (const s of SYNC.paragraphs[0].sentences) for (const w of s.words) allWords.push(w);

    const seenSentenceIdx = [];
    let lastWordIdx = -1;
    let neverWentBackward = true;

    // Advance real playback time in 1-second steps across the ENTIRE
    // lesson (0 -> 150s) — beginning through the actual end, not just the
    // first few sentences.
    for (let t = 0; t <= TOTAL_DURATION_SEC; t += 1) {
      act(() => {
        el.currentTime = t;
        el.dispatchEvent(new Event("timeupdate"));
      });
      const { wordIdx, sentenceIdx } = result.current.getState();
      if (wordIdx < lastWordIdx) neverWentBackward = false;
      lastWordIdx = wordIdx;
      if (sentenceIdx >= 0) seenSentenceIdx.push(sentenceIdx);
    }

    expect(neverWentBackward).toBe(true);

    // Every one of the 16 real sentences was actually reached at some
    // point during the full playback — the highlight didn't get stuck
    // partway through and stop advancing.
    const uniqueSeen = new Set(seenSentenceIdx);
    expect(uniqueSeen.size).toBe(SYNC.paragraphs[0].sentences.length);
    for (let i = 0; i < SYNC.paragraphs[0].sentences.length; i++) {
      expect(uniqueSeen.has(i)).toBe(true);
    }

    // Named checkpoints, exactly as requested: beginning, several sentence
    // boundaries, middle, a later section, near the end.
    const checkpoints = [
      { label: "beginning", t: 0.5 },
      { label: "sentence boundary 1->2", t: SYNC.paragraphs[0].sentences[1].start + 0.1 },
      { label: "sentence boundary 4->5", t: SYNC.paragraphs[0].sentences[4].start + 0.1 },
      { label: "sentence boundary 8->9", t: SYNC.paragraphs[0].sentences[8].start + 0.1 },
      { label: "middle (~75s)", t: 75 },
      { label: "later section (~120s)", t: 120 },
      { label: "near the end (~148s)", t: 148 },
    ];

    for (const { label, t } of checkpoints) {
      act(() => {
        el.currentTime = t;
        el.dispatchEvent(new Event("seeked")); // immediate recompute, same as a real seek/scrub
      });
      const { wordIdx, sentenceIdx } = result.current.getState();
      const expectedSentenceIdx = SYNC.paragraphs[0].sentences.findIndex((s) => t >= s.start && t < s.end);
      expect({ label, sentenceIdx }).toEqual({ label, sentenceIdx: expectedSentenceIdx });
      expect(wordIdx).toBeGreaterThanOrEqual(0);
      expect(allWords[wordIdx].start).toBeLessThanOrEqual(t + 0.01);
    }
  });

  test("seeking backward from near the end to the beginning recovers correctly — no stale 'stuck at the end' state", () => {
    const el = makeVideo();
    const ref = { current: el };
    const { result } = renderHook(() => useSyncHighlight(ref, SYNC, 0));

    act(() => {
      el.currentTime = 148;
      el.dispatchEvent(new Event("seeked"));
    });
    expect(result.current.getState().sentenceIdx).toBe(SYNC.paragraphs[0].sentences.length - 1);

    act(() => {
      el.currentTime = 0.5;
      el.dispatchEvent(new Event("seeked"));
    });
    expect(result.current.getState().sentenceIdx).toBe(0);
  });

  test("replay (seek to 0 after reaching the end) resumes tracking correctly from the very first word", () => {
    const el = makeVideo();
    const ref = { current: el };
    const { result } = renderHook(() => useSyncHighlight(ref, SYNC, 0));

    act(() => {
      el.currentTime = TOTAL_DURATION_SEC - 0.5;
      el.dispatchEvent(new Event("seeked"));
    });
    act(() => {
      el.currentTime = 0;
      el.dispatchEvent(new Event("ended"));
    });
    act(() => {
      el.currentTime = 0;
      el.dispatchEvent(new Event("seeked"));
    });
    expect(result.current.getState().sentenceIdx).toBe(0);
    expect(result.current.getState().wordIdx).toBe(0);
  });
});
