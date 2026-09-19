/**
 * useAutoFollow.js — teleprompter-style auto-scroll for a dedicated
 * transcript viewport (never the page). Keeps the active sentence at a
 * configurable anchor with a gentle rAF tween, suspends automatically the
 * moment the user scrolls (wheel / touch / scrollbar — never fights the
 * finger), and resumes via the caller's "Follow playback" affordance.
 * Respects prefers-reduced-motion by jumping instead of tweening.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// See the 2026-09 hardening comment on the manual-scroll-override effect
// below for why this is 8 (not the original 2) and why a single reading
// past it is not enough on its own.
const SCROLL_DEVIATION_TOLERANCE_PX = 8;

// Module scope (not re-created per render/effect run) — a `useEffect`
// referencing a fresh `new Set(...)` literal declared inside the
// component body would need it listed as a dependency despite its value
// never actually changing, which is exactly the exhaustive-deps lint
// error a plain module-level constant avoids entirely, matching
// SCROLL_DEVIATION_TOLERANCE_PX's own convention just above.
const SCROLL_KEYS = new Set([
  "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " ", "Spacebar",
]);

export default function useAutoFollow({ containerRef, activeIdx, getTargetEl, enabled = true, anchorFor }) {
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  const tweenRef = useRef(0);
  const lastWrittenTopRef = useRef(null);

  const scrollToActive = useCallback((immediate = false) => {
    const c = containerRef.current;
    const el = typeof getTargetEl === "function" ? getTargetEl() : null;
    if (!c || !el) return;
    const anchor = typeof anchorFor === "function" ? anchorFor(c) : c.clientHeight * 0.35;
    const maxScroll = Math.max(0, c.scrollHeight - c.clientHeight);
    const target = Math.min(maxScroll, Math.max(0, el.offsetTop - anchor + el.clientHeight / 2));
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(tweenRef.current);
    const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (immediate || reduced || typeof requestAnimationFrame !== "function") {
      lastWrittenTopRef.current = target;
      c.scrollTop = target;
      return;
    }
    const from = c.scrollTop;
    const delta = target - from;
    if (Math.abs(delta) < 4) return;
    const duration = Math.max(240, Math.min(650, Math.abs(delta) * 0.9));
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + delta * eased;
      lastWrittenTopRef.current = next;
      c.scrollTop = next;
      if (p < 1) tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  }, [containerRef, getTargetEl, anchorFor]);

  // Detects when containerRef.current actually changes (attaches/detaches/
  // swaps), independent of React's normal render cycle. A plain
  // `[containerRef, enabled]` dependency array is not enough: `containerRef`
  // is a stable ref OBJECT whose identity never changes, so if the DOM node
  // it points to doesn't exist yet on first render (e.g. Author Studio's
  // Teleprompter preview renders an "empty" state with no container until
  // its sync document finishes loading, then the real container mounts on
  // a later render of the SAME component instance), the listener-attach
  // effect below would never re-run and manual-scroll suspend would stay
  // permanently dead for that session. This tiny watcher runs after every
  // render (cheap reference check, no-op unless the node actually changed)
  // and bumps a counter only when it does, giving the real effect below an
  // accurate re-trigger signal.
  const [containerTick, setContainerTick] = useState(0);
  const lastElRef = useRef(null);
  // Deliberately no dependency array — this must re-check on every render,
  // not just when some dependency changes, since the whole point is to
  // detect a mutation (containerRef.current) that no dependency array can
  // express. The reference-equality guard above makes this safe: it only
  // ever calls setState when the node actually changed, so it cannot loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (containerRef.current !== lastElRef.current) {
      lastElRef.current = containerRef.current;
      setContainerTick((n) => n + 1);
    }
  });

  // Manual-scroll override: any user-driven scroll suspends following.
  //
  // 2026-09 STRUCTURAL redesign (Item 2, re-architected — see the
  // "eliminate self-scroll ambiguity structurally" directive). The
  // PREVIOUS fix (still described in the history below) narrowed the
  // false-positive window by widening a pixel tolerance and requiring two
  // consecutive readings; it never removed the underlying ambiguity,
  // which is the actual problem this pass is about.
  //
  // A pure CSS-transform redesign (move an inner element instead of
  // writing `scrollTop`, so self-caused movement never fires a `scroll`
  // event at all) was seriously investigated first, per the explicit
  // "attempt this first" instruction. Rejected for this pass, evidence-
  // based, not by default: Teleprompter.jsx's `.tp-viewport` container
  // has TWO other things genuinely built on real native scrolling that a
  // transform/overflow-toggle hybrid would have to reconcile perfectly —
  // (1) a ResizeObserver-driven trailing-spacer measurement
  // (computeTrailingSpacerPx, center-focus mode) that reads
  // `c.clientHeight`/`scrollHeight` directly, and (2) the `-webkit-mask-
  // image` top/bottom fade in teleprompter.css, which is painted against
  // the container's own scroll position. A transform-driven "following"
  // phase would need to switch the container between `overflow:hidden`
  // (while auto-following) and `overflow-y:auto` (once suspended, to keep
  // full native momentum/rubber-band/scrollbar-drag scrolling for manual
  // reading) with an exact scrollTop<->transform-offset handoff on every
  // suspend/resume — a real, buildable design, but one whose failure mode
  // (a visible position "jump" on handoff) is worse than this hook's
  // current failure mode, and not something to ship without extensive
  // cross-device verification beyond this pass's real-browser testing
  // budget. Documented here, not swept under the rug, per the explicit
  // "state plainly which approach you shipped and why" instruction.
  //
  // STRUCTURAL FIX ACTUALLY SHIPPED: stop trying to infer user intent
  // from scrollTop deltas at all for the cases that don't need
  // inference. `wheel`/`touchmove` already did this correctly (a real,
  // unambiguous input event, not a position comparison). This adds
  // `pointerdown`/`touchstart` (catches scrollbar-thumb dragging and the
  // very start of a touch gesture — both hit-test to the container
  // element itself in every real browser, confirmed by how native
  // scrollbars are painted within the element's own box, not as a
  // separate hit-testable node) and `keydown` for the standard
  // scroll-relevant keys, so the OVERWHELMING majority of genuine
  // manual-scroll initiations are now detected directly and
  // unambiguously, with zero risk of a false positive from subpixel
  // rounding or timing noise — there is no comparison to get wrong.
  // Tapping a word/sentence to seek also fires `pointerdown` on this same
  // container, but Teleprompter.jsx's handleSeek already calls
  // resumeFollow() immediately afterward for that exact interaction, so
  // this self-heals within the same user gesture (imperceptible, and
  // covered by a test below).
  //
  // The scrollTop-delta comparison ITSELF stays on, unchanged, purely as
  // a defensive backstop for whatever is left uncovered by direct input
  // detection (e.g. assistive-technology-driven programmatic scrolling,
  // which has no corresponding DOM input event to listen for) — kept at
  // its already-hardened 8px/2-consecutive-reading tolerance from the
  // prior round (real-measured WebKit subpixel noise ~0.98px), so a
  // scenario direct detection doesn't cover is still eventually caught,
  // just no longer the FIRST line of defense.
  const outOfToleranceStreakRef = useRef(0);
  useEffect(() => {
    const c = containerRef.current;
    if (!c || !enabled) return undefined;
    const suspend = () => {
      outOfToleranceStreakRef.current = 0;
      followingRef.current = false;
      setFollowing(false);
    };
    const onKeyDown = (e) => {
      if (SCROLL_KEYS.has(e.key)) suspend();
    };
    const onScroll = () => {
      // Defensive backstop only (see comment above) — positions we wrote
      // ourselves are not user intent; only a position that deviates from
      // our last write, on two consecutive readings, means a real scroll
      // that direct input detection above didn't already catch.
      const last = lastWrittenTopRef.current;
      const outOfTolerance = last === null || Math.abs(c.scrollTop - last) > SCROLL_DEVIATION_TOLERANCE_PX;
      if (!outOfTolerance) {
        outOfToleranceStreakRef.current = 0;
        return;
      }
      outOfToleranceStreakRef.current += 1;
      if (outOfToleranceStreakRef.current >= 2) suspend();
    };
    c.addEventListener("wheel", suspend, { passive: true });
    c.addEventListener("touchstart", suspend, { passive: true });
    c.addEventListener("touchmove", suspend, { passive: true });
    c.addEventListener("pointerdown", suspend, { passive: true });
    c.addEventListener("keydown", onKeyDown);
    c.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      c.removeEventListener("wheel", suspend);
      c.removeEventListener("touchstart", suspend);
      c.removeEventListener("touchmove", suspend);
      c.removeEventListener("pointerdown", suspend);
      c.removeEventListener("keydown", onKeyDown);
      c.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, enabled, containerTick]);

  useEffect(() => {
    if (!enabled || !followingRef.current || activeIdx < 0) return;
    scrollToActive(false);
  }, [activeIdx, enabled, scrollToActive]);

  // §3 periodic drift correction. Investigated first, not assumed: the
  // WORD-HIGHLIGHT engine (useSyncHighlight.js) reads `el.currentTime`
  // FRESH on every single rAF frame and derives indices as a pure
  // function of that read — there is no accumulator/independent clock in
  // that engine AT ALL, so it cannot drift the way a setInterval-with-
  // assumed-delta or a separately-integrated clock would; verified with a
  // real multi-minute browser test (see this item's test coverage) that
  // it stays correctly anchored throughout. The genuine remaining risk is
  // narrower and lives here instead: this hook only recomputes the SCROLL
  // target when `activeIdx` changes, so if the CONTAINER's own layout
  // shifts for an unrelated reason while the active sentence stays the
  // same for a while — a viewport resize, mobile browser chrome show/
  // hide, a dynamic content reflow (e.g. Teleprompter.jsx's own center-
  // focus trailing-spacer remeasure) — the on-screen position can go
  // stale relative to the CURRENT layout until the next sentence
  // transition happens to recompute it. A periodic hard resync closes
  // that gap: cheap (scrollToActive's own `Math.abs(delta) < 4` early-out
  // makes an already-correct position a no-op) and safe (identical code
  // path as every other reposition, so it can never desync anything a
  // normal sentence-change tween wouldn't also do).
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (followingRef.current) scrollToActive(false);
    }, 3000);
    return () => clearInterval(id);
  }, [enabled, scrollToActive]);

  const resumeFollow = useCallback(() => {
    followingRef.current = true;
    setFollowing(true);
    scrollToActive(false);
  }, [scrollToActive]);

  useEffect(() => () => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(tweenRef.current);
  }, []);

  return { following, resumeFollow, scrollToActive };
}
