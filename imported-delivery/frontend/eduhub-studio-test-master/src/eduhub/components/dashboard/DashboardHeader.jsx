// DashboardHeader.jsx — Home Dashboard V4 (flat mobile-first reconstruction).
//
// Replaces the old floating-world PresencePassportCard footer tile with a
// single top-of-page identity row: greeting + streak/tier + points, matching
// the approved mockup's header. This sits BELOW the app's existing global
// Header (logo/bell/menu, rendered by AppShell) — it is Dashboard-owned
// content, not a replacement for that shell chrome.
//
// Data is 100% the existing hooks, unchanged: useAuth() for name/points,
// useAttendance() for streak/tier/live-session state (same hook
// PresencePassportCard used). No new backend, no fabricated fields.
import { Link } from "react-router-dom";
import { Flame, Gem, Coins, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAnimatedPoints } from "../../lib/useAnimatedPoints";

// RC2.5 — framer-motion v12's supported way to animate a non-DOM component
// (react-router's Link). Defined once at module scope, not per-render.
const MotionLink = motion.create(Link);
import { useAuth } from "../../context/AuthContext";
import { useAttendance } from "../../hooks/useAttendance";
import { elevation } from "../../styles/tokens/designTokens";
import { spring, ambient, easing } from "../../styles/tokens/motionTokens";
import useAmbientActive from "../../hooks/useAmbientActive";
import AmbientParticles from "./AmbientParticles";
import { useLang } from "../../pages/portal/contexts/LanguageContext";
import avatarProfileSrc from "../../../assets/dashboard/avatar-profile.png";
import walletIconSrc from "../../../assets/dashboard/wallet.png";

const TIER_COLORS = { bronze: "#CD7F32", silver: "#8E9196", gold: "#D9A22B", diamond: "#3FB6C9" };

function greetingForHour(h) {
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// RC2.5 — a brief glow on the points pill when the real points value goes
// up (real signal — an actual increase in already-fetched data, never a
// simulated/periodic effect). Ignores the very first render (nothing
// "just increased" on mount) and any decrease.
function usePointsJustEarned(points) {
  const prevRef = useRef(points);
  const [justEarned, setJustEarned] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = points;
    if (points > prev) {
      setJustEarned(true);
      const t = setTimeout(() => setJustEarned(false), 1600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [points]);

  return justEarned;
}

export default function DashboardHeader() {
  const { student, isAuthenticated } = useAuth() || {};
  const { me, live, loading, currentStreak, tier } = useAttendance({ enabled: isAuthenticated, pollLive: true });
  const { t, lang } = useLang();
  const points = typeof student?.portalPoints === "number" ? student.portalPoints : 0;
  // Hooks must run unconditionally (rules of hooks) — before the
  // isAuthenticated early return below.
  const pointsDisplay = useAnimatedPoints(points, { duration: 0.9 });
  const justEarned = usePointsJustEarned(points);
  // Avatar/wallet artwork enhancement — presentation only. If either
  // bundled asset ever fails to load at runtime, fall back to the prior
  // layout (no avatar slot / the Coins glyph) rather than a broken-image
  // icon.
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [walletFailed, setWalletFailed] = useState(false);
  // RC2.9 §12/13 — the wallet pill's ambient bloom/sweep/particles all
  // gate through the same on-screen/tab-visible/reduced-motion check as
  // every other continuous loop on the Dashboard.
  const { ref: walletAmbientRef, active: walletAmbientActive } = useAmbientActive();

  if (!isAuthenticated) return null;

  const greeting = greetingForHour(new Date().getHours());
  const firstName = (student?.name || "").trim().split(/\s+/)[0] || "there";
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.bronze;
  const streakLinkTo = live?.live && live?.slug ? `/attendance/j/${live.slug}` : "/attendance";

  return (
    <>
    <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1" data-testid="dashboard-header">
      {/* RC3.2 §3 — explicit 3-zone layout: LEFT avatar (flex-none) /
          CENTER greeting+name+streak+tier (flex-1, min-w-0) / RIGHT
          wallet pill (flex-none, now deliberately narrow — see below).
          `min-w-0` (not a min-width floor) is the correct fix here: it
          lets this zone truly shrink to whatever space is actually left,
          so the name ALWAYS gets real estate proportional to the
          viewport and gracefully ellipsis-truncates instead of a floor
          value that doesn't actually change how much space the wallet
          claims. The wallet's own footprint (below) is now shrunk at the
          source instead, which is what actually stops it competing with
          the name for room. */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {!avatarFailed && (
          <img
            src={avatarProfileSrc}
            alt=""
            aria-hidden
            onError={() => setAvatarFailed(true)}
            className="flex-none w-12 h-12 rounded-full object-cover border-2 border-white dark:border-white/10"
            style={{ boxShadow: elevation.soft }}
            data-testid="dashboard-header-avatar"
          />
        )}

        <div className="min-w-0">
          {/* Greeting word ("Good evening") and the student's name used to
              share one truncating line — on a long greeting ("Good
              afternoon") or a narrow viewport, the shared ellipsis could
              eat into the name itself (e.g. "Good evening, Ad…" for
              "Admin"). Split into two lines instead: a small, muted
              greeting label, then the name alone on its own line with its
              own full-width truncate scope — the one thing a student
              should always be able to read at a glance is their own name. */}
          <p className="text-[0.7rem] font-semibold text-zinc-500 dark:text-white/50 leading-none mb-0.5">
            {greeting}
          </p>
          <h1 className="font-display text-[1.4rem] sm:text-[1.55rem] font-extrabold tracking-tight text-ink dark:text-white truncate leading-tight">
            {firstName} <span aria-hidden>👋</span>
          </h1>

          {!loading && me && (
            <Link
              to={streakLinkTo}
              className="mt-1 inline-flex items-center gap-2.5 text-[0.8rem] text-zinc-600 dark:text-white/60 hover:text-ink dark:hover:text-white transition-colors"
              data-testid="dashboard-presence-passport"
            >
              {/* A lit flame next to "0 day streak" reads as broken, not
                  motivating — mute it and reframe the copy at the honest
                  zero-state instead of always showing the same lit icon. */}
              <span className="inline-flex items-center gap-1 font-semibold">
                <Flame
                  className="w-3.5 h-3.5"
                  style={{ color: currentStreak > 0 ? "#F97316" : "currentColor", opacity: currentStreak > 0 ? 1 : 0.4 }}
                />
                {currentStreak > 0 ? `${currentStreak} day streak` : "Start your streak today"}
              </span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1 font-semibold capitalize" style={{ color: tierColor }}>
                <Gem className="w-3.5 h-3.5" style={{ color: tierColor }} />
                {tier} tier
              </span>
              {live?.live && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              )}
            </Link>
          )}
        </div>
      </div>

      {/* RC3.2 §4 — footprint deliberately minimized (no "pts" label, no
          chevron) so the pill structurally cannot compete with the name
          for space, while still reading as MORE premium: bigger coin,
          bolder number, layered surface with edge lighting + an inner
          highlight. "pts" is dropped rather than fabricated-smaller —
          the coin icon already establishes what the number means. */}
      <MotionLink
        ref={walletAmbientRef}
        to="/portal/me"
        data-testid="dashboard-header-points"
        className="relative overflow-hidden flex-none inline-flex pl-2 pr-3 py-1.5 rounded-full bg-gradient-to-br from-white to-[#FFFBF0] dark:from-white/[0.07] dark:to-white/[0.04] border border-zinc-200 dark:border-white/[0.10]"
        whileTap={spring.tap}
        animate={{
          boxShadow: justEarned
            ? [elevation.soft, `${elevation.soft}, inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 2px rgba(245,158,11,0.4), 0 0 18px rgba(245,158,11,0.35)`, elevation.soft]
            : `${elevation.soft}, inset 0 1px 0 rgba(255,255,255,0.8)`,
        }}
        transition={justEarned ? { duration: 1.4, ease: "easeOut" } : { duration: 0.2 }}
      >
        {/* Champagne bloom + soft radial lighting (static), a periodic
            reflective sweep, and a couple of ambient particles. The
            pill's premium surface, not a flashy effect. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(80% 100% at 15% 0%, rgba(244,208,138,0.35) 0%, transparent 70%)" }}
        />
        {/* Edge lighting — a soft light rim along the top edge. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, transparent 40%)", opacity: 0.6 }}
        />
        {walletAmbientActive && (
          <motion.div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(100deg, transparent 40%, rgba(255,247,220,0.55) 50%, transparent 60%)",
              mixBlendMode: "overlay",
            }}
            initial={{ x: "-160%" }}
            animate={{ x: ["-160%", "160%"] }}
            transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity, repeatDelay: ambient.sweep + 8 }}
          />
        )}
        <AmbientParticles active={walletAmbientActive} count={3} />

        {/* Real content sits in its own positioned wrapper so it reliably
            paints ABOVE the decorative overlays above (an absolutely
            positioned element paints above non-positioned in-flow
            siblings regardless of DOM order — wrapping the content in its
            own `relative` box, placed after them in the DOM, is what
            guarantees correct stacking; same pattern MissionHero uses). */}
        <span className="relative z-[1] flex items-center gap-1.5">
          {walletFailed ? (
            <Coins className="w-5 h-5 text-amber-500" />
          ) : (
            <motion.img
              src={walletIconSrc}
              alt=""
              aria-hidden
              onError={() => setWalletFailed(true)}
              className="w-7 h-7 object-contain"
              data-testid="dashboard-header-wallet-icon"
              initial={{ scale: 0.7, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...spring.tap, delay: 0.15 }}
            />
          )}
          <motion.span className="tnum font-extrabold text-[0.95rem] text-ink dark:text-white">
            {pointsDisplay}
          </motion.span>
        </span>
      </MotionLink>
    </div>
    {live?.live && (
      <LiveAttendanceBanner
        slug={live.slug}
        title={lang === "km" ? (live.title_kh || live.title_en) : live.title_en}
        t={t}
      />
    )}
    </>
  );
}

// RC — Live attendance is a convenience signal ON TOP of the existing
// attendance-link workflow (teacher still shares the link via Telegram),
// never a second attendance-link architecture. Data is the SAME
// useAttendance({pollLive:true}) call the header row already makes — this
// just gives it a proper premium presentation instead of the small inline
// "Live" pill alone. title comes straight from GET /attendance/live's
// title_en/title_kh (the real class name) — never invented.
function LiveAttendanceBanner({ slug, title, t }) {
  const { ref, active } = useAmbientActive();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: easing.premiumEaseOut }}
      className="mx-4 mt-2"
      data-testid="dashboard-live-attendance-banner"
    >
      <Link
        to={`/attendance/j/${slug}`}
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ background: "rgba(79,166,217,0.12)", border: "1px solid rgba(79,166,217,0.3)" }}
      >
        <span ref={ref} className="relative inline-flex h-2.5 w-2.5 shrink-0">
          {active && (
            <motion.span
              className="absolute inset-[-5px] rounded-full"
              style={{ border: "1.5px solid #4FA6D9" }}
              animate={{ scale: [0.6, 2.3], opacity: [0.7, 0] }}
              transition={{ duration: ambient.breathe / 3, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#4FA6D9" }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "#2E7BAE" }}>
            {t("attDashboardLiveEyebrow")}
          </p>
          <p className="text-[13px] font-bold text-ink dark:text-white truncate">{title || t("attGoToAttendance")}</p>
          <p className="text-[11px] text-zinc-600 dark:text-white/60">{t("attDashboardLiveBody")}</p>
        </div>
        <span
          className="shrink-0 text-[11.5px] font-bold px-3.5 py-2 rounded-full"
          style={{ background: "linear-gradient(135deg,#E4C97A,#C9A24B)", color: "#7A5D1F" }}
        >
          {t("attCheckInBtn")}
        </span>
      </Link>
    </motion.div>
  );
}
