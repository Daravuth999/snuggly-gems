/**
 * useAutoFollowScrollRaceInvestigation.test.js — attempted reproduction of
 * a HYPOTHESIZED (not previously confirmed) auto-scroll false-suspend
 * race, per the Video Factory surgical bug-fix investigation.
 *
 * THE HYPOTHESIS: useAutoFollow.js's manual-scroll-suspend check —
 *   const onScroll = () => {
 *     const last = lastWrittenTopRef.current;
 *     if (last === null || Math.abs(c.scrollTop - last) > 2) suspend();
 *   };
 * — treats any scrollTop deviating >2px from the LAST value the tween
 * itself wrote as genuine user intent. The hypothesis: `lastWrittenTopRef.
 * current` is updated on every rAF tick of the tween (~every 16ms), but a
 * browser's native `scroll` event dispatch is not guaranteed to fire in
 * exact lockstep with that same tick — so a `scroll` event could
 * conceivably fire referencing an EARLIER write than the CURRENT
 * `lastWrittenTopRef.current`, making a self-caused tween scroll look
 * like a real user scroll and wrongly suspending follow.
 *
 * INVESTIGATION RESULT: NOT REPRODUCIBLE, and closer analysis of DOM
 * event semantics suggests the hypothesis does not hold. `onScroll` reads
 * BOTH `c.scrollTop` (native DOM property — always returns the CURRENT
 * live value, by definition; there is no mechanism for it to be "stale"
 * relative to an earlier write) AND `lastWrittenTopRef.current` (a plain
 * ref) FRESH at the moment the handler actually runs — never as a paired
 * historical snapshot from whenever the underlying write happened. Since
 * `step()` in useAutoFollow.js's `scrollToActive` always writes BOTH
 * values together, synchronously, in the same statement pair —
 *   lastWrittenTopRef.current = next;
 *   c.scrollTop = next;
 * — nothing else in this hook ever writes to `c.scrollTop` independently.
 * So whenever `onScroll` actually runs (however delayed relative to the
 * write that triggered it), both values it compares must still match
 * (mismatched only by browser subpixel/DPI rounding, which the existing
 * 2px tolerance already exists to absorb) UNLESS something EXTERNAL to
 * this hook changed scrollTop in between — in which case treating that as
 * a real, suspend-worthy scroll is the CORRECT behavior, not a bug.
 *
 * This file documents the attempted reproduction (a rapid-fire tween
 * simulating many ticks in quick succession, with a same-tick scroll
 * event fired after each write) and proves the current code does NOT
 * false-positive under this scenario. No fix was shipped for this
 * hypothesis — per the investigation's own ground rules, an unconfirmed
 * hypothesis does not get a speculative fix.
 *
 * 2026-09 UPDATE (Item 2, reopened): the project owner directly observed
 * the "Follow playback" chip appearing on a real device with no genuine
 * input. Real-browser (Playwright, real Chromium + real WebKit)
 * reproduction — not just jsdom — was attempted against this exact
 * unmodified hook over ~60-90s of realistic simulated playback and still
 * could not force a false suspend, but DID directly measure a real
 * subpixel/rounding noise floor of ~0.5px (Chromium) and ~0.98px (WebKit)
 * between `c.scrollTop` and `lastWrittenTopRef.current` on ordinary,
 * healthy scroll events — leaving under 2x headroom under the OLD 2px
 * tolerance this file was written against. useAutoFollow.js now uses an
 * 8px tolerance plus a 2-consecutive-reading requirement before actually
 * suspending (see its own comment) — defensive hardening against that
 * measured noise, not a confirmed fix, since the false suspend itself
 * still couldn't be forced to reproduce. The second test below is
 * updated to dispatch two consecutive out-of-tolerance scroll events
 * instead of one, matching how a real scroll gesture actually behaves
 * (many events in a row) and the new 2-in-a-row semantics.
 */
import { renderHook, act } from "@testing-library/react";
import useAutoFollow from "../useAutoFollow";

function makeContainer({ clientHeight = 400, scrollHeight = 2000 } = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(container, "scrollHeight", { value: scrollHeight, configurable: true });
  let scrollTopValue = 0;
  Object.defineProperty(container, "scrollTop", {
    get: () => scrollTopValue,
    set: (v) => { scrollTopValue = v; },
    configurable: true,
  });
  return container;
}

function makeTarget(offsetTop) {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetTop", { value: offsetTop, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 40, configurable: true });
  return el;
}

test("attempted reproduction: a same-tick 'scroll' event fired immediately after every tween-driven write never triggers a false suspend, across many rapid successive writes", () => {
  const container = makeContainer();
  const containerRef = { current: container };
  let target = makeTarget(300);

  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
  );

  // Simulate many rapid "tween tick" writes — the immediate (reduced-
  // motion-equivalent) path writes synchronously, letting this test drive
  // dozens of ticks without depending on real rAF timing at all. After
  // EVERY write, fire a native scroll event synchronously (jsdom does not
  // dispatch one automatically on a plain scrollTop assignment — this
  // manually reproduces the MOST adversarial version of the hypothesis:
  // a scroll event firing on literally every single write, back-to-back).
  for (let i = 0; i < 40; i++) {
    target = makeTarget(300 + i * 17); // active position keeps advancing
    act(() => {
      result.current.scrollToActive(true);
      container.dispatchEvent(new Event("scroll"));
    });
  }

  // If the hypothesized race were real, at least one of these 40 rapid
  // writes would have been misread as a user scroll and suspended
  // following. It never does.
  expect(result.current.following).toBe(true);
});

test("attempted reproduction: firing a scroll event BEFORE the write it corresponds to has a chance to be read back (worst-case ordering) still does not desync the comparison, because both sides are read live", () => {
  const container = makeContainer();
  const containerRef = { current: container };
  const target = makeTarget(900);
  const { result } = renderHook(
    () => useAutoFollow({ containerRef, activeIdx: 0, getTargetEl: () => target, enabled: true }),
  );

  act(() => { result.current.scrollToActive(true); });
  const writtenTop = container.scrollTop;
  expect(writtenTop).toBeGreaterThan(0);

  // A genuinely external, real user scroll (the container's scrollTop
  // moves to a value the hook never wrote) MUST still suspend — proving
  // this test harness can actually detect a real desync, not just
  // trivially pass no matter what. Two consecutive events, matching how
  // an actual scroll gesture behaves (and the hook's 2-in-a-row
  // requirement, added 2026-09 — see useAutoFollow.js's own comment): a
  // real user's finger/wheel keeps producing out-of-tolerance readings on
  // every subsequent event, unlike a single stray rounding blip.
  act(() => {
    Object.defineProperty(container, "scrollTop", { value: writtenTop + 500, configurable: true });
    container.dispatchEvent(new Event("scroll"));
    container.dispatchEvent(new Event("scroll"));
  });
  expect(result.current.following).toBe(false);
});
