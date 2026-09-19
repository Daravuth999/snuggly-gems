/**
 * focusZone.test.js — pure-geometry coverage for the center-focus reading
 * mode: the anchor ratio must respond to bilingual/font inputs (never a
 * hardcoded viewport percentage), and per-distance styling must recede
 * for past sentences / approach for upcoming ones while leaving the
 * active sentence untouched.
 */
import { computeFocusAnchorRatio, focusZoneStyle, computeTrailingSpacerPx, computeStandardAnchorPx } from "../focusZone";

describe("computeFocusAnchorRatio", () => {
  test("returns the base ratio for plain English, default font", () => {
    expect(computeFocusAnchorRatio({})).toBeCloseTo(0.34, 5);
  });

  test("bilingual mode increases the ratio — anchors the active line higher, leaving more room below for the Khmer line", () => {
    const plain = computeFocusAnchorRatio({ bilingual: false });
    const bilingual = computeFocusAnchorRatio({ bilingual: true });
    expect(bilingual).toBeGreaterThan(plain);
  });

  test("larger font scale reduces the ratio (anchors higher, more room below)", () => {
    const normal = computeFocusAnchorRatio({ fontScale: 1.0 });
    const large = computeFocusAnchorRatio({ fontScale: 1.3 });
    expect(large).toBeLessThan(normal);
  });

  test("smaller font scale increases the ratio slightly", () => {
    const normal = computeFocusAnchorRatio({ fontScale: 1.0 });
    const small = computeFocusAnchorRatio({ fontScale: 0.8 });
    expect(small).toBeGreaterThan(normal);
  });

  test("always stays within the sane clamp range regardless of combined inputs", () => {
    const r1 = computeFocusAnchorRatio({ bilingual: true, fontScale: 0.7 });
    const r2 = computeFocusAnchorRatio({ bilingual: false, fontScale: 1.5 });
    for (const r of [r1, r2]) {
      expect(r).toBeGreaterThanOrEqual(0.22);
      expect(r).toBeLessThanOrEqual(0.46);
    }
  });

  test("is a pure function of its geometry inputs, independent of any specific device — the actual pixel anchor only emerges once a caller multiplies by a real container height", () => {
    const ratioA = computeFocusAnchorRatio({ bilingual: true, fontScale: 1 });
    const smallDeviceHeight = 480; // e.g. iPhone SE-class reading viewport
    const largeDeviceHeight = 760; // e.g. Pro Max-class reading viewport
    const anchorSmall = smallDeviceHeight * ratioA;
    const anchorLarge = largeDeviceHeight * ratioA;
    expect(anchorLarge).toBeGreaterThan(anchorSmall); // same ratio, different real pixels per device
  });
});

// §3 anchor-repositioning UX request: the STANDARD (non-centerFocus)
// reading mode's "Low"/"Center"/"Leading" anchor (TeleprompterSettings'
// scrollSpeed slider) used to place the active line 33-67% down the
// viewport — real vertical distance from the video above it. These
// tests prove the NEW anchor lands near the top instead, while the
// slider's existing Low->Center->Leading direction and relative feel
// are preserved for anyone who already tuned it.
describe("computeStandardAnchorPx", () => {
  test("the existing default (scrollSpeed=1.0, labeled 'Center') now lands near the top, not at 50% down", () => {
    const px = computeStandardAnchorPx(700, 1.0);
    expect(px).toBeCloseTo(91, 1); // 700 / (1+1) * 0.26
    expect(px).toBeLessThan(700 * 0.2); // nowhere near the old 50%-down position
  });

  test("preserves the slider's existing direction: higher scrollSpeed ('Leading') still anchors higher than lower scrollSpeed ('Low')", () => {
    const low = computeStandardAnchorPx(700, 0.5);
    const center = computeStandardAnchorPx(700, 1.0);
    const leading = computeStandardAnchorPx(700, 2.0);
    expect(low).toBeGreaterThan(center);
    expect(center).toBeGreaterThan(leading);
  });

  test("clamps scrollSpeed to the same [0.4, 2.5] range as before, rather than accepting an out-of-range slider value literally", () => {
    const belowRange = computeStandardAnchorPx(700, 0.01);
    const atFloorClamp = computeStandardAnchorPx(700, 0.4);
    const aboveRange = computeStandardAnchorPx(700, 10);
    const atCeilClamp = computeStandardAnchorPx(700, 2.5);
    expect(belowRange).toBeCloseTo(atFloorClamp, 5);
    expect(aboveRange).toBeCloseTo(atCeilClamp, 5);
  });

  test("defaults to the scrollSpeed=1.0 ('Center') anchor when scrollSpeed is missing or not a number", () => {
    const center = computeStandardAnchorPx(700, 1.0);
    expect(computeStandardAnchorPx(700, undefined)).toBeCloseTo(center, 5);
    expect(computeStandardAnchorPx(700, NaN)).toBeCloseTo(center, 5);
  });

  test("floors at 60px on a short/embedded container instead of landing inside .tp-viewport's own 44px top fade mask", () => {
    const px = computeStandardAnchorPx(200, 2.5); // smallest possible raw fraction
    expect(px).toBe(60);
  });

  test("scales up proportionally on a taller device, same as the pre-existing centerFocus anchor's own responsive-fraction philosophy", () => {
    const small = computeStandardAnchorPx(480, 1.0);
    const large = computeStandardAnchorPx(760, 1.0);
    expect(large).toBeGreaterThan(small);
  });
});

describe("focusZoneStyle", () => {
  test("the active sentence (distance 0) is fully visible with no transform offset", () => {
    expect(focusZoneStyle(0)).toEqual({ opacity: 1, transform: "translateY(0px) scale(1)" });
  });

  test("past sentences fade further the more sentences back they are", () => {
    const near = focusZoneStyle(-1);
    const far = focusZoneStyle(-3);
    expect(near.opacity).toBeLessThan(1);
    expect(far.opacity).toBeLessThan(near.opacity);
  });

  test("past sentences translate upward (negative Y)", () => {
    const style = focusZoneStyle(-2);
    const y = Number(style.transform.match(/translateY\((-?[\d.]+)px\)/)[1]);
    expect(y).toBeLessThan(0);
  });

  test("upcoming sentences dim further the more sentences ahead they are", () => {
    const near = focusZoneStyle(1);
    const far = focusZoneStyle(3);
    expect(near.opacity).toBeLessThan(1);
    expect(far.opacity).toBeLessThan(near.opacity);
  });

  test("upcoming sentences translate downward (positive Y), approaching from below", () => {
    const style = focusZoneStyle(2);
    const y = Number(style.transform.match(/translateY\((-?[\d.]+)px\)/)[1]);
    expect(y).toBeGreaterThan(0);
  });

  test("clamps far-distance sentences instead of fading to nothing or drifting indefinitely", () => {
    const far = focusZoneStyle(-50);
    const clampEquivalent = focusZoneStyle(-4);
    expect(far).toEqual(clampEquivalent);
    expect(far.opacity).toBeGreaterThan(0); // never fully invisible — still findable if scrolled to
  });

  test("reduced motion eliminates the translate offset but keeps the opacity fade (state change stays clear)", () => {
    const normal = focusZoneStyle(-2, { reducedMotion: false });
    const reduced = focusZoneStyle(-2, { reducedMotion: true });
    expect(reduced.transform).toBe("translateY(0px) scale(1)");
    expect(reduced.opacity).toBe(normal.opacity); // fade itself is not motion, stays as the state cue
  });
});

// ── Priority-2 focused refinement: the trailing spacer that lets the LAST
//    sentence still reach the center-focus anchor, without wasting scroll
//    room a short transcript never needed. Pure geometry only — no timing,
//    no sync data, no relationship to useAutoFollow's own tween mechanics.
describe("computeTrailingSpacerPx", () => {
  test("computes exactly the extra room needed to bring the last sentence up to the anchor", () => {
    // container 400px tall, anchor at 136px (0.34 ratio), a 40px-tall last
    // sentence: needed = 400 - 136 - 20 = 244.
    const px = computeTrailingSpacerPx({ containerHeight: 400, anchorPx: 136, lastElementHeight: 40 });
    expect(px).toBe(244);
  });

  test("scales up when the anchor sits higher (more room above it needs replacing below)", () => {
    const shallow = computeTrailingSpacerPx({ containerHeight: 400, anchorPx: 200, lastElementHeight: 40 });
    const deep = computeTrailingSpacerPx({ containerHeight: 400, anchorPx: 100, lastElementHeight: 40 });
    expect(deep).toBeGreaterThan(shallow);
  });

  test("floors at the minimum breathing-room value instead of going to zero or negative", () => {
    // The anchor already sits right at the bottom of the reading area, so
    // no extra room is mathematically needed — must not compute a negative
    // or zero spacer, just settle at the small aesthetic floor.
    const px = computeTrailingSpacerPx({ containerHeight: 400, anchorPx: 390, lastElementHeight: 20 });
    expect(px).toBe(16);
  });

  test("a document that already fits the viewport (large last-sentence headroom) gets only the floor, never a wall of empty space", () => {
    // This is the "short transcript" case: the container is generously
    // larger than needed, so no meaningful extra scroll room should be
    // manufactured beyond the small floor.
    const px = computeTrailingSpacerPx({ containerHeight: 200, anchorPx: 190, lastElementHeight: 20 });
    expect(px).toBeLessThanOrEqual(16);
  });

  test("falls back to the floor honestly when geometry is not yet known (e.g. before first layout)", () => {
    expect(computeTrailingSpacerPx({ containerHeight: NaN, anchorPx: 100 })).toBe(16);
    expect(computeTrailingSpacerPx({ containerHeight: 400, anchorPx: undefined })).toBe(16);
  });

  test("a custom minimum is respected", () => {
    expect(computeTrailingSpacerPx({ containerHeight: 100, anchorPx: 95, lastElementHeight: 0, minPx: 32 })).toBe(32);
  });
});
