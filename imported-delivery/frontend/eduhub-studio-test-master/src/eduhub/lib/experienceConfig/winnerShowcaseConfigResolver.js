/**
 * winnerShowcaseConfigResolver.js — twin of achievementConfigResolver.js,
 * same structure applied to a second experienceType
 * ("winner_showcase_theme") rather than a copy-paste-and-diverge. Turns a
 * raw ExperienceConfig into a fully-resolved presentation object
 * FridaySpeakingWinnersPanel.jsx can render directly.
 *
 * WHY A SEPARATE TYPE FROM "achievement_top_earner" (Option 1 of the
 * Winner Showcase Theme Engine directive, chosen over Option 2's literal
 * `syncMode: "followAchievement"` dependency): grepping every consumer of
 * useExperienceConfig/resolveExperienceConfig in this codebase turns up
 * zero precedent for one experience type reading another type's actual
 * `experience_configs` document. achievementConfigResolver.js's own
 * "Follow Welcome Theme" doesn't do that either — resolveFollowWelcomeTheme
 * only reads the app's shared useTheme() day/night SIGNAL, the same
 * signal every themed surface already consumes, never Welcome's own
 * config content. A parallel `winner_showcase_theme` type is what this
 * codebase's own established pattern actually looks like; a literal
 * cross-type config dependency would be the first of its kind here.
 *
 * appearance shape (experience_configs, experienceType=
 * "winner_showcase_theme") — deliberately the SAME shape as
 * achievement_top_earner's:
 *   syncMode      "followWelcome" | "independent"
 *   themeId       preset id from achievementThemes.js (REUSED directly,
 *                 not forked — "clone exactly" means starting from the
 *                 same visual quality; a parallel preset file would be a
 *                 second theme-authoring system, exactly what
 *                 achievementConfigResolver.js's own header comment warns
 *                 against building)
 *   overrides     same OVERRIDABLE_TOP_LEVEL field set, same per-field
 *                 merge semantics
 *   artwork       same heroArtworkSchema-shaped background artwork
 *   nextSessionCountdown  ADDITIVE field, not part of the achievement
 *                 twin: { enabled, weekday (0=Sun..6=Sat), hour, minute }
 *                 — a live countdown to the next Friday classroom session,
 *                 admin-configurable via WinnerShowcaseThemeStudio.jsx.
 *                 Presentation-only (a display config, not winner data),
 *                 so it lives here rather than in the winner_showcase
 *                 snapshot doc.
 */
import { getAchievementTheme, resolveFollowWelcomeTheme } from "../../styles/tokens/achievementThemes";
import { mergeAchievementOverrides } from "./achievementConfigResolver";

// Sensible default: Friday (weekday 5), a placeholder time an admin is
// expected to adjust to the real classroom slot — this codebase has no
// confirmed real session time anywhere, so a specific hour is never
// invented as if it were verified data. 15:00 local is used only as a
// clearly-adjustable starting point, matching "zero required setup"
// without claiming to know the real schedule.
export const DEFAULT_NEXT_SESSION_COUNTDOWN = {
  enabled: true,
  weekday: 5,
  hour: 15,
  minute: 0,
};

/**
 * resolveWinnerShowcasePresentation(config, {appTheme}) -> a
 * fully-resolved theme object (same shape as an achievementThemes.js
 * entry, plus nextSessionCountdown) TopEarnerPanel-style rendering needs.
 *
 * `config` may be null (no published config yet) — ALWAYS falls back to
 * Follow-Welcome behavior with no artwork and the default countdown,
 * matching achievementConfigResolver.js's own "never a broken/blank
 * panel" guarantee, and giving the panel a premium look with zero admin
 * setup required (same bar the Achievement panel's own default sets).
 */
export function resolveWinnerShowcasePresentation(config, { appTheme } = {}) {
  const appearance = config?.appearance || {};
  const syncMode = appearance.syncMode === "independent" ? "independent" : "followWelcome";

  const base = syncMode === "independent"
    ? getAchievementTheme(appearance.themeId || "emeraldAchievement")
    : resolveFollowWelcomeTheme(appTheme);

  const resolved = mergeAchievementOverrides(base, appearance.overrides);

  return {
    ...resolved,
    syncMode,
    artwork: appearance.artwork || null,
    visible: config?.content?.visible !== false,
    nextSessionCountdown: {
      ...DEFAULT_NEXT_SESSION_COUNTDOWN,
      ...(appearance.nextSessionCountdown || {}),
    },
  };
}

export default { resolveWinnerShowcasePresentation, DEFAULT_NEXT_SESSION_COUNTDOWN };
