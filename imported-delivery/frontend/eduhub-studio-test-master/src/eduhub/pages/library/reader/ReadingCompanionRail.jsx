// ReadingCompanionRail.jsx — independent Reading Companion controls.
//
// Replaces ReadingHub.jsx's tap-to-reveal bubble/peek pattern. Live Coach
// and EduTalk are now two permanently visible, independently labeled
// controls (a small vertical rail — Live Coach above EduTalk) instead of
// being hidden inside one generic microphone bubble a student had to open
// first just to discover they exist. Narration is untouched — it stays
// exactly where it already lived, the in-page player in ChapterBlocks.jsx
// (see the `.block-audio--enhanced[data-active="true"]` animation added to
// reader.css alongside this file).
//
// Composes the SAME read-only descriptors ReadingHub.jsx consumed
// ({visible, label, isActive, onOpen}), reported by EduTalkPanel.jsx /
// EduTalkLiveCoach.jsx's own `onFabState` prop — zero changes to either
// module's session/chat/WebSocket/billing logic. `onOpen` is called
// exactly as those components' own (now-hidden) launcher always called
// it. `visible` already goes false the instant a module's own overlay
// takes over (see those components' onFabState effects), so a button
// disappears on its own the moment its feature is actually in use —
// no separate "auto-collapse" bookkeeping needed here.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Mic, MessageCircle } from "lucide-react";
import "./readingCompanionRail.css";

// Shown once per device, matching the exact pattern ReadingHub.jsx /
// AchievementIntro.jsx / AnnouncementPopup.jsx already use elsewhere in
// this app (a boolean localStorage flag, read once on mount).
const INTRO_SEEN_KEY = "eduhub_reading_companion_intro_seen";
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };

function RailButton({ kind, icon: Icon, title, compactLabel, sub, active, onTap, delay, reducedMotion }) {
  return (
    <motion.button
      type="button"
      className="companion-rail__btn"
      data-kind={kind}
      data-testid={`companion-rail-${kind}`}
      data-active={active ? "true" : "false"}
      aria-label={title}
      onClick={() => onTap?.()}
      initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.92 }}
      transition={{ ...SPRING, delay: reducedMotion ? 0 : delay }}
      whileHover={reducedMotion ? undefined : { scale: 1.03, y: -2 }}
      whileFocus={reducedMotion ? undefined : { scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="companion-rail__icon">
        <Icon size={16} aria-hidden="true" />
        <span className="companion-rail__pulse" aria-hidden="true" />
      </span>
      <span className="companion-rail__text">
        <span className="companion-rail__title">{title}</span>
        <span className="companion-rail__title-compact" aria-hidden="true">{compactLabel}</span>
        {sub ? <span className="companion-rail__sub">{sub}</span> : null}
      </span>
    </motion.button>
  );
}

export default function ReadingCompanionRail({ eduTalk, liveCoach, celebrating = false }) {
  const prefersReducedMotion = useReducedMotion();

  const [introDismissed, setIntroDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      return true; // storage unavailable — fail toward "don't nag"
    }
  });
  // Whether the intro had ALREADY been seen on a previous visit, captured
  // once at mount — used only to decide when small-screen label
  // compacting is allowed to kick in ("after the initial discovery
  // animation, never immediately on first use"), independent of whatever
  // introDismissed becomes later in this same session.
  const introAlreadySeenRef = useRef(introDismissed);
  const [showIntro, setShowIntro] = useState(false);
  const dismissIntro = () => {
    setShowIntro(false);
    setIntroDismissed(true);
    try { localStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* noop */ }
  };

  const liveCoachVisible = !!liveCoach?.visible;
  const eduTalkVisible = !!eduTalk?.visible;
  const anyVisible = liveCoachVisible || eduTalkVisible;

  // Smart first-time discovery: once the reading surface has something to
  // show, wait a beat (let Live Coach/EduTalk fade/slide into place first —
  // see each button's own entrance `delay`), then show a tiny contextual
  // hint once. No tutorial modal, nothing to dismiss — it just times out.
  useEffect(() => {
    if (introAlreadySeenRef.current || !anyVisible || celebrating) return;
    const showTimer = setTimeout(() => setShowIntro(true), 1100);
    return () => clearTimeout(showTimer);
  }, [anyVisible, celebrating]);
  useEffect(() => {
    if (!showIntro) return;
    const hideTimer = setTimeout(dismissIntro, 5000);
    return () => clearTimeout(hideTimer);
  }, [showIntro]);
  useEffect(() => {
    if (!showIntro) return;
    const onKeyDown = (e) => { if (e.key === "Escape") dismissIntro(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showIntro]);

  // Nothing to host (guest / feature-flags off / neither module available)
  // — render nothing, same as ReadingHub.jsx's own empty-state contract.
  if (!anyVisible || celebrating) return null;

  return (
    <div
      className="companion-rail"
      data-testid="companion-rail"
      data-intro-done={introAlreadySeenRef.current || introDismissed ? "true" : "false"}
    >
      {showIntro && (
        <div className="companion-rail__intro" data-testid="companion-rail-intro" role="status">
          <span className="companion-rail__intro-title">Your reading companions</span>
          <span className="companion-rail__intro-sub">Listen, practice, or speak with your coach.</span>
        </div>
      )}
      <AnimatePresence>
        {liveCoachVisible && (
          <RailButton
            key="livecoach"
            kind="livecoach"
            icon={Mic}
            title="Live Coach"
            compactLabel="◉ Live"
            sub={liveCoach.isActive ? "Listening…" : (liveCoach.label || "Speak with your coach")}
            active={!!liveCoach.isActive}
            onTap={liveCoach.onOpen}
            delay={0}
            reducedMotion={prefersReducedMotion}
          />
        )}
        {eduTalkVisible && (
          <RailButton
            key="edutalk"
            kind="edutalk"
            icon={MessageCircle}
            title="EduTalk"
            compactLabel="◇ Talk"
            sub={eduTalk.label || "Practice what you read"}
            active={!!eduTalk.isActive}
            onTap={eduTalk.onOpen}
            delay={prefersReducedMotion ? 0 : (liveCoachVisible ? 0.15 : 0)}
            reducedMotion={prefersReducedMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
