/**
 * useSyncHighlightResilience.test.js — regression coverage for the 2026-08
 * "teleprompter highlight desync, never recovers" investigation.
 *
 * Root cause found by reading useSyncHighlight.js's rAF loop directly (not
 * a Gemini-timing question): loop() called compute() with NO exception
 * guard. If compute() ever threw on any single frame — for any reason —
 * the throw aborted loop() BEFORE its requestAnimationFrame(loop) call, so
 * the loop silently stopped scheduling itself forever. `running` never got
 * reset to false (only stop() does that), so a later `play` event could
 * never restart it either (start() no-ops while running is true). The
 * highlight would freeze at its last-good word and never recover for the
 * rest of the lesson — exactly the reported "works for a while, then
 * permanently stops" failure mode, independent of whether the underlying
 * Gemini timestamps are themselves accurate.
 *
 * This file proves the fix (safeCompute wrapping every entry point) by
 * making computeActiveWord throw on exactly one call, mid-lesson, and
 * confirming: (1) the loop survives that frame, (2) a LATER frame still
 * resolves correctly, (3) a subsequent pause/play cycle still works (never
 * left in the "running=true forever, start() no-ops" trap).
 */
import { renderHook, act } from "@testing-library/react";

// CRA's jest config resets every mock's IMPLEMENTATION before each test
// runs (resetMocks) — an implementation assigned inside the jest.mock
// factory below (which only runs once, at module-import time, well before
// any test body) gets silently wiped back to a bare stub returning
// undefined. The passthrough implementation must therefore be (re-)armed
// in beforeEach, not baked into the factory. See this codebase's own
// documented pitfall (feedback-cra-resetmocks-beforeall-pitfall).
const actualSyncConsumption = jest.requireActual("../syncConsumption");

jest.mock("../syncConsumption", () => ({
  __esModule: true,
  computeActiveWord: jest.fn(),
  computeActiveSentence: jest.requireActual("../syncConsumption").computeActiveSentence,
  computeActiveParagraph: jest.requireActual("../syncConsumption").computeActiveParagraph,
  computeCurrentSpeaker: jest.requireActual("../syncConsumption").computeCurrentSpeaker,
  computeScrollPosition: jest.requireActual("../syncConsumption").computeScrollPosition,
}));

import { computeActiveWord } from "../syncConsumption";
import { useSyncHighlight } from "../useSyncHighlight";

beforeAll(() => {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
});

beforeEach(() => {
  computeActiveWord.mockImplementation((...args) => actualSyncConsumption.computeActiveWord(...args));
});

// A realistic multi-sentence lesson span, so "later in the lesson" is a
// real, distinct point in time from "the first frame after the throw".
const LONG_SYNC = {
  paragraphs: [{
    id: "p1",
    sentences: [
      { id: "s1", start: 0, end: 1, words: [{ word: "Before", start: 0, end: 1 }] },
      { id: "s2", start: 1, end: 2, words: [{ word: "the", start: 1, end: 2 }] },
      { id: "s3", start: 2, end: 3, words: [{ word: "sun", start: 2, end: 3 }] },
      { id: "s4", start: 3, end: 4, words: [{ word: "rises", start: 3, end: 4 }] },
      { id: "s5", start: 4, end: 5, words: [{ word: "Today", start: 4, end: 5 }] },
    ],
  }],
};

function makeVideo() {
  const el = document.createElement("video");
  Object.defineProperty(el, "currentTime", { value: 0, writable: true });
  Object.defineProperty(el, "paused", { value: true, writable: true });
  Object.defineProperty(el, "ended", { value: false, writable: true });
  return el;
}

test("a single frame that throws inside compute() does not permanently kill the rAF loop", async () => {
  const el = makeVideo();
  const ref = { current: el };
  const { result } = renderHook(() => useSyncHighlight(ref, LONG_SYNC, 0));

  // Sentence 1 ("the") resolves normally first.
  act(() => {
    el.currentTime = 1.2;
    el.dispatchEvent(new Event("seeked"));
  });
  expect(result.current.getState().wordIdx).toBe(1);

  // Start real rAF-driven playback.
  act(() => {
    el.paused = false;
    el.dispatchEvent(new Event("play"));
  });

  // Exactly ONE upcoming frame throws — simulates the unpredictable,
  // unreproducible defect class this fix guards against (a malformed
  // document edge case, a future regression in computeIndices, anything).
  computeActiveWord.mockImplementationOnce(() => {
    throw new Error("simulated transient failure — must not be fatal to the session");
  });

  el.currentTime = 2.5; // sentence 3 ("sun") — the frame that will throw
  await act(() => new Promise((r) => setTimeout(r, 60)));
  // Before the fix: this throw would have permanently stopped the loop —
  // the assertion below (a LATER time) is what actually proves survival.

  el.currentTime = 4.5; // sentence 5 ("Today") — several sentences later
  await act(() => new Promise((r) => setTimeout(r, 60)));
  expect(result.current.getState().wordIdx).toBe(4); // "Today" — loop kept running and caught up
});

test("after a mid-lesson throw, pause then play still works — never stuck in a dead 'running' state", async () => {
  const el = makeVideo();
  const ref = { current: el };
  const { result } = renderHook(() => useSyncHighlight(ref, LONG_SYNC, 0));

  act(() => {
    el.paused = false;
    el.dispatchEvent(new Event("play"));
  });

  computeActiveWord.mockImplementationOnce(() => {
    throw new Error("simulated transient failure");
  });
  el.currentTime = 2.5;
  await act(() => new Promise((r) => setTimeout(r, 60)));

  // Pause, then resume — this is exactly the path that was permanently
  // broken before the fix: start() no-ops while `running` stays stuck true.
  act(() => {
    el.paused = true;
    el.dispatchEvent(new Event("pause"));
  });
  act(() => {
    el.paused = false;
    el.currentTime = 4.5;
    el.dispatchEvent(new Event("play"));
  });
  await act(() => new Promise((r) => setTimeout(r, 60)));
  expect(result.current.getState().wordIdx).toBe(4);
});

test("a throw on the very first computed frame (before any word ever resolved) still lets the very next frame resolve correctly", async () => {
  const el = makeVideo();
  const ref = { current: el };
  computeActiveWord.mockImplementationOnce(() => {
    throw new Error("simulated failure on the mount-time compute() call");
  });
  const { result } = renderHook(() => useSyncHighlight(ref, LONG_SYNC, 0));

  act(() => {
    el.currentTime = 1.2;
    el.dispatchEvent(new Event("seeked"));
  });
  expect(result.current.getState().wordIdx).toBe(1);
});
