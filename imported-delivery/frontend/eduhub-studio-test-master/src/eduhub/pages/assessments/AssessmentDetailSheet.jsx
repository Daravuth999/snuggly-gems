/**
 * AssessmentDetailSheet.jsx — the assessment introduction / status surface.
 *
 * Opens from any assessment card and answers, before anything else:
 * "What am I doing? Why am I doing it? What happens next?" — then hands
 * off to the submission journey or the results sheet depending on where
 * the submission genuinely stands (backend `mySubmission` only, never a
 * client guess).
 *
 * Bottom sheet on mobile, centered card on ≥sm — the same overlay pattern
 * as SubmitAssessmentModal so the whole feature feels like one product.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X, Camera, ScanLine, UserCheck, ChevronRight, Loader2, AlertTriangle,
  FileImage, ShieldCheck, Award, ClipboardCheck,
} from "lucide-react";
import JourneyTimeline from "./JourneyTimeline";
import { statusMeta, canSubmit, fmtPts, GOLD } from "./lifecycle";
import useBodyScrollLock from "./useBodyScrollLock";
import "./assessments.css";

const HOW_IT_WORKS = [
  {
    Icon: Camera,
    title: "Photograph your completed worksheet",
    desc: "Finish it on paper first, then take one clear photo (or scan to PDF).",
  },
  {
    Icon: ScanLine,
    title: "We read and score your answers",
    desc: "Your handwriting is read and checked against your teacher's answer key.",
  },
  {
    Icon: UserCheck,
    title: "Your teacher reviews and awards points",
    desc: "The score is calculated instantly — points reach your wallet only after your teacher approves.",
  },
];

// Honest, grounded in the backend's real reason codes (assessment_ai_provider.py's
// AssessmentAiError taxonomy: provider_rejected/files_upload_failed/
// files_processing_failed/unexpected_error = a system/provider-side hiccup,
// not the student's fault; bad_response/empty_media = the AI genuinely
// couldn't read what was uploaded). Never a guess dressed up as certainty —
// falls back to the plain generic copy when the reason is missing or unknown.
// There is no anti-cheat mechanism anywhere in this pipeline — "failed"
// always means a real extraction attempt that didn't succeed technically.
function extractionFailureHint(reason) {
  if (!reason) return null;
  if (/^(provider_rejected|files_upload_failed|files_processing_failed|unexpected_error)/.test(reason)) {
    return "This looks like a temporary system issue on our end — please try again in a moment.";
  }
  if (/^(bad_response|empty_media)/.test(reason)) {
    return "We couldn't read your photo clearly enough to check it.";
  }
  return null;
}

function MetaChip({ children, testId }) {
  return (
    <span data-testid={testId}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-white/65 tnum">
      {children}
    </span>
  );
}

export default function AssessmentDetailSheet({ open, assessment, onClose, onPrimaryAction, onRefresh }) {
  const cardRef = useRef(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    cardRef.current?.focus?.();
    const onKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !assessment) return null;

  const sub = assessment.mySubmission;
  const status = sub?.status || null;
  const meta = sub ? statusMeta(status) : statusMeta("not_submitted");
  const submittable = canSubmit(assessment);
  const hasScore = !!sub?.score;
  const qCount = Array.isArray(assessment.questions) ? assessment.questions.length : null;

  const primaryLabel = submittable
    ? (status === "failed" ? "Try again" : "Submit worksheet")
    : hasScore ? "View full results" : null;

  // Portal to <body> — see SubmitAssessmentModal for the stacking-context
  // rationale (bottom nav is z-[400] at the root level).
  return createPortal(
    <div className="asmt-theme asmt-modal-overlay fixed inset-0 z-[500] flex items-end sm:items-center justify-center px-0 sm:px-6 overflow-hidden"
         style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
         data-testid="assessment-detail-sheet"
         onClick={() => onClose?.()}>
      <div ref={cardRef} tabIndex={-1}
           role="dialog" aria-modal="true" aria-labelledby="assessment-detail-heading"
           className="asmt-modal-card asmt-sheet-in relative w-full sm:max-w-md max-w-full bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-2xl outline-none overflow-x-hidden"
           style={{
             paddingTop: "max(0.75rem, env(safe-area-inset-top))",
             paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
             paddingRight: "max(1.25rem, env(safe-area-inset-right))",
             paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
             maxHeight: "min(720px, calc(100dvh - 24px - env(safe-area-inset-top)))",
             overflowY: "auto",
             overflowX: "hidden",
           }}
           onClick={(e) => e.stopPropagation()}>
        <div className="asmt-grab-handle sm:hidden" aria-hidden="true" />
        <button onClick={onClose} aria-label="Close" data-testid="assessment-detail-close-button"
                className="absolute top-3.5 right-3.5 z-10 p-1.5 text-white/45 hover:text-white">
          <X size={16} />
        </button>

        {/* ── identity ───────────────────────────────────────────────── */}
        <div className="pt-2 pb-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={13} style={{ color: GOLD }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
              {assessment.subject || "Assessment"}
            </span>
          </div>
          <h2 id="assessment-detail-heading" className="font-display text-[19px] font-bold text-white leading-snug pr-6 break-words min-w-0 [overflow-wrap:anywhere]">
            {assessment.title}
          </h2>
          <div className="flex flex-wrap gap-1.5" data-testid="assessment-detail-meta">
            {qCount && <MetaChip testId="assessment-detail-meta-questions">{qCount} questions</MetaChip>}
            {assessment.totalPoints !== undefined && (
              <MetaChip testId="assessment-detail-meta-points">{fmtPts(assessment.totalPoints)} pts</MetaChip>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold"
                  style={{ color: meta.color, borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
                  data-testid="assessment-detail-status-badge">
              {meta.label}
            </span>
          </div>
        </div>

        {/* ── unsubmitted / failed: the introduction experience ─────── */}
        {submittable && (
          <div className="space-y-4">
            {status === "failed" && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.07] px-3.5 py-3 flex items-start gap-2.5"
                   data-testid="assessment-detail-failed-note">
                <AlertTriangle size={15} className="text-rose-300 flex-shrink-0 mt-0.5" />
                <div className="text-[12px] text-rose-200/85 leading-relaxed space-y-1">
                  <p>Your last upload couldn't be processed. Nothing was scored — take a clearer photo and try again.</p>
                  {extractionFailureHint(sub?.extractionError) && (
                    <p className="text-rose-200/60" data-testid="assessment-detail-failed-hint">
                      {extractionFailureHint(sub.extractionError)}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3.5"
                 data-testid="assessment-detail-how-it-works">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">How it works</div>
              {HOW_IT_WORKS.map((s, i) => (
                <div key={s.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: "rgba(212,168,67,0.12)", border: "1px solid rgba(212,168,67,0.26)" }}>
                    <s.Icon size={14} style={{ color: GOLD }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-white leading-snug">{i + 1}. {s.title}</div>
                    <div className="text-[11.5px] text-white/50 leading-relaxed mt-0.5">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 space-y-2"
                 data-testid="assessment-detail-file-rules">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
                <FileImage size={12} /> Accepted files
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["JPG", "PNG", "WEBP", "HEIC", "PDF"].map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-[10.5px] font-bold text-white/60">{t}</span>
                ))}
                <span className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-[10.5px] font-bold text-white/60">up to 25 MB</span>
              </div>
              <div className="flex items-start gap-2 pt-0.5">
                <ShieldCheck size={13} className="text-white/35 flex-shrink-0 mt-[1px]" />
                <p className="text-[11px] text-white/45 leading-relaxed">
                  One submission per assessment — check your worksheet is complete before you send it.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── processing: honest in-flight state ─────────────────────── */}
        {status === "processing" && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center space-y-3"
               data-testid="assessment-detail-processing">
            <Loader2 size={22} className="animate-spin mx-auto" style={{ color: GOLD }} />
            <div>
              <div className="text-[13.5px] font-bold text-white mb-1">Your worksheet is being read</div>
              <p className="text-[12px] text-white/50 leading-relaxed">
                This usually takes under a minute. You can close this — the status updates automatically.
              </p>
            </div>
            <button onClick={() => onRefresh?.()} data-testid="assessment-detail-refresh-button"
                    className="eduhub-tap inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-white/15 text-[12.5px] font-semibold text-white/75 hover:text-white">
              <Loader2 size={12} /> Refresh status
            </button>
          </div>
        )}

        {/* ── has a score: status summary + journey ──────────────────── */}
        {!submittable && status !== "processing" && (
          <div className="space-y-4">
            {hasScore && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="assessment-detail-score-summary">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="font-display text-[26px] font-bold text-white tnum leading-none">
                      {sub.score.correct}<span className="text-white/40 text-[17px]">/{sub.score.total}</span>
                    </div>
                    <div className="text-[11.5px] text-white/50 mt-1 tnum">{sub.score.scorePct}% correct</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold tnum" style={{ color: GOLD }}>
                      {fmtPts(sub.score.pointsEarned)} / {fmtPts(assessment.totalPoints ?? sub.score.total)} pts
                    </div>
                    <div className="text-[10.5px] text-white/40 mt-0.5">
                      {status === "awarded" ? "credited to your wallet" : "calculated — award pending"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status === "awarded" && (
              <div className="rounded-xl border px-3.5 py-3 flex items-center gap-2.5"
                   style={{ borderColor: "rgba(212,168,67,0.35)", background: "rgba(212,168,67,0.08)" }}
                   data-testid="assessment-detail-awarded-note">
                <Award size={16} style={{ color: GOLD }} className="flex-shrink-0" />
                <p className="text-[12px] leading-relaxed" style={{ color: GOLD }}>
                  Your teacher approved this worksheet — the points are in your wallet.
                </p>
              </div>
            )}
            {status === "needs_review" && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-3 flex items-start gap-2.5"
                   data-testid="assessment-detail-review-note">
                <AlertTriangle size={15} className="text-amber-300 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-200/85 leading-relaxed">
                  Some answers were hard to read, so your teacher will check this one personally.
                  Your score is provisional and nothing is needed from you right now.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 mb-3">Where it stands</div>
              <JourneyTimeline submission={sub} compact testId="assessment-detail-timeline" />
            </div>
          </div>
        )}

        {/* ── actions ─────────────────────────────────────────────────── */}
        <div className="pt-4 space-y-2">
          {primaryLabel && (
            <button onClick={() => onPrimaryAction?.(assessment)} data-testid="assessment-detail-primary-cta"
                    className="eduhub-tap w-full py-3.5 min-h-[48px] rounded-xl text-[14px] font-bold text-black inline-flex items-center justify-center gap-1.5"
                    style={{ background: GOLD }}>
              {primaryLabel} <ChevronRight size={15} />
            </button>
          )}
          <button onClick={onClose} data-testid="assessment-detail-dismiss-button"
                  className="eduhub-tap w-full py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold text-white/55 hover:text-white">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
