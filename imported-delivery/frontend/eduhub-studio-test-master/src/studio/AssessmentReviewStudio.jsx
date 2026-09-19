/**
 * AssessmentReviewStudio.jsx — Author Studio panel for the AI Assessment /
 * Quiz Submission Lab.
 *
 * Composed from three existing precedents (no single file in this
 * codebase already does all of this):
 *   - filter/stats shell            -> ReceiptManagementStudio.jsx
 *   - per-row busy state            -> PasswordResetRequestsPanel.jsx's busyId
 *   - status badge + guarded action -> SyncReviewStudio.jsx's reviewStatus ternary
 * Bulk-select checkboxes + "N selected" bar have no precedent anywhere in
 * this codebase (confirmed by search) and are built fresh here: a
 * `selectedIds` Set, one checkbox per row, and a sticky bulk-award bar that
 * calls the SAME single-award endpoint per id (bulkAwardAssessmentSubmissions
 * on the backend already loops the identical _award_one function server-
 * side — no separate bulk logic invented on either side).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardList, Loader2, Check, AlertTriangle, Coins, RefreshCcw,
  Upload, Plus, ChevronDown, ChevronUp, X as XIcon, Wallet, Bell, RotateCcw,
  Pencil, ExternalLink, Trash2, HelpCircle, History, FlaskConical,
  ShieldAlert, ArrowRight, ScrollText,
} from "lucide-react";
import {
  extractAssessmentAnswerKey, createAssessment, listAssessments as apiListAssessments,
  listAssessmentSubmissions, awardAssessmentSubmission, bulkAwardAssessmentSubmissions,
  retryAssessmentGasSync, correctAssessmentSubmission, deleteAssessmentSubmission,
  runAssessmentExtractionCheck, applyAssessmentCorrection, listAssessmentCorrections,
  updateAssessment, deleteAssessment,
} from "./api";

// ── post-award correction (reverse review) ────────────────────────────────
const CORRECTION_REASONS = [
  { value: "teacher_grading_mistake", label: "Teacher grading mistake" },
  { value: "student_evidence_accepted", label: "Student evidence accepted" },
  { value: "question_key_error", label: "Question/key error" },
  { value: "gemini_interpretation_error", label: "Gemini interpretation error" },
  { value: "listening_interpretation_error", label: "Listening/pronunciation interpretation error" },
  { value: "technical_issue", label: "Technical issue" },
  { value: "other", label: "Other" },
];

/** Client-side PREVIEW only — mirrors assessment_scoring.py's
 * apply_teacher_overrides exactly (same clamp-into-[0,max] rule) so the
 * Before/After panel is accurate, but the server recomputes and applies
 * this authoritatively; nothing here is trusted as the real outcome. */
function previewCorrectedScore(baseScore, overrides, questions) {
  const byQidQ = new Map((questions || []).map((q) => [q.qid, q]));
  let correct = 0;
  let pointsEarned = 0;
  let totalPoints = 0;
  const details = (baseScore?.details || []).map((d) => {
    totalPoints += Number(d.points) || 0;
    const ov = overrides[d.qid];
    if (!ov) {
      if (d.correct) correct += 1;
      pointsEarned += Number(d.pointsEarned) || 0;
      return d;
    }
    const q = byQidQ.get(d.qid);
    const maxPts = q ? Number(q.points) : Number(d.points) || 0;
    let pts = Number(ov.points);
    if (!Number.isFinite(pts)) pts = ov.correct ? maxPts : 0;
    pts = Math.max(0, Math.min(maxPts, pts));
    if (ov.correct) correct += 1;
    pointsEarned += pts;
    return { ...d, correct: !!ov.correct, pointsEarned: pts, teacherOverride: true };
  });
  const total = details.length;
  return {
    ...baseScore,
    details,
    correct,
    total,
    scorePct: total ? Math.round((correct / total) * 1000) / 10 : 0,
    pointsEarned: Math.round(pointsEarned * 1000) / 1000,
    totalPoints: Math.round(totalPoints * 1000) / 1000,
  };
}

// needs_review means "a teacher should look" — it is still awardable with
// its exact persisted calculated score, never a dead end.
const AWARDABLE_STATUSES = ["needs_review", "scored", "reviewed"];

const STATUS_STYLE = {
  processing: "text-slate-300 border-slate-400/40 bg-slate-400/10",
  needs_review: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  scored: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  reviewed: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  awarded: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  failed: "text-red-300 border-red-400/40 bg-red-400/10",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLE[status] || STATUS_STYLE.processing}`}
      data-testid="assessment-submission-status-badge"
    >
      {status}
    </span>
  );
}

const AVATAR_PALETTE = [
  "text-amber-200 bg-amber-400/15 border-amber-400/25",
  "text-sky-200 bg-sky-400/15 border-sky-400/25",
  "text-violet-200 bg-violet-400/15 border-violet-400/25",
  "text-emerald-200 bg-emerald-400/15 border-emerald-400/25",
  "text-rose-200 bg-rose-400/15 border-rose-400/25",
];

function initialsOf(text) {
  if (!text) return "?";
  const parts = String(text).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.length ? parts.map((p) => p[0]).join("") : String(text).slice(0, 2);
  return letters.toUpperCase();
}

function hashPalette(key) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** Whose worksheet this is — always visible, never squeezed to nothing.
 * `studentName` is a real resolved identity (assessment_tools.py's
 * admin_list_submissions batch-joins db.students); the raw studentId/
 * cleanId code is the honest fallback when no name resolves, and stays
 * visible as a secondary line even when a name IS known so a teacher can
 * still cross-reference the exact account. */
function StudentIdentity({ s }) {
  const id = s.cleanId || s.studentId || "unknown";
  const name = s.studentName || null;
  const key = id || name || "?";
  return (
    <div className="flex items-center gap-2.5 min-w-0" data-testid="assessment-submission-identity">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold border ${hashPalette(key)}`}
        aria-hidden="true"
      >
        {initialsOf(name || id)}
      </div>
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-white truncate" data-testid="assessment-submission-student-name">
          {name || id}
        </div>
        <div className="text-[10.5px] text-white/40 truncate tnum" data-testid="assessment-submission-student-id">
          {name ? id : "no name on file"}
        </div>
      </div>
    </div>
  );
}

/** Per-question given-vs-correct breakdown, straight from the persisted
 * submission's own score.details (assessment_scoring.py's real output —
 * nothing computed here). This is the direct diagnostic for "the student
 * really answered X but it scored as wrong" — including the exact raw
 * text Gemini extracted per question, so a mismatched vocabulary (e.g.
 * the prompt word instead of a LONG/SHORT classification) is visible at
 * a glance instead of an unexplained 0. */
// Confidence heatmap: low-confidence readings must jump out BEFORE awarding.
function confMeta(conf) {
  if (typeof conf !== "number") return null;
  if (conf >= 0.85) return { band: "high", cls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30" };
  if (conf >= 0.7) return { band: "good", cls: "text-lime-300 bg-lime-400/10 border-lime-400/30" };
  if (conf >= 0.5) return { band: "low", cls: "text-amber-300 bg-amber-400/10 border-amber-400/35" };
  return { band: "critical", cls: "text-red-300 bg-red-400/10 border-red-400/40" };
}

const STATE_BADGE = {
  blank: { label: "blank", cls: "text-slate-300 border-slate-400/40 bg-slate-400/10" },
  uncertain: { label: "uncertain", cls: "text-amber-300 border-amber-400/40 bg-amber-400/10" },
};

function AnswerStateBadge({ state }) {
  const meta = STATE_BADGE[state];
  if (!meta) return null;
  return (
    <span className={`ml-1 text-[9px] font-bold uppercase px-1.5 py-px rounded-full border ${meta.cls}`}
          data-testid="assessment-answer-state-badge">
      {meta.label}
    </span>
  );
}

/** One correctable row: shows the prompt, what Gemini read (with its
 * physical answer state + confidence) and the answer key, plus an inline
 * teacher-correction editor. Applying a correction calls the backend's
 * /correct endpoint, which recalculates the deterministic score and
 * preserves the original Gemini extraction untouched. */
function DetailRow({ d, submissionId, locked, onCorrected }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const apply = async () => {
    setBusy(true);
    setErr(null);
    try {
      await correctAssessmentSubmission(submissionId, [{ qid: d.qid, answer: value.trim() }]);
      setEditing(false);
      onCorrected?.();
    } catch (e) {
      setErr(e.message || "Correction failed.");
    } finally {
      setBusy(false);
    }
  };

  const confPct = typeof d.confidence === "number" ? `${Math.round(d.confidence * 100)}%` : null;
  const conf = confMeta(d.confidence);
  return (
    <>
      <tr className="border-t border-white/5" data-testid="assessment-submission-detail-row">
        <td className="pr-2 py-1 text-white/70 truncate max-w-[120px]">{d.prompt}</td>
        <td className="pr-2 py-1 text-white/80">
          {d.givenAnswer ?? <span className="text-white/30">—</span>}
          <AnswerStateBadge state={d.answerState} />
          {d.source === "teacher" && (
            <span className="ml-1 text-[9px] font-bold uppercase px-1.5 py-px rounded-full border text-sky-300 border-sky-400/40 bg-sky-400/10">
              teacher
            </span>
          )}
        </td>
        <td className="pr-2 py-1 text-white/50">{d.correctAnswer}</td>
        <td className="pr-2 py-1 whitespace-nowrap">
          {confPct ? (
            <span className={`text-[10px] font-bold px-1.5 py-px rounded-full border ${conf.cls}`}
                  data-testid="assessment-confidence-pill" data-confidence-band={conf.band}>
              {confPct}
            </span>
          ) : (
            <span className="text-white/25 text-[10px]">—</span>
          )}
        </td>
        <td className="pr-2 py-1">
          {d.correct
            ? <Check size={12} className="text-emerald-400" />
            : d.answerState === "uncertain"
              ? <HelpCircle size={12} className="text-amber-400" />
              : <XIcon size={12} className="text-red-400" />}
        </td>
        <td className="py-1">
          {!locked && (
            <button onClick={() => { setEditing((v) => !v); setValue(d.givenAnswer || ""); setErr(null); }}
                    aria-label={`Correct ${d.prompt}`}
                    data-testid="assessment-correct-toggle-button"
                    className="p-1 text-white/35 hover:text-amber-300">
              <Pencil size={11} />
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr className="border-t border-white/5 bg-amber-400/[0.04]" data-testid="assessment-correction-editor-row">
          <td colSpan={6} className="py-1.5 pr-2">
            <div className="flex items-center gap-2 pl-1">
              <span className="text-[10.5px] text-white/45">Teacher final answer:</span>
              <input value={value} onChange={(e) => setValue(e.target.value)}
                     data-testid="assessment-correction-input"
                     placeholder={d.correctAnswer}
                     className="flex-1 max-w-[160px] rounded bg-black/30 border border-amber-400/30 px-2 py-1 text-[11.5px] text-white" />
              <button onClick={apply} disabled={busy}
                      data-testid="assessment-apply-correction-button"
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold text-black bg-amber-400 rounded px-2 py-1 disabled:opacity-50">
                {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Apply Correction
              </button>
              {err && <span className="text-[10.5px] text-red-300">{err}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CorrectionHistory({ corrections }) {
  return (
    <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.04] p-2.5 space-y-2"
         data-testid="assessment-correction-history">
      {corrections.map((c, i) =>
        typeof c === "object" && c !== null ? (
          <div key={i} className="flex items-start gap-2 text-[11px]" data-testid="assessment-correction-history-item">
            <History size={11} className="text-sky-300 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-white/80">{c.qid}</span>
              <span className="text-white/50"> · </span>
              <span className="text-white/45">{c.previousAnswer || "—"}</span>
              {c.previousState && c.previousState !== "answered" && (
                <span className="text-white/35"> ({c.previousState})</span>
              )}
              <span className="text-sky-300 font-bold"> → {c.answer || "—"}</span>
              <div className="text-[10px] text-white/35">
                by {c.correctedBy || "teacher"}{c.correctedAt ? ` · ${c.correctedAt}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className="text-[11px] text-white/45" data-testid="assessment-correction-history-item">
            <span className="font-bold text-white/70">{String(c)}</span> corrected (legacy record — no detail stored)
          </div>
        ))}
    </div>
  );
}

/** One editable row inside the post-award Correction Workspace. Shows the
 * CURRENT decision (already reflects any prior correction) read-only, and
 * an inline override editor a teacher can open to change correctness +
 * points + a note — independent of the student's raw answer text (that
 * text and the original AI read stay untouched; see requirement 15). */
function QuestionOverrideRow({ detail, question, override, onChange }) {
  const [editing, setEditing] = useState(!!override);
  const maxPts = question?.points ?? detail.points ?? 0;

  const startEdit = () => {
    setEditing(true);
    if (!override) {
      onChange({ correct: !!detail.correct, points: detail.pointsEarned ?? 0, note: "" });
    }
  };
  const stopEdit = () => {
    setEditing(false);
    onChange(null);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 space-y-1.5"
         data-testid="assessment-correction-override-row" data-qid={detail.qid}>
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-[11.5px] text-white/70 truncate">{detail.prompt}</span>
        <span className="text-[10.5px] text-white/40 tnum">
          {detail.givenAnswer ?? "—"} <span className="text-white/25">/ {detail.correctAnswer}</span>
        </span>
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold tnum ${
          detail.correct ? "text-emerald-300" : "text-red-300"
        }`}>
          {detail.correct ? <Check size={11} /> : <XIcon size={11} />} {detail.pointsEarned}/{maxPts}
          {detail.teacherOverride && (
            <span className="ml-0.5 text-[9px] font-bold uppercase px-1 py-px rounded-full border text-sky-300 border-sky-400/40 bg-sky-400/10">
              corrected
            </span>
          )}
        </span>
        {!editing ? (
          <button onClick={startEdit} data-testid="assessment-override-open-button"
                  aria-label={`Correct ${detail.prompt}`}
                  className="p-1 text-white/35 hover:text-amber-300">
            <ShieldAlert size={12} />
          </button>
        ) : (
          <button onClick={stopEdit} data-testid="assessment-override-close-button"
                  aria-label="Cancel this correction" className="p-1 text-white/35 hover:text-white/70">
            <XIcon size={12} />
          </button>
        )}
      </div>
      {editing && override && (
        <div className="flex flex-wrap items-center gap-2 pt-1 pl-1 border-t border-white/5"
             data-testid="assessment-override-editor">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-white/70">
            <input type="checkbox" checked={!!override.correct}
                   data-testid="assessment-override-correct-checkbox"
                   className="accent-emerald-400"
                   onChange={(e) => {
                     const correct = e.target.checked;
                     onChange({ ...override, correct, points: correct ? (override.points || maxPts) : 0 });
                   }} />
            Correct
          </label>
          <label className="inline-flex items-center gap-1 text-[11px] text-white/50">
            Points
            <input type="number" step="0.5" min={0} max={maxPts} value={override.points}
                   data-testid="assessment-override-points-input"
                   onChange={(e) => onChange({ ...override, points: e.target.value === "" ? "" : Number(e.target.value) })}
                   className="w-16 rounded bg-black/30 border border-white/10 px-1.5 py-0.5 text-white text-[11px]" />
            <span className="text-white/30">/ {maxPts}</span>
          </label>
          <input value={override.note || ""} placeholder="Reason for this question (optional)"
                 data-testid="assessment-override-note-input"
                 onChange={(e) => onChange({ ...override, note: e.target.value })}
                 className="flex-1 min-w-[140px] rounded bg-black/30 border border-white/10 px-2 py-0.5 text-white text-[11px]" />
        </div>
      )}
    </div>
  );
}

/** The post-award correction audit trail — distinct from the pre-award
 * `CorrectionHistory` above (that one shows raw-answer-text edits before
 * an award ever happened; this shows point/correctness corrections made
 * AFTER an award, each tied to a real wallet adjustment or an explicit
 * zero). Fetched lazily so viewing a never-corrected submission costs
 * nothing extra. */
function PostAwardCorrectionHistory({ corrections }) {
  if (!corrections || corrections.length === 0) {
    return <p className="text-[11px] text-white/35 px-1">No corrections have been applied yet.</p>;
  }
  return (
    <div className="space-y-2" data-testid="assessment-postaward-history">
      {corrections.map((c) => (
        <div key={c.correctionId} className="rounded-lg border border-sky-400/20 bg-sky-400/[0.04] p-2.5 space-y-1"
             data-testid="assessment-postaward-history-item">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-white/80">
              {c.originalPoints}<span className="text-white/30"> pts → </span>{c.correctedPoints}
              <span className="text-white/30"> pts</span>
            </span>
            <span className={`font-bold tnum ${c.walletAdjustment > 0 ? "text-emerald-300" : c.walletAdjustment < 0 ? "text-red-300" : "text-white/40"}`}
                  data-testid="assessment-postaward-history-adjustment">
              {c.walletAdjustment > 0 ? "+" : ""}{c.walletAdjustment} wallet
            </span>
          </div>
          <div className="text-[10.5px] text-white/45">
            {CORRECTION_REASONS.find((r) => r.value === c.reason)?.label || c.reason}
            {c.reasonNote ? ` — ${c.reasonNote}` : ""}
          </div>
          {/* Wallet balance never goes negative (product decision) — a
              downward correction the student had already partly/fully
              spent recovers only what's actually there; the unrecovered
              remainder is recorded here, never silently dropped. */}
          {c.walletShortfall > 0 && (
            <div className="text-[10.5px] text-amber-300/85" data-testid="assessment-postaward-history-shortfall">
              {c.walletShortfall} pt(s) could not be recovered — student's balance was already below the reversal amount.
            </div>
          )}
          <div className="text-[10px] text-white/35">
            by {c.teacherEmail || "teacher"}{c.createdAt ? ` · ${c.createdAt}` : ""}
            {c.notifiedAt ? " · student notified" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The Reverse Review / Post-Award Correction workspace. Only ever
 * rendered for an ALREADY-AWARDED submission (see SubmissionDetail).
 * Gated behind an explicit, distinctly-styled confirmation before any
 * editing surface appears — this must never look like a routine Edit
 * action (requirement 1). */
function CorrectionWorkspace({ submission, questions, onApplied }) {
  const [reopened, setReopened] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [staleError, setStaleError] = useState(false);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // Generated ONCE per correction attempt and reused across retries of
  // the SAME Apply click (network failure, double-click) — a NEW attempt
  // (re-opening the workspace, or "Apply" after a successful prior
  // correction) gets a fresh token. This is the idempotency key the
  // backend keys the wallet adjustment on.
  const clientTokenRef = useRef(null);

  const details = submission?.score?.details || [];
  const preview = previewCorrectedScore(submission?.score, overrides, questions);
  const changedQids = Object.keys(overrides);
  const hasChanges = changedQids.length > 0;
  const diff = Math.round(((preview.pointsEarned ?? 0) - (submission?.award?.pointsCredited ?? 0)) * 1000) / 1000;

  const loadHistory = useCallback(() => {
    if (!submission?.submissionId) return;
    listAssessmentCorrections(submission.submissionId)
      .then((res) => setHistory(res.corrections || []))
      .catch(() => setHistory([]));
  }, [submission?.submissionId]);

  const setOverride = (qid, value) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === null) delete next[qid];
      else next[qid] = value;
      return next;
    });
  };

  const reset = () => {
    setReopened(false);
    setConfirming(false);
    setOverrides({});
    setReason("");
    setReasonNote("");
    setReviewing(false);
    setError(null);
    setStaleError(false);
    clientTokenRef.current = null;
  };

  const apply = async () => {
    if (!reason || (reason === "other" && !reasonNote.trim())) {
      setError("Choose a reason (and a note, if 'Other') before applying.");
      return;
    }
    if (!clientTokenRef.current) {
      clientTokenRef.current = (window.crypto?.randomUUID?.() || `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    }
    setApplying(true);
    setError(null);
    setStaleError(false);
    try {
      const corrections = changedQids.map((qid) => ({
        qid, correct: !!overrides[qid].correct, points: overrides[qid].points, note: overrides[qid].note || undefined,
      }));
      await applyAssessmentCorrection(submission.submissionId, {
        corrections, reason, reasonNote,
        clientToken: clientTokenRef.current,
        expectedVersion: submission.correctionVersion ?? 0,
      });
      reset();
      loadHistory();
      setShowHistory(true);
      onApplied?.();
    } catch (e) {
      const msg = e.message || "Correction failed.";
      if (/409/.test(msg) || /corrected since you opened it/i.test(msg)) {
        // The backend's real detail (e.g. "you have version 0, current is
        // 1") is the only way to tell a genuine concurrent edit apart from
        // a version-tracking bug — never collapse it to the generic copy
        // alone, the way this used to silently discard it.
        setStaleError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setApplying(false);
    }
  };

  if (!reopened) {
    if (!confirming) {
      return (
        <button onClick={() => setConfirming(true)} data-testid="assessment-reopen-correction-button"
                className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-amber-200 border border-amber-400/40 bg-amber-400/[0.06] rounded-lg px-2.5 py-1.5 hover:bg-amber-400/10">
          <ShieldAlert size={12} /> Review & Correct
        </button>
      );
    }
    return (
      <div className="rounded-lg border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2.5 space-y-2"
           data-testid="assessment-reopen-confirm">
        <p className="text-[11.5px] text-amber-100/90 leading-relaxed">
          This assessment has already been awarded. Reopening it creates a correction record
          and may change the student's score and points.
        </p>
        <div className="flex gap-2">
          <button onClick={() => { setConfirming(false); setReopened(true); loadHistory(); }}
                  data-testid="assessment-reopen-confirm-button"
                  className="text-[11px] font-bold text-black bg-amber-400 rounded-lg px-2.5 py-1.5">
            Continue
          </button>
          <button onClick={() => setConfirming(false)} data-testid="assessment-reopen-cancel-button"
                  className="text-[11px] font-semibold text-white/50 border border-white/15 rounded-lg px-2.5 py-1.5">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.03] p-3 space-y-3"
         data-testid="assessment-correction-workspace">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-amber-200">
          <ShieldAlert size={13} /> Correction Workspace
        </span>
        <button onClick={reset} data-testid="assessment-correction-exit-button"
                className="text-[10.5px] font-semibold text-white/40 hover:text-white/70">
          Close
        </button>
      </div>

      {/* Original vs Current — for a submission already corrected once
          before, "current" already reflects that prior correction, which
          is NOT the same thing as the true original AI-scored result.
          submission.originalAward is the immutable snapshot from the
          moment of the FIRST correction; when it's absent (this would be
          the first correction ever), original and current are identical
          and are shown as such, honestly, not hidden. */}
      <div className="grid grid-cols-2 gap-2" data-testid="assessment-correction-original-vs-current">
        <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <div className="text-[9.5px] font-bold uppercase tracking-wide text-white/35 mb-0.5">
            Original {submission?.originalAward ? "(before any correction)" : "(this is the first correction)"}
          </div>
          <div className="text-[12.5px] font-bold text-white tnum">
            {(submission?.originalAward?.score ?? submission?.score)?.correct}/{(submission?.originalAward?.score ?? submission?.score)?.total}
            <span className="text-white/40 font-semibold text-[11px] ml-1.5">
              {submission?.originalAward?.pointsCredited ?? submission?.award?.pointsCredited} pts
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.05] px-2.5 py-2">
          <div className="text-[9.5px] font-bold uppercase tracking-wide text-sky-300/70 mb-0.5">Current</div>
          <div className="text-[12.5px] font-bold text-white tnum">
            {submission?.score?.correct}/{submission?.score?.total}
            <span className="text-sky-300/80 font-semibold text-[11px] ml-1.5">
              {submission?.award?.pointsCredited} pts
            </span>
          </div>
        </div>
      </div>

      {staleError && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/[0.08] px-2.5 py-2 flex items-center justify-between gap-2"
             data-testid="assessment-correction-stale-error">
          <span className="text-[11px] text-red-200" data-testid="assessment-correction-stale-error-detail">
            {typeof staleError === "string" && staleError
              ? staleError
              : "This submission was corrected since you opened it — your view is out of date."}
          </span>
          <button onClick={() => { reset(); onApplied?.(); }} data-testid="assessment-correction-refresh-button"
                  className="text-[10.5px] font-bold text-white bg-red-400/70 rounded px-2 py-1 flex-shrink-0">
            Refresh
          </button>
        </div>
      )}

      {!reviewing ? (
        <>
          <div className="space-y-1.5" data-testid="assessment-override-list">
            {details.map((d) => (
              <QuestionOverrideRow
                key={d.qid} detail={d}
                question={(questions || []).find((q) => q.qid === d.qid)}
                override={overrides[d.qid] || null}
                onChange={(v) => setOverride(d.qid, v)}
              />
            ))}
          </div>
          <button onClick={() => setReviewing(true)} disabled={!hasChanges}
                  data-testid="assessment-correction-review-button"
                  className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-bold text-black bg-amber-400 rounded-lg py-2 disabled:opacity-40">
            Review changes <ArrowRight size={13} />
          </button>
          {!hasChanges && (
            <p className="text-[10.5px] text-white/35 text-center">
              Open a question above (the shield icon) to correct it.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-3" data-testid="assessment-correction-compare">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2.5" data-testid="assessment-correction-before">
              <div className="text-[9.5px] font-bold uppercase tracking-wide text-white/35 mb-1">Before</div>
              <div className="text-[13px] font-bold text-white tnum">{submission.score.correct}/{submission.score.total}</div>
              <div className="text-[11px] text-white/50 tnum">{submission.award?.pointsCredited} pts</div>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-2.5" data-testid="assessment-correction-after">
              <div className="text-[9.5px] font-bold uppercase tracking-wide text-amber-300/70 mb-1">After</div>
              <div className="text-[13px] font-bold text-white tnum">{preview.correct}/{preview.total}</div>
              <div className="text-[11px] font-bold tnum" style={{ color: diff >= 0 ? "#7dd08a" : "#f08787" }}>
                {preview.pointsEarned} pts
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11.5px]"
               data-testid="assessment-correction-change-summary">
            <span className="font-bold" style={{ color: diff > 0 ? "#7dd08a" : diff < 0 ? "#f08787" : "#ffffff80" }}>
              {diff > 0 ? "+" : ""}{diff} point(s)
            </span>
            <span className="text-white/45"> net wallet change · {changedQids.length} question(s) changed</span>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                      data-testid="assessment-correction-reason-select"
                      className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-[11.5px] text-white">
                <option value="">Select a reason…</option>
                {CORRECTION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)}
                     placeholder={reason === "other" ? "Required for 'Other'" : "Note (optional)"}
                     data-testid="assessment-correction-reason-note"
                     className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-[11.5px] text-white" />
            </div>
            {error && <p className="text-[11px] text-red-300">{error}</p>}
            <div className="flex gap-2">
              <button onClick={apply} disabled={applying}
                      data-testid="assessment-correction-apply-button"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12px] font-bold text-black bg-amber-400 rounded-lg py-2 disabled:opacity-50">
                {applying ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />} Apply Correction
              </button>
              <button onClick={() => setReviewing(false)} disabled={applying}
                      data-testid="assessment-correction-back-button"
                      className="px-3 py-2 rounded-lg text-[11.5px] font-semibold text-white/60 border border-white/15">
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1 border-t border-white/5">
        <button onClick={() => setShowHistory((v) => !v)} data-testid="assessment-postaward-history-toggle"
                className="inline-flex items-center gap-1 text-[10.5px] font-bold text-sky-300 hover:text-sky-200">
          <ScrollText size={11} /> {showHistory ? "Hide" : "Show"} correction history{history ? ` (${history.length})` : ""}
        </button>
        {showHistory && (
          <div className="mt-2">
            <PostAwardCorrectionHistory corrections={history} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Staging diagnostic: one real Gemini 2.5 Pro read of a worksheet,
 * compared per-qid against the deterministic baseline (the answer key).
 * Read-only — creates no submission, moves no points. The backend returns
 * 503 in environments without a real Gemini credential. */
function ExtractionCheckPanel({ assessment }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await runAssessmentExtractionCheck(assessment.assessmentId, file));
    } catch (e) {
      setErr(e.message || "Extraction check failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="assessment-extraction-check-panel">
      <button onClick={() => setOpen((v) => !v)} data-testid="assessment-extraction-check-toggle"
              className="w-full flex items-center justify-between gap-2 text-left">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-white">
          <FlaskConical size={14} className="text-purple-300" /> Real Extraction Check
          <span className="text-[9.5px] font-bold uppercase px-1.5 py-px rounded-full border text-purple-300 border-purple-400/40 bg-purple-400/10">staging</span>
        </span>
        {open ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-white/45">
            Runs ONE real Gemini 2.5 Pro read of an uploaded worksheet and compares each
            question against the deterministic baseline (the answer key). Diagnostic only —
            no submission is created and no points move.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                   onChange={(e) => setFile(e.target.files?.[0] || null)}
                   data-testid="assessment-extraction-check-file-input"
                   className="text-[11px] text-white/60 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-white" />
            <button onClick={run} disabled={!file || busy}
                    data-testid="assessment-extraction-check-run-button"
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-black bg-purple-300 rounded-lg px-3 py-1.5 disabled:opacity-40">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />} Run check
            </button>
          </div>
          {err && <div className="text-[11.5px] text-red-300" data-testid="assessment-extraction-check-error">{err}</div>}
          {result && (
            <div className="space-y-2" data-testid="assessment-extraction-check-result">
              <div className="text-[11.5px] text-white/70">
                <span className="font-bold text-white">{result.matches} / {result.total}</span> match the baseline
                {" "}· Model: <span className="font-semibold text-purple-300">{result.model}</span>
                {result.verification?.checkedQids?.length
                  ? ` · verification re-checked ${result.verification.checkedQids.length}`
                  : ""}
              </div>
              <div className="text-[11px] text-white/50">
                Score preview: {result.scorePreview.correct}/{result.scorePreview.total} correct
                {" "}· {result.scorePreview.pointsEarned} pts calculated
                {result.scorePreview.needsReview ? " · would need review" : ""}
              </div>
              {result.mismatches?.length > 0 && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-2 space-y-1">
                  {result.mismatches.map((m) => (
                    <div key={m.qid} className="text-[11px] text-white/70" data-testid="assessment-extraction-check-mismatch">
                      <span className="font-bold">{m.prompt}</span>: baseline
                      {" "}<span className="text-white/45">{m.baseline}</span> → real
                      {" "}<span className="text-red-300 font-bold">{m.real}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.unreadable?.length > 0 && (
                <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2 space-y-1">
                  {result.unreadable.map((u) => (
                    <div key={u.qid} className="text-[11px] text-white/70" data-testid="assessment-extraction-check-unreadable">
                      <span className="font-bold">{u.prompt}</span>: {u.answerState}
                      {typeof u.confidence === "number" ? ` (${Math.round(u.confidence * 100)}%)` : ""}
                    </div>
                  ))}
                </div>
              )}
              {result.mismatches?.length === 0 && result.unreadable?.length === 0 && (
                <div className="text-[11px] text-emerald-300">Perfect agreement with the baseline.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function SubmissionDetail({ submission, assessment, onChanged }) {
  const [showHistory, setShowHistory] = useState(false);
  const details = submission?.score?.details || [];
  const extraction = submission?.extraction;
  const corrections = submission?.teacherCorrections || [];
  const correctionCount = corrections.length;
  const locked = submission?.status === "awarded";
  return (
    <div className="mt-2 pt-2 border-t border-white/10 space-y-2" data-testid="assessment-submission-detail">
      {extraction && (
        <div className="text-[10.5px] text-white/40" data-testid="assessment-submission-extraction-meta">
          Engine: {extraction.engine || "—"}{extraction.model ? ` · Model: ${extraction.model}` : ""}
          {extraction.extractedAt ? ` · Extracted: ${extraction.extractedAt}` : ""} · Gemini returned {extraction.rawAnswerCount} answer(s),
          {" "}{extraction.normalizedAnswerCount} matched a known question.
          {extraction.verification?.checkedQids?.length
            ? ` Verification pass re-checked ${extraction.verification.checkedQids.length} question(s).`
            : ""}
        </div>
      )}
      {submission?.mediaRef && (
        <a href={submission.mediaRef} target="_blank" rel="noreferrer"
           data-testid="assessment-view-original-paper"
           className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 hover:text-sky-200">
          <ExternalLink size={11} /> View original paper (R2 evidence)
        </a>
      )}
      {correctionCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="text-[10.5px] text-sky-300/80" data-testid="assessment-corrections-count">
              {correctionCount} teacher correction(s) applied — original Gemini extraction preserved.
            </div>
            <button onClick={() => setShowHistory((v) => !v)}
                    data-testid="assessment-correction-history-toggle"
                    className="inline-flex items-center gap-1 text-[10.5px] font-bold text-sky-300 hover:text-sky-200">
              <History size={10} /> {showHistory ? "Hide history" : `History (${correctionCount})`}
            </button>
          </div>
          {showHistory && <CorrectionHistory corrections={corrections} />}
        </div>
      )}
      {details.length === 0 ? (
        <div className="text-[11px] text-white/35">No extracted-answer detail available.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-white/40 text-left">
                <th className="font-medium pr-2 py-1">Prompt</th>
                <th className="font-medium pr-2 py-1">Given</th>
                <th className="font-medium pr-2 py-1">Correct</th>
                <th className="font-medium pr-2 py-1">Conf</th>
                <th className="font-medium pr-2 py-1"></th>
                <th className="font-medium py-1"></th>
              </tr>
            </thead>
            <tbody>
              {details.map((d) => (
                <DetailRow key={d.qid} d={d} submissionId={submission.submissionId}
                           locked={locked} onCorrected={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {locked && (
        <div className="pt-1">
          <CorrectionWorkspace submission={submission} questions={assessment?.questions}
                                onApplied={onChanged} />
        </div>
      )}
    </div>
  );
}

/** Proves "AWARDED" is real, not just a status label. `submission.award`
 * is the exact outcome persisted by the backend at credit time — the
 * WALLET line reflects the real points_wallets.credit() result (the
 * actual money movement); the legacy-balance line and notification line
 * are separate, honestly-tracked downstream concerns that can fail
 * without the wallet credit ever being reversed. A failed legacy sync
 * offers "Retry sync", which re-attempts ONLY that leg — never a second
 * wallet credit. */
function AwardProof({ submission, onSynced }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const award = submission?.award;
  if (submission?.status !== "awarded" || !award) return null;

  const retrySync = async () => {
    setBusy(true);
    setErr(null);
    try {
      await retryAssessmentGasSync(submission.submissionId);
      onSynced?.();
    } catch (e) {
      setErr(e.message || "Retry failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-white/10 space-y-1" data-testid="assessment-award-proof">
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
        <Wallet size={12} />
        {award.pointsCredited} pts credited · student balance updated
        {typeof award.balanceAfter === "number" ? ` (now ${award.balanceAfter})` : ""}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/50">
        <Bell size={12} />
        Notification {award.notifiedAt ? "sent" : "pending"}
      </div>
      {award.gasSynced === false ? (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-300" data-testid="assessment-award-gas-sync-failed">
          <AlertTriangle size={12} />
          Legacy points-pill sync failed{award.gasSyncError ? ` (${award.gasSyncError})` : ""} — the
          real wallet credit above is unaffected.
          <button onClick={retrySync} disabled={busy}
                  data-testid="assessment-retry-gas-sync-button"
                  className="inline-flex items-center gap-1 text-amber-200 underline disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Retry sync
          </button>
        </div>
      ) : award.gasSynced === true ? (
        <div className="flex items-center gap-1.5 text-[11px] text-white/40">
          <Check size={12} className="text-emerald-400" /> Legacy points pill synced
        </div>
      ) : null}
      {err && <p className="text-[11px] text-red-300">{err}</p>}
    </div>
  );
}

// ── answer-key extraction + create flow ───────────────────────────────────
function CreateAssessmentPanel({ onCreated }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [group, setGroup] = useState("");
  const [questions, setQuestions] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setErr(null);
    setExtracting(true);
    try {
      const result = await extractAssessmentAnswerKey(file);
      setQuestions(result.questions || []);
      if (!title) setTitle(file.name.replace(/\.[a-z0-9]+$/i, ""));
    } catch (e) {
      setErr(e.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const updateQuestion = (i, patch) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };

  const save = async (publish) => {
    if (!title.trim() || questions.length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title, subject, group,
        questions: questions.map((q, i) => ({
          qid: q.qid || `q${i + 1}`,
          prompt: q.prompt,
          correctAnswer: q.correctAnswer,
          points: Number(q.points) || 1,
        })),
        publish,
      };
      await createAssessment(payload);
      setTitle(""); setSubject(""); setGroup(""); setQuestions([]);
      onCreated?.();
    } catch (e) {
      setErr(e.message || "Could not save assessment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3" data-testid="assessment-create-panel">
      <div className="flex items-center gap-2 text-white font-bold text-[13.5px]">
        <Plus size={15} /> New Assessment
      </div>
      <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-4 text-[12.5px] text-white/55 cursor-pointer hover:border-white/40">
        <Upload size={14} />
        {extracting ? "Extracting…" : "Upload an answer key (image, PDF, or .docx)"}
        <input type="file" className="hidden" accept="image/*,application/pdf,.docx"
               data-testid="assessment-key-file-input"
               onChange={(e) => handleFile(e.target.files?.[0])} disabled={extracting} />
      </label>
      {err && <p className="text-[12px] text-red-300">{err}</p>}

      {questions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
                   data-testid="assessment-title-input"
                   className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-[13px] text-white" />
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)"
                   data-testid="assessment-subject-input"
                   className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-[13px] text-white" />
          </div>
          <label className="flex items-center gap-2 text-[11.5px] text-white/55">
            Assign to schedule
            <select value={group} onChange={(e) => setGroup(e.target.value)}
                    data-testid="assessment-group-select"
                    className="rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-[12.5px] text-white">
              <option value="">Every student</option>
              <option value="A">Schedule A only</option>
              <option value="B">Schedule B only</option>
            </select>
          </label>
          <div className="max-h-64 overflow-y-auto space-y-1.5" data-testid="assessment-question-editor">
            {questions.map((q, i) => (
              <div key={q.qid || i} className="flex items-center gap-1.5 text-[12px]">
                <span className="w-5 text-white/40">{i + 1}.</span>
                <input value={q.prompt || ""} onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                       className="flex-1 rounded bg-black/30 border border-white/10 px-2 py-1 text-white" />
                <input value={q.correctAnswer || q.answer || ""}
                       onChange={(e) => updateQuestion(i, { correctAnswer: e.target.value })}
                       className="w-24 rounded bg-black/30 border border-white/10 px-2 py-1 text-white" />
                <input type="number" step="0.5" value={q.points ?? 1}
                       onChange={(e) => updateQuestion(i, { points: e.target.value })}
                       className="w-14 rounded bg-black/30 border border-white/10 px-2 py-1 text-white" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => save(true)} disabled={saving}
                    data-testid="assessment-save-publish-button"
                    className="flex-1 py-2 rounded-lg text-[12.5px] font-bold text-black bg-amber-400 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin inline" /> : "Save & Publish"}
            </button>
            <button onClick={() => save(false)} disabled={saving}
                    data-testid="assessment-save-draft-button"
                    className="py-2 px-3 rounded-lg text-[12.5px] font-semibold text-white/70 border border-white/15">
              Save Draft
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── submissions review + award ────────────────────────────────────────────
function SubmissionsPanel({ assessment, onChanged }) {
  const [submissions, setSubmissions] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const refresh = useCallback(() => {
    if (!assessment) return;
    setLoading(true);
    listAssessmentSubmissions(assessment.assessmentId, statusFilter || undefined)
      .then((res) => setSubmissions(res.submissions || []))
      .catch((e) => setErr(e.message || "Failed to load submissions."))
      .finally(() => setLoading(false));
  }, [assessment, statusFilter]);

  useEffect(() => { refresh(); setSelectedIds(new Set()); }, [refresh]);

  if (!assessment) {
    return <div className="text-center text-white/40 text-[12.5px] py-10">Select an assessment to review submissions.</div>;
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const awardOne = async (submissionId) => {
    setBusyId(submissionId);
    setErr(null);
    try {
      await awardAssessmentSubmission(submissionId);
      refresh();
      onChanged?.();
    } catch (e) {
      setErr(e.message || "Award failed.");
    } finally {
      setBusyId(null);
    }
  };

  const awardSelected = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkAwardAssessmentSubmissions(Array.from(selectedIds));
      setSelectedIds(new Set());
      refresh();
      onChanged?.();
    } catch (e) {
      setErr(e.message || "Bulk award failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const removeOne = async (submissionId) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm("Delete this submission? The original paper in R2 will also be permanently deleted.")) return;
    setBusyId(submissionId);
    setErr(null);
    try {
      await deleteAssessmentSubmission(submissionId);
      refresh();
      onChanged?.();
    } catch (e) {
      setErr(e.message || "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const awardable = submissions.filter((s) => AWARDABLE_STATUSES.includes(s.status));

  return (
    <div className="space-y-3" data-testid="assessment-submissions-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {["", "needs_review", "scored", "reviewed", "awarded", "failed"].map((s) => (
            <button key={s || "all"} onClick={() => setStatusFilter(s)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border ${statusFilter === s ? "border-amber-400/50 text-amber-300 bg-amber-400/10" : "border-white/10 text-white/50"}`}>
              {s || "All"}
            </button>
          ))}
        </div>
        <button onClick={refresh} className="text-white/40 hover:text-white" aria-label="Refresh">
          <RefreshCcw size={14} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>

      {err && <p className="text-[12px] text-red-300">{err}</p>}

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2"
             data-testid="assessment-bulk-award-bar">
          <span className="text-[12.5px] font-semibold text-amber-200">{selectedIds.size} selected</span>
          <button onClick={awardSelected} disabled={bulkBusy}
                  data-testid="assessment-bulk-award-button"
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-black bg-amber-400 rounded-lg px-3 py-1.5 disabled:opacity-50">
            {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />} Award Points
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {submissions.map((s) => (
          <div key={s.submissionId} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-2"
               data-testid="assessment-submission-row">
            {/* identity row — always visible, never squeezed by the action
                cluster: whose worksheet this is comes first, full stop. */}
            <div className="flex items-center gap-2.5">
              <input type="checkbox" checked={selectedIds.has(s.submissionId)}
                     onChange={() => toggleSelect(s.submissionId)}
                     disabled={!AWARDABLE_STATUSES.includes(s.status)}
                     data-testid="assessment-submission-checkbox"
                     className="accent-amber-400 flex-shrink-0" />
              <button
                onClick={() => setExpandedId((id) => (id === s.submissionId ? null : s.submissionId))}
                data-testid="assessment-submission-expand-button"
                className="flex-1 min-w-0 text-left"
              >
                <StudentIdentity s={s} />
              </button>
              <StatusBadge status={s.status} />
            </div>

            {/* score summary — its own line so it can never crush the name
                above it into an unreadable truncated sliver. */}
            {s.score && (
              <div className="text-[11px] text-white/45 pl-[46px] tnum">
                {s.score.correct}/{s.score.total} correct · {s.score.scorePct}% · {s.score.pointsEarned} pts
                {s.status === "awarded" ? " · points awarded" : " · not yet awarded"}
              </div>
            )}
            {/* Extraction failures have no score to show — the real reason
                code (assessment_ai_provider.py's AssessmentAiError taxonomy,
                persisted server-side) is the only useful thing to surface
                here, so a teacher/admin can tell "AI genuinely couldn't
                read this photo" apart from a transient provider/network
                issue, instead of a bare unexplained "failed" badge. This
                pipeline has no anti-cheat logic — a failure is always a
                real technical extraction outcome, never a rejection verdict. */}
            {!s.score && s.status === "failed" && (
              <div className="text-[11px] text-red-300/70 pl-[46px]" data-testid="assessment-submission-failure-reason">
                Extraction failed{s.extractionError ? `: ${s.extractionError}` : " (no reason recorded)"}
              </div>
            )}

            {/* actions row */}
            <div className="flex items-center gap-2 pl-[46px] flex-wrap">
              {AWARDABLE_STATUSES.includes(s.status) && s.score && (
                <button onClick={() => awardOne(s.submissionId)} disabled={busyId === s.submissionId}
                        data-testid="assessment-award-button"
                        className="inline-flex items-center gap-1 text-[11.5px] font-bold text-black bg-amber-400 rounded-lg px-2.5 py-1.5 disabled:opacity-50">
                  {busyId === s.submissionId ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />} Award {s.score.pointsEarned} pts
                </button>
              )}
              {s.status === "awarded" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                  <Check size={14} /> awarded
                </span>
              )}
              {s.status === "needs_review" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                  <AlertTriangle size={13} /> needs review
                </span>
              )}
              <span className="flex-1" />
              {s.status !== "awarded" && (
                <button onClick={() => removeOne(s.submissionId)} disabled={busyId === s.submissionId}
                        aria-label="Delete submission" data-testid="assessment-delete-submission-button"
                        className="p-1.5 text-white/25 hover:text-red-400 disabled:opacity-50">
                  <Trash2 size={13} />
                </button>
              )}
              <button onClick={() => setExpandedId((id) => (id === s.submissionId ? null : s.submissionId))}
                      aria-label="Toggle detail" className="p-1.5 text-white/30 hover:text-white/60">
                {expandedId === s.submissionId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            <AwardProof submission={s} onSynced={refresh} />
            {expandedId === s.submissionId && (
              <SubmissionDetail submission={s} assessment={assessment}
                                 onChanged={() => { refresh(); onChanged?.(); }} />
            )}
          </div>
        ))}
        {!loading && submissions.length === 0 && (
          <div className="text-center text-white/35 text-[12px] py-8">No submissions yet.</div>
        )}
      </div>
      {awardable.length === 0 && submissions.length > 0 && (
        <p className="text-[11px] text-white/35">
          Submissions with a calculated score ("needs_review", "scored" or "reviewed") can be awarded.
        </p>
      )}
    </div>
  );
}

// ── edit an existing assessment: title/subject/schedule-targeting/status —
//    beyond what the PATCH route allowed before this round (it already
//    supported title/questions/publish/archive/status; subject and group
//    are genuinely new fields it did not accept previously). ──────────────
function EditAssessmentPanel({ assessment, onCancel, onSaved }) {
  const [title, setTitle] = useState(assessment.title || "");
  const [subject, setSubject] = useState(assessment.subject || "");
  const [group, setGroup] = useState(assessment.group || "");
  const [status, setStatus] = useState(assessment.status || "draft");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!title.trim()) { setErr("Title is required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const result = await updateAssessment(assessment.assessmentId, { title, subject, group, status });
      onSaved(result.assessment);
    } catch (e) {
      setErr(e.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4 space-y-3"
         data-testid="assessment-edit-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-bold text-[13px]">
          <Pencil size={14} /> Edit Assessment
        </div>
        <button onClick={onCancel} data-testid="assessment-edit-cancel" className="text-white/50 hover:text-white">
          <XIcon size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
               data-testid="assessment-edit-title-input"
               className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-[13px] text-white" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)"
               data-testid="assessment-edit-subject-input"
               className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-[13px] text-white" />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[11.5px] text-white/55">
          Schedule
          <select value={group} onChange={(e) => setGroup(e.target.value)}
                  data-testid="assessment-edit-group-select"
                  className="rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-[12.5px] text-white">
            <option value="">Every student</option>
            <option value="A">Schedule A only</option>
            <option value="B">Schedule B only</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11.5px] text-white/55">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}
                  data-testid="assessment-edit-status-select"
                  className="rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-[12.5px] text-white">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      {err && <p className="text-[12px] text-red-300">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
                data-testid="assessment-edit-save-button"
                className="py-1.5 px-4 rounded-lg text-[12px] font-bold text-black bg-amber-400 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin inline" /> : "Save Changes"}
        </button>
        <button onClick={onCancel} data-testid="assessment-edit-cancel-button"
                className="py-1.5 px-3 rounded-lg text-[12px] font-semibold text-white/70 border border-white/15">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AssessmentReviewStudio() {
  const [assessments, setAssessments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [editing, setEditing] = useState(null); // the assessment currently open in the edit panel
  const [confirmDelete, setConfirmDelete] = useState(null); // the assessment pending delete confirmation
  const [deleteBusyId, setDeleteBusyId] = useState(null);
  const [rowError, setRowError] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    apiListAssessments()
      .then((res) => setAssessments(res.assessments || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (assessment) => {
    setDeleteBusyId(assessment.assessmentId);
    setRowError(null);
    try {
      await deleteAssessment(assessment.assessmentId);
      if (selected?.assessmentId === assessment.assessmentId) setSelected(null);
      refresh();
    } catch (e) {
      setRowError(e.message || "Failed to delete assessment.");
    } finally {
      setDeleteBusyId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5" data-testid="assessment-review-studio">
      <div className="flex items-center gap-2 text-white font-bold text-[16px]">
        <ClipboardList size={18} className="text-amber-400" /> Assessment Lab
      </div>

      <CreateAssessmentPanel onCreated={refresh} />

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <div className="text-[13px] font-bold text-white">Assessments</div>
        {rowError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-300">
            {rowError}
          </div>
        )}
        {loading ? (
          <Loader2 size={16} className="animate-spin text-white/40" />
        ) : (
          <div className="space-y-1.5">
            {assessments.map((a) => (
              <div key={a.assessmentId}
                   data-testid="assessment-row"
                   className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${selected?.assessmentId === a.assessmentId ? "border-amber-400/50 bg-amber-400/10" : "border-white/10 bg-black/20"}`}>
                <button onClick={() => { setSelected(a); setShowAnswerKey(false); }}
                        data-testid="assessment-select-row"
                        className="flex-1 flex items-center justify-between text-left min-w-0">
                  <span className="text-[12.5px] font-semibold text-white truncate">{a.title}</span>
                  <span className="flex items-center gap-2 text-[10.5px] text-white/40 shrink-0 ml-2">
                    {a.status} · {a.totalPoints} pts
                    {a.group && (
                      <span className="rounded-full px-1.5 py-0.5 bg-amber-400/15 text-amber-300"
                            data-testid="assessment-group-badge">
                        {a.group}
                      </span>
                    )}
                    <ChevronDown size={12} />
                  </span>
                </button>
                <button onClick={() => setEditing(a)}
                        data-testid="assessment-edit-button"
                        title="Edit"
                        className="p-1.5 rounded-md text-white/50 hover:text-amber-300 hover:bg-white/5 shrink-0">
                  <Pencil size={13} />
                </button>
                <button onClick={() => setConfirmDelete(a)}
                        disabled={deleteBusyId === a.assessmentId}
                        data-testid="assessment-delete-button"
                        title="Delete"
                        className="p-1.5 rounded-md text-white/50 hover:text-red-400 hover:bg-white/5 shrink-0">
                  {deleteBusyId === a.assessmentId
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />}
                </button>
              </div>
            ))}
            {assessments.length === 0 && (
              <div className="text-center text-white/35 text-[12px] py-4">No assessments yet — create one above.</div>
            )}
          </div>
        )}

        {editing && (
          <EditAssessmentPanel
            assessment={editing}
            onCancel={() => setEditing(null)}
            onSaved={(updated) => {
              setEditing(null);
              if (selected?.assessmentId === updated.assessmentId) setSelected(updated);
              refresh();
            }}
          />
        )}

        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
               data-testid="assessment-delete-confirm"
               onClick={() => setConfirmDelete(null)}>
            <div onClick={(e) => e.stopPropagation()}
                 className="rounded-2xl max-w-sm w-full p-5 bg-[#0a0a0f] border border-white/15 space-y-3">
              <div className="flex items-center gap-2 text-white font-semibold text-[13.5px]">
                <AlertTriangle size={16} className="text-red-400" /> Delete assessment?
              </div>
              <p className="text-[12px] leading-relaxed text-white/60">
                "{confirmDelete.title}" will be removed from every student's list immediately.
                Existing student submissions for it are kept for record-keeping and are not deleted.
                This cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)}
                        data-testid="assessment-delete-confirm-cancel"
                        className="rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/70 border border-white/15">
                  Cancel
                </button>
                <button onClick={() => handleDelete(confirmDelete)}
                        disabled={deleteBusyId === confirmDelete.assessmentId}
                        data-testid="assessment-delete-confirm-confirm"
                        className="rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300 bg-red-500/15 border border-red-500/40">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {selected && (
          <div>
            <button onClick={() => setShowAnswerKey((v) => !v)}
                    data-testid="assessment-view-answer-key-button"
                    className="text-[11.5px] font-semibold text-amber-300 hover:text-amber-200">
              {showAnswerKey ? "Hide" : "View"} answer key ({(selected.questions || []).length} questions)
            </button>
            {showAnswerKey && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2"
                   data-testid="assessment-answer-key-view">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-white/40 text-left">
                      <th className="font-medium pr-2 py-1">#</th>
                      <th className="font-medium pr-2 py-1">Prompt</th>
                      <th className="font-medium pr-2 py-1">Correct Answer</th>
                      <th className="font-medium pr-2 py-1">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.questions || []).map((q, i) => (
                      <tr key={q.qid} className="border-t border-white/5" data-testid="assessment-answer-key-row">
                        <td className="pr-2 py-1 text-white/40">{i + 1}</td>
                        <td className="pr-2 py-1 text-white/70">{q.prompt}</td>
                        <td className="pr-2 py-1 text-white font-semibold">{q.correctAnswer}</td>
                        <td className="pr-2 py-1 text-white/50">{q.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && <ExtractionCheckPanel assessment={selected} />}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[13px] font-bold text-white mb-3">Submissions</div>
        <SubmissionsPanel assessment={selected} onChanged={refresh} />
      </div>
    </div>
  );
}
