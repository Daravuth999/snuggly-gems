/**
 * StudentManager.jsx — Teacher Studio "Students" tab (v10.0).
 *
 * Self-contained panel that lets a teacher onboard, list, reset, and
 * deactivate student accounts against the new Render-backed auth.
 * Visual language is locked to the existing Teacher Studio palette
 * (parchment ink on near-black, soft gold accent) so the new tab is
 * indistinguishable from the older Points/Restriction tabs.
 *
 * Three views are managed by a single `view` state:
 *
 *   list        — table of all students + filter + search
 *   create      — new-student form
 *   credential  — one-time credential card (also shown after reset)
 *
 * The plain password lives ONLY in component state. Clicking "Done" on
 * the credential card clears it; it is never written to localStorage,
 * never logged, never re-fetchable from the server.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  RotateCcw,
  XCircle,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Search,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  QrCode,
  Download,
  Ban,
  CalendarClock,
} from "lucide-react";
import {
  listStudents,
  createStudent,
  deactivateStudent,
  resetStudentPassword,
  generateSmartLoginCredential,
  revokeSmartLoginCredential,
  forceLogoutAllUsers,
  assignStudentSchedule,
  bulkAssignStudentSchedule,
} from "../../eduhub/auth/studentAuthService";
import { renderSmartLoginCredentialCard } from "../../eduhub/lib/smartLoginCredentialArtwork";
import PasswordResetRequestsPanel from "./PasswordResetRequestsPanel";
import SecurityPanel from "./SecurityPanel";
import ScheduleTimeWindowsPanel from "./ScheduleTimeWindowsPanel";

/**
 * Composites the raw backend QR into a professional, personalized
 * credential card (student name + ID around the same untouched QR
 * pixels) — see smartLoginCredentialArtwork.js for the security
 * rationale. Falls back to the raw QR (still fully functional) if
 * compositing fails for any reason, e.g. Canvas unavailable.
 */
function useSmartLoginCredentialCard({ qrPngDataUri, displayName, cleanId }) {
  const [cardDataUri, setCardDataUri] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setCardDataUri(null);
    if (!qrPngDataUri) return undefined;
    renderSmartLoginCredentialCard({ qrPngDataUri, displayName, cleanId })
      .then((uri) => { if (!cancelled) setCardDataUri(uri); })
      .catch(() => { /* raw QR fallback below still works */ });
    return () => { cancelled = true; };
  }, [qrPngDataUri, displayName, cleanId]);
  return cardDataUri;
}

/* -------------------- design tokens (match TeacherStudio) ---------------- */
const css = {
  bg: "#0a0a0f",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "#F4E5C1",
  textMuted: "rgba(244,229,193,0.55)",
  aurora: "linear-gradient(135deg, #FFE19A 0%, #D4A843 50%, #9C7A2C 100%)",
  danger: "rgba(239, 68, 68, 0.9)",
  good: "rgba(74, 222, 128, 0.9)",
  warn: "rgba(251, 191, 36, 0.9)",
};

const inputStyle = {
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${css.border}`,
  color: css.text,
  outline: "none",
};

/* ─────────────────────────  root component  ─────────────────────────── */
export default function StudentManager() {
  const [view, setView] = useState("list"); // list | create | credential | smart-qr
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [error, setError] = useState(null);
  const [credential, setCredential] = useState(null); // { clean_id, display_name, password, login_url }
  // EduHub Smart Login — the generate response, held ONLY in component
  // state (never localStorage, never re-fetchable) — same one-time-reveal
  // contract as `credential` above. { student_id, clean_id, display_name,
  // qr_payload, qr_png_data_uri, qr_svg_data_uri }
  const [smartLoginResult, setSmartLoginResult] = useState(null);

  const refresh = useCallback(() => setReloadFlag((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listStudents()
      .then((s) => { if (!cancelled) setStudents(s); })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load students"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadFlag]);

  if (view === "credential" && credential) {
    return (
      <CredentialCard
        credential={credential}
        onDone={() => {
          setCredential(null);
          setView("list");
          refresh();
        }}
      />
    );
  }

  if (view === "smart-qr" && smartLoginResult) {
    return (
      <SmartLoginQrCard
        result={smartLoginResult}
        onDone={() => {
          setSmartLoginResult(null);
          setView("list");
          refresh();
        }}
      />
    );
  }

  if (view === "create") {
    return (
      <CreateForm
        students={students}
        onCancel={() => setView("list")}
        onCreated={async (cred) => {
          // EduHub Smart Login — generate a QR credential alongside the
          // password for every newly created student, reusing the SAME
          // one-time reveal screen (CredentialCard) rather than a second
          // page transition. Best-effort: a Smart Login generation hiccup
          // must never block the primary password-credential reveal the
          // teacher is actually waiting on — same "never block the core
          // flow on a secondary feature" convention this file already
          // uses for GAS sync elsewhere in this codebase.
          let merged = cred;
          try {
            const qr = await generateSmartLoginCredential(cred.student_id);
            merged = { ...cred, ...qr };
          } catch { /* Smart Login optional at creation time — password still shown */ }
          setCredential(merged);
          setView("credential");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SecurityPanel />
      <ScheduleTimeWindowsPanel />
      <PasswordResetRequestsPanel
        onCredential={(cred) => {
          setCredential(cred);
          setView("credential");
        }}
      />
      <StudentList
        students={students}
        loading={loading}
        error={error}
        onRefresh={refresh}
        onNew={() => setView("create")}
        onReset={async (s) => {
          const r = await resetStudentPassword(s.student_id);
          setCredential(r);
          setView("credential");
        }}
        onDeactivate={async (s) => {
          await deactivateStudent(s.student_id);
          refresh();
        }}
        onReuse={(s) => {
          // Pre-fill the create form with the inactive student's clean_id so
          // the admin can re-onboard under the same printed slip ID.
          sessionStorage.setItem("v10_reuse_clean_id", s.clean_id);
          setView("create");
        }}
        onSmartGenerate={async (s) => {
          const r = await generateSmartLoginCredential(s.student_id);
          setSmartLoginResult(r);
          setView("smart-qr");
        }}
        onSmartRevoke={async (s) => {
          await revokeSmartLoginCredential(s.student_id);
          refresh();
        }}
      />
    </div>
  );
}

/* ─────────────────────────  list view  ──────────────────────────────── */
function StudentList({
  students, loading, error, onRefresh, onNew, onReset, onDeactivate, onReuse,
  onSmartGenerate, onSmartRevoke,
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | inactive
  const [busyId, setBusyId] = useState(null);
  const [confirmDeact, setConfirmDeact] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  // EduHub Smart Login — separate confirm state from password reset; only
  // shown when REGENERATING an already-active credential (a brand-new
  // Generate on a student with none yet needs no confirmation, same as
  // password reset needing none on first creation).
  const [confirmSmartRegen, setConfirmSmartRegen] = useState(null);
  const [confirmSmartRevoke, setConfirmSmartRevoke] = useState(null);
  const [smartBusyId, setSmartBusyId] = useState(null);

  // ── Speaking Lab Schedule A/B assignment — this UI is a thin client for
  // the existing POST .../schedule-assignment (+ /bulk) routes in
  // teacher_admission.py; every safety check below (conflict detection,
  // confirm-flag semantics) is enforced server-side and simply surfaced
  // here, never re-implemented or bypassed.
  const [scheduleBusyId, setScheduleBusyId] = useState(null);
  const [scheduleError, setScheduleError] = useState(null);
  // { student, newSchedule } — the "already assigned elsewhere, are you
  // sure" gate. `confirm` CAN resolve this one.
  const [scheduleConfirm, setScheduleConfirm] = useState(null);
  // { student, reason } — the "active session in the other schedule" hard
  // block. `confirm` can NEVER resolve this one — info-only dialog.
  const [scheduleBlocked, setScheduleBlocked] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkSchedule, setBulkSchedule] = useState("A");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirmPending, setBulkConfirmPending] = useState(null); // { ids, schedule, needsConfirmCount }
  const [bulkResult, setBulkResult] = useState(null); // summary shown after a bulk run settles

  // Selection is scoped to whatever's currently loaded — clear it whenever
  // the underlying list changes (a refresh after an action, a manual
  // Refresh click) so it can never silently point at stale rows. Mirrors
  // AssessmentReviewStudio's SubmissionsPanel, the one other bulk-select
  // precedent in this codebase.
  useEffect(() => { setSelectedIds(new Set()); }, [students]);

  const toggleSelect = (studentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const applyScheduleOutcome = (student, result) => {
    if (result.outcome === "updated" || result.outcome === "unchanged") {
      onRefresh();
      return;
    }
    if (result.outcome === "confirmation_required") {
      setScheduleConfirm({ student, newSchedule: result.new_schedule });
      return;
    }
    if (result.outcome === "blocked_active_elsewhere") {
      setScheduleBlocked({ student, reason: result.reason });
      return;
    }
    setScheduleError(result.reason || `Could not change schedule (${result.outcome}).`);
  };

  const handleScheduleChange = async (student, newSchedule) => {
    if ((student.group || "") === newSchedule) return; // already there — no call needed
    setScheduleError(null);
    setScheduleBusyId(student.student_id);
    try {
      const result = await assignStudentSchedule(student.student_id, { schedule: newSchedule, confirm: false });
      applyScheduleOutcome(student, result);
    } catch (err) {
      setScheduleError(err.message || "Failed to change schedule.");
    } finally {
      setScheduleBusyId(null);
    }
  };

  const runBulkAssignment = async (ids, schedule, confirm) => {
    setBulkBusy(true);
    try {
      const resp = await bulkAssignStudentSchedule({ studentIds: ids, schedule, confirm });
      const results = resp.results || [];
      const needsConfirm = results.filter((r) => r.outcome === "confirmation_required");
      if (!confirm && needsConfirm.length > 0) {
        // Bulk applies one confirm flag to the whole batch (matches the
        // backend's own request shape) — re-running with confirm:true is
        // safe for the already-updated ones too, since they'll just come
        // back "unchanged" the second time.
        setBulkConfirmPending({ ids, schedule, needsConfirmCount: needsConfirm.length, total: ids.length });
        return;
      }
      setBulkResult({ schedule, results });
      setSelectedIds(new Set());
      onRefresh();
    } catch (err) {
      setScheduleError(err.message || "Bulk schedule assignment failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      if (filter === "active" && !s.is_active) return false;
      if (filter === "inactive" && s.is_active) return false;
      if (!needle) return true;
      return (
        s.clean_id.toLowerCase().includes(needle) ||
        (s.display_name || "").toLowerCase().includes(needle) ||
        (s.group || "").toLowerCase().includes(needle)
      );
    });
  }, [students, q, filter]);

  return (
    <div data-testid="student-manager" className="space-y-4">
      {/* header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Users className="h-4 w-4" style={{ color: "#D4A843" }} />
        <h3 className="text-[13px] font-semibold" style={{ color: css.text }}>
          Student Management
        </h3>
        <span className="text-[11px]" style={{ color: css.textMuted }}>
          {students.filter((s) => s.is_active).length} active ·{" "}
          {students.filter((s) => !s.is_active).length} inactive
        </span>
        <div className="flex-1" />
        <button
          onClick={onRefresh}
          data-testid="student-refresh-btn"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition"
          style={{ background: "rgba(45,31,62,0.65)", color: css.text,
                   border: "1px solid rgba(212,168,67,0.25)" }}
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
        <button
          onClick={onNew}
          data-testid="student-new-btn"
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition"
          style={{ background: css.aurora, color: "#1a1420",
                   border: "1px solid rgba(255,225,154,0.6)",
                   boxShadow: "0 6px 14px rgba(212,168,67,0.35)" }}
        >
          <UserPlus className="h-3 w-3" /> New Student
        </button>
      </div>

      {/* filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: css.textMuted }} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ID, name or group…"
            data-testid="student-search-input"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-[12px]"
            style={inputStyle}
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="student-filter-select"
          className="rounded-lg px-3 py-2 text-[12px]"
          style={inputStyle}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {error && (
        <div className="rounded-xl px-3 py-2.5 text-[12px] border"
             style={{ background: "rgba(239,68,68,0.08)",
                      borderColor: "rgba(239,68,68,0.35)", color: css.danger }}
             data-testid="student-list-error">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {error}
        </div>
      )}

      {scheduleError && (
        <div className="rounded-xl px-3 py-2.5 text-[12px] border flex items-start gap-2"
             style={{ background: "rgba(239,68,68,0.08)",
                      borderColor: "rgba(239,68,68,0.35)", color: css.danger }}
             data-testid="student-schedule-error">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="flex-1">{scheduleError}</span>
          <button onClick={() => setScheduleError(null)} className="font-bold uppercase text-[10px]">
            Dismiss
          </button>
        </div>
      )}

      {/* bulk schedule-assignment bar — appears only once rows are selected */}
      {selectedIds.size > 0 && (
        <div className="rounded-xl px-3.5 py-2.5 flex items-center gap-3 flex-wrap"
             style={{ background: "rgba(212,168,67,0.10)",
                      border: "1px solid rgba(212,168,67,0.3)" }}
             data-testid="student-bulk-schedule-bar">
          <CalendarClock className="h-3.5 w-3.5" style={{ color: "#D4A843" }} />
          <span className="text-[11.5px] font-semibold" style={{ color: css.text }}>
            {selectedIds.size} selected
          </span>
          <select
            value={bulkSchedule}
            onChange={(e) => setBulkSchedule(e.target.value)}
            data-testid="student-bulk-schedule-select"
            className="rounded-lg px-2.5 py-1.5 text-[12px]"
            style={inputStyle}
          >
            <option value="A">Assign to Schedule A</option>
            <option value="B">Assign to Schedule B</option>
            <option value="">Unassign schedule</option>
          </select>
          <button
            onClick={() => runBulkAssignment(Array.from(selectedIds), bulkSchedule, false)}
            disabled={bulkBusy}
            data-testid="student-bulk-schedule-apply"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: css.aurora, color: "#1a1420",
                     border: "1px solid rgba(255,225,154,0.6)" }}
          >
            {bulkBusy && <Loader2 className="h-3 w-3 animate-spin" />}
            Apply
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            data-testid="student-bulk-schedule-clear"
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: css.textMuted }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* table */}
      <div className="rounded-xl overflow-hidden"
           style={{ border: `1px solid ${css.border}`, background: css.card }}>
        <table className="w-full text-[12px]" data-testid="student-table">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)",
                         borderBottom: `1px solid ${css.border}` }}>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                  style={{ color: css.textMuted }}>ID</th>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                  style={{ color: css.textMuted }}>Name</th>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                  style={{ color: css.textMuted }}>Group</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider"
                  style={{ color: css.textMuted }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center" style={{ color: css.textMuted }}>
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                  Loading students…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center" style={{ color: css.textMuted }}>
                  No students match the current filter.
                </td>
              </tr>
            )}
            {!loading && filtered.map((s) => {
              const inactive = !s.is_active;
              return (
                <tr key={s.student_id}
                    data-testid={`student-row-${s.clean_id}`}
                    style={{ borderTop: `1px solid ${css.border}`,
                             opacity: inactive ? 0.55 : 1 }}>
                  <td className="px-3 py-2">
                    {!inactive && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.student_id)}
                        onChange={() => toggleSelect(s.student_id)}
                        data-testid={`student-select-${s.clean_id}`}
                        className="accent-amber-400"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: css.text }}>
                    {s.clean_id}{inactive ? " ✗" : ""}
                    {s.smart_login_active && (
                      <span
                        title="Smart Login active"
                        data-testid={`student-smart-active-${s.clean_id}`}
                        className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: css.good }}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: css.text }}>
                    {inactive ? <em>(inactive)</em> : s.display_name}
                  </td>
                  <td className="px-3 py-2" style={{ color: css.text }}>
                    {inactive ? (
                      s.group || "—"
                    ) : (
                      <select
                        value={s.group || ""}
                        onChange={(e) => handleScheduleChange(s, e.target.value)}
                        disabled={scheduleBusyId === s.student_id}
                        data-testid={`student-schedule-select-${s.clean_id}`}
                        className="rounded-md px-1.5 py-1 text-[11.5px]"
                        style={inputStyle}
                      >
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                      </select>
                    )}
                    {scheduleBusyId === s.student_id && (
                      <Loader2 className="inline h-3 w-3 animate-spin ml-1.5" style={{ color: "#D4A843" }} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {inactive ? (
                      <button
                        onClick={() => onReuse(s)}
                        data-testid={`student-reuse-${s.clean_id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider"
                        style={{ background: "rgba(212,168,67,0.18)", color: "#D4A843",
                                 border: "1px solid rgba(212,168,67,0.4)" }}
                      >
                        Reuse ID
                      </button>
                    ) : (
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={async () => {
                            // First-time generate needs no confirmation (mirrors
                            // password reset having none on brand-new creation);
                            // regenerating an ALREADY active credential invalidates
                            // it, so that path is gated behind confirmSmartRegen.
                            if (s.smart_login_active) { setConfirmSmartRegen(s); return; }
                            setSmartBusyId(s.student_id);
                            try { await onSmartGenerate(s); }
                            finally { setSmartBusyId(null); }
                          }}
                          disabled={smartBusyId === s.student_id}
                          data-testid={`student-smart-generate-${s.clean_id}`}
                          title={s.smart_login_active ? "Regenerate Smart Login QR" : "Generate Smart Login QR"}
                          className="rounded-md p-1.5 transition"
                          style={{ background: "rgba(139,92,246,0.12)", color: "#8B5CF6",
                                   border: "1px solid rgba(139,92,246,0.3)" }}
                        >
                          {smartBusyId === s.student_id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <QrCode className="h-3 w-3" />}
                        </button>
                        {s.smart_login_active && (
                          <button
                            onClick={() => setConfirmSmartRevoke(s)}
                            disabled={smartBusyId === s.student_id}
                            data-testid={`student-smart-revoke-${s.clean_id}`}
                            title="Revoke Smart Login"
                            className="rounded-md p-1.5 transition"
                            style={{ background: "rgba(239,68,68,0.12)", color: css.danger,
                                     border: "1px solid rgba(239,68,68,0.3)" }}
                          >
                            <Ban className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmReset(s)}
                          disabled={busyId === s.student_id}
                          data-testid={`student-reset-${s.clean_id}`}
                          title="Reset password"
                          className="rounded-md p-1.5 transition"
                          style={{ background: "rgba(212,168,67,0.12)", color: "#D4A843",
                                   border: "1px solid rgba(212,168,67,0.3)" }}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeact(s)}
                          disabled={busyId === s.student_id}
                          data-testid={`student-deact-${s.clean_id}`}
                          title="Deactivate"
                          className="rounded-md p-1.5 transition"
                          style={{ background: "rgba(239,68,68,0.12)", color: css.danger,
                                   border: "1px solid rgba(239,68,68,0.3)" }}
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* confirm dialogs */}
      {confirmDeact && (
        <ConfirmDialog
          testId="confirm-deactivate"
          title="Deactivate student?"
          body={`Deactivate ${confirmDeact.clean_id} (${confirmDeact.display_name})? Their ID can be reused for a new student.`}
          danger
          onCancel={() => setConfirmDeact(null)}
          onConfirm={async () => {
            setBusyId(confirmDeact.student_id);
            try { await onDeactivate(confirmDeact); }
            finally { setBusyId(null); setConfirmDeact(null); }
          }}
        />
      )}
      {confirmReset && (
        <ConfirmDialog
          testId="confirm-reset"
          title="Reset password?"
          body={`Reset password for ${confirmReset.clean_id}? All active sessions will be logged out.`}
          onCancel={() => setConfirmReset(null)}
          onConfirm={async () => {
            setBusyId(confirmReset.student_id);
            try { await onReset(confirmReset); }
            finally { setBusyId(null); setConfirmReset(null); }
          }}
        />
      )}
      {confirmSmartRegen && (
        <ConfirmDialog
          testId="confirm-smart-regen"
          title="Regenerate Smart Login QR?"
          body={`The current QR for ${confirmSmartRegen.clean_id} will stop working immediately. A new one will be generated.`}
          danger
          onCancel={() => setConfirmSmartRegen(null)}
          onConfirm={async () => {
            setSmartBusyId(confirmSmartRegen.student_id);
            try { await onSmartGenerate(confirmSmartRegen); }
            finally { setSmartBusyId(null); setConfirmSmartRegen(null); }
          }}
        />
      )}
      {confirmSmartRevoke && (
        <ConfirmDialog
          testId="confirm-smart-revoke"
          title="Revoke Smart Login?"
          body={`${confirmSmartRevoke.clean_id} will no longer be able to sign in with their QR. Student ID + Password keeps working.`}
          danger
          onCancel={() => setConfirmSmartRevoke(null)}
          onConfirm={async () => {
            setSmartBusyId(confirmSmartRevoke.student_id);
            try { await onSmartRevoke(confirmSmartRevoke); }
            finally { setSmartBusyId(null); setConfirmSmartRevoke(null); }
          }}
        />
      )}

      {/* schedule reassignment — "already assigned elsewhere" gate; confirm CAN resolve this */}
      {scheduleConfirm && (
        <ConfirmDialog
          testId="confirm-schedule-reassign"
          title="Reassign schedule?"
          body={`${scheduleConfirm.student.clean_id} is already in Schedule ${scheduleLabel(scheduleConfirm.student.group)}. Reassign to ${scheduleLabel(scheduleConfirm.newSchedule)}?`}
          onCancel={() => setScheduleConfirm(null)}
          onConfirm={async () => {
            setScheduleBusyId(scheduleConfirm.student.student_id);
            try {
              const result = await assignStudentSchedule(scheduleConfirm.student.student_id, {
                schedule: scheduleConfirm.newSchedule, confirm: true,
              });
              applyScheduleOutcome(scheduleConfirm.student, result);
            } catch (err) {
              setScheduleError(err.message || "Failed to change schedule.");
            } finally {
              setScheduleBusyId(null); setScheduleConfirm(null);
            }
          }}
        />
      )}

      {/* schedule reassignment — active-session hard block; confirm CANNOT resolve this,
          so this is an info-only dialog, never a confirm action */}
      {scheduleBlocked && (
        <InfoDialog
          testId="student-schedule-blocked"
          title="Can't reassign schedule"
          body={`${scheduleBlocked.student.clean_id} has an active Speaking Lab session in the other schedule, so this can't be changed here. Resolve it in Speaking Lab first, then try again.`}
          onDismiss={() => setScheduleBlocked(null)}
        />
      )}

      {/* bulk — some selected students need explicit confirmation to reassign */}
      {bulkConfirmPending && (
        <ConfirmDialog
          testId="confirm-bulk-schedule-reassign"
          title="Reassign schedules?"
          body={`${bulkConfirmPending.needsConfirmCount} of your ${bulkConfirmPending.total} selected students already have a different schedule assigned and require confirmation to reassign to ${scheduleLabel(bulkConfirmPending.schedule)}. Continue?`}
          onCancel={() => setBulkConfirmPending(null)}
          onConfirm={async () => {
            const pending = bulkConfirmPending;
            setBulkConfirmPending(null);
            await runBulkAssignment(pending.ids, pending.schedule, true);
          }}
        />
      )}

      {/* bulk — final settled summary (updated / blocked / unchanged / errors) */}
      {bulkResult && (
        <BulkScheduleResultDialog
          result={bulkResult}
          students={students}
          onDismiss={() => setBulkResult(null)}
        />
      )}
    </div>
  );
}

function scheduleLabel(value) {
  return value ? `Schedule ${value}` : "Unassigned";
}

function BulkScheduleResultDialog({ result, students, onDismiss }) {
  const byId = useMemo(() => new Map(students.map((s) => [s.student_id, s])), [students]);
  const groups = {
    updated: result.results.filter((r) => r.outcome === "updated"),
    unchanged: result.results.filter((r) => r.outcome === "unchanged"),
    blocked: result.results.filter((r) => r.outcome === "blocked_active_elsewhere"),
    needsConfirm: result.results.filter((r) => r.outcome === "confirmation_required"),
    other: result.results.filter((r) =>
      !["updated", "unchanged", "blocked_active_elsewhere", "confirmation_required"].includes(r.outcome)),
  };
  const nameFor = (r) => (byId.get(r.student_id)?.clean_id) || r.student_name || r.student_id;
  return (
    <div
      data-testid="student-bulk-schedule-result"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onDismiss}
    >
      <div onClick={(e) => e.stopPropagation()}
           className="rounded-2xl max-w-md w-full p-5 space-y-3"
           style={{ background: css.bg, border: `1px solid ${css.borderStrong}` }}>
        <h4 className="text-[13.5px] font-semibold" style={{ color: css.text }}>
          Bulk assignment to {scheduleLabel(result.schedule)}
        </h4>
        <div className="space-y-1.5 text-[12px]" style={{ color: css.textMuted }}>
          {groups.updated.length > 0 && (
            <p style={{ color: css.good }}>{groups.updated.length} updated.</p>
          )}
          {groups.unchanged.length > 0 && (
            <p>{groups.unchanged.length} already at that schedule (no change needed).</p>
          )}
          {groups.blocked.length > 0 && (
            <div style={{ color: css.danger }}>
              <p>{groups.blocked.length} blocked — active session in the other schedule:</p>
              <p className="font-mono text-[11px] mt-0.5">
                {groups.blocked.map(nameFor).join(", ")}
              </p>
            </div>
          )}
          {groups.needsConfirm.length > 0 && (
            <p style={{ color: css.warn }}>{groups.needsConfirm.length} still need confirmation.</p>
          )}
          {groups.other.length > 0 && (
            <p style={{ color: css.danger }}>{groups.other.length} failed unexpectedly.</p>
          )}
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={onDismiss}
            data-testid="student-bulk-schedule-result-dismiss"
            className="rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: css.aurora, color: "#1a1420",
                     border: "1px solid rgba(255,225,154,0.6)" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  create view  ────────────────────────────── */
function CreateForm({ onCancel, onCreated, students = [] }) {
  const [cleanId, setCleanId] = useState(() => {
    try { return sessionStorage.getItem("v10_reuse_clean_id") || ""; }
    catch { return ""; }
  });
  const [displayName, setDisplayName] = useState("");
  const [group, setGroup] = useState("");
  const [purgePreviousHistory, setPurgePreviousHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => { try { sessionStorage.removeItem("v10_reuse_clean_id"); } catch { /* ignore */ } };
  }, []);

  // Data-integrity fix (2026-09): the same form is used for two genuinely
  // different admin intents — "this exact student is coming back" (their
  // history should stay) vs. "this ID slot is now for a different person"
  // (their history must not be inherited). Recomputed live as the admin
  // types/edits the ID, not just when arriving via the "Reuse ID" button,
  // so a manually-typed inactive ID gets the same explicit choice.
  const normalizedId = cleanId.trim().toLowerCase();
  const matchedInactiveStudent = normalizedId
    ? students.find((s) => s.clean_id === normalizedId && !s.is_active)
    : null;
  const isReusingASlot = Boolean(matchedInactiveStudent);

  // The checkbox only makes sense for a slot that's actually being reused —
  // reset it if the admin changes the ID to one that isn't (or clears it),
  // so a stale "yes, wipe it" choice can never silently carry over.
  useEffect(() => {
    if (!isReusingASlot) setPurgePreviousHistory(false);
  }, [isReusingASlot]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const id = cleanId.trim().toLowerCase();
    const name = displayName.trim();
    if (!id || !name) { setError("Student ID and Full Name are required."); return; }
    setBusy(true);
    try {
      const r = await createStudent({
        cleanId: id, displayName: name, group: group.trim(),
        purgePreviousHistory: isReusingASlot && purgePreviousHistory,
      });
      onCreated(r);
    } catch (err) {
      if (err.status === 409) setError("This ID is already active. Deactivate it first to reuse.");
      else setError(err.message || "Failed to create student.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid="student-create-form" className="space-y-4 max-w-md">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} data-testid="student-create-cancel"
                className="rounded-md p-1.5"
                style={{ background: "rgba(255,255,255,0.04)",
                         border: `1px solid ${css.border}`, color: css.text }}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <h3 className="text-[14px] font-semibold" style={{ color: css.text }}>
          New Student
        </h3>
      </div>

      <Field label="Student ID" hint="Lowercase. Example: stu042">
        <input
          type="text"
          value={cleanId}
          onChange={(e) => setCleanId(e.target.value)}
          placeholder="stu042"
          autoComplete="off"
          data-testid="student-create-id"
          className="w-full rounded-lg px-3 py-2 text-[13px] font-mono"
          style={inputStyle}
        />
      </Field>

      <Field label="Full Name">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Daravuth Sok"
          data-testid="student-create-name"
          className="w-full rounded-lg px-3 py-2 text-[13px]"
          style={inputStyle}
        />
      </Field>

      <Field label="Group" hint="Optional">
        <input
          type="text"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="A"
          data-testid="student-create-group"
          className="w-full rounded-lg px-3 py-2 text-[13px]"
          style={inputStyle}
        />
      </Field>

      {isReusingASlot && (
        <div
          className="rounded-xl px-3.5 py-3 space-y-2"
          data-testid="student-reuse-slot-notice"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)" }}
        >
          <p className="text-[11.5px] leading-relaxed" style={{ color: css.text }}>
            <strong>{matchedInactiveStudent.clean_id}</strong> is an inactive ID slot
            (previously {matchedInactiveStudent.display_name || "a student"}). Is this the
            <em> same</em> student coming back, or a <em>different</em>, new student?
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={purgePreviousHistory}
              onChange={(e) => setPurgePreviousHistory(e.target.checked)}
              data-testid="student-create-purge-checkbox"
              className="mt-0.5 accent-amber-400"
            />
            <span className="text-[11.5px] leading-relaxed" style={{ color: css.textMuted }}>
              This is a <strong style={{ color: css.text }}>different, new</strong> student —
              permanently wipe the previous occupant's wallet balance, purchases, submissions,
              attendance, and every other record tied to this ID. Leave unchecked if the same
              student is simply returning and should keep their history.
            </span>
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-xl px-3 py-2.5 text-[12px] border"
             style={{ background: "rgba(239,68,68,0.08)",
                      borderColor: "rgba(239,68,68,0.35)", color: css.danger }}
             data-testid="student-create-error">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        data-testid="student-create-submit"
        className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-wider transition disabled:opacity-60"
        style={{ background: css.aurora, color: "#1a1420",
                 border: "1px solid rgba(255,225,154,0.6)",
                 boxShadow: "0 6px 14px rgba(212,168,67,0.35)" }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
        Create Student
      </button>
    </form>
  );
}

/* ─────────────────────────  credential card view  ───────────────────── */
function CredentialCard({ credential, onDone }) {
  const [copied, setCopied] = useState(false);
  const smartCardDataUri = useSmartLoginCredentialCard({
    qrPngDataUri: credential.qr_png_data_uri,
    displayName: credential.display_name,
    cleanId: credential.clean_id,
  });

  const text = useMemo(() => {
    const url = credential.login_url || "https://eduhub-studio-test.vercel.app";
    return [
      "EduHub Login",
      `Login ID : ${credential.clean_id}`,
      `Name     : ${credential.display_name}`,
      `Password : ${credential.password}`,
      `URL      : ${url}`,
    ].join("\n");
  }, [credential]);

  const copyAll = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div data-testid="student-credential-card" className="max-w-md">
      <div className="rounded-2xl overflow-hidden"
           style={{ border: `1px solid ${css.border}`, background: css.card }}>
        <div className="px-5 py-3 flex items-center gap-2"
             style={{ borderBottom: `1px solid ${css.border}`,
                      background: "rgba(74,222,128,0.06)" }}>
          <ShieldCheck className="h-4 w-4" style={{ color: css.good }} />
          <span className="text-[13px] font-semibold" style={{ color: css.text }}>
            Student {credential.action === "reactivated" ? "Reactivated" : credential.password ? "Created" : "Updated"}
          </span>
        </div>

        <div className="px-5 py-4 space-y-2 text-[12.5px] font-mono"
             data-testid="credential-body" style={{ color: css.text }}>
          <Row label="Login ID" value={credential.clean_id} />
          <Row label="Name"     value={credential.display_name} />
          <Row label="Password" value={credential.password} emphasis />
          <Row label="URL"      value={credential.login_url || "https://eduhub-studio-test.vercel.app"} />
        </div>

        {/* EduHub Smart Login — additive: only renders when a QR was
            generated alongside this password (new-student creation, or
            when the parent passed one through). CredentialCard's own
            copyAll/Done buttons stay exactly as they were. */}
        {credential.qr_png_data_uri && (
          <div className="px-5 pb-2 flex flex-col items-center gap-2" data-testid="credential-smart-login-qr">
            <div className="rounded-xl p-2.5" style={{ background: "#FFFFFF" }}>
              <img
                src={smartCardDataUri || credential.qr_png_data_uri}
                alt={`Smart Login credential for ${credential.display_name}`}
                data-testid="credential-smart-login-qr-image"
                className={smartCardDataUri ? "w-40" : "w-32 h-32"}
              />
            </div>
            <a
              href={smartCardDataUri || credential.qr_png_data_uri}
              download={`eduhub-smart-login-${credential.clean_id}.png`}
              data-testid="credential-smart-login-download"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(139,92,246,0.18)", color: "#8B5CF6",
                       border: "1px solid rgba(139,92,246,0.4)" }}
            >
              <Download className="h-3 w-3" /> Download Smart Login QR
            </a>
          </div>
        )}

        <div className="px-5 pb-4 flex items-center gap-2">
          <button
            onClick={copyAll}
            data-testid="credential-copy-all"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(212,168,67,0.18)", color: "#D4A843",
                     border: "1px solid rgba(212,168,67,0.4)" }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy All"}
          </button>
          <button
            onClick={onDone}
            data-testid="credential-done"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: css.aurora, color: "#1a1420",
                     border: "1px solid rgba(255,225,154,0.6)" }}
          >
            Done
          </button>
        </div>

        <div className="px-5 py-3 flex items-start gap-2 text-[11.5px]"
             style={{ background: "rgba(251,191,36,0.08)",
                      borderTop: `1px solid ${css.border}`,
                      color: css.warn }}
             data-testid="credential-warning">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Save this now. The password is shown <strong>once</strong> and
            will never be retrievable again. It is not stored on the server
            in plaintext.
          </span>
        </div>

        {credential.purge_summary && (
          <div
            className="px-5 py-3 text-[11.5px] leading-relaxed"
            data-testid="credential-purge-summary"
            style={{ borderTop: `1px solid ${css.border}`, color: css.textMuted }}
          >
            Previous occupant's history wiped —{" "}
            {Object.keys(credential.purge_summary.deleted || {}).length} record type
            {Object.keys(credential.purge_summary.deleted || {}).length === 1 ? "" : "s"} deleted,{" "}
            {Object.keys(credential.purge_summary.archived || {}).length} archived for
            accounting (never deleted).
          </div>
        )}

        {credential.tuition_anchor && (
          <div
            className="px-5 py-3 text-[11.5px] leading-relaxed"
            data-testid="credential-tuition-anchor"
            style={{ borderTop: `1px solid ${css.border}`, color: css.textMuted }}
          >
            {credential.tuition_anchor.created ? (
              <>Tuition due date anchored to <strong style={{ color: css.text }}>{credential.tuition_anchor.next_due_date}</strong>.</>
            ) : (
              <>Tuition record not created — {credential.tuition_anchor.reason}.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────  EduHub Smart Login QR card  ──────────────────── */
// Mirrors CredentialCard's one-time-reveal contract exactly: the plain QR
// payload lives ONLY in this component's props (sourced from React state
// in the parent, never localStorage, never re-fetchable from the server —
// the backend only ever stores sha256(secret), never the secret itself).
function SmartLoginQrCard({ result, onDone }) {
  const [copied, setCopied] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const smartCardDataUri = useSmartLoginCredentialCard({
    qrPngDataUri: result.qr_png_data_uri,
    displayName: result.display_name,
    cleanId: result.clean_id,
  });

  const copyPayload = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(result.qr_payload);
      } else {
        const ta = document.createElement("textarea");
        ta.value = result.qr_payload;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div data-testid="smart-login-qr-card" className="max-w-md">
      <div className="rounded-2xl overflow-hidden"
           style={{ border: `1px solid ${css.border}`, background: css.card }}>
        <div className="px-5 py-3 flex items-center gap-2"
             style={{ borderBottom: `1px solid ${css.border}`,
                      background: "rgba(139,92,246,0.08)" }}>
          <QrCode className="h-4 w-4" style={{ color: "#8B5CF6" }} />
          <span className="text-[13px] font-semibold" style={{ color: css.text }}>
            Smart Login Credential Generated
          </span>
        </div>

        <div className="px-5 py-4 flex flex-col items-center gap-3">
          <div className="rounded-xl p-3" style={{ background: "#FFFFFF" }} data-testid="smart-login-qr-image-wrap">
            <img
              src={smartCardDataUri || result.qr_png_data_uri}
              alt={`Smart Login credential for ${result.display_name}`}
              data-testid="smart-login-qr-image"
              className={smartCardDataUri ? "w-56" : "w-48 h-48"}
            />
          </div>
          {!smartCardDataUri && (
            <div className="text-center">
              <p className="text-[13px] font-semibold" style={{ color: css.text }}>
                {result.display_name}
              </p>
              <p className="text-[11px] font-mono" style={{ color: css.textMuted }}>
                {result.clean_id}
              </p>
            </div>
          )}
        </div>

        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => setShowPayload((v) => !v)}
            data-testid="smart-login-toggle-payload"
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "#8B5CF6" }}
          >
            {showPayload ? "Hide" : "Show"} raw credential text
          </button>
          {showPayload && (
            <p
              className="mt-1.5 text-[11px] font-mono break-all rounded-lg p-2"
              style={{ background: "rgba(255,255,255,0.03)", color: css.text }}
              data-testid="smart-login-payload-text"
            >
              {result.qr_payload}
            </p>
          )}
        </div>

        <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
          <a
            href={smartCardDataUri || result.qr_png_data_uri}
            download={`eduhub-smart-login-${result.clean_id}.png`}
            data-testid="smart-login-download-png"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(139,92,246,0.18)", color: "#8B5CF6",
                     border: "1px solid rgba(139,92,246,0.4)" }}
          >
            <Download className="h-3 w-3" /> Download PNG
          </a>
          <button
            onClick={copyPayload}
            data-testid="smart-login-copy-payload"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(212,168,67,0.18)", color: "#D4A843",
                     border: "1px solid rgba(212,168,67,0.4)" }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy Text"}
          </button>
          <button
            onClick={onDone}
            data-testid="smart-login-done"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: css.aurora, color: "#1a1420",
                     border: "1px solid rgba(255,225,154,0.6)" }}
          >
            Done
          </button>
        </div>

        <div className="px-5 py-3 flex items-start gap-2 text-[11.5px]"
             style={{ background: "rgba(251,191,36,0.08)",
                      borderTop: `1px solid ${css.border}`,
                      color: css.warn }}
             data-testid="smart-login-warning">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Save or print this now. This QR is shown <strong>once</strong> and
            will never be retrievable again — the server only ever stores a
            one-way hash of it, never the credential itself. If lost, use
            Regenerate to issue a new one.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  small primitives  ───────────────────────── */
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
            style={{ color: css.textMuted }}>
        {label}{hint && <span className="ml-2 font-normal opacity-70">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, emphasis }) {
  return (
    <div className="flex">
      <span className="w-20 shrink-0" style={{ color: css.textMuted }}>
        {label}
      </span>
      <span style={{ color: emphasis ? "#FFE19A" : css.text,
                     fontWeight: emphasis ? 700 : 400 }}>
        : {value}
      </span>
    </div>
  );
}

function ConfirmDialog({ title, body, danger, onCancel, onConfirm, testId }) {
  const [busy, setBusy] = useState(false);
  return (
    <div data-testid={testId} className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
         onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
           className="rounded-2xl max-w-sm w-full p-5"
           style={{ background: css.bg, border: `1px solid ${css.borderStrong}` }}>
        <h4 className="text-[13.5px] font-semibold mb-2" style={{ color: css.text }}>
          {title}
        </h4>
        <p className="text-[12px] leading-relaxed mb-4" style={{ color: css.textMuted }}>
          {body}
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={busy}
                  data-testid={`${testId}-cancel`}
                  className="rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
                  style={{ background: "rgba(255,255,255,0.04)",
                           border: `1px solid ${css.border}`, color: css.text }}>
            Cancel
          </button>
          <button
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
            disabled={busy}
            data-testid={`${testId}-confirm`}
            className="rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
            style={{
              background: danger ? "rgba(239,68,68,0.18)" : css.aurora,
              color: danger ? css.danger : "#1a1420",
              border: danger ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,225,154,0.6)",
            }}
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// A single-button, dismiss-only dialog — for outcomes `confirm` genuinely
// cannot resolve (e.g. the schedule-assignment active-session hard block).
// Never offers a "confirm anyway" action, unlike ConfirmDialog above.
function InfoDialog({ title, body, onDismiss, testId }) {
  return (
    <div data-testid={testId} className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
         onClick={onDismiss}>
      <div onClick={(e) => e.stopPropagation()}
           className="rounded-2xl max-w-sm w-full p-5"
           style={{ background: css.bg, border: `1px solid ${css.borderStrong}` }}>
        <h4 className="text-[13.5px] font-semibold mb-2 flex items-center gap-2" style={{ color: css.text }}>
          <AlertTriangle className="h-4 w-4" style={{ color: css.danger }} />
          {title}
        </h4>
        <p className="text-[12px] leading-relaxed mb-4" style={{ color: css.textMuted }}>
          {body}
        </p>
        <div className="flex justify-end">
          <button onClick={onDismiss}
                  data-testid={`${testId}-dismiss`}
                  className="rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
                  style={{ background: css.aurora, color: "#1a1420",
                           border: "1px solid rgba(255,225,154,0.6)" }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
