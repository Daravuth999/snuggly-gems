// ScheduleTimeWindowCard.jsx — Dashboard's display of the student's own
// Schedule A/B meeting time, sourced from the admin-configurable
// schedule_time_windows.py backend (built on eduhub_platform.config's
// existing three-tier resolver). Purely additive: does not read or
// affect eligibility/assignment, only displays the real-world time a
// student's own schedule label has been configured to mean.
//
// Round 3 of positioning/sizing per live feedback:
//   Round 1 — small icon-row, placed after Learning Progress/Assessment:
//     went completely unnoticed.
//   Round 2 — big hero-style gold-glow card, moved under the Hero: now
//     noticed, but reported as "oversized and weird" (a tall card with a
//     large empty gradient area to the right of its left-aligned content).
//   Round 3 (this version) — a single-row strip, the same footprint/
//     recipe as DashboardHeader's own LiveAttendanceBanner (icon circle +
//     one line of text, rounded-2xl, no wasted space), moved to the very
//     top of the page (Dashboard.jsx renders it immediately under the
//     app's own top bar, ahead of even the Hero) so it's still the first
//     thing seen, but sized proportionally to how little it actually
//     says.
//
// Round 4 — live-state awareness (§3). Wires in the existing
// GET /api/attendance/live poll (useAttendance's own pollLive:true, the
// SAME hook/endpoint DashboardHeader's LiveAttendanceBanner and
// ConstellationView already use — no new endpoint, no second poller).
// When the student's own class is genuinely live, the WHOLE strip
// becomes a tappable Link straight to /attendance/j/${slug} (the exact
// join mechanism StudentCheckIn.jsx already handles).
//
// Round 5 — premium countdown + live-glow upgrade, per direct product
// feedback ("curiosity driven, premium grade... boost user feel
// impressed"). Two real changes over Round 4:
//   1. The not-live countdown is no longer a single line of text — it's
//      a real flip-clock (Days/Hours/Minutes/Seconds tiles, each one
//      mechanically flipping over on change) ticking every second, in
//      this app's own gold/glass language rather than a generic
//      countdown-widget look. `nowMs` now ticks at 1s (was 30s) so the
//      seconds tile genuinely counts down live — cheap, since it only
//      re-renders four small tiles, not a re-fetch (the underlying
//      next_session data still only refreshes on useAttendance's own
//      30s poll cadence).
//   2. The live state gets a real "wow" treatment: a pulsing outer glow
//      (not just the existing thin breathing ring), a diagonal shimmer
//      sweep, and a tactile hover/tap scale — still gated by
//      useAmbientActive for the continuous parts (on-screen + tab-
//      visible + prefers-reduced-motion, the same contract every other
//      ambient Dashboard effect already uses); hover/tap micro-
//      interactions need no extra gate since the shell's own
//      <MotionConfig reducedMotion="user"> already covers those
//      globally.
//
// Unlike AssessmentPendingCard (the visual language this still borrows
// its gold accent from), this card does NOT render null for its
// "nothing to show yet" states — an explicit product requirement: a
// student with no schedule assigned, or a schedule with no time window
// configured yet, must see an honest message ("No schedule assigned
// yet" / "Time not yet set") rather than the element silently
// disappearing, which would look like the feature doesn't exist at all.
// It DOES render null while the one-shot fetch is in flight (matching
// every other Dashboard section's convention of not flashing a
// placeholder for a fetch that normally resolves in well under a
// second) and on a genuine fetch failure (never surface a raw
// network/auth error on this frozen, premium dashboard).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Radio } from "lucide-react";
import { easing, duration, ambient } from "../../styles/tokens/motionTokens";
import { getMyScheduleTimeWindow } from "../../auth/studentAuthService";
import { useAttendance } from "../../hooks/useAttendance";
import useAmbientActive from "../../hooks/useAmbientActive";

const GOLD = "#D4A843";
const LIVE_RING = "rgba(168,239,198,0.6)";
const LIVE_TEXT = "#A8EFC6";
const LIVE_GLOW = "rgba(94,222,151,0.55)";

// "19:00" -> "7:00 PM". Display-only — the value exchanged with the
// backend is always the plain 24-hour "HH:MM" string it stores.
function formatTime12h(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return "";
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

// A real countdown against a real ISO instant — never an estimate. Kept
// as the accessible text alternative (aria-label) for the flip-clock
// below, which is otherwise a purely visual digit display.
export function formatCountdown(targetIso, nowMs) {
  if (!targetIso) return "";
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return "";
  let diffSec = Math.round((target - nowMs) / 1000);
  if (diffSec <= 0) return "starting now";
  const days = Math.floor(diffSec / 86400); diffSec -= days * 86400;
  const hours = Math.floor(diffSec / 3600); diffSec -= hours * 3600;
  const mins = Math.floor(diffSec / 60);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m`;
  return "in under a minute";
}

// Days/Hours/Minutes/Seconds breakdown for the flip-clock tiles — the
// same real-instant math as formatCountdown, just not collapsed into a
// single largest-unit string. Returns null for a missing/invalid target
// (renders nothing rather than a guessed "00:00:00:00"), and clamps a
// past/zero gap to null too — that state is handled by a distinct
// "starting any moment" message, not a frozen all-zero clock.
export function countdownParts(targetIso, nowMs) {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const diffSec = Math.round((target - nowMs) / 1000);
  if (diffSec <= 0) return null;
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;
  return { days, hours, minutes, seconds };
}

const pad2 = (n) => String(n).padStart(2, "0");

// A single digit "reel" — the mechanical unit a vehicle's odometer/trip
// counter is built from: each digit position spins independently on its
// own vertical axis, not the whole 2-digit pair as one block. Direction
// is real, not decorative: this countdown mostly DECREASES each tick
// (a digit rolls down, e.g. 7→6, entering from below/exiting upward —
// the natural feel of a number scrolling down through a fixed window),
// but a borrow/wrap (e.g. seconds 00→59 when a minute ticks over) makes
// THIS digit momentarily increase (0→9) — exactly the moment a real
// odometer's own wheels visibly reverse mid-roll while an adjacent wheel
// turns over. Comparing against the previous rendered digit (not a
// fixed direction) is what makes that "some digits move the other way
// in the middle" behaviour real rather than simulated.
function DigitReel({ digit }) {
  const prevDigitRef = useRef(digit);
  const increased = Number(digit) > Number(prevDigitRef.current);
  useEffect(() => { prevDigitRef.current = digit; }, [digit]);

  return (
    <span className="relative inline-block w-[9px] sm:w-[11px] h-full overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={digit}
          initial={{ y: increased ? "-70%" : "70%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: increased ? "70%" : "-70%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.55 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// One tile, two independent digit reels — the visible unit (e.g. "07").
// Splitting into reels rather than sliding the whole 2-character string
// is what lets a carry (09→10) show both wheels turning at once, each
// with its own real direction, instead of one flat block sliding.
function FlipUnit({ value, label }) {
  const [tensDigit, onesDigit] = pad2(value).split("");
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative w-[38px] h-[34px] sm:w-11 sm:h-10 rounded-lg overflow-hidden
          flex items-center justify-center tnum font-black text-[16px] sm:text-[19px]
          bg-gradient-to-b from-[#FFF6DE] to-[#F3DFA0] border border-[rgba(180,128,20,0.35)] text-[#5C3B08]
          dark:from-white/[0.08] dark:to-black/40 dark:border-[rgba(212,168,67,0.32)] dark:text-[#F0C869]"
      >
        <DigitReel digit={tensDigit} />
        <DigitReel digit={onesDigit} />
      </div>
      <span className="text-[8px] sm:text-[9px] font-bold tracking-widest uppercase text-[#8A6212] dark:text-[rgba(212,168,67,0.7)]">
        {label}
      </span>
    </div>
  );
}

function FlipSeparator() {
  return (
    <span className="text-[14px] font-black self-start mt-1.5 text-[rgba(140,95,10,0.45)] dark:text-[rgba(212,168,67,0.35)]" aria-hidden>
      :
    </span>
  );
}

// The full Days/Hours/Minutes/Seconds row. `parts` is null either
// because there's genuinely no target (handled one level up as "No
// upcoming session scheduled") or the target has just crossed into the
// past (handled here as "starting any moment" while the next live poll
// catches up — never a frozen 00:00:00:00).
function FlipCountdown({ parts, targetIso, nowMs }) {
  if (!parts) {
    return (
      <span className="text-[0.78rem] font-bold tnum text-[#5C3B08] dark:text-[#F0C869]" data-testid="schedule-time-window-starting-now">
        Starting any moment…
      </span>
    );
  }
  const a11yLabel = `Next ${formatCountdown(targetIso, nowMs)}`;
  return (
    <div
      className="flex items-start gap-1 sm:gap-1.5"
      data-testid="schedule-time-window-countdown"
      role="timer"
      aria-label={a11yLabel}
    >
      {parts.days > 0 && (
        <>
          <FlipUnit value={parts.days} label="Days" />
          <FlipSeparator />
        </>
      )}
      <FlipUnit value={parts.hours} label="Hrs" />
      <FlipSeparator />
      <FlipUnit value={parts.minutes} label="Min" />
      <FlipSeparator />
      <FlipUnit value={parts.seconds} label="Sec" />
    </div>
  );
}

export default function ScheduleTimeWindowCard() {
  const [data, setData] = useState(undefined); // undefined = loading, null = fetch failed
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { live } = useAttendance({ pollLive: true });
  const { ref: ambientRef, active: ambientActive } = useAmbientActive();

  useEffect(() => {
    let cancelled = false;
    getMyScheduleTimeWindow()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Round 5 — ticks every second so the flip-clock's Seconds tile is
  // genuinely live, not just a periodic snapshot. Still cheap: this only
  // re-renders four small tiles; the underlying next_session VALUE only
  // ever changes on useAttendance's own 30s poll.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (failed || data === undefined) return null;

  const { schedule, window } = data;
  const hasSchedule = Boolean(schedule);
  const hasWindow = Boolean(window && window.start && window.end);
  const isLive = Boolean(live?.live && live?.slug);
  const nextSession = !isLive ? live?.next_session : null;
  const parts = nextSession?.opens_at ? countdownParts(nextSession.opens_at, nowMs) : null;

  const card = (
    <motion.div
      ref={ambientRef}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.fast, ease: easing.premiumEaseOut }}
      whileHover={isLive ? { scale: 1.012, y: -1 } : undefined}
      whileTap={isLive ? { scale: 0.988 } : undefined}
      className="relative overflow-hidden flex items-center gap-3 rounded-2xl px-4 py-2.5 border"
      style={
        isLive
          ? {
              background: "rgba(20,54,36,0.42)",
              borderColor: "rgba(168,239,198,0.45)",
              boxShadow: ambientActive ? `0 0 0 1px rgba(168,239,198,0.12), 0 10px 40px -4px ${LIVE_GLOW}` : "none",
            }
          : { background: "rgba(212,168,67,0.10)", borderColor: "rgba(212,168,67,0.28)" }
      }
      data-testid="schedule-time-window-card"
      data-live={isLive ? "true" : "false"}
    >
      {isLive && ambientActive && (
        <div data-testid="schedule-time-window-live-glow">
          {/* Pulsing outer glow — the "impressed" upgrade over the plain
              thin ring: a soft halo breathing in and out around the
              whole card, not just a hairline border. */}
          <motion.span
            aria-hidden
            className="absolute -inset-3 rounded-[1.75rem] pointer-events-none"
            style={{ background: `radial-gradient(closest-side, ${LIVE_GLOW}, transparent)`, filter: "blur(9px)" }}
            animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.96, 1.03, 0.96] }}
            transition={{ duration: ambient.breathe, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Diagonal shimmer sweep — a single light band drifting across
              the card every few seconds, the same "premium surface"
              trick used on shipped reward/achievement cards elsewhere in
              this app. */}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-1/3 pointer-events-none"
            style={{
              background: "linear-gradient(115deg, transparent, rgba(255,255,255,0.16), transparent)",
              left: "-40%",
            }}
            animate={{ left: ["-40%", "140%"] }}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
          />
          {/* Original breathing ring, kept — the immediate-edge pulse
              that reads as "recording" up close, layered under the
              softer outer glow above. */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ border: `1.5px solid ${LIVE_RING}` }}
            animate={{ opacity: [0.55, 0], scale: [1, 1.015] }}
            transition={{ duration: ambient.breathe / 2, repeat: Infinity, ease: "easeOut" }}
          />
        </div>
      )}

      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 relative z-[1]"
        style={
          isLive
            ? { background: "rgba(168,239,198,0.18)", border: "1px solid rgba(168,239,198,0.45)" }
            : { background: "rgba(212,168,67,0.18)", border: "1px solid rgba(212,168,67,0.35)" }
        }
      >
        {isLive
          ? <Radio size={16} style={{ color: LIVE_TEXT }} className="animate-pulse" />
          : <Clock size={16} style={{ color: GOLD }} />}
      </div>

      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap relative z-[1]">
        {hasSchedule && !isLive && (
          <span
            className="inline-flex items-center justify-center h-5 px-2 rounded-full text-[0.64rem] font-extrabold shrink-0"
            style={{ background: GOLD, color: "#241D0B" }}
            data-testid="schedule-time-window-badge"
          >
            Schedule {schedule}
          </span>
        )}

        {isLive ? (
          <span
            className="tnum text-[0.85rem] font-bold truncate"
            style={{ color: LIVE_TEXT }}
            data-testid="schedule-time-window-card-line"
          >
            {(live.title_en || "Your class") + " is live — tap to join"}
          </span>
        ) : (
          <span
            className={`truncate ${
              hasSchedule && hasWindow
                ? "tnum text-[0.85rem] font-bold text-ink dark:text-white"
                : "text-[0.8rem] italic font-medium text-zinc-500 dark:text-white/50"
            }`}
            data-testid="schedule-time-window-card-line"
          >
            {!hasSchedule
              ? "No schedule assigned yet"
              : hasWindow
              ? `${formatTime12h(window.start)} – ${formatTime12h(window.end)}`
              : "Time not yet set"}
          </span>
        )}

        {!isLive && nextSession?.opens_at && (
          <FlipCountdown parts={parts} targetIso={nextSession.opens_at} nowMs={nowMs} />
        )}
        {!isLive && !nextSession && (
          <span
            className="text-[0.72rem] text-zinc-400 dark:text-white/35 shrink-0"
            data-testid="schedule-time-window-no-upcoming"
          >
            No upcoming session scheduled
          </span>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="px-4 mt-2">
      {isLive ? (
        <Link to={`/attendance/j/${live.slug}`} data-testid="schedule-time-window-join-link">
          {card}
        </Link>
      ) : (
        card
      )}
    </div>
  );
}
