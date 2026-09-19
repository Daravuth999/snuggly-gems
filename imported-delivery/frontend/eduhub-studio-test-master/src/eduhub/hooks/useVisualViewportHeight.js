// useVisualViewportHeight.js — the LIVE, measured height of the visual
// viewport in pixels, for screens that must dock content directly on
// top of the on-screen keyboard rather than merely hide something else
// while it's open (see useVisualViewportKeyboard.js for that simpler,
// boolean-only sibling — this hook exists specifically for the
// messaging thread's composer, which needs the real number, not just
// an open/closed flag).
//
// WHY NOT JUST `h-[100dvh]`: this exact codebase already has a
// documented prior incident of `100dvh` on a root PWA container failing
// to track the keyboard correctly in an installed-to-home-screen iOS
// PWA (see feedback memory "No dvh on root containers w/o iOS PWA
// validation"), and the messaging thread's own first attempt at
// `h-[100dvh]` reproduced the same class of failure on a real device
// (a visible dead gap between the composer and the keyboard). WebKit's
// `dvh` support in STANDALONE display mode has genuinely inconsistent
// behavior across iOS versions — this is not assumed, it is why this
// hook measures `window.visualViewport.height` directly instead:
// `visualViewport` itself has been supported in iOS Safari since iOS
// 13, a much wider floor than `dvh` (iOS 15.4+) or the newer
// `interactive-widget=resizes-content` viewport meta value (iOS
// 17.4+, and even there behavior has had reported inconsistencies
// across WebKit builds) — measuring the real reported value sidesteps
// uncertainty about which CSS-unit behavior a given build implements.
//
// Same event-wiring convention as useVisualViewportKeyboard.js
// (`resize` + `scroll` on visualViewport, `resize` on window as the
// fallback when visualViewport is unavailable) — a second real usage
// of that exact pattern, not a new one.
//
// Returns `null` in non-browser / SSR environments and until the very
// first measurement lands, so a consumer can render a `100dvh`
// Tailwind class as a same-frame placeholder (never a 0-height flash)
// and switch to the live pixel value the instant it's known.

import { useEffect, useState } from "react";

function readHeight() {
  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  return Math.round(vv ? vv.height : window.innerHeight);
}

export default function useVisualViewportHeight() {
  // Lazy initializer — measured synchronously on the first render
  // rather than starting at `null` and correcting a render later,
  // matching the exact lesson from MessagingBell.jsx's reduced-motion
  // fix (a value that only self-corrects after mount lets one bad
  // frame render against the wrong assumption first).
  const [height, setHeight] = useState(readHeight);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => setHeight(readHeight());
    update();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    } else {
      window.addEventListener("resize", update);
    }
    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      } else {
        window.removeEventListener("resize", update);
      }
    };
  }, []);

  return height;
}
