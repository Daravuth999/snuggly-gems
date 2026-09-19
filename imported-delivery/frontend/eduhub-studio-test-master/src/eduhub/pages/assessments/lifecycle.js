/**
 * lifecycle.js — single source of truth for how the student Assessment
 * surface interprets the backend's submission lifecycle.
 *
 * The backend (assessment_tools.py / assessment_schema.py) owns the
 * statuses: processing | needs_review | scored | reviewed | awarded |
 * failed (plus "no submission yet"). Nothing in this module invents a
 * state — every helper below is a pure projection of fields the server
 * actually returned, so the list page, detail sheet, submit modal and
 * results sheet can never drift apart in how they describe the same
 * submission.
 */

export const GOLD = "var(--eh-gold, #D4A843)";

/**
 * Muted, honest status palette (design guidelines: gold is NOT a status
 * color — it is reserved for the primary CTA and the awarded/terminal
 * state's key numbers).
 */
export const STATUS_META = {
  not_submitted: { label: "Not submitted", tone: "neutral", color: "rgba(159,176,195,0.9)" },
  processing: { label: "Processing", tone: "info", color: "#7cc7de", spin: true },
  needs_review: { label: "Awaiting review", tone: "warn", color: "#f0a850" },
  scored: { label: "Scored", tone: "score", color: "#D4A843" },
  reviewed: { label: "Reviewed", tone: "ok", color: "#D4A843" },
  awarded: { label: "Points awarded", tone: "gold", color: "#7dd08a" },
  failed: { label: "Couldn't process — try again", tone: "error", color: "#e08a8a" },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.processing;
}

/**
 * Four real lifecycle buckets, derived only from the backend's own
 * mySubmission.status. "Results" covers every status that carries a real
 * score, whether or not points have been awarded yet.
 */
export function bucketOf(assessment) {
  const status = assessment?.mySubmission?.status;
  if (!status || status === "failed") return "assigned";
  if (status === "processing") return "in_progress";
  if (status === "needs_review") return "submitted";
  return "results"; // scored | reviewed | awarded
}

export const TABS = [
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "submitted", label: "Submitted" },
  { key: "results", label: "Results" },
];

/** True when the student's next honest action is to upload a worksheet. */
export function canSubmit(assessment) {
  const sub = assessment?.mySubmission;
  return !sub || sub.status === "failed";
}

/** Points formatting that preserves fractional values exactly (13.5 stays
 * 13.5, 15.0 renders as 15) — never rounds, never truncates. */
export function fmtPts(value) {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return String(n);
}

/** Compact, locale-aware timestamp for lifecycle steps. Returns null for
 * anything unparsable so the UI simply omits the line (never fakes it). */
export function fmtWhen(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/**
 * The student's honest four-step journey for one submission:
 *   Submitted → AI checked → Teacher review → Points awarded
 * Each step's state is derived strictly from persisted backend fields
 * (status, submittedAt, extraction.extractedAt, reviewedAt,
 * award.creditedAt) — a step is only "done" when the server says so.
 */
export function buildJourney(submission) {
  const status = submission?.status || null;
  const score = submission?.score || null;
  const award = submission?.award || null;
  const submittedWhen = fmtWhen(submission?.submittedAt);
  const checkedWhen = fmtWhen(submission?.extraction?.extractedAt);
  const reviewedWhen = fmtWhen(submission?.reviewedAt);
  const creditedWhen = fmtWhen(award?.creditedAt);

  const steps = [
    { key: "submitted", label: "Submitted", state: "pending", desc: "Upload a photo of your worksheet.", when: null },
    { key: "checked", label: "AI checked", state: "pending", desc: "We read your answers and score them.", when: null },
    { key: "review", label: "Teacher review", state: "pending", desc: "Your teacher confirms the result.", when: null },
    { key: "awarded", label: "Points awarded", state: "pending", desc: "Points are credited to your wallet.", when: null },
  ];
  const [sSub, sChk, sRev, sAwd] = steps;

  if (!status) {
    sSub.state = "active";
    return steps;
  }

  sSub.state = "done";
  sSub.desc = "Your worksheet was received.";
  sSub.when = submittedWhen;

  if (status === "failed") {
    sChk.state = "failed";
    sChk.desc = "We couldn't read this file. Submit it again.";
    return steps;
  }
  if (status === "processing") {
    sChk.state = "active";
    sChk.desc = "Reading your answers now…";
    return steps;
  }

  // Every remaining status carries a persisted deterministic score.
  sChk.state = "done";
  sChk.when = checkedWhen;
  sChk.desc = score
    ? `${score.correct}/${score.total} correct · ${fmtPts(score.pointsEarned)} pts calculated`
    : "Score calculated.";

  if (status === "needs_review") {
    sRev.state = "active";
    sRev.desc = "Some answers were hard to read — your teacher will check them personally.";
    return steps;
  }
  if (status === "scored") {
    sRev.state = "active";
    sRev.desc = "Waiting for your teacher to review and approve.";
    return steps;
  }

  sRev.state = "done";
  sRev.when = reviewedWhen;
  sRev.desc = "Reviewed by your teacher.";

  if (status === "reviewed") {
    sAwd.state = "active";
    sAwd.desc = "Your teacher awards the points next.";
    return steps;
  }

  // awarded — terminal
  sAwd.state = "done";
  sAwd.when = creditedWhen;
  sAwd.desc = award && award.pointsCredited !== undefined && award.pointsCredited !== null
    ? `${fmtPts(award.pointsCredited)} pts credited to your wallet.`
    : "Points credited to your wallet.";
  return steps;
}
