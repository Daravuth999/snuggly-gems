/**
 * MessagingBell.jsx — in-app messaging header icon, placed alongside
 * NotificationBell (rule 9: header bar, not a 7th bottom-nav tab).
 *
 * Fully omitted (rule 8.2), not shown disabled, whenever the feature
 * is off: MessagingContext's `enabled` is null while still checking
 * and false once the backend has confirmed the feature is off — this
 * renders nothing in EITHER of those states, only once `enabled` is
 * confirmed true does the real icon mount. No flash of a
 * disabled-looking icon at any point.
 *
 * v2 (premium Lottie icon) — a small gold "chat bubble" Lottie
 * (public/lotties/messaging-bell.json), following TopUpLottie.jsx's
 * exact established convention (the one REAL Lottie integration in
 * this codebase — lottie-react, lazy-fetched JSON under
 * /lotties/*.json, prefers-reduced-motion check, defensive fallback
 * to a static equivalent on any failure). LibraryLottieGreeter.jsx,
 * despite its name, is pure SVG+framer-motion with zero Lottie
 * involvement — not the pattern followed here.
 *
 * "lottie-react" is imported DYNAMICALLY (inside the fetch effect),
 * never as a static top-level import — lottie-web touches a 2D canvas
 * context at MODULE LOAD time, which jsdom does not implement, and a
 * static import here previously crashed every unrelated test that
 * transitively renders Header.jsx.
 *
 * v3 (invisible-icon fix — confirmed root cause, not a guess): a real
 * browser test against lottie-web directly proved `autoplay:false`
 * renders NOTHING at all — not a static frame 0 — until an imperative
 * `playSegments` call succeeds. v2 depended ENTIRELY on one `useEffect`
 * finding a populated `lottieRef.current.animationItem` after mount; if
 * that link ever failed for any reason (a remount race, anything), the
 * icon was permanently blank with zero visual fallback despite the
 * button staying clickable — exactly the reported regression. Fixed by
 * making the idle state fully DECLARATIVE (`autoplay` + `loop` +
 * `initialSegment`, verified in a real browser to render correctly
 * with ZERO imperative calls at all) — the player now guarantees
 * visible content the instant it mounts, independent of any effect
 * timing. The only remaining imperative logic is the arrival burst
 * (no declarative way to express "play this other segment once, on a
 * later external event"); if that specific effect ever fails, the
 * worst case is now "the burst animation doesn't play" — never
 * "the icon is invisible again."
 *
 * A `LottieErrorBoundary` also wraps the real player: if lottie-react
 * ever throws during render (a corrupted/future asset, a library bug),
 * it falls back to the exact same static icon rather than taking the
 * header down with it — the fallback UI is centralized in one
 * component so the "not loaded yet," "failed to fetch," and "threw
 * while rendering" paths can never visually diverge from each other.
 */
import { Component } from "react";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMessaging } from "../../context/MessagingContext";

const LOTTIE_PATH = "/lotties/messaging-bell.json";
const IDLE_SEGMENT = [0, 90];
const ARRIVAL_SEGMENT = [90, 135];

function readReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function useReducedMotion() {
  // Lazy initializer — computed synchronously on the FIRST render, not
  // corrected a render later via an effect. A `false` default that only
  // self-corrects after mount would let the fetch effect below (which
  // depends on this value) fire once before the correction lands,
  // wasting a network request under prefers-reduced-motion every time.
  const [reduced, setReduced] = useState(readReducedMotion);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = (e) => setReduced(e.matches);
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    } catch {
      return undefined;
    }
  }, []);
  return reduced;
}

function FallbackIcon() {
  return (
    <div
      className={[
        "w-[34px] h-[34px] rounded-[9px] border flex items-center justify-center",
        "bg-zinc-900/[0.04] dark:bg-white/[0.05] border-zinc-900/[0.10] dark:border-white/[0.10] text-ink dark:text-white/80",
      ].join(" ")}
      data-testid="messaging-bell-fallback"
    >
      <MessageCircle className="w-4 h-4" />
    </div>
  );
}

class LottieErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Nothing to report to — FallbackIcon below is the whole recovery.
  }

  render() {
    return this.state.hasError ? <FallbackIcon /> : this.props.children;
  }
}

export default function MessagingBell() {
  const ctx = useMessaging();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [LottieComp, setLottieComp] = useState(null);
  const [animData, setAnimData] = useState(null);
  const [animFailed, setAnimFailed] = useState(false);
  const lottieRef = useRef(null);

  const enabled = ctx?.enabled === true;

  // Lazy-fetch (JSON + the lottie-react module itself, in parallel) —
  // only once the feature is actually on for this student, so a
  // student with messaging off never pays even this small cost, and
  // jsdom test environments that never reach this branch never touch
  // lottie-web's module-load-time canvas access at all.
  useEffect(() => {
    if (!enabled || reducedMotion) return undefined;
    let alive = true;
    Promise.all([
      import("lottie-react"),
      fetch(LOTTIE_PATH, { credentials: "omit" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("404")))),
    ])
      .then(([mod, j]) => {
        if (!alive) return;
        setLottieComp(() => mod.default);
        setAnimData(j);
      })
      .catch(() => { if (alive) setAnimFailed(true); });
    return () => { alive = false; };
  }, [enabled, reducedMotion]);

  // A genuine new arrival — one non-looping burst, then back to idle.
  // Enhancement only: idle itself never depends on this ever firing.
  useEffect(() => {
    const inst = lottieRef.current;
    const anim = inst?.animationItem;
    if (!ctx?.lastArrival || !anim || !animData) return;
    anim.loop = false;
    inst.playSegments(ARRIVAL_SEGMENT, true);
  }, [ctx?.lastArrival, animData]);

  const handleBurstComplete = () => {
    const inst = lottieRef.current;
    const anim = inst?.animationItem;
    if (!anim) return;
    anim.loop = true;
    inst.playSegments(IDLE_SEGMENT, true);
  };

  if (!ctx || ctx.enabled !== true) return null;
  const { unreadCount } = ctx;
  const hasUnread = unreadCount > 0;
  const showLottie = !reducedMotion && !animFailed && animData && LottieComp;

  return (
    <div className="relative inline-flex items-center">
      <style>{`
        @keyframes eduhub-msg-badge-pop {
          0% { transform: scale(0.4); opacity: 0; }
          70% { transform: scale(1.18); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <button
        onClick={() => navigate("/messages")}
        aria-label={hasUnread ? `Messages — ${unreadCount} unread` : "Messages"}
        data-testid="messaging-bell-btn"
        className="relative w-[40px] h-[40px] rounded-[10px] flex items-center justify-center transition-transform duration-150 hover:scale-105 active:scale-95"
      >
        {showLottie ? (
          <LottieErrorBoundary>
            <LottieComp
              lottieRef={lottieRef}
              animationData={animData}
              autoplay
              loop
              initialSegment={IDLE_SEGMENT}
              onComplete={handleBurstComplete}
              data-testid="messaging-bell-lottie"
              style={{ width: 32, height: 32, pointerEvents: "none" }}
            />
          </LottieErrorBoundary>
        ) : (
          <FallbackIcon />
        )}
        {hasUnread && (
          <span
            data-testid="messaging-bell-badge"
            className="absolute -top-[2px] -right-[2px] min-w-[16px] h-[16px] px-[3px] rounded-full bg-aurora-magenta text-white text-[9.5px] font-bold flex items-center justify-center ring-2 ring-[#0a0a0f] leading-none"
            style={{ animation: "eduhub-msg-badge-pop 0.35s ease-out" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
