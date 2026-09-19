import { renderHook, act } from "@testing-library/react";
import useAutoFollow from "../useAutoFollow";

// Regression guard for a real integration defect found while auditing the
// Video Library surgical refinement package: Author Studio's (unmodified)
// TeleprompterPanel.jsx renders Teleprompter with `sync` starting as null
// (fetched async, no loading gate) — so the scrollable container does not
// exist in the DOM on first render. It appears on a LATER render once the
// sync document resolves, without the component ever unmounting. A naive
// `[containerRef, enabled]` effect dependency array never re-fires in that
// case, since the ref OBJECT's identity never changes — only `.current`
// does — so manual-scroll suspend silently never attaches for the rest of
// that session. Fixed by useAutoFollow.js's containerTick watcher.
test("manual-scroll suspend still attaches once the container appears on a later render", () => {
  const containerRef = { current: null }; // same ref object identity throughout
  const { result, rerender } = renderHook(
    ({ hasContainer }) => {
      if (hasContainer && !containerRef.current) {
        containerRef.current = document.createElement("div");
      }
      return useAutoFollow({ containerRef, activeIdx: -1, getTargetEl: () => null });
    },
    { initialProps: { hasContainer: false } },
  );

  expect(result.current.following).toBe(true);

  // The sync document resolves; the real container div mounts for the
  // first time on this render, but containerRef itself never changed
  // identity, only its `.current`.
  rerender({ hasContainer: true });

  act(() => {
    containerRef.current.dispatchEvent(new Event("wheel"));
  });

  expect(result.current.following).toBe(false);
});

// Regression guard for the "video moves while reading" bug reported against
// TeleprompterPanel.jsx: jsdom reports clientHeight/scrollHeight/offsetTop
// as 0 for every element unless a test explicitly stubs them, which means a
// container with NO real height ceiling (maxScroll always 0, exactly the
// production bug) and a container with a REAL ceiling were previously
// indistinguishable to this suite — both "passed" by doing nothing. This
// test stubs realistic dimensions for a properly-bounded container (the
// fixed shape once TeleprompterPanel.jsx's max-height ships) and proves
// useAutoFollow actually writes a non-zero, advancing scrollTop as the
// active sentence progresses — the one thing the bug prevented.
test("writes an advancing scrollTop on a container with a real clientHeight/scrollHeight gap", () => {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(container, "scrollHeight", { value: 2000, configurable: true });
  let scrollTopValue = 0;
  Object.defineProperty(container, "scrollTop", {
    get: () => scrollTopValue,
    set: (v) => { scrollTopValue = v; },
    configurable: true,
  });
  const containerRef = { current: container };

  const sentenceEls = [0, 1, 2, 3, 4].map((i) => {
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetTop", { value: i * 300, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 40, configurable: true });
    return el;
  });

  const { result, rerender } = renderHook(
    ({ activeIdx }) => useAutoFollow({
      containerRef,
      activeIdx,
      getTargetEl: () => sentenceEls[activeIdx],
      enabled: true,
      anchorFor: (c) => c.clientHeight * 0.35,
    }),
    { initialProps: { activeIdx: 0 } },
  );

  // Immediate (reduced-motion-equivalent) path is exercised via jsdom's
  // absent requestAnimationFrame in this environment, so the write happens
  // synchronously inside the effect — no timer/rAF driving needed here.
  act(() => { result.current.scrollToActive(true); });
  const afterFirst = container.scrollTop;

  rerender({ activeIdx: 3 }); // sentence progressed well past the first screenful
  act(() => { result.current.scrollToActive(true); });
  const afterAdvance = container.scrollTop;

  expect(afterAdvance).toBeGreaterThan(afterFirst);
  expect(afterAdvance).toBeGreaterThan(0);
  // Never scrolls past what the container actually has to give.
  expect(afterAdvance).toBeLessThanOrEqual(container.scrollHeight - container.clientHeight);
});

// 2026-09 hardening (Item 2, reopened): real-browser (Playwright, real
// Chromium + real WebKit) investigation of the reported "Follow playback
// appears mid-lesson with no real input" symptom could not force a false
// suspend over ~60-90s of realistic simulated playback in either engine,
// but DID measure a real subpixel-rounding noise floor of up to ~0.5px
// (Chromium) / ~0.98px (WebKit) between `c.scrollTop` and
// `lastWrittenTopRef.current` on ordinary, healthy scroll events — under
// 2x headroom below the OLD 2px tolerance. These tests discriminate the
// actual hardening (8px tolerance + a 2-consecutive-reading requirement),
// not a re-run of jsdom coverage that already existed.
function makeScrollableContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(container, "scrollHeight", { value: 2000, configurable: true });
  let scrollTopValue = 0;
  Object.defineProperty(container, "scrollTop", {
    get: () => scrollTopValue,
    set: (v) => { scrollTopValue = v; },
    configurable: true,
  });
  return container;
}

test("a single small subpixel-rounding-sized deviation never suspends following", () => {
  const container = makeScrollableContainer();
  const containerRef = { current: container };
  const target = document.createElement("div");
  Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
  Object.defineProperty(target, "clientHeight", { value: 40, configurable: true });

  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
  );
  act(() => { result.current.scrollToActive(true); });
  const written = container.scrollTop;

  // A single reading 5px off (bigger than any measured real noise, but
  // still well under the new 8px tolerance) must not suspend.
  act(() => {
    Object.defineProperty(container, "scrollTop", { value: written + 5, configurable: true });
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(true);
});

test("a single reading past the tolerance does not suspend on its own, but a second consecutive one does", () => {
  const container = makeScrollableContainer();
  const containerRef = { current: container };
  const target = document.createElement("div");
  Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
  Object.defineProperty(target, "clientHeight", { value: 40, configurable: true });

  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
  );
  act(() => { result.current.scrollToActive(true); });
  const written = container.scrollTop;

  // First out-of-tolerance reading — a lone jank/rounding blip must not
  // suspend by itself.
  act(() => {
    Object.defineProperty(container, "scrollTop", { value: written + 50, configurable: true });
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(true);

  // A real scroll gesture keeps producing out-of-tolerance readings on
  // the very next event too — the second one must suspend.
  act(() => {
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(false);
});

test("an in-tolerance reading between two out-of-tolerance ones resets the streak (no false suspend from alternating noise)", () => {
  const container = makeScrollableContainer();
  const containerRef = { current: container };
  const target = document.createElement("div");
  Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
  Object.defineProperty(target, "clientHeight", { value: 40, configurable: true });

  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
  );
  act(() => { result.current.scrollToActive(true); });
  const written = container.scrollTop;

  act(() => {
    Object.defineProperty(container, "scrollTop", { value: written + 50, configurable: true });
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(true);

  // Back in tolerance — this must reset the streak, not carry it forward.
  act(() => {
    Object.defineProperty(container, "scrollTop", { value: written + 1, configurable: true });
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(true);

  // One more out-of-tolerance reading right after — since the streak was
  // reset, this is only the FIRST of a new streak, so still no suspend.
  act(() => {
    Object.defineProperty(container, "scrollTop", { value: written + 50, configurable: true });
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(true);
});

// 2026-09 structural redesign (Item 2, reopened again — "eliminate self-
// scroll ambiguity structurally", not just widen the tolerance further):
// direct input-event detection replaces position-comparison as the FIRST
// line of defense for the input types that have an unambiguous DOM event
// of their own. These tests exercise that direct path — no scrollTop
// comparison involved at all, unlike the tests above (which exercise the
// remaining defensive backstop).
function makeSimpleContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(container, "scrollHeight", { value: 2000, configurable: true });
  let scrollTopValue = 0;
  Object.defineProperty(container, "scrollTop", {
    get: () => scrollTopValue,
    set: (v) => { scrollTopValue = v; },
    configurable: true,
  });
  return container;
}

test("pointerdown (scrollbar-thumb-drag and touch-gesture-start both hit-test here) suspends immediately, with no position comparison needed", () => {
  const container = makeSimpleContainer();
  const containerRef = { current: container };
  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => null, enabled: true }),
  );
  expect(result.current.following).toBe(true);
  act(() => { container.dispatchEvent(new Event("pointerdown")); });
  expect(result.current.following).toBe(false);
});

test("touchstart suspends immediately, before any touchmove would even fire", () => {
  const container = makeSimpleContainer();
  const containerRef = { current: container };
  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => null, enabled: true }),
  );
  act(() => { container.dispatchEvent(new Event("touchstart")); });
  expect(result.current.following).toBe(false);
});

test.each(["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "])(
  "keydown %s suspends immediately",
  (key) => {
    const container = makeSimpleContainer();
    const containerRef = { current: container };
    const { result } = renderHook(
      () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => null, enabled: true }),
    );
    act(() => { container.dispatchEvent(new KeyboardEvent("keydown", { key })); });
    expect(result.current.following).toBe(false);
  },
);

test("an unrelated keydown (e.g. typing in a search box elsewhere that bubbles through) does not suspend", () => {
  const container = makeSimpleContainer();
  const containerRef = { current: container };
  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => null, enabled: true }),
  );
  act(() => { container.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
  expect(result.current.following).toBe(true);
});

test("a word-tap's pointerdown self-heals within the same interaction once the caller's seek handler calls resumeFollow", () => {
  // Mirrors Teleprompter.jsx's real handleSeek: onSeek(t) then
  // resumeFollow() in direct sequence — proves the momentary suspend a
  // word tap's own pointerdown causes never leaves the user stuck.
  const container = makeSimpleContainer();
  const containerRef = { current: container };
  const target = document.createElement("div");
  Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
  Object.defineProperty(target, "clientHeight", { value: 40, configurable: true });
  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
  );

  act(() => {
    container.dispatchEvent(new Event("pointerdown")); // the tap's own pointerdown
    result.current.resumeFollow(); // the seek handler's immediate follow-up, same gesture
  });

  expect(result.current.following).toBe(true);
});

// §3 periodic drift correction.
test("a periodic resync corrects a stale scroll position caused by an external layout change (e.g. a resize), without waiting for the next sentence change", () => {
  jest.useFakeTimers();
  try {
    const container = makeSimpleContainer();
    const containerRef = { current: container };
    let target = document.createElement("div");
    Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
    Object.defineProperty(target, "clientHeight", { value: 40, configurable: true });

    const { result } = renderHook(
      () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
    );
    act(() => { result.current.scrollToActive(true); });
    const correctPosition = container.scrollTop;
    expect(correctPosition).toBeGreaterThan(0);

    // Simulate an external layout change desyncing the visual position
    // from the correct target WITHOUT any sentence change (activeIdx
    // stays 0) — e.g. a viewport resize shifted content underneath it.
    // Uses the container's own existing scrollTop setter (from
    // makeSimpleContainer), not a property redefinition, which would
    // otherwise clobber that setter and make scrollTop read-only for the
    // rest of the test.
    container.scrollTop = correctPosition - 200;
    expect(container.scrollTop).not.toBe(correctPosition);

    // No sentence change happens — only the periodic resync should fix this.
    act(() => { jest.advanceTimersByTime(3100); });

    expect(container.scrollTop).toBe(correctPosition);
  } finally {
    jest.useRealTimers();
  }
});

test("the periodic resync never fires while auto-follow is suspended", () => {
  jest.useFakeTimers();
  try {
    const container = makeSimpleContainer();
    const containerRef = { current: container };
    const target = document.createElement("div");
    Object.defineProperty(target, "offsetTop", { value: 900, configurable: true });
    Object.defineProperty(target, "clientHeight", { value: 40, configurable: true });

    const { result } = renderHook(
      () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
    );
    act(() => { result.current.scrollToActive(true); });
    const correctPosition = container.scrollTop;

    act(() => { container.dispatchEvent(new Event("pointerdown")); }); // suspend
    expect(result.current.following).toBe(false);

    // The user has deliberately scrolled elsewhere while suspended — the
    // periodic resync must never yank them back.
    container.scrollTop = 5;
    act(() => { jest.advanceTimersByTime(3100); });

    expect(container.scrollTop).toBe(5); // untouched
  } finally {
    jest.useRealTimers();
  }
});
