/**
 * AssessmentResultsSheet.jsx — the results experience: a meaningful
 * learning moment, not just "Score: 13.5".
 *
 * Renders ONLY what GET /api/student/assessments/submissions actually
 * returned for this student: the deterministic score (fractional points
 * preserved exactly), answered/blank/unclear counts, the lifecycle
 * timeline with real timestamps, the award record when points were truly
 * credited, and the per-question breakdown from score.details (what the
 * AI read vs the correct answer, confidence, teacher corrections).
 * Nothing is fabricated; provisional states say so explicitly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Check, AlertTriangle, Loader2, ChevronDown, Award, RefreshCw,
  UserCheck, PenLine, HelpCircle, CircleSlash,
} from "lucide-react";
import { listMySubmissions } from "./assessmentApi";
import JourneyTimeline from "./JourneyTimeline";
import { statusMeta, fmtPts, fmtWhen, GOLD } from "./lifecycle";
import useBodyScrollLock from "./useBodyScrollLock";
import "./assessments.css";

/** Per-question physical answer-state badges — assessment_schema.py's
 * ANSWER_STATES verbatim (answered/blank/uncertain), in student words. */
function AnswerStateBadge({ state, source }) {
  if (source === "teacher") {
    return (
      <span className="asmt-qbadge" style={{ color: "#8fd6a0", borderColor: "rgba(125,208,138,0.35)" }}
            data-testid="assessment-results-teacher-badge">
        <UserCheck size={10} /> Corrected by teacher
      </span>
    );
  }
  if (state === "blank") {
    return (
      <span className="asmt-qbadge text-white/45 border-white/15" data-testid="assessment-results-blank-badge">
        <CircleSlash size={10} /> Left blank
      </span>
    );
  }
  if (state === "uncertain") {
    return (
      <span className="asmt-qbadge" style={{ color: "#f0c47e", borderColor: "rgba(240,168,80,0.4)" }}
            data-testid="assessment-results-uncertain-badge">
        <HelpCircle size={10} /> Hard to read — teacher will check
      </span>
    );
  }
  return null;
}

function QuestionRow({ detail, index }) {
  const [expanded, setExpanded] = useState(false);
  const ok = !!detail.correct;
  const uncertain = detail.answerState === "uncertain";
  return (
    <div className="asmt-qrow rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
         data-testid="assessment-results-question-row" data-qid={detail.qid}>
      <button onClick={() => setExpanded((v) => !v)}
              data-testid={`assessment-results-question-toggle-${detail.qid}`}
              aria-expanded={expanded}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-left">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10.5px] font-bold tnum ${
          ok ? "bg-emerald-400/12 text-emerald-300 border border-emerald-400/30"
             : uncertain ? "bg-amber-400/10 text-amber-300 border border-amber-400/30"
                         : "bg-rose-400/10 text-rose-300 border border-rose-400/25"
        }`}>
          {index + 1}
        </span>
        <span className="flex-1 min-w-0 text-[12px] text-white/75 leading-snug line-clamp-2 break-words [overflow-wrap:anywhere]">
          {detail.prompt || `Question ${index + 1}`}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-bold tnum text-white/55">
            {fmtPts(detail.pointsEarned)}<span className="text-white/30">/{fmtPts(detail.points)}</span>
          </span>
          {ok
            ? <Check size={14} className="text-emerald-400" strokeWidth={3} />
            : uncertain
              ? <HelpCircle size={14} className="text-amber-300" />
              : <X size={14} className="text-rose-300" strokeWidth={2.6} />}
          <ChevronDown size={13} className={`text-white/30 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0.5 space-y-2 asmt-phase-in"
             data-testid={`assessment-results-question-detail-${detail.qid}`}>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/35 mb-0.5">Answer we read</div>
            <div className="text-[12.5px] font-semibold text-white/85">
              {detail.answerState === "blank" ? <span className="text-white/40 italic">— left blank —</span>
                : detail.givenAnswer || <span className="text-white/40 italic">— unreadable —</span>}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/35 mb-0.5">Correct answer</div>
            <div className="text-[12.5px] font-semibold text-emerald-300/90">{detail.correctAnswer}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <AnswerStateBadge state={detail.answerState} source={detail.source} />
            {typeof detail.confidence === "number" && detail.source !== "teacher" && (
              <span className="asmt-qbadge text-white/45 border-white/15 tnum"
                    data-testid="assessment-results-confidence">
                <PenLine size={10} /> Reading confidence {Math.round(detail.confidence * 100)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssessmentResultsSheet({ open, assessment, onClose, onResubmit }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submission, setSubmission] = useState(null);
  const cardRef = useRef(null);

  useBodyScrollLock(open);

  const load = useCallback((signal) => {
    if (!assessment) return;
    setLoading(true);
    setError(null);
    listMySubmissions(signal)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const target = assessment.mySubmission?.submissionId;
        const found = (target && list.find((s) => s.submissionId === target))
          || list.find((s) => s.assessmentId === assessment.assessmentId)
          || null;
        setSubmission(found);
        if (!found) setError("We couldn't find this submission anymore.");
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError" || signal?.aborted) return;
        setError(e?.message || "Could not load your results.");
        setLoading(false);
      });
  }, [assessment]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    cardRef.current?.focus?.();
    const onKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !assessment) return null;

  const status = submission?.status;
  const meta = submission ? statusMeta(status) : null;
  const score = submission?.score;
  const award = submission?.award;
  const awarded = status === "awarded";
  const details = Array.isArray(score?.details) ? score.details : [];
  const totalPoints = assessment.totalPoints ?? score?.totalPoints ?? score?.total;

  // Portal to <body> — see SubmitAssessmentModal for the stacking-context
  // rationale (bottom nav is z-[400] at the root level).
  return createPortal(
    <div className="asmt-theme asmt-modal-overlay fixed inset-0 z-[500] flex items-end sm:items-center justify-center px-0 sm:px-6 overflow-hidden"
         style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
         data-testid="assessment-results-sheet"
         onClick={() => onClose?.()}>
      <div ref={cardRef} tabIndex={-1}
           role="dialog" aria-modal="true" aria-labelledby="assessment-results-heading"
           className="asmt-modal-card asmt-sheet-in relative w-full sm:max-w-md max-w-full bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-2xl outline-none overflow-x-hidden"
           style={{
             paddingTop: "max(0.75rem, env(safe-area-inset-top))",
             paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
             paddingRight: "max(1.25rem, env(safe-area-inset-right))",
             paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
             maxHeight: "calc(100dvh - 24px - env(safe-area-inset-top))",
             overflowY: "auto",
             overflowX: "hidden",
           }}
           onClick={(e) => e.stopPropagation()}>
        <div className="asmt-grab-handle sm:hidden" aria-hidden="true" />
        <button onClick={onClose} aria-label="Close" data-testid="assessment-results-close-button"
                className="absolute top-3.5 right-3.5 z-10 p-1.5 text-white/45 hover:text-white">
          <X size={16} />
        </button>

        {/* identity */}
        <div className="pt-2 pb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: GOLD }}>
            {assessment.subject || "Assessment"} · Results
          </div>
          <h2 id="assessment-results-heading" className="font-display text-[18px] font-bold text-white leading-snug pr-6 break-words min-w-0 [overflow-wrap:anywhere]">
            {assessment.title}
          </h2>
        </div>

        {loading && (
          <div className="py-12 flex flex-col items-center gap-3" data-testid="assessment-results-loading">
            <Loader2 size={22} className="animate-spin" style={{ color: GOLD }} />
            <div className="text-[12px] text-white/45">Loading your results…</div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.07] p-5 text-center space-y-3 mb-4"
               data-testid="assessment-results-error">
            <AlertTriangle size={20} className="text-rose-300 mx-auto" />
            <p className="text-[12px] text-rose-200/85">{error}</p>
            <button onClick={() => load()} data-testid="assessment-results-retry-button"
                    className="eduhub-tap inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-white/15 text-[12.5px] font-semibold text-white/80">
              <RefreshCw size={13} /> Try again
            </button>
          </div>
        )}

        {!loading && !error && submission && (
          <div className="space-y-4">
            {/* ── score hero ─────────────────────────────────────────── */}
            {score ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="assessment-results-score-hero">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="font-display text-[38px] font-bold text-white tnum leading-none"
                         data-testid="assessment-results-correct">
                      {score.correct}<span className="text-white/35 text-[22px]">/{score.total}</span>
                    </div>
                    <div className="text-[12px] text-white/55 mt-1.5 tnum">{score.scorePct}% answered correctly</div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10.5px] font-bold uppercase tracking-wide flex-shrink-0"
                        style={{ color: meta.color, borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                        data-testid="assessment-results-status-badge">
                    {meta.label}
                  </span>
                </div>

                <div className="asmt-divider my-4" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12.5px]" data-testid="assessment-results-points-calculated">
                    <span className="text-white/55">Score calculated</span>
                    <span className="font-bold text-white tnum">{fmtPts(score.pointsEarned)} / {fmtPts(totalPoints)} pts</span>
                  </div>
                  <div className="flex items-center justify-between text-[12.5px]" data-testid="assessment-results-points-credited">
                    <span className="text-white/55">Points in your wallet</span>
                    {awarded ? (
                      <span className="font-bold tnum" style={{ color: GOLD }}>
                        {fmtPts(award?.pointsCredited ?? score.pointsEarned)} pts
                      </span>
                    ) : (
                      <span className="font-semibold text-white/45">0 — after teacher review</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center" data-testid="assessment-results-no-score">
                <p className="text-[12.5px] text-white/55 leading-relaxed">
                  {status === "failed"
                    ? "This upload couldn't be processed, so there's no score yet."
                    : "Your worksheet is still being processed — no score yet."}
                </p>
              </div>
            )}

            {/* ── state explanations (honest, never dead ends) ───────── */}
            {awarded && (
              <div className="rounded-xl border px-3.5 py-3"
                   style={{ borderColor: "rgba(212,168,67,0.35)", background: "rgba(212,168,67,0.08)" }}
                   data-testid="assessment-results-awarded">
                <div className="flex items-center gap-2.5">
                  <Award size={16} style={{ color: GOLD }} className="flex-shrink-0" />
                  <div className="text-[12.5px] font-bold" style={{ color: GOLD }}>
                    {fmtPts(award?.pointsCredited ?? score?.pointsEarned)} points credited to your wallet
                  </div>
                </div>
                {(award?.creditedAt || award?.balanceAfter !== undefined) && (
                  <div className="text-[11px] text-white/45 mt-1 ml-[26px] tnum">
                    {fmtWhen(award?.creditedAt) ? `Credited ${fmtWhen(award.creditedAt)}` : ""}
                    {award?.balanceAfter !== undefined && award?.balanceAfter !== null
                      ? ` · wallet balance ${fmtPts(award.balanceAfter)} pts` : ""}
                  </div>
                )}
                {/* Additive, honest signal only — never exposes teacher
                    identity, reasons, or internal audit detail here; the
                    score/points above already reflect the CURRENT
                    (post-correction) truth, this just names why they may
                    differ from what the student remembers seeing before. */}
                {submission?.correctionState === "applied" && (
                  <div className="flex items-center gap-1.5 mt-2 ml-[26px] text-[11px] text-emerald-300/85"
                       data-testid="assessment-results-correction-applied">
                    <UserCheck size={12} /> Correction applied · your teacher reviewed this result
                  </div>
                )}
              </div>
            )}
            {status === "needs_review" && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-3 flex items-start gap-2.5"
                   data-testid="assessment-results-review-note">
                <AlertTriangle size={15} className="text-amber-300 flex-shrink-0 mt-0.5" />
                <div className="text-[12px] text-amber-200/85 leading-relaxed">
                  <span className="font-bold">This score is provisional.</span> Some answers were hard to read,
                  so your teacher will check them personally before points are awarded.
                  You don't need to do anything — you'll be notified when it's confirmed.
                </div>
              </div>
            )}
            {status === "reviewed" && (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-3.5 py-3 flex items-start gap-2.5"
                   data-testid="assessment-results-reviewed-note">
                <UserCheck size={15} className="text-emerald-300 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-emerald-200/85 leading-relaxed">
                  Your teacher has reviewed this worksheet. Points will be credited shortly.
                </p>
              </div>
            )}
            {status === "failed" && (
              <button onClick={() => onResubmit?.(assessment)} data-testid="assessment-results-resubmit-button"
                      className="eduhub-tap w-full py-3 min-h-[48px] rounded-xl text-[13.5px] font-bold text-black"
                      style={{ background: GOLD }}>
                Submit again
              </button>
            )}

            {/* ── reading summary (real counts from the scorer) ──────── */}
            {score && (score.answeredCount !== undefined) && (
              <div className="flex gap-2" data-testid="assessment-results-reading-summary">
                {[
                  { label: "answered", value: score.answeredCount },
                  { label: "blank", value: score.blankCount },
                  { label: "unclear", value: score.uncertainCount },
                ].map((c) => (
                  <div key={c.label} className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
                    <div className="text-[16px] font-bold text-white tnum leading-none">{c.value ?? 0}</div>
                    <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wide">{c.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── lifecycle timeline ─────────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 mb-3">Journey</div>
              <JourneyTimeline submission={submission} testId="assessment-results-timeline" />
            </div>

            {/* ── per-question breakdown ─────────────────────────────── */}
            {details.length > 0 && (
              <div className="space-y-2" data-testid="assessment-results-question-list">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 pt-1">
                  Question by question
                </div>
                {details.map((d, i) => (
                  <QuestionRow key={d.qid || i} detail={d} index={i} />
                ))}
              </div>
            )}

            <button onClick={onClose} data-testid="assessment-results-done-button"
                    className="eduhub-tap w-full py-3 min-h-[48px] rounded-xl text-[13px] font-semibold text-white/60 hover:text-white border border-white/10">
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
