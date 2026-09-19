/**
 * AttendanceOverview.jsx — Attendance's own premium visual identity.
 *
 * This is a visual/motion reconstruction, not a data-model change: every
 * number, state, and copy string below still comes from the same verified
 * sources as before (GET /attendance/monthly-summary, /monthly-history,
 * the real Login Reward campaign, useAttendance()'s live session). What
 * changed is composition — a full-bleed navy hero with an arc-progress
 * ring (the goal folded INTO the hero rather than a duplicate card), a
 * reward surface built for discovery instead of a beige rectangle,
 * timeline rows instead of boxed cards for activity/history, and an
 * inline expandable "how it works" instead of documentation-in-a-card.
 *
 * Student-facing statuses are ONLY Present / Late / Absent — never any
 * internal enum (present_full, present_partial, verification status) is
 * rendered. The reward card's name/points always come from whatever real
 * Login Reward campaign the backend resolved; this component never
 * invents a value, a next-class time, or a "classes remaining" count the
 * backend doesn't actually compute.
 *
 * Only rendered when GET /api/attendance/v2-status resolves {enabled:true}
 * (see AttendanceRouteGate.jsx) — the legacy ConstellationView.jsx is
 * completely untouched and remains the fallback. risk_score is a private
 * teacher signal and is never requested or rendered here.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, Loader2, AlertTriangle, Radio, ChevronDown, Info } from "lucide-react";
import useAttendance from "../../hooks/useAttendance";
import useAmbientActive from "../../hooks/useAmbientActive";
import { getMonthlySummary, claimMonthlyReward, getMonthlyHistory } from "./api";
import { shortDate } from "./attendancePassport";
import { useLang } from "../portal/contexts/LanguageContext";
import { easing, duration as dur, stagger } from "../../styles/tokens/motionTokens";
import { requestPointsRefresh } from "../../utils/pointsSync";
import { attendance as C } from "./attendanceTokens";
import RewardSurface, { deriveRewardState } from "./RewardSurface";

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(period, lang, opts) {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const locale = lang === "km" ? "km-KH" : "en-US";
  const d = new Date(y, m - 1, 1);
  try {
    return d.toLocaleDateString(locale, opts || { month: "long", year: "numeric" });
  } catch {
    return d.toLocaleDateString(undefined, opts || { month: "long", year: "numeric" });
  }
}

export default function AttendanceOverview() {
  const { t, tpl, num, lang } = useLang();
  const { live, history } = useAttendanceHistory();
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [justClaimed, setJustClaimed] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [monthlyHistory, setMonthlyHistory] = useState([]);

  const period = currentPeriod();

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    try {
      const data = await getMonthlySummary({ month: period });
      setSummary(data);
    } catch (e) {
      setSummaryError(e?.message || t("attErrorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    let cancelled = false;
    getMonthlyHistory({ months: 6 })
      .then((d) => { if (!cancelled) setMonthlyHistory(d?.months || []); })
      .catch(() => { if (!cancelled) setMonthlyHistory([]); });
    return () => { cancelled = true; };
  }, []);

  async function handleClaim() {
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await claimMonthlyReward({ period });
      setSummary((prev) => (prev ? { ...prev, already_claimed: true, can_claim: false,
        reward_points: res?.points ?? prev.reward_points, reward_name: res?.reward_name ?? prev.reward_name } : prev));
      // The credited amount shown here is the real value the backend just
      // returned — never fabricated. This only asks the shared balance
      // display (DashboardHeader's points pill etc.) to catch up; it never
      // writes a number itself.
      requestPointsRefresh("attendance_monthly_claim");
      // A brief, real success moment — corresponds to an actual completed
      // server-side credit (never shown on eligibility or a pending
      // request), then settles into the calm "✓ Claimed" state.
      setJustClaimed(true);
      setTimeout(() => setJustClaimed(false), 2200);
    } catch (e) {
      setClaimError(e?.message || t("attErrorGeneric"));
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" data-testid="attendance-overview-loading">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: C.pageInkFaint }} />
      </div>
    );
  }

  if (summaryError || !summary) {
    return (
      <div className="max-w-md mx-auto py-10 text-center" data-testid="attendance-overview-error">
        <AlertTriangle className="h-6 w-6 mx-auto mb-2" style={{ color: C.amber }} />
        <p className="text-[13.5px]" style={{ color: C.pageInkMuted }}>
          {summaryError || t("attErrorGeneric")}
        </p>
        <button
          type="button"
          onClick={loadSummary}
          className="mt-3 text-[12.5px] font-bold"
          style={{ color: C.live }}
          data-testid="attendance-overview-retry"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const {
    stats, required_pct: requiredPct, eligible, reward_enabled: rewardEnabled,
    reward_configured: rewardConfigured, reward_name: rewardName, reward_points: rewardPoints,
    already_claimed: alreadyClaimed, can_claim: canClaimNow, cycle_start: cycleStart,
    attendance_points_this_month: pointsThisMonth,
  } = summary;
  const hasClasses = stats.total > 0;
  const gapPct = hasClasses ? Math.round((stats.attendance_pct - requiredPct) * 10) / 10 : null;
  const rState = rewardEnabled ? deriveRewardState({
    reward_configured: rewardConfigured, already_claimed: alreadyClaimed,
    can_claim: canClaimNow, eligible, stats,
  }) : null;
  const historyRows = monthlyHistory.filter((m) => m.stats.total > 0);

  return (
    <div className="max-w-md mx-auto pb-6" data-testid="attendance-overview">
      <div className="flex items-center justify-between px-1 py-2 mb-1">
        <h1 className="text-[15px] font-bold tracking-tight" style={{ color: C.pageInk }}>{t("attGoToAttendance")}</h1>
        <button
          type="button"
          onClick={() => setHowOpen(true)}
          aria-label={t("attHowItWorks")}
          className="h-7 w-7 rounded-full flex items-center justify-center"
          style={{ color: C.pageInkFaint }}
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      <Hero
        period={period} lang={lang} t={t} tpl={tpl} num={num}
        hasClasses={hasClasses} stats={stats} eligible={eligible}
        requiredPct={requiredPct} gapPct={gapPct} cycleStart={cycleStart}
      />

      {live?.live && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.fast, ease: easing.premiumEaseOut, delay: stagger.section }}
          className="mt-3"
        >
          <LiveBanner t={t} slug={live.slug} />
        </motion.div>
      )}

      {rewardEnabled && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.base, ease: easing.premiumEaseOut, delay: stagger.section * (live?.live ? 3 : 2) }}
          className="mt-4"
        >
          <RewardSurface
            t={t} tpl={tpl} num={num} rState={rState}
            rewardConfigured={rewardConfigured} rewardName={rewardName} rewardPoints={rewardPoints}
            stats={stats} requiredPct={requiredPct}
            claiming={claiming} claimError={claimError} onClaim={handleClaim}
            justClaimed={justClaimed}
          />
        </motion.div>
      )}

      {hasClasses && (
        <Section delay={stagger.section * 4} title={t("attYourAttendance")} testId="attendance-stat-row-section">
          <div className="flex justify-around py-1" data-testid="attendance-stat-row">
            <StatFigure n={num(stats.present + stats.partial)} label={t("attPresent")} color={C.emerald} />
            <div className="w-px my-1" style={{ background: C.pageHairline }} />
            <StatFigure n={num(stats.late)} label={t("attLate")} color={C.amber} />
            <div className="w-px my-1" style={{ background: C.pageHairline }} />
            <StatFigure n={num(stats.absent)} label={t("attAbsent")} color={C.absent} />
          </div>
          {typeof pointsThisMonth === "number" && (
            // Layer A — a subtle, informational running total. No claim
            // button, no reward-redemption styling: this is never the
            // Monthly Attendance Reward (RewardSurface, above), it just
            // reflects points already accumulated per eligible session.
            <p
              className="text-center text-[11.5px] mt-3"
              style={{ color: C.pageInkFaint }}
              data-testid="attendance-points-this-month"
            >
              {tpl(t("attPointsThisMonthTpl"), { points: num(pointsThisMonth) })}
            </p>
          )}
        </Section>
      )}

      {history.length > 0 && (
        <Section delay={stagger.section * (hasClasses ? 4.5 : 4)} title={t("attRecentSessions")} testId="attendance-recent-sessions">
          {history.slice(0, 5).map((h) => {
            const meta = statusMeta(h.status, t);
            return (
              <div key={h.session_id} className="flex items-center gap-2.5 py-2 border-t" style={{ borderColor: C.pageHairline }}>
                <span className="h-6 w-6 rounded-full flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color }}>
                  <meta.Icon className="h-3 w-3" />
                </span>
                <span className="text-[11px] font-medium w-11 shrink-0" style={{ color: C.pageInkFaint }}>{shortDate(h.session_date)}</span>
                <span className="text-[12.5px] flex-1 truncate" style={{ color: C.pageInk }}>{h.title_en || "Class"}</span>
                <span className="text-[11.5px] font-bold" style={{ color: meta.color }}>
                  {meta.label}
                  {h.corrected && (
                    <span className="font-medium" style={{ color: C.pageInkFaint }}> · {t("attSessionUpdated")}</span>
                  )}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      <Section delay={stagger.section * 5} title={t("attAttendanceHistory")} testId="attendance-history">
        {historyRows.length === 0 ? (
          <p className="text-[12px] py-1" style={{ color: C.pageInkMuted }}>{t("attAttendanceHistoryEmpty")}</p>
        ) : historyRows.map((m) => (
          <div key={m.period} className="flex items-center justify-between py-2 border-t text-[12.5px]" style={{ borderColor: C.pageHairline }}>
            <span className="font-medium" style={{ color: C.pageInk }}>{monthLabel(m.period, lang)}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums" style={{ color: C.pageInkMuted }}>{num(m.stats.attendance_pct)}%</span>
              <span style={{ color: m.eligible ? C.emerald : C.pageInkFaint }}>
                {m.eligible ? t("attEligible") : t("attNotEligible")}
              </span>
            </span>
          </div>
        ))}
      </Section>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: dur.base, delay: stagger.section * 6 }}
        className="mt-5 pt-4 border-t" style={{ borderColor: C.pageHairline }}
        data-testid="attendance-how-it-works"
      >
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          className="w-full flex items-center justify-between"
          data-testid="attendance-how-it-works-toggle"
        >
          <span className="text-[12.5px] font-bold" style={{ color: C.pageInk }}>{t("attHowToUnlock")}</span>
          <motion.span animate={{ rotate: howOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5" style={{ color: C.pageInkFaint }} />
          </motion.span>
        </button>
        {!howOpen && (
          <p className="mt-1.5 text-[11.5px]" style={{ color: C.pageInkMuted }}>{t("attHowItWorksSummary")}</p>
        )}
        <AnimatePresence initial={false}>
          {howOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: easing.premiumEaseOut }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-3">
                <HowStep n="01" title={t("attUnlockStep1Title")} body={t("attUnlockStep1Body")} />
                <HowStep n="02" title={t("attUnlockStep2Title")} body={t("attUnlockStep2Body")} />
                <HowStep n="03" title={t("attUnlockStep3Title")} body={t("attUnlockStep3Body")} />
                <HowStep n="04" title={t("attUnlockStep4Title")} body={t("attUnlockStep4Body")} />
                <HowStep n="05" title={t("attUnlockStep5Title")} body={t("attUnlockStep5Body")} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────
function Hero({ period, lang, t, tpl, num, hasClasses, stats, eligible, requiredPct, gapPct, cycleStart }) {
  const monthEyebrow = monthLabel(period, lang, { month: "long", year: "numeric" });
  // Only during the actual launch month — cycleStart falling inside the
  // period currently being viewed. Next month cycleStart no longer starts
  // with that period's prefix, so this naturally stops appearing once the
  // transition period is over, with no separate "dismiss" state to manage.
  const showCycleBanner = !!cycleStart && cycleStart.startsWith(period);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: easing.premiumEaseOut }}
      className="rounded-[28px] px-6 pt-7 pb-6 relative overflow-hidden"
      style={{ background: `radial-gradient(120% 90% at 88% -10%, ${C.navySoft} 0%, ${C.navy} 55%, ${C.navyDeep} 100%)` }}
      data-testid="attendance-hero"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(60% 55% at 92% 0%, rgba(228,201,122,0.16) 0%, transparent 70%)" }}
      />
      <p className="relative text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.onNavyFaint }}>
        {monthEyebrow}
      </p>
      {showCycleBanner && (
        <p className="relative text-[11px] mt-1.5 max-w-[34ch] leading-snug" style={{ color: C.onNavySoft }} data-testid="attendance-cycle-banner">
          {tpl(t("attCycleStartedTpl"), { date: shortDate(cycleStart) })}
        </p>
      )}

      {hasClasses ? (
        <div className="relative flex flex-col items-center mt-3">
          <ArcProgress pct={stats.attendance_pct} requiredPct={requiredPct} eligible={eligible} num={num} />
          <p className="text-[12.5px] mt-3" style={{ color: C.onNavySoft }}>
            {tpl(t("attClassesCountTpl"), { attended: num(stats.attended), total: num(stats.total) })}
          </p>
          <StatusLine eligible={eligible} t={t} />
          <div className="w-full mt-5 pt-4 border-t flex items-center justify-between" style={{ borderColor: C.hairlineOnNavy }} data-testid="attendance-goal-narrative">
            <span className="text-[11.5px]" style={{ color: C.onNavySoft }}>
              {tpl(t("attRequiredPctTpl"), { pct: num(requiredPct) })}
            </span>
            {gapPct != null && (
              <span className="text-[11.5px] font-semibold" style={{ color: gapPct >= 0 ? C.emeraldOnNavy : C.onNavySoft }}>
                {gapPct >= 0
                  ? tpl(t("attGoalAboveTpl"), { pct: num(Math.abs(gapPct)) })
                  : tpl(t("attGoalBelowTpl"), { pct: num(Math.abs(gapPct)) })}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="relative mt-4 pb-1" data-testid="attendance-hero-empty">
          <p className="text-[20px] font-bold leading-snug max-w-[22ch]" style={{ color: C.onNavy }}>
            {t("attMonthStartsHere")}
          </p>
          <p className="text-[12.5px] mt-2 max-w-[30ch]" style={{ color: C.onNavySoft }}>
            {t("attProgressWillAppear")}
          </p>
          <ZeroTrack requiredPct={requiredPct} num={num} />
          <p className="text-[11.5px] mt-2.5" style={{ color: C.onNavySoft }}>
            {tpl(t("attRequiredPctTpl"), { pct: num(requiredPct) })}
          </p>
        </div>
      )}
    </motion.div>
  );
}

function ArcProgress({ pct, requiredPct, eligible, num }) {
  const size = 176, radius = 74, stroke = 9, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, pct) / 100) * circumference;
  const tickAngle = (Math.min(100, requiredPct) / 100) * 360;
  const color = eligible ? C.emeraldOnNavy : C.goldBright;

  return (
    <div className="relative shrink-0" data-testid="attendance-hero-pct-wrap">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={radius} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,0.10)" />
        <line
          x1={cx} y1={cy - radius + 6} x2={cx} y2={cy - radius - 4}
          stroke="rgba(255,255,255,0.35)" strokeWidth={2}
          transform={`rotate(${tickAngle} ${cx} ${cy})`}
        />
        <motion.circle
          cx={cx} cy={cy} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={color}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${dash} ${circumference}` }}
          transition={{ duration: 1.4, ease: easing.premiumEaseOut, delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[42px] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: C.onNavy }} data-testid="attendance-hero-pct">
          {num(pct)}%
        </span>
      </div>
    </div>
  );
}

function ZeroTrack({ requiredPct, num }) {
  const ambient = useAmbientActive();
  return (
    <div className="mt-5" ref={ambient.ref}>
      <div className="relative h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.14)" }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full"
          style={{ left: 0, background: C.goldBright }}
        >
          {ambient.active && (
            <motion.span
              className="absolute inset-[-4px] rounded-full"
              style={{ border: `1.5px solid ${C.goldBright}` }}
              animate={{ scale: [0.6, 2.2], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2.5 w-[2px]"
          style={{ left: `${Math.min(100, requiredPct)}%`, background: "rgba(255,255,255,0.4)" }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: C.onNavyFaint }}>
        <span>0%</span>
        <span>{num(requiredPct)}%</span>
      </div>
    </div>
  );
}

function StatusLine({ eligible, t }) {
  const ambient = useAmbientActive();
  const color = eligible ? C.emeraldOnNavy : C.onNavySoft;
  return (
    <div className="flex items-center gap-1.5 mt-2.5" ref={ambient.ref}>
      <span className="relative inline-flex h-1.5 w-1.5">
        {ambient.active && (
          <motion.span
            className="absolute inset-[-3px] rounded-full"
            style={{ border: `1px solid ${color}` }}
            animate={{ scale: [0.6, 2.2], opacity: [0.6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      </span>
      <span className="text-[12.5px] font-semibold" style={{ color }} data-testid="attendance-status-pill">
        {eligible ? t("attRequirementMet") : t("attAlmostThere")}
      </span>
    </div>
  );
}

// ── Live banner ──────────────────────────────────────────────────────────
function LiveBanner({ t, slug }) {
  const ambient = useAmbientActive();
  return (
    <Link
      to={`/attendance/j/${slug}`}
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{ background: C.liveSoft, border: `1px solid rgba(79,166,217,0.3)` }}
      data-testid="attendance-live-card"
    >
      <span className="relative inline-flex h-2 w-2 shrink-0" ref={ambient.ref}>
        {ambient.active && (
          <motion.span
            className="absolute inset-[-5px] rounded-full"
            style={{ border: `1.5px solid ${C.live}` }}
            animate={{ scale: [0.6, 2.4], opacity: [0.7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="h-2 w-2 rounded-full" style={{ background: C.live }} />
      </span>
      <div className="flex-1">
        <p className="text-[12.5px] font-bold" style={{ color: C.pageInk }}>{t("attLiveNow")}</p>
        <p className="text-[11px]" style={{ color: C.pageInkMuted }}>{t("attTapToCheckIn")}</p>
      </div>
      <Radio className="h-4 w-4 shrink-0" style={{ color: C.live }} />
    </Link>
  );
}

// ── Small building blocks ────────────────────────────────────────────────
function Section({ title, children, delay, testId }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: easing.premiumEaseOut, delay }}
      className="mt-5"
      data-testid={testId}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] mb-1" style={{ color: C.pageInkFaint }}>{title}</p>
      {children}
    </motion.div>
  );
}

function StatFigure({ n, label, color }) {
  return (
    <div className="text-center">
      <div className="text-[17px] font-extrabold leading-none tabular-nums" style={{ color }}>{n}</div>
      <div className="text-[9.5px] mt-1" style={{ color: C.pageInkFaint }}>{label}</div>
    </div>
  );
}

function HowStep({ n, title, body }) {
  return (
    <div className="flex gap-3">
      <span className="text-[10.5px] font-bold tabular-nums shrink-0 mt-0.5" style={{ color: C.pageInkFaint }}>{n}</span>
      <div>
        <p className="text-[12px] font-bold" style={{ color: C.pageInk }}>{title}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: C.pageInkMuted }}>{body}</p>
      </div>
    </div>
  );
}

/**
 * `present_partial` is a legacy internal status — it always normalises to
 * "Present" for display; the raw DB value is never shown to students.
 */
function statusMeta(status, t) {
  if (status === "present_full" || status === "present_partial") {
    return { label: t("attPresent"), Icon: Check, color: C.emerald, bg: "rgba(31,138,95,0.10)" };
  }
  if (status === "late") return { label: t("attLate"), Icon: Clock, color: C.amber, bg: "rgba(182,130,42,0.10)" };
  return { label: t("attAbsent"), Icon: X, color: C.absent, bg: C.absentSoft };
}

/** Thin wrapper so the component body above reads cleanly. */
function useAttendanceHistory() {
  const { me, live } = useAttendance({ enabled: true, pollLive: true });
  return { me, live, history: (me && me.history) || [] };
}
