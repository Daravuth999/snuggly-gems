/**
 * RewardSurface.jsx — the ONE reward card component, shared by the real
 * student page (AttendanceOverview.jsx) and Author Studio's Settings
 * "Student Preview" (AttendanceStudio.jsx). Extracted specifically so the
 * preview can never drift from what students actually see — the teacher
 * previewing a campaign selection renders the exact same component tree,
 * just fed the selected campaign's real data.
 *
 * The claim button is ALWAYS visible once a reward is actually configured
 * — locked-and-disabled before eligibility, active once unlocked, "✓
 * Claimed" after a successful claim — never hidden entirely, so a student
 * always understands "the reward exists, I just haven't earned it yet."
 * It's only omitted when no reward is configured at all (nothing to claim).
 *
 * No bundled reward/lock/gift artwork exists anywhere in this PWA (audited
 * before building this) — the reward illustration below is built from
 * lucide-react icons + CSS/motion, never an introduced image asset.
 */
import { motion } from "framer-motion";
import { Gift, Lock, Sparkles, Check, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import useAmbientActive from "../../hooks/useAmbientActive";
import { easing } from "../../styles/tokens/motionTokens";
import { attendance as C } from "./attendanceTokens";

/**
 * Attendance eligibility and reward availability are separate questions —
 * this derives the one the student actually needs to see next. Shared so
 * the Studio preview computes the SAME state a real student would see for
 * the given inputs, never a separately-invented preview state.
 */
export function deriveRewardState({ reward_configured, already_claimed, can_claim, eligible, stats }) {
  if (!reward_configured) return "not_configured";
  if (already_claimed) return "claimed";
  if (can_claim) return "unlocked";
  if (eligible) return "unavailable";
  if (!stats || stats.total === 0) return "not_started";
  return "in_progress";
}

/** Within this many percentage points of the goal, the display switches
 * from the generic "you're at X%" copy to encouragement — never an
 * invented "N classes left" count the backend doesn't actually compute. */
const ALMOST_THERE_GAP = 10;

export default function RewardSurface({
  t, tpl, num, rState, rewardConfigured, rewardName, rewardPoints,
  stats, requiredPct, claiming, claimError, onClaim, justClaimed,
}) {
  const ambient = useAmbientActive();
  const gap = stats && stats.total > 0 ? requiredPct - stats.attendance_pct : null;
  const isAlmost = rState === "in_progress" && gap != null && gap <= ALMOST_THERE_GAP && gap > 0;
  const visualState =
    rState === "claimed" ? "claimed" :
    rState === "unlocked" ? "unlocked" :
    isAlmost ? "almost" : "locked";
  const showButton = rState !== "not_configured";
  const buttonDisabled = claiming || rState !== "unlocked";
  // The reward's own distance-to-goal track — only meaningful while the
  // student hasn't reached the goal yet; once unlocked/claimed the reward
  // itself already says so, and there's nothing left to project onto a bar.
  const showTrack = (rState === "not_started" || rState === "in_progress") && stats;

  return (
    <motion.div
      ref={ambient.ref}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="rounded-[24px] px-5 pt-6 pb-5 relative overflow-hidden flex flex-col items-center text-center"
      style={{
        background: `linear-gradient(155deg, ${C.ivory} 0%, ${C.goldSoft} 130%)`,
        border: `1px solid rgba(201,162,75,0.32)`,
      }}
      data-testid="attendance-reward-card"
      data-reward-state={rState}
    >
      <RewardIcon visualState={visualState} ambientActive={ambient.active} />

      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] mt-3" style={{ color: C.inkFaint }}>
        {t("attMonthlyReward")}
      </p>
      <p className="text-[16px] font-bold mt-1 max-w-[26ch]" style={{ color: C.ink }}>
        {rewardConfigured ? (rewardName || t("attMonthlyReward")) : t("attMonthlyReward")}
      </p>
      {rewardConfigured && rewardPoints > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, ease: easing.premiumEaseOut }}
          className="text-[22px] font-extrabold tabular-nums mt-0.5"
          style={{ color: C.goldDeep }}
        >
          +{num(rewardPoints)}
        </motion.p>
      )}

      {showTrack && (
        <div className="w-full max-w-[220px] mt-4" data-testid="attendance-reward-track">
          <div className="relative h-[3px] rounded-full" style={{ background: "rgba(201,162,75,0.22)" }}>
            <motion.div
              className="absolute top-0 left-0 h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})` }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, stats.attendance_pct)}%` }}
              transition={{ duration: 1, ease: easing.premiumEaseOut, delay: 0.15 }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 h-2.5 w-[2px]"
              style={{ left: `${Math.min(100, requiredPct)}%`, background: "rgba(27,33,48,0.28)" }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] tabular-nums" style={{ color: C.inkFaint }}>
            <span>{num(stats.attendance_pct)}%</span>
            <span>{tpl(t("attUnlockHintTpl"), { pct: num(requiredPct) })}</span>
          </div>
        </div>
      )}

      <p className="text-[12px] mt-3 leading-relaxed max-w-[30ch]" style={{ color: C.inkMuted }}>
        {rState === "not_configured" && t("attRewardNotConfigured")}
        {rState === "not_started" && t("attRewardLocked")}
        {rState === "in_progress" && (isAlmost
          ? t("attRewardAlmostThere")
          : tpl(t("attRewardInProgressTpl"), { pct: num(stats.attendance_pct), required: num(requiredPct) }))}
        {rState === "unlocked" && t("attRewardUnlockedNote")}
        {rState === "unavailable" && t("attRewardUnavailable")}
        {rState === "claimed" && tpl(t("attPointsAddedTpl"), { points: num(rewardPoints) })}
      </p>

      {claimError && (
        <p className="text-[11.5px] mt-2 flex items-center gap-1.5" style={{ color: "#B42318" }} data-testid="attendance-claim-error">
          <AlertTriangle className="h-3.5 w-3.5" /> {claimError}
        </p>
      )}

      {showButton && (
        <motion.button
          type="button"
          onClick={rState === "unlocked" ? onClaim : undefined}
          disabled={buttonDisabled}
          whileHover={rState === "unlocked" && !claiming ? { scale: 1.015 } : {}}
          whileTap={rState === "unlocked" && !claiming ? { scale: 0.97 } : {}}
          className="relative w-full mt-4 py-3 rounded-2xl font-bold text-[13px] overflow-hidden flex items-center justify-center gap-1.5"
          style={
            rState === "claimed"
              ? { background: C.emeraldSoft, color: C.emerald, cursor: "default" }
              : rState === "unlocked"
                ? { background: `linear-gradient(135deg, ${C.goldBright}, ${C.gold})`, color: C.goldDeep }
                : { background: "rgba(27,33,48,0.06)", color: C.inkFaint, cursor: "not-allowed" }
          }
          data-testid="attendance-claim-btn"
        >
          {rState === "unlocked" && !claiming && ambient.active && <ShineSweep />}
          {rState !== "unlocked" && rState !== "claimed" && <Lock className="h-3.5 w-3.5 relative" />}
          {rState === "claimed" && <Check className="h-3.5 w-3.5 relative" />}
          <span className="relative">
            {claiming ? t("attClaiming") : rState === "claimed" ? t("attClaimed") : t("attClaimReward")}
          </span>
        </motion.button>
      )}

      {rState === "claimed" && (
        <div className="mt-3 flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.55)" }}>
          <span className="text-[11px]" style={{ color: C.inkMuted }}>{t("attAddedToBalance")}</span>
          <span className="text-[13px] font-extrabold tabular-nums" style={{ color: C.emerald }}>+{num(rewardPoints)} pts</span>
        </div>
      )}
      {rState === "claimed" && (
        <Link to="/portal/me" className="block text-center mt-2.5 text-[11.5px] font-bold" style={{ color: C.live }}>
          {t("attViewMyPoints")}
        </Link>
      )}

      {justClaimed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[24px]"
          style={{ background: `linear-gradient(155deg, ${C.ivory} 0%, ${C.goldSoft} 130%)` }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="h-12 w-12 rounded-2xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.gold})` }}
          >
            <CheckCircle2 className="h-6 w-6" style={{ color: C.goldDeep }} />
          </motion.div>
          <p className="text-[14px] font-extrabold" style={{ color: C.ink }}>{t("attCongrats")}</p>
          <p className="text-[13px] font-bold" style={{ color: C.goldDeep }}>+{num(rewardPoints)} pts</p>
        </motion.div>
      )}
    </motion.div>
  );
}

/**
 * The reward artwork itself — large and centered, the visual anchor of the
 * whole card (per the "enough visual presence to become part of the
 * composition, not a tiny generic icon box" directive). Built from
 * lucide-react + motion, not an image asset — no bundled reward/gift/lock
 * artwork exists anywhere in this PWA (audited before Phase 9).
 */
function RewardIcon({ visualState, ambientActive }) {
  const gradient =
    visualState === "unlocked" || visualState === "claimed"
      ? `linear-gradient(135deg, ${C.goldBright}, ${C.gold})`
      : visualState === "almost"
        ? `linear-gradient(135deg, ${C.goldSoft}, ${C.goldBright})`
        : "linear-gradient(135deg, rgba(201,162,75,0.35), rgba(201,162,75,0.5))";

  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      {/* A faint stationary halo behind the artwork gives it presence
          without being a second competing animation. */}
      <div
        className="absolute inset-[-10px] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(228,201,122,${visualState === "locked" ? 0.1 : 0.22}) 0%, transparent 72%)` }}
      />
      <motion.div
        animate={ambientActive && visualState !== "claimed" ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.06, rotate: -2 }}
        className="relative h-[72px] w-[72px] rounded-[24px] flex items-center justify-center"
        style={{ background: gradient, boxShadow: visualState === "locked" ? "none" : "0 8px 24px -10px rgba(201,162,75,0.55)" }}
      >
        <Gift className="h-8 w-8" style={{ color: C.goldDeep }} />
      </motion.div>

      {visualState === "locked" && (
        <span
          className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full flex items-center justify-center"
          style={{ background: C.ivory, border: `1px solid ${C.hairline}` }}
        >
          <Lock className="h-3.5 w-3.5" style={{ color: C.inkFaint }} />
        </span>
      )}

      {visualState === "almost" && ambientActive && (
        <>
          <motion.span
            className="absolute -top-1.5 -right-1"
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-4 w-4" style={{ color: C.gold }} />
          </motion.span>
          <motion.span
            className="absolute -bottom-1 -left-2"
            animate={{ opacity: [0.2, 0.7, 0.2], scale: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            <Sparkles className="h-2.5 w-2.5" style={{ color: C.goldBright }} />
          </motion.span>
        </>
      )}

      {visualState === "unlocked" && (
        <>
          <motion.span
            className="absolute -top-2 -right-1.5"
            initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
            animate={{ opacity: [0, 1, 0.6], scale: [0.4, 1.15, 1], rotate: 0 }}
            transition={{ duration: 0.9, ease: easing.premiumEaseOut }}
          >
            <Sparkles className="h-4.5 w-4.5" style={{ color: C.goldBright }} />
          </motion.span>
          <motion.span
            className="absolute -bottom-1.5 -left-2"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 0.5], scale: [0.3, 1, 0.8] }}
            transition={{ duration: 0.9, delay: 0.1, ease: easing.premiumEaseOut }}
          >
            <Sparkles className="h-3 w-3" style={{ color: C.gold }} />
          </motion.span>
          <motion.span
            className="absolute top-1/2 -left-3.5 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 0.8, 0.4], scale: [0.3, 0.9, 0.7] }}
            transition={{ duration: 0.9, delay: 0.2, ease: easing.premiumEaseOut }}
          >
            <Sparkles className="h-2 w-2" style={{ color: C.goldBright }} />
          </motion.span>
        </>
      )}

      {visualState === "claimed" && (
        <span
          className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full flex items-center justify-center"
          style={{ background: C.emerald }}
        >
          <Check className="h-3.5 w-3.5" style={{ color: "#fff" }} />
        </span>
      )}
    </div>
  );
}

function ShineSweep() {
  return (
    <motion.span
      className="absolute top-0 h-full w-[35%] pointer-events-none"
      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)", transform: "skewX(-14deg)" }}
      animate={{ left: ["-45%", "120%"] }}
      transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
