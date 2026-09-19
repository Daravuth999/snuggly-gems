/**
 * AssessmentsListPage.jsx — premium student home for the Assessment Lab.
 *
 * Every status shown is the backend's own `mySubmission` field on
 * GET /api/student/assessments — never fabricated. The page is the hub
 * for three journeys, each on its own surface:
 *   card → AssessmentDetailSheet (what is this? how does it work? where
 *           does my submission stand?)
 *   detail CTA → SubmitAssessmentModal (the guarded upload journey)
 *   detail/results CTA → AssessmentResultsSheet (score hero, lifecycle
 *           timeline, per-question breakdown — all real server data)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, ChevronRight, Loader2, Check, AlertTriangle, Clock,
  RefreshCw, Inbox,
} from "lucide-react";
import { listAssessments } from "./assessmentApi";
import SubmitAssessmentModal from "./SubmitAssessmentModal";
import AssessmentDetailSheet from "./AssessmentDetailSheet";
import AssessmentResultsSheet from "./AssessmentResultsSheet";
import { statusMeta, bucketOf, canSubmit, TABS, fmtPts, GOLD } from "./lifecycle";
import "./assessments.css";

const STATUS_ICONS = {
  not_submitted: Clock,
  processing: Loader2,
  needs_review: AlertTriangle,
  scored: Check,
  reviewed: Check,
  awarded: Check,
  failed: AlertTriangle,
};

// Score (what was answered correctly) and Points awarded (whether the
// teacher has actually credited the wallet for it) are two different
// backend facts — rendered as two separate lines so a "Scored" submission
// never reads as if points already landed in the wallet.
function StatusPill({ submission, totalPoints }) {
  if (!submission) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/45"
            data-testid="assessment-status-pill">
        <Clock size={12} /> Not submitted
      </span>
    );
  }
  const meta = statusMeta(submission.status);
  const Icon = STATUS_ICONS[submission.status] || Loader2;
  const awarded = submission.status === "awarded";
  const maxPoints = totalPoints ?? submission.score?.total;
  return (
    <span className="inline-flex flex-col gap-0.5" data-testid="assessment-status-pill">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: meta.color }}>
        <Icon size={12} className={meta.spin ? "animate-spin" : undefined} /> {meta.label}
        {submission.score ? ` · ${submission.score.correct}/${submission.score.total} correct · ${submission.score.scorePct}%` : ""}
      </span>
      {submission.score && (
        <span className="text-[10.5px] text-white/45 tnum" data-testid="assessment-status-pill-points">
          Score: {submission.score.pointsEarned}/{maxPoints} pts · Points awarded: {awarded ? submission.score.pointsEarned : "0 (pending teacher approval)"}
        </span>
      )}
    </span>
  );
}

function AssessmentCard({ assessment, onOpen }) {
  const sub = assessment.mySubmission;
  const meta = sub ? statusMeta(sub.status) : statusMeta("not_submitted");
  const qCount = Array.isArray(assessment.questions) ? assessment.questions.length : null;
  const metaLine = [
    assessment.subject || "Assessment",
    qCount ? `${qCount} questions` : null,
    assessment.totalPoints !== undefined ? `${fmtPts(assessment.totalPoints)} pts` : null,
  ].filter(Boolean).join(" · ");

  return (
    <button onClick={() => onOpen(assessment)}
            data-testid="assessment-card"
            aria-label={`Open ${assessment.title}`}
            className="asmt-card eduhub-tap w-full text-left rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center gap-3.5">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
           style={{ background: "rgba(212,168,67,0.12)", border: "1px solid rgba(212,168,67,0.28)" }}>
        <ClipboardCheck size={18} style={{ color: GOLD }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-[14.5px] font-bold text-white truncate leading-snug">{assessment.title}</div>
        <div className="text-[11.5px] text-white/45 mb-1 tnum truncate">{metaLine}</div>
        <StatusPill submission={sub} totalPoints={assessment.totalPoints} />
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="asmt-status-dot" style={{ background: meta.color }} aria-hidden="true" />
        <ChevronRight size={16} className="text-white/30" />
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3.5" aria-hidden="true">
      <div className="asmt-skeleton w-11 h-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="asmt-skeleton h-3.5 rounded w-3/4" />
        <div className="asmt-skeleton h-2.5 rounded w-1/2" />
        <div className="asmt-skeleton h-2.5 rounded w-2/5" />
      </div>
    </div>
  );
}

const TAB_EMPTY_COPY = {
  assigned: "Nothing here yet. New worksheets from your teacher will appear here.",
  in_progress: "Nothing here yet. Worksheets we're still reading will appear here.",
  submitted: "Nothing here yet. Submissions waiting for your teacher will appear here.",
  results: "Nothing here yet. Your scores will appear here once a worksheet is checked.",
};

export default function AssessmentsListPage() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("assigned");
  const [detailFor, setDetailFor] = useState(null);   // assessment → intro/status sheet
  const [submitFor, setSubmitFor] = useState(null);   // assessment → upload modal
  const [resultsFor, setResultsFor] = useState(null); // assessment → results sheet

  const load = useCallback((signal) => {
    setLoading(true);
    setError(null);
    listAssessments(signal)
      .then((rows) => {
        setAssessments(Array.isArray(rows) ? rows : []);
        setLoading(false);
      })
      .catch((e) => {
        // An aborted request (unmount / StrictMode re-mount / fast
        // navigation) is not an error the student should ever see.
        if (e?.name === "AbortError" || signal?.aborted) return;
        setError(e?.message || "Could not load assessments.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const buckets = useMemo(() => {
    const b = { assigned: [], in_progress: [], submitted: [], results: [] };
    for (const a of assessments) b[bucketOf(a)].push(a);
    return b;
  }, [assessments]);
  const visible = buckets[tab] || [];

  const openAssessment = (assessment) => setDetailFor(assessment);

  // Detail sheet primary action, based on the real lifecycle position.
  const handleDetailAction = (assessment) => {
    setDetailFor(null);
    if (canSubmit(assessment)) setSubmitFor(assessment);
    else if (assessment.mySubmission?.score) setResultsFor(assessment);
  };

  return (
    <div className="asmt-theme px-4 sm:px-6 pt-6 pb-24 max-w-2xl mx-auto" data-testid="assessments-list-page">
      {/* ── header ──────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <ClipboardCheck size={15} style={{ color: GOLD }} />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
            Assessment Lab
          </span>
        </div>
        <h1 className="font-display text-[24px] font-bold text-white tracking-tight leading-tight">
          Assessments
        </h1>
        <p className="text-[12.5px] text-white/50 mt-1 leading-relaxed">
          Submit your completed worksheets, then follow them from AI checking to your teacher's award.
        </p>
      </div>

      {/* ── summary strip (real counts, only once loaded) ───────────── */}
      {!loading && !error && assessments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-5" data-testid="assessments-summary">
          {[
            { key: "todo", label: "To submit", value: buckets.assigned.length },
            { key: "inreview", label: "In review", value: buckets.in_progress.length + buckets.submitted.length },
            { key: "done", label: "Results", value: buckets.results.length },
          ].map((s) => (
            <div key={s.key} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                 data-testid={`assessments-summary-${s.key}`}>
              <div className="font-display text-[20px] font-bold text-white tnum leading-none">{s.value}</div>
              <div className="text-[10.5px] text-white/45 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── lifecycle tabs ───────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="asmt-tabs flex gap-1 mb-4 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1"
             data-testid="assessments-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    role="tab" aria-selected={tab === t.key}
                    data-testid={`assessments-tab-${t.key}`}
                    className={`whitespace-nowrap flex-1 text-[11.5px] font-semibold px-2.5 py-2 rounded-lg transition-colors tnum ${
                      tab === t.key
                        ? "text-amber-300 bg-amber-400/10 border border-amber-400/30"
                        : "text-white/50 border border-transparent hover:text-white/75"
                    }`}>
              {t.label}{buckets[t.key].length > 0 ? ` · ${buckets[t.key].length}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* ── loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-2.5" data-testid="assessments-loading">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}

      {/* ── error ───────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.07] p-5 text-center space-y-3"
             data-testid="assessments-error">
          <AlertTriangle size={22} className="text-rose-300 mx-auto" />
          <div>
            <div className="text-[13.5px] font-bold text-white mb-0.5">Couldn't load your assessments</div>
            <p className="text-[12px] text-rose-200/80">{error}</p>
          </div>
          <button onClick={() => load()} data-testid="assessments-retry-button"
                  className="eduhub-tap inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-white/15 text-[12.5px] font-semibold text-white/80 hover:text-white">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      )}

      {/* ── global empty ────────────────────────────────────────────── */}
      {!loading && !error && assessments.length === 0 && (
        <div className="text-center py-14 px-6" data-testid="assessments-empty">
          <div className="w-12 h-12 mx-auto rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center mb-3">
            <Inbox size={20} className="text-white/35" />
          </div>
          <div className="text-[13.5px] font-bold text-white mb-1">No assessments are open right now. Check back soon.</div>
          <p className="text-[12px] text-white/45">Your teacher publishes new worksheets here.</p>
        </div>
      )}

      {/* ── per-tab empty ───────────────────────────────────────────── */}
      {!loading && !error && assessments.length > 0 && visible.length === 0 && (
        <div className="text-center py-14 px-6 text-white/45 text-[12.5px]" data-testid="assessments-tab-empty">
          Nothing here yet.
          <div className="text-[11.5px] text-white/30 mt-1">{TAB_EMPTY_COPY[tab]}</div>
        </div>
      )}

      {/* ── cards ───────────────────────────────────────────────────── */}
      {!loading && !error && visible.length > 0 && (
        <div className="space-y-2.5">
          {visible.map((a) => (
            <AssessmentCard key={a.assessmentId} assessment={a} onOpen={openAssessment} />
          ))}
        </div>
      )}

      {/* ── surfaces ────────────────────────────────────────────────── */}
      <AssessmentDetailSheet
        open={!!detailFor}
        assessment={detailFor}
        onClose={() => setDetailFor(null)}
        onPrimaryAction={handleDetailAction}
        onRefresh={() => load()}
      />

      <SubmitAssessmentModal
        open={!!submitFor}
        assessment={submitFor}
        onClose={() => setSubmitFor(null)}
        onSubmitted={() => load()}
        onViewResults={() => {
          const a = submitFor;
          setSubmitFor(null);
          load();
          if (a) setResultsFor(a);
        }}
        onDuplicate={() => {
          const a = submitFor;
          setSubmitFor(null);
          load();
          if (a) setDetailFor(a);
        }}
      />

      <AssessmentResultsSheet
        open={!!resultsFor}
        assessment={resultsFor}
        onClose={() => setResultsFor(null)}
        onResubmit={(a) => {
          setResultsFor(null);
          setSubmitFor(a);
        }}
      />
    </div>
  );
}
