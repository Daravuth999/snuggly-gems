// FridaySpeakingWinnersPanel.jsx — Friday Speaking Labs Feature 1.
//
// Winner Showcase Theme Engine directive: this panel is now BUILT THE
// SAME WAY TopEarnerPanel.jsx is — same imports of AchievementDecorations,
// HeroArtworkLayer, and the shared achievementPresentationHelpers
// (TROPHY_ICONS/BORDER_STYLE/initials/avatarColor) — reusing this
// codebase's existing premium, admin-configurable presentation engine
// instead of the earlier round's hand-designed gradients/Lottie shimmer.
// That earlier direction is fully superseded here; ChampionShimmer.jsx is
// left on disk unused (rollback-safety convention) rather than deleted.
//
// Data stays exactly what it always was — useWinnerShowcaseRotation()'s
// topWinners/champion/activeWindow, a point-in-time settlement snapshot —
// NOT resolveAchievementPresentation's live leaderboard query. Only the
// THEME/RENDERING layer is swapped: resolveWinnerShowcasePresentation
// (winnerShowcaseConfigResolver.js), a twin of achievementConfigResolver.js
// against its own independent `winner_showcase_theme` experience type
// (Option 1 of the directive — see that resolver's own header comment for
// why a parallel type was chosen over a literal cross-type dependency).
//
// Preserved untouched from prior rounds: position above LearningProgress
// (Dashboard.jsx, unchanged by this file), the bilingual Khmer heading and
// per-rank labels, the "Rotates in Nd" countdown from the showcase's own
// activeWindow.endsAt, the backend wiring (useWinnerShowcaseRotation +
// SOURCE filter), the loading skeleton, and the empty-state null-render.
//
// New: a live "Next Friday Speaking Lab in…" countdown
// (nextSessionCountdown.js), admin-configurable via
// WinnerShowcaseThemeStudio.jsx's own "Next Session Countdown" section —
// presentation-only (lives in the theme config, not the winner_showcase
// snapshot doc), separate from the existing rotation countdown.
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Trophy, Crown } from "lucide-react";
import useWinnerShowcaseRotation from "../../hooks/useWinnerShowcaseRotation";
import useExperienceConfig from "../../hooks/useExperienceConfig";
import { useTheme } from "../../pages/portal/hooks/useTheme";
import { resolveWinnerShowcasePresentation } from "../../lib/experienceConfig/winnerShowcaseConfigResolver";
import { computeNextSessionCountdown, formatCountdown } from "../../lib/experienceConfig/nextSessionCountdown";
import AchievementDecorations from "../AchievementDecorations";
import HeroArtworkLayer from "../HeroArtworkLayer";
import { TROPHY_ICONS, BORDER_STYLE, initials, avatarColor } from "../achievementPresentationHelpers";

const SOURCE = "speaking_lab_classroom_draw";
const EXPERIENCE_TYPE = "winner_showcase_theme";

// English + Khmer per rank — same convention as the prior round's
// RANK_STYLE labels, carried over unchanged (kept bilingual per the
// "keep everything already correct from prior rounds untouched"
// directive). TODO(i18n): needs native Khmer speaker review before
// shipping — not yet verified by a native speaker.
const RANK_LABELS = [
  { label: "Champion", labelKm: "ជើងឯក" },
  { label: "2nd Place", labelKm: "ចំណាត់ថ្នាក់ទី២" },
  { label: "3rd Place", labelKm: "ចំណាត់ថ្នាក់ទី៣" },
];

function initialOf(name) {
  return initials(name || "?");
}

// Display-only — the backend's own activeWindow.endsAt is authoritative;
// this only formats the remaining time, never re-derives expiry logic.
function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
}

function WinnerCardSkeleton({ index }) {
  return (
    <div
      className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] p-3 animate-pulse"
      data-testid={`friday-winner-skeleton-${index}`}
    >
      <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-white/10 mx-auto" />
      <div className="h-2.5 w-3/4 mx-auto mt-3 rounded bg-zinc-200 dark:bg-white/10" />
      <div className="h-2 w-1/2 mx-auto mt-2 rounded bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}

function WinnerCard({ winner, rank, theme }) {
  const tile = theme.rankTile[rank + 1] || theme.rankTile.rest;
  const TrophyIcon = TROPHY_ICONS[theme.trophy?.style] || Crown;
  const cardBorder = BORDER_STYLE[theme.playerCard?.borderStyle || "glow"](tile.glow || theme.goldAccent);
  const name = winner.display_name || winner.student_id || "Student";
  const isChampion = rank === 0;
  const winnerEmphasis = theme.playerCard?.winnerEmphasis?.enabled !== false;
  const championGlow = isChampion && theme.trophy?.championGlow?.enabled && winnerEmphasis;
  const rankMeta = RANK_LABELS[rank] || RANK_LABELS[2];

  return (
    <motion.div
      className="relative flex-1 rounded-2xl p-3 text-center overflow-hidden backdrop-blur-sm"
      style={{
        background: theme.surfaceCard,
        borderRadius: theme.playerCard?.cornerRadius,
        ...cardBorder,
        boxShadow: championGlow ? `0 0 24px -6px ${theme.trophy.color}` : cardBorder.boxShadow,
      }}
      data-testid={`friday-winner-card-${rank}`}
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 2.6 + rank * 0.3, repeat: Infinity, ease: "easeInOut", delay: rank * 0.2 }}
      whileHover={{ y: -5, scale: 1.03 }}
    >
      {isChampion && (
        <span
          className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm z-10"
          style={{ background: tile.gradient, color: tile.on }}
        >
          <TrophyIcon className="w-2.5 h-2.5" />
          {rankMeta.label}
        </span>
      )}
      <div
        className="relative w-10 h-10 mx-auto rounded-full flex items-center justify-center font-orbitron font-black text-sm text-white border border-white/20"
        style={{ background: avatarColor(name) }}
      >
        {initialOf(name)}
      </div>
      <p className="mt-2 text-[0.8rem] font-bold truncate" style={{ color: theme.nameColor || theme.onSurface }} title={name}>
        {name}
      </p>
      {typeof winner.amount === "number" && (
        <p className="text-[0.72rem] font-semibold tabular-nums" style={{ color: theme.scoreColor || theme.goldAccent }}>
          +{winner.amount.toLocaleString()} pts
        </p>
      )}
      {!isChampion && (
        <p className="text-[0.62rem] font-semibold mt-0.5" style={{ color: theme.onSurfaceSoft }}>
          {rankMeta.label} <span className="font-khmer">· {rankMeta.labelKm}</span>
        </p>
      )}
    </motion.div>
  );
}

function NextSessionCountdown({ schedule, theme }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!schedule?.enabled) return null;
  const countdown = computeNextSessionCountdown(schedule, new Date(now));
  return (
    <p
      className="px-1 mb-2 text-[0.62rem] font-semibold flex items-center gap-1"
      style={{ color: theme.onSurfaceSoft }}
      data-testid="friday-winners-next-session"
    >
      <span aria-hidden>⏱</span>
      Next Friday Speaking Lab in {formatCountdown(countdown)}
    </p>
  );
}

/**
 * @param {object} [themeConfig] — resolved ExperienceConfig for
 *   experienceType="winner_showcase_theme" (see
 *   WinnerShowcaseThemeStudio.jsx's own live preview). Optional and purely
 *   presentational — when absent, this component self-fetches its own
 *   published theme via useExperienceConfig, matching how DiscoveryCard.jsx
 *   and other leaf Dashboard panels already self-fetch. Absent/null
 *   ALWAYS falls back to Follow-Welcome behavior — never a broken panel.
 */
export default function FridaySpeakingWinnersPanel({ themeConfig } = {}) {
  const { current, loading } = useWinnerShowcaseRotation({ sourceFilter: SOURCE });
  const { config: fetchedThemeConfig } = useExperienceConfig(EXPERIENCE_TYPE);
  const { theme: appTheme } = useTheme();
  const prefersReducedMotion = useReducedMotion();
  const animateEnabled = !prefersReducedMotion;

  const effectiveThemeConfig = themeConfig || fetchedThemeConfig;
  const theme = useMemo(
    () => resolveWinnerShowcasePresentation(effectiveThemeConfig, { appTheme }),
    [effectiveThemeConfig, appTheme],
  );

  if (loading) {
    return (
      <section data-testid="friday-speaking-winners-panel-loading">
        <div className="flex items-center gap-1.5 px-1 mb-2">
          <Trophy className="w-3.5 h-3.5 text-[#9C7A2C] dark:text-[#FFE19A]" />
          <h2 className="text-[0.78rem] font-extrabold uppercase tracking-wide text-ink dark:text-white/90">
            Friday&apos;s Speaking Winners
          </h2>
        </div>
        <div className="flex items-stretch gap-2.5">
          {[0, 1, 2].map((i) => (
            <WinnerCardSkeleton key={i} index={i} />
          ))}
        </div>
      </section>
    );
  }

  // Empty state — same convention as WinnerShowcaseBanner: render null,
  // never a fabricated placeholder winner.
  if (!current) return null;
  if (!theme.visible) return null;

  const content = current.content || {};
  const topWinners = (Array.isArray(content.topWinners) ? content.topWinners : []).slice(0, 3);
  if (!topWinners.length) return null;

  const remainingDays = daysUntil(current.activeWindow?.endsAt);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.8, 0.25, 1], delay: 0.1 }}
      className="relative overflow-hidden rounded-2xl p-3"
      style={{
        background: theme.surface,
        boxShadow: `${theme.shadow || "0 14px 40px rgba(0,0,0,0.35)"}, 0 0 0 1px ${theme.borderColor || `${theme.goldAccent}1A`}`,
      }}
      data-testid="friday-speaking-winners-panel"
      data-winner-theme={theme.mode}
      data-winner-preset={theme.id}
    >
      {theme.artwork?.url && (
        <HeroArtworkLayer heroArtwork={theme.artwork} animateEnabled={animateEnabled} />
      )}
      <AchievementDecorations decorations={theme.decorations} animateEnabled={animateEnabled} />

      <div className="relative flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: theme.goldAccent }} />
          <h2 className="text-[0.78rem] font-extrabold uppercase tracking-wide truncate" style={{ color: theme.headerColor || theme.onSurface }}>
            Friday&apos;s Speaking Winners
          </h2>
          {/* TODO(i18n): needs native Khmer speaker review before shipping. */}
          <span className="font-khmer text-[0.78rem] -ml-0.5 shrink-0" style={{ color: theme.onSurfaceSoft }}>
            · ជ័យលាភីនិយាយថ្ងៃសុក្រ
          </span>
        </div>
        {remainingDays !== null && (
          <span
            className="shrink-0 text-[0.62rem] font-bold whitespace-nowrap"
            style={{ color: theme.onSurfaceSoft }}
            data-testid="friday-winners-rotation-hint"
          >
            {remainingDays <= 0 ? "Rotates soon" : `Rotates in ${remainingDays}d`}
          </span>
        )}
      </div>

      <NextSessionCountdown schedule={theme.nextSessionCountdown} theme={theme} />

      <div className="relative flex items-stretch gap-2.5">
        {topWinners.map((winner, i) => (
          <WinnerCard key={winner.student_id || winner.code || i} winner={winner} rank={i} theme={theme} />
        ))}
      </div>
    </motion.section>
  );
}
