/**
 * SubmitAssessmentModal.jsx — upload a photo/PDF of a completed paper
 * worksheet and see it scored against the teacher's answer key.
 *
 * Phase machine (mirrors PurchaseLessonModal.jsx's proven shape): pick ->
 * preview -> uploading -> result (scored/needsReview) -> error (including
 * a first-class "already submitted" 409 state). The backend
 * (assessment_tools.py) is the ONLY authority on scoring and status —
 * this component never computes or fakes a score locally, it only
 * renders whatever the server returns.
 *
 * Three entry points converge on the SAME single-file pipeline (2026-08
 * one-device fix): "Take Photo" forces capture="environment"; "Choose
 * from Photos" and "Upload a File" omit `capture` so the OS's normal
 * picker opens — on iOS Safari a forced capture attribute makes it
 * impossible to pick an existing photo. The backend route
 * (`POST /student/assessments/submit`) takes exactly one file, so this
 * stays single-file by design.
 *
 * ACCEPTED_TYPES mirrors assessment_tools.py's SUBMISSION_CONTENT_TYPES
 * exactly (jpeg/png/webp/heic/pdf) — offering a type the pipeline can't
 * process would mean accepting it here and failing it later.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Loader2, Check, AlertTriangle, Camera, Image as ImageIcon, FileText, FileUp,
  ScanLine, ListChecks, Calculator, ShieldCheck, ChevronRight,
} from "lucide-react";
import { submitAssessment } from "./assessmentApi";
import { fmtPts, GOLD } from "./lifecycle";
import useBodyScrollLock from "./useBodyScrollLock";
import "./assessments.css";

// The honest, real pipeline stages (the backend does upload -> Gemini
// reading -> deterministic checking -> scoring in one request): the UI
// advances through them on gentle timers while the request is in flight
// and only ever claims SUBMITTED once the server actually responds.
const PROGRESS_STAGES = [
  { key: "uploading", label: "Uploading your worksheet", Icon: FileUp },
  { key: "reading", label: "Reading your answers", Icon: ScanLine },
  { key: "checking", label: "Checking against the answer key", Icon: ListChecks },
  { key: "calculating", label: "Calculating your score", Icon: Calculator },
];
const STAGE_ADVANCE_MS = [1400, 3200, 3000];

function SubmissionProgress() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= PROGRESS_STAGES.length - 1) return undefined;
    const t = setTimeout(() => setStage((s) => s + 1), STAGE_ADVANCE_MS[stage] || 2500);
    return () => clearTimeout(t);
  }, [stage]);
  const pct = ((stage + 1) / (PROGRESS_STAGES.length + 1)) * 100;
  return (
    <div className="py-4 space-y-4" data-testid="assessment-submit-uploading" aria-live="polite">
      <div className="asmt-progress-track">
        <div className="asmt-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-2.5">
        {PROGRESS_STAGES.map((s, i) => {
          const { Icon } = s;
          const done = i < stage;
          const active = i === stage;
          return (
            <div key={s.key}
                 data-testid={`assessment-submit-stage-${s.key}`}
                 className={`asmt-stage-row flex items-center gap-3 ${active ? "" : done ? "opacity-70" : "opacity-35"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "asmt-stage-done" : active ? "asmt-stage-icon-active" : ""}`}
                   style={{
                     background: done ? "rgba(125,208,138,0.16)" : "rgba(212,168,67,0.14)",
                     border: `1px solid ${done ? "rgba(125,208,138,0.45)" : "rgba(212,168,67,0.35)"}`,
                   }}>
                {done
                  ? <Check size={14} className="text-emerald-400" strokeWidth={3} />
                  : <Icon size={14} style={{ color: GOLD }} className={active ? "animate-pulse" : undefined} />}
              </div>
              <div className={`text-[12.5px] ${active ? "font-bold text-white" : "font-semibold text-white/55"}`}>
                {s.label}{active ? "…" : ""}
              </div>
              {active && <Loader2 size={13} className="animate-spin ml-auto" style={{ color: GOLD }} />}
            </div>
          );
        })}
      </div>
      <div className="text-center text-[11px] text-white/40">
        Gemini is reading your physical worksheet — this can take a little while.
      </div>
    </div>
  );
}

// Mirrors assessment_tools.py's SUBMISSION_CONTENT_TYPES exactly — the
// real, verified set the backend will accept and Gemini can process for a
// student submission. Do not add a type here without confirming the
// backend accepts it first.
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "application/pdf"];
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic";
const ALL_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;
const MAX_BYTES = 25 * 1024 * 1024;

const TYPE_LABELS = {
  "image/jpeg": "JPEG photo", "image/jpg": "JPEG photo", "image/png": "PNG photo",
  "image/webp": "WEBP photo", "image/heic": "HEIC photo", "application/pdf": "PDF document",
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IdentityStrip({ assessment }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="assessment-submit-identity-strip">
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/5 border border-white/10 flex items-center justify-center">
        <FileUp size={15} className="text-white/30" />
      </div>
      <div className="min-w-0 text-left">
        <div className="text-[12.5px] font-semibold text-white/70 truncate">{assessment.title}</div>
        {assessment.totalPoints !== undefined && (
          <div className="text-[10.5px] text-white/40 tnum">
            {Array.isArray(assessment.questions) ? `${assessment.questions.length} questions · ` : ""}{fmtPts(assessment.totalPoints)} pts
          </div>
        )}
      </div>
    </div>
  );
}

/** One of the three "how would you like to submit" entry rows — each is
 * just a differently-configured hidden <input type=file>. */
function EntryRow({ icon: Icon, title, subtitle, accept, capture, onFile, testId }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} capture={capture}
             className="hidden" data-testid={`${testId}-input`}
             onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <button onClick={() => ref.current?.click()} data-testid={testId}
              className="asmt-entry-row eduhub-tap w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-left transition-colors">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: "rgba(212,168,67,0.14)", border: "1px solid rgba(212,168,67,0.3)" }}>
          <Icon size={16} style={{ color: GOLD }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-white">{title}</div>
          <div className="text-[11.5px] text-white/50">{subtitle}</div>
        </div>
        <ChevronRight size={14} className="text-white/25 flex-shrink-0" />
      </button>
    </>
  );
}

export default function SubmitAssessmentModal({ open, assessment, onClose, onSubmitted, onViewResults, onDuplicate }) {
  const [phase, setPhase] = useState("pick"); // pick | preview | uploading | result | error
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [error, setError] = useState(null);
  const cardRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase("pick"); setFile(null); setPreviewUrl(null); setFileError(null);
      setSubmission(null); setError(null); submittingRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    cardRef.current?.focus?.();
    const onKeyDown = (e) => {
      if (e.key === "Escape" && phase !== "uploading") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, phase, onClose]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useBodyScrollLock(open);

  if (!open || !assessment) return null;

  const handleFile = (f) => {
    if (!f) return; // student cancelled the native picker — stay put, no error
    setFileError(null);
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setFileError("This file type isn't supported yet. Please choose a JPG, PNG, WEBP, or HEIC photo, or a PDF.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError("That file is too large (max 25 MB).");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setPhase("preview");
  };

  const removeFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setPhase("pick");
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !file) return;
    submittingRef.current = true;
    setError(null);
    setPhase("uploading");
    try {
      const result = await submitAssessment(assessment.assessmentId, file);
      if (result?.ok) {
        setSubmission(result.submission);
        try { if (navigator.vibrate) navigator.vibrate([16, 30, 22]); } catch { /* unsupported */ }
        setPhase("result");
        onSubmitted?.(result.submission);
      } else {
        setError({ message: "Your worksheet could not be processed. Please try again." });
        setPhase("error");
      }
    } catch (e) {
      // 409 = the backend's duplicate-submission guard: this student already
      // has a live submission for this assessment. That's a first-class
      // state (retrying would 409 forever), not a generic error.
      setError({ message: e?.message || "Something went wrong. Please try again.", duplicate: e?.status === 409 });
      setPhase("error");
    } finally {
      submittingRef.current = false;
    }
  };

  const closable = phase !== "uploading";

  // Portal to <body>: the app shell's bottom nav lives at z-[400] in the
  // root stacking context — an inline overlay can never reliably sit above
  // it from inside the page subtree (same escape hatch as WelcomeOverlay).
  return createPortal(
    <div className="asmt-theme asmt-modal-overlay fixed inset-0 z-[500] flex items-end sm:items-center justify-center px-0 sm:px-6 overflow-hidden"
         style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
         data-testid="assessment-submit-modal"
         onClick={() => { if (closable) onClose?.(); }}>
      <div ref={cardRef} tabIndex={-1}
           role="dialog" aria-modal="true" aria-labelledby="assessment-submit-heading"
           className="asmt-modal-card asmt-sheet-in relative w-full sm:max-w-sm max-w-full bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-2xl space-y-4 outline-none overflow-x-hidden"
           style={{
             paddingTop: "max(1.25rem, env(safe-area-inset-top))",
             paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
             paddingRight: "max(1.25rem, env(safe-area-inset-right))",
             paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
             maxHeight: "min(680px, calc(100dvh - 24px - env(safe-area-inset-top)))",
             overflowY: "auto",
             overflowX: "hidden",
           }}
           onClick={(e) => e.stopPropagation()}>
        {closable && (
          <button onClick={onClose} aria-label="Close" data-testid="assessment-submit-close-button"
                  className="absolute top-3.5 right-3.5 z-10 p-1.5 text-white/45 hover:text-white">
            <X size={16} />
          </button>
        )}

        <div key={phase} className="asmt-phase-in space-y-4">
          {phase === "pick" && (
            <div className="space-y-4 pt-1">
              <div className="text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
                  Submit your worksheet
                </div>
                <h2 id="assessment-submit-heading" className="font-display text-[16px] font-bold text-white leading-snug break-words min-w-0 [overflow-wrap:anywhere]">
                  {assessment.title}
                </h2>
                <p className="text-[12.5px] text-white/55">
                  Choose how you'd like to submit your completed work.
                </p>
              </div>

              <div className="space-y-2">
                <EntryRow icon={Camera} title="Take Photo" subtitle="Capture your worksheet now."
                          accept={IMAGE_ACCEPT} capture="environment" onFile={handleFile}
                          testId="assessment-submit-take-photo" />
                <EntryRow icon={ImageIcon} title="Choose from Photos" subtitle="Use a photo already saved on your device."
                          accept={IMAGE_ACCEPT} onFile={handleFile}
                          testId="assessment-submit-choose-photos" />
                <EntryRow icon={FileText} title="Upload a File" subtitle="Select a supported photo or PDF."
                          accept={ALL_ACCEPT} onFile={handleFile}
                          testId="assessment-submit-upload-file" />
              </div>

              {fileError && (
                <p className="text-[12px] text-red-300 text-center" data-testid="assessment-submit-file-error">{fileError}</p>
              )}
              <button onClick={onClose} data-testid="assessment-submit-cancel-button"
                      className="eduhub-tap w-full py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold text-white/55 hover:text-white">
                Not now
              </button>
            </div>
          )}

          {phase === "preview" && file && (
            <div className="text-center space-y-4 pt-1">
              <IdentityStrip assessment={assessment} />

              {previewUrl && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30" style={{ maxHeight: 180 }}>
                  <img src={previewUrl} alt="Your selected worksheet" className="w-full h-full object-contain"
                       style={{ maxHeight: 180 }} data-testid="assessment-submit-preview-large" />
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center gap-3 text-left"
                   data-testid="assessment-submit-selected-file">
                <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-black/30 border border-white/10 flex items-center justify-center">
                  {previewUrl
                    ? <img src={previewUrl} alt="" className="w-full h-full object-cover" data-testid="assessment-submit-preview-image" />
                    : <FileText size={22} className="text-white/40" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-white truncate" data-testid="assessment-submit-selected-file-name">
                    {file.name}
                  </div>
                  <div className="text-[11px] text-white/45" data-testid="assessment-submit-selected-file-meta">
                    {TYPE_LABELS[file.type] || file.type} · {formatFileSize(file.size)}
                  </div>
                </div>
                <button onClick={removeFile} aria-label="Remove file" data-testid="assessment-submit-remove-file-button"
                        className="p-1.5 text-white/40 hover:text-red-300 flex-shrink-0">
                  <X size={16} />
                </button>
              </div>

              {/* What submitting means — deliberate, honest review step. */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left space-y-1.5"
                   data-testid="assessment-submit-review-note">
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/40">
                  <ShieldCheck size={11} /> Before you submit
                </div>
                <ul className="text-[11.5px] text-white/55 leading-relaxed space-y-1 list-none">
                  <li>· Make sure every answer is visible and readable.</li>
                  <li>· You can submit this assessment only once.</li>
                  <li>· Your score is calculated instantly — points arrive after your teacher approves.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <button onClick={handleSubmit} data-testid="assessment-submit-confirm-button"
                        className="eduhub-tap w-full py-3.5 min-h-[48px] rounded-xl text-[14px] font-bold text-black"
                        style={{ background: GOLD }}>
                  Submit for AI Checking
                </button>
                <button onClick={() => setPhase("pick")} data-testid="assessment-submit-retake-button"
                        className="eduhub-tap w-full py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold text-white/55 hover:text-white">
                  Choose a different file
                </button>
              </div>
            </div>
          )}

          {phase === "uploading" && (
            <>
              <IdentityStrip assessment={assessment} />
              <SubmissionProgress />
            </>
          )}

          {phase === "result" && submission && (
            <div className="text-center space-y-4 pt-1 pb-1" data-testid="assessment-submit-result">
              <IdentityStrip assessment={assessment} />
              <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
                   style={{
                     background: submission.status === "needs_review" ? "rgba(240,168,80,0.16)" : "rgba(212,168,67,0.16)",
                     border: `1.5px solid ${submission.status === "needs_review" ? "rgba(240,168,80,0.5)" : "rgba(212,168,67,0.55)"}`,
                   }}>
                {submission.status === "needs_review"
                  ? <AlertTriangle size={26} className="text-orange-300" />
                  : <Check size={28} style={{ color: GOLD }} strokeWidth={3} />}
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-[17px] font-bold text-white">
                  {submission.status === "needs_review" ? "Worksheet submitted" : "Worksheet Scored"}
                </h2>
                {submission.score && (
                  <>
                    <div className="text-[15px] font-bold mt-1 text-white/85 tnum" data-testid="assessment-submit-score">
                      {submission.score.correct} / {submission.score.total} correct · {submission.score.scorePct}%
                    </div>
                    <div className="text-[12px] text-white/55 tnum" data-testid="assessment-submit-points-preview">
                      {submission.score.pointsEarned} / {assessment.totalPoints ?? submission.score.total} pts calculated
                    </div>
                  </>
                )}
                <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full border border-amber-400/35 bg-amber-400/10"
                     data-testid="assessment-submit-teacher-review-pill">
                  <AlertTriangle size={11} className="text-amber-300" />
                  <span className="text-[10.5px] font-bold uppercase tracking-wide text-amber-300">Teacher review</span>
                </div>
                <p className="text-[12px] text-white/50" data-testid="assessment-submit-points-awarded-note">
                  Your points are waiting for your teacher's approval — nothing has been credited yet.
                </p>
              </div>
              <div className="space-y-2">
                <button onClick={onClose} data-testid="assessment-submit-done-button"
                        className="eduhub-tap w-full py-3.5 min-h-[48px] rounded-xl text-[14px] font-bold text-black"
                        style={{ background: GOLD }}>
                  Done
                </button>
                {onViewResults && submission.score && (
                  <button onClick={() => onViewResults(submission)} data-testid="assessment-submit-view-results-button"
                          className="eduhub-tap w-full py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold text-white/60 hover:text-white border border-white/10">
                    See the question-by-question breakdown
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === "error" && error?.duplicate && (
            <div className="text-center space-y-4 pt-2" data-testid="assessment-submit-duplicate">
              <IdentityStrip assessment={assessment} />
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
                   style={{ background: "rgba(240,168,80,0.14)", border: "1px solid rgba(240,168,80,0.4)" }}>
                <ShieldCheck size={20} className="text-amber-300" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-[16px] font-bold text-white">Already submitted</h2>
                <p className="text-[12.5px] text-white/55 leading-relaxed">
                  You've already sent in this assessment, so a second copy can't be accepted.
                  You can follow its status and results from the assessment card.
                </p>
              </div>
              <div className="space-y-2">
                <button onClick={() => (onDuplicate ? onDuplicate() : onClose?.())}
                        data-testid="assessment-submit-view-status-button"
                        className="eduhub-tap w-full py-3.5 min-h-[48px] rounded-xl text-[14px] font-bold text-black"
                        style={{ background: GOLD }}>
                  View my submission status
                </button>
                <button onClick={onClose} data-testid="assessment-submit-cancel-button"
                        className="eduhub-tap w-full py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold text-white/55 hover:text-white">
                  Close
                </button>
              </div>
            </div>
          )}

          {phase === "error" && !error?.duplicate && (
            <div className="text-center space-y-4 pt-2" data-testid="assessment-submit-error">
              <IdentityStrip assessment={assessment} />
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
                   style={{ background: "rgba(240,80,80,0.13)" }}>
                <X size={20} className="text-red-400" />
              </div>
              <p className="text-[12.5px] text-white/55 leading-relaxed">{error?.message}</p>
              <div className="space-y-2">
                <button onClick={handleSubmit} data-testid="assessment-submit-retry-button"
                        className="eduhub-tap w-full py-3.5 min-h-[48px] rounded-xl text-[14px] font-bold text-black"
                        style={{ background: GOLD }}>
                  Try again
                </button>
                <button onClick={onClose} data-testid="assessment-submit-cancel-button"
                        className="eduhub-tap w-full py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold text-white/55 hover:text-white">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
