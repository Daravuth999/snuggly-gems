/**
 * attendanceTokens.js — Attendance's own visual identity.
 *
 * Deliberately NOT the Dashboard's `morningEmerald`/`auroraNight` palette
 * (designTokens.js) — Attendance is its own domain with its own premium
 * surface language (deep navy hero, warm ivory ground, champagne-gold
 * reward, restrained emerald success, a quiet "live" accent that never
 * reads as neon). Motion, however, comes from the shared platform
 * `motionTokens.js` — timing/easing is a platform concern, color is not.
 */
export const attendance = {
  navy: "#0B1120",
  navyDeep: "#070C18",
  navySoft: "#131E36",
  ivory: "#FAF9F6",
  surface: "#FFFFFF",
  // ink/inkMuted/inkFaint/hairline: FIXED dark literals — only correct
  // when paired with one of Attendance's own opaque light surfaces (the
  // RewardSurface ivory-gold card). Never use these for text that sits
  // directly on the app shell's own background (Section labels, timeline
  // rows, borderless dividers, LiveBanner's translucent tint) — that
  // background is theme-aware (rgb(var(--bgfx-1)), flipped by
  // themeAuto.js) and near-black in dark mode, so fixed near-black text
  // on it goes invisible. Use the pageInk/pageInkMuted/pageInkFaint/
  // pageHairline tokens below instead for anything without its own
  // explicit light card.
  ink: "#1B2130",
  inkMuted: "rgba(27,33,48,0.62)",
  inkFaint: "rgba(27,33,48,0.42)",
  onNavy: "#FFFFFF",
  onNavySoft: "rgba(255,255,255,0.68)",
  onNavyFaint: "rgba(255,255,255,0.42)",
  hairline: "rgba(27,33,48,0.09)",
  hairlineOnNavy: "rgba(255,255,255,0.12)",

  // Page-level text/dividers — read the SAME --bgfx-ink/--bgfx-line CSS
  // variables themeAuto.js already drives everywhere else in the app
  // (see StudentProfilePage.jsx, GamePublic.jsx, PortalPublic.jsx for the
  // identical rgb(var(--bgfx-ink) / alpha) convention), so these flip
  // automatically with the day/night toggle instead of needing their own
  // theme-detection logic. Mirrors ink/inkMuted/inkFaint's exact 100/62/42
  // opacity tiers so page-level hierarchy still matches the card-level one.
  pageInk: "rgb(var(--bgfx-ink))",
  pageInkMuted: "rgb(var(--bgfx-ink) / 0.62)",
  pageInkFaint: "rgb(var(--bgfx-ink) / 0.42)",
  pageHairline: "rgb(var(--bgfx-line) / 0.09)",

  emerald: "#1F8A5F",
  emeraldSoft: "rgba(74,222,128,0.16)",
  emeraldOnNavy: "#86EFAC",

  amber: "#B6822A",
  amberSoft: "rgba(251,191,36,0.14)",
  amberOnNavy: "#FDE68A",

  gold: "#C9A24B",
  goldBright: "#E4C97A",
  goldDeep: "#7A5D1F",
  goldSoft: "rgba(201,162,75,0.12)",

  live: "#4FA6D9",
  liveSoft: "rgba(79,166,217,0.14)",

  absent: "#9A9285",
  absentSoft: "rgba(154,146,133,0.12)",
};

export default { attendance };
