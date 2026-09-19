/**
 * achievementPresentationHelpers.js — pure, domain-agnostic presentation
 * helpers originally written inline inside TopEarnerPanel.jsx. Extracted
 * here (Winner Showcase Theme Engine clone) so the new
 * FridaySpeakingWinnersPanel.jsx can reuse them by IMPORT, not by
 * copy-paste — TopEarnerPanel.jsx now imports from here too, so both
 * consumers share exactly one implementation. No behavior change: every
 * function body is byte-for-byte what TopEarnerPanel.jsx already had.
 */
import { useEffect, useRef, useState } from "react";
import { Crown, Trophy, Medal, Star, Award } from "lucide-react";

export const TROPHY_ICONS = {
  classic: Trophy,
  crownJewel: Crown,
  medal: Medal,
  star: Star,
  wreath: Award,
};

export const BORDER_STYLE = {
  solid: (color) => ({ border: `1px solid ${color}` }),
  glow: (color) => ({ border: `1px solid ${color}`, boxShadow: `0 0 14px ${color}40` }),
  none: () => ({ border: "none" }),
};

export function initials(name) {
  if (!name) return "??";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(name) {
  const palette = ["#00e0ff", "#9b5cff", "#ff3da6", "#ffc94d", "#a3ff3a", "#ff7a3a"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function CountUp({ value, duration = 900, decimals = 0 }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  useEffect(() => {
    fromRef.current = display;
    startRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * e;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return (
    <span className="tabular-nums" data-testid="top-earner-countup">
      {display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

export default { TROPHY_ICONS, BORDER_STYLE, initials, avatarColor, CountUp };
