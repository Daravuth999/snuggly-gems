/**
 * ScheduleTimeWindowsPanel.jsx — Author Studio "Schedule Time Windows".
 *
 * Admin control for the NEW, purely-additive time-of-day metadata
 * attached to each Schedule A/B label (schedule_time_windows.py, built
 * on eduhub_platform.config's existing generic three-tier resolver).
 * This has zero effect on schedule ASSIGNMENT or ELIGIBILITY — those
 * remain entirely owned by the existing StudentList schedule-select /
 * bulk-assignment controls this panel sits beside. A schedule label with
 * no configured time window here is displayed as "Time not yet set"
 * everywhere it's read (here and on the student dashboard) — never a
 * guessed or invented time.
 *
 * Generic by label, not hardcoded to exactly two: the label list comes
 * from the backend's own list_known_schedule_labels (every label
 * currently assigned to at least one student, union "A"/"B") — a future
 * schedule "C" appears here automatically the moment a student holds it,
 * with no change to this component.
 */
import { useCallback, useEffect, useState } from "react";
import { Clock, Pencil, History, Loader2, AlertTriangle, Check, X } from "lucide-react";
import {
  listScheduleTimeWindows,
  setScheduleTimeWindow,
  getScheduleTimeWindowHistory,
} from "../../eduhub/auth/studentAuthService";

const css = {
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text: "#F4E5C1",
  textMuted: "rgba(244,229,193,0.55)",
  gold: "#D4A843",
  goldBg: "rgba(212,168,67,0.10)",
  goldBorder: "rgba(212,168,67,0.32)",
  danger: "rgba(239, 68, 68, 0.9)",
  good: "rgba(74, 222, 128, 0.9)",
};

const inputStyle = {
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${css.border}`,
  color: css.text,
  outline: "none",
};

/** "19:00" -> "7:00 PM". Display-only formatting; the stored/transmitted
 * value is always the plain 24-hour "HH:MM" string the backend expects. */
function formatTime12h(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return hhmm || "";
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

function formatWindow(window) {
  if (!window || !window.start || !window.end) return null;
  return `${formatTime12h(window.start)} – ${formatTime12h(window.end)}`;
}

export default function ScheduleTimeWindowsPanel() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingLabel, setEditingLabel] = useState(null);
  const [historyLabel, setHistoryLabel] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listScheduleTimeWindows()
      .then(setSchedules)
      .catch((e) => setError(e.message || "Failed to load schedule time windows"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div
      data-testid="schedule-time-windows-panel"
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${css.border}`, background: css.card }}
    >
      <div
        className="px-5 py-3 flex items-center gap-2"
        style={{ borderBottom: `1px solid ${css.border}`, background: css.goldBg }}
      >
        <Clock className="h-4 w-4" style={{ color: css.gold }} />
        <span className="text-[13px] font-semibold" style={{ color: css.text }}>
          Schedule Time Windows
        </span>
      </div>

      <div className="px-5 py-3">
        <p className="text-[12px] mb-3" style={{ color: css.textMuted }}>
          Set the real-world meeting time for each schedule. Students see this
          on their dashboard. This never changes who is eligible for which
          schedule — that's still controlled by each student's Group
          assignment above.
        </p>

        {error && (
          <div className="rounded-lg px-3 py-2 mb-3 text-[12px] flex items-center gap-2"
               style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: css.danger }}
               data-testid="schedule-time-windows-error">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: css.textMuted }} />
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => (
              <ScheduleRow
                key={s.label}
                schedule={s}
                editing={editingLabel === s.label}
                showingHistory={historyLabel === s.label}
                onEdit={() => setEditingLabel(s.label)}
                onCancelEdit={() => setEditingLabel(null)}
                onSaved={() => { setEditingLabel(null); refresh(); }}
                onToggleHistory={() => setHistoryLabel(historyLabel === s.label ? null : s.label)}
              />
            ))}
            {schedules.length === 0 && (
              <p className="text-[12px] py-2" style={{ color: css.textMuted }}>
                No schedule labels found yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleRow({ schedule, editing, showingHistory, onEdit, onCancelEdit, onSaved, onToggleHistory }) {
  const { label, window } = schedule;
  const formatted = formatWindow(window);

  return (
    <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${css.border}` }}>
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-bold shrink-0"
          style={{ background: css.goldBg, border: `1px solid ${css.goldBorder}`, color: css.gold }}
        >
          {label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px]" style={{ color: formatted ? css.text : css.textMuted, fontStyle: formatted ? "normal" : "italic" }}
               data-testid={`schedule-time-window-display-${label}`}>
            {formatted || "Time not yet set"}
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleHistory}
              title="Change history"
              data-testid={`schedule-time-window-history-toggle-${label}`}
              className="rounded-md p-1.5"
              style={{ background: "rgba(255,255,255,0.04)", color: css.textMuted, border: `1px solid ${css.border}` }}
            >
              <History className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEdit}
              data-testid={`schedule-time-window-edit-${label}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ background: css.goldBg, color: css.gold, border: `1px solid ${css.goldBorder}` }}
            >
              <Pencil className="h-3 w-3" />
              {formatted ? "Edit" : "Set time"}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <EditTimeWindowForm label={label} window={window} onCancel={onCancelEdit} onSaved={onSaved} />
      )}

      {showingHistory && !editing && <TimeWindowHistory label={label} />}
    </div>
  );
}

function EditTimeWindowForm({ label, window, onCancel, onSaved }) {
  const [start, setStart] = useState(window?.start || "");
  const [end, setEnd] = useState(window?.end || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (!start || !end) { setError("Both a start and end time are required."); return; }
    setBusy(true);
    try {
      await setScheduleTimeWindow(label, { start, end });
      onSaved();
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-3 pt-3 flex items-end gap-2 flex-wrap" style={{ borderTop: `1px solid ${css.border}` }}>
      <label className="text-[11px]" style={{ color: css.textMuted }}>
        Start
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          data-testid={`schedule-time-window-start-${label}`}
          className="block mt-1 rounded-lg px-2.5 py-1.5 text-[13px]"
          style={inputStyle}
        />
      </label>
      <label className="text-[11px]" style={{ color: css.textMuted }}>
        End
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          data-testid={`schedule-time-window-end-${label}`}
          className="block mt-1 rounded-lg px-2.5 py-1.5 text-[13px]"
          style={inputStyle}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        data-testid={`schedule-time-window-save-${label}`}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ background: css.gold, color: "#1a1420", border: "1px solid rgba(255,225,154,0.6)" }}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        data-testid={`schedule-time-window-cancel-${label}`}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ background: "rgba(255,255,255,0.04)", color: css.text, border: `1px solid ${css.border}` }}
      >
        <X className="h-3 w-3" />
        Cancel
      </button>
      {error && (
        <p className="w-full text-[11.5px]" style={{ color: css.danger }} data-testid={`schedule-time-window-form-error-${label}`}>
          {error}
        </p>
      )}
    </form>
  );
}

function TimeWindowHistory({ label }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getScheduleTimeWindowHistory(label)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load history"); });
    return () => { cancelled = true; };
  }, [label]);

  return (
    <div className="mt-3 pt-3 text-[11.5px]" style={{ borderTop: `1px solid ${css.border}` }} data-testid={`schedule-time-window-history-${label}`}>
      {error && <p style={{ color: css.danger }}>{error}</p>}
      {!error && history === null && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: css.textMuted }} />}
      {!error && history && history.length === 0 && (
        <p style={{ color: css.textMuted }}>No changes recorded yet.</p>
      )}
      {!error && history && history.length > 0 && (
        <ul className="space-y-1.5">
          {history.map((h, i) => (
            <li key={i} style={{ color: css.textMuted }}>
              <span style={{ color: css.text }}>{h.by || "unknown admin"}</span>
              {" set it to "}
              <span style={{ color: css.text }}>{formatWindow(h.new_value) || "—"}</span>
              {h.old_value && (
                <> (was {formatWindow(h.old_value) || "unset"})</>
              )}
              {" — "}
              {h.at ? new Date(h.at).toLocaleString() : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
