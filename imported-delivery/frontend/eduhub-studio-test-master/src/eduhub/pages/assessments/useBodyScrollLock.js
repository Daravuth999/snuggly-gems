/**
 * useBodyScrollLock — freezes the page behind a full-screen assessment
 * overlay while it's open.
 *
 * The three assessment overlays (SubmitAssessmentModal, AssessmentDetailSheet,
 * AssessmentResultsSheet) portal to document.body and visually blur the
 * dashboard, but nothing previously stopped the dashboard itself from still
 * scrolling underneath. A touch meant to scroll the sheet's content could
 * instead drag the page behind it — the app shell's own horizontal
 * `overflow-x-auto` strips (e.g. the assessments tab bar) would then respond
 * to that same touch, producing an unstable "pulls left/right" scroll and
 * taps that land on now-shifted background elements instead of the sheet.
 * `overflow: hidden` alone doesn't fully stop this on iOS Safari (rubber-band
 * scroll still reaches the body), so this pins the body at its current
 * scroll offset with position:fixed and restores it on close.
 */
import { useEffect } from "react";

export default function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const { body } = document;
    const { style } = body;
    const scrollY = window.scrollY;
    const prev = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      width: style.width,
    };
    style.overflow = "hidden";
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    return () => {
      style.overflow = prev.overflow;
      style.position = prev.position;
      style.top = prev.top;
      style.width = prev.width;
      try { window.scrollTo(0, scrollY); } catch { /* not implemented in some test/embedded environments */ }
    };
  }, [active]);
}
