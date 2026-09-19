/**
 * AttendanceStudio.jsx — teacher-only Attendance Studio panel.
 * Panels: Classes · Sessions · Live Roster · Needs Encouragement · Settings · Reports
 * Professional admin UI — not game-styled. All admin-only data stays here.
 */
import { useState, useEffect, useCallback } from "react";
import {
  CalendarCheck, CalendarClock, CalendarOff, Users, Radio, AlertTriangle, Settings as SettingsIcon,
  BarChart2, Plus, Pencil, Trash2, Play, Square, Bell, RefreshCw,
  Download, ChevronDown, ChevronUp, X, Check, Copy, QrCode, ClipboardEdit, Video,
} from "lucide-react";
import * as api from "./attendanceAdminApi";
import { listLoginRewardCampaigns } from "./api";
import RewardSurface from "../eduhub/pages/attendance/RewardSurface";
import { useLang } from "../eduhub/pages/portal/contexts/LanguageContext";

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString();
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  return iso.slice(0, 10);
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

// §2.5 — display-only mirror of the backend's class_matches_student_schedule
// (attendance_tools.py). Used ONLY to preview an auto-match count in this
// admin UI; the backend's live query at read time (resolve_class_roster_ids /
// the closure-local _class_roster) is the actual source of truth whenever a
// class is used for check-in, the live tile, or anything else. A class's
// Schedule A/B tag drives this automatically — no admin action creates or
// maintains it, and it's never blocked by picking students in RosterPicker
// below (that list is purely additive extras, never a replacement).
const normalizeScheduleTag = (v) => (v || "").toString().trim().toUpperCase();
const classMatchesStudentScheduleDisplay = (classGroupRaw, studentGroupRaw) => {
  const classGroup = normalizeScheduleTag(classGroupRaw);
  if (!classGroup) return false;
  const studentGroup = normalizeScheduleTag(studentGroupRaw);
  if (classGroup === "AB") return Boolean(studentGroup);
  return studentGroup === classGroup;
};

// datetime-local inputs give local time without timezone ("YYYY-MM-DDTHH:mm").
// The backend expects UTC ISO strings. These two helpers handle the round-trip.
const localDtToUtcIso = (v) => {
  if (!v) return undefined;
  const d = new Date(v);          // browser parses as LOCAL time
  return isNaN(d.getTime()) ? undefined : d.toISOString();   // → UTC
};
const utcIsoToLocalDt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);        // parsed as UTC
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  // Format as local time "YYYY-MM-DDTHH:mm" — what datetime-local expects
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TIER_COLORS = {
  bronze: "#CD7F32", silver: "#A8A9AD", gold: "#D4A843", diamond: "#b9f2ff",
};

function Pill({ children, color = "#D4A843" }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
          style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    scheduled: { label: "Scheduled", color: "#6b9fff" },
    open:       { label: "Open",      color: "#4ade80" },
    closed:     { label: "Closed",    color: "#a1a1aa" },
    present_full:    { label: "On-time",  color: "#4ade80" },
    present_partial: { label: "Late",     color: "#f59e0b" },
    late:            { label: "Late",     color: "#f59e0b" },
    absent:          { label: "Absent",   color: "#f87171" },
    pending:         { label: "Pending",  color: "#a1a1aa" },
  };
  const { label, color } = map[status] || { label: status || "—", color: "#a1a1aa" };
  return <Pill color={color}>{label}</Pill>;
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-white/10 p-5 ${className}`}
         style={{ background: "rgba(20,14,32,0.55)" }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-[14px] font-bold text-parchment mb-4">
      <Icon className="h-4 w-4 text-gold" /> {children}
    </h2>
  );
}

function Btn({ children, onClick, variant = "default", size = "sm", disabled, className = "" }) {
  const base = "inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider transition-all disabled:opacity-40";
  const sz = size === "sm" ? "px-3 py-1.5 text-[10.5px]" : "px-4 py-2 text-[12px]";
  const variants = {
    default: "border border-parchment/25 bg-walnut/50 text-parchment hover:border-gold hover:text-gold",
    gold: "text-ink border border-gold/60 hover:opacity-90",
    danger: "border border-red-400/40 bg-red-900/20 text-red-300 hover:border-red-300",
    green: "border border-emerald-400/40 bg-emerald-900/20 text-emerald-300 hover:border-emerald-300",
  };
  const style = variant === "gold"
    ? { background: "linear-gradient(135deg,#FFE19A 0%,#D4A843 50%,#9C7A2C 100%)" }
    : {};
  return (
    <button onClick={onClick} disabled={disabled} style={style}
            className={`${base} ${sz} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, required, small }) {
  return (
    <div className={small ? "" : "flex flex-col gap-1"}>
      {label && <label className="text-[11px] text-white/60 font-medium">{label}{required && " *"}</label>}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             placeholder={placeholder}
             className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-parchment placeholder-white/25 focus:border-gold/40 focus:outline-none" />
    </div>
  );
}

function Select({ label, value, onChange, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] text-white/60 font-medium">{label}</label>}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-parchment focus:border-gold/40 focus:outline-none">
        {children}
      </select>
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}

/** Draggable threshold slider (0-100%) — native range input for built-in
 * keyboard/touch support, styled to read as the mockup's own slider. */
function ThresholdSlider({ label, value, onChange, hint }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] text-white/60 font-medium">{label}</label>}
      <div className="flex items-center gap-3">
        <input
          type="range" min={0} max={100} step={1} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            accentColor: "#D4A843",
            background: `linear-gradient(90deg, #D4A843 ${value}%, rgba(255,255,255,0.1) ${value}%)`,
          }}
        />
        <span className="text-[14px] font-extrabold text-parchment w-11 text-right shrink-0">{value}%</span>
      </div>
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}

/**
 * Renders the SAME RewardSurface component the real student page uses
 * (../eduhub/pages/attendance/RewardSurface.jsx) — never a separately
 * hand-built preview mockup that could drift from what students actually
 * see. Shown in the "unlocked" state (name + points + claim button all
 * visible at once) since that's the most complete single frame for a
 * teacher to sanity-check a campaign selection against.
 */
function StudentRewardPreview({ campaign, threshold }) {
  const { t, tpl, num } = useLang();
  if (!campaign) {
    return (
      <div className="mt-4">
        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Student preview</p>
        <p className="text-[11px] text-white/40">This campaign isn't point-earning or couldn't be loaded — students will see a neutral "no reward configured" state.</p>
      </div>
    );
  }
  return (
    <div className="mt-4">
      <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">Student preview — this is what students will see</p>
      <div className="max-w-[300px]">
        <RewardSurface
          t={t} tpl={tpl} num={num} rState="unlocked"
          rewardConfigured rewardName={campaign.reward_label || campaign.name} rewardPoints={campaign.reward_points}
          stats={{ attendance_pct: Math.round((threshold ?? 0.85) * 100) }}
          requiredPct={Math.round((threshold ?? 0.85) * 100)}
          claiming={false} claimError={null} onClaim={() => {}}
        />
      </div>
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] text-white/60 font-medium">{label}</label>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder} rows={rows}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-parchment placeholder-white/25 focus:border-gold/40 focus:outline-none resize-y" />
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button type="button" onClick={() => onChange(!checked)}
              className="w-9 h-5 rounded-full border transition-all relative shrink-0"
              style={{
                background: checked ? "#D4A843" : "rgba(255,255,255,0.08)",
                borderColor: checked ? "#D4A843" : "rgba(255,255,255,0.15)",
              }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
              style={{ left: checked ? "18px" : "2px" }} />
      </button>
      <span className="text-[12px] text-white/80">{label}</span>
    </label>
  );
}

function ErrMsg({ err }) {
  if (!err) return null;
  return (
    <p className="text-[11px] text-red-400 mt-1">
      {err?.message || String(err)}
    </p>
  );
}

// ── ROSTER PICKER ─────────────────────────────────────────────────────────────
// Searchable multi-select for a class's roster. selectedIds: string[]
// NOTE: backend /api/teacher/students returns snake_case → student_id, display_name
//
// §2.5 — when the class has a real Schedule A/B tag (autoMatchGroup), this
// list is EXTRAS ONLY: students matching that tag are already included
// automatically, live, with zero action here (see class_matches_student_
// schedule / resolve_class_roster_ids in attendance_tools.py) — picking
// students below only ever ADDS on top of that, it can never disable or
// replace the automatic match. For a class with no Schedule A/B tag, this
// is the class's entire roster, exactly as before.
function RosterPicker({ selectedIds = [], onChange, autoMatchGroup = "" }) {
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.listAllStudents()
      .then((d) => setStudents(d.students || []))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, []);

  const hasAutoMatch = Boolean(normalizeScheduleTag(autoMatchGroup));
  const autoMatchedCount = hasAutoMatch
    ? students.filter((s) => classMatchesStudentScheduleDisplay(autoMatchGroup, s.group)).length
    : 0;

  const selected = new Set(selectedIds);

  const sid = (s) => s.student_id || s.studentId || s.id || "";

  const filtered = query.trim()
    ? students.filter((s) => {
        const q = query.toLowerCase();
        return (
          sid(s).toLowerCase().includes(q) ||
          (s.display_name || "").toLowerCase().includes(q) ||
          (s.group || "").toLowerCase().includes(q)
        );
      })
    : students;

  const toggle = (id) => {
    if (!id) return; // guard against undefined IDs
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const selectAll = () => onChange(filtered.map(sid).filter(Boolean));
  const clearAll  = () => onChange([]);

  const nameFor = (id) => {
    const s = students.find((x) => sid(x) === id);
    return s?.display_name || id;
  };

  return (
    <div className="space-y-2">
      {hasAutoMatch && (
        <p
          className="text-[11px] rounded-lg px-2.5 py-2 border"
          style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)", color: "#6ee7b7" }}
          data-testid="roster-auto-match-banner"
        >
          {loadingStudents
            ? "Checking auto-matched students…"
            : `${autoMatchedCount} student${autoMatchedCount !== 1 ? "s" : ""} auto-matched via Schedule ${normalizeScheduleTag(autoMatchGroup)} — live, always current, no action needed here.`}
        </p>
      )}
      <p className="text-[10px] uppercase tracking-wider text-white/45">
        {hasAutoMatch
          ? `Extra students — ${selectedIds.length} added manually, on top of the auto-match above`
          : `Roster — ${selectedIds.length} student${selectedIds.length !== 1 ? "s" : ""} selected`}
      </p>

      {/* Selected chips */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/10 min-h-[40px]">
          {selectedIds.map((id) => (
            <span key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/15 text-gold border border-gold/25">
              {nameFor(id)}
              <button type="button" onClick={() => toggle(id)} className="ml-0.5 text-gold/60 hover:text-gold">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Toggle dropdown */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] text-white/70 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <span>
          {loadingStudents
            ? "Loading students…"
            : hasAutoMatch
            ? `Add extra students (${students.length} total)`
            : `Search & select students (${students.length} total)`}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && !loadingStudents && (
        <div className="rounded-lg border border-white/10 bg-[rgba(12,8,24,0.92)] overflow-hidden">
          {/* Search row */}
          <div className="px-3 py-2 border-b border-white/5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or ID…"
              className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-white/30"
            />
          </div>
          {/* Bulk actions — separate row so mobile touches don't bleed into the search/list */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
            <button type="button" onClick={selectAll}
                    className="text-[11px] font-medium text-gold/80 hover:text-gold py-1 px-2 rounded">
              Select all ({filtered.length})
            </button>
            <span className="text-white/15 text-[10px]">|</span>
            <button type="button" onClick={clearAll}
                    className="text-[11px] font-medium text-white/40 hover:text-white/70 py-1 px-2 rounded">
              Clear
            </button>
          </div>

          {/* Student list */}
          <div className="max-h-52 overflow-y-auto divide-y divide-white/[0.04]">
            {filtered.length === 0 && (
              <p className="text-[11px] text-white/30 px-3 py-3 text-center">No students match.</p>
            )}
            {filtered.map((s) => {
              const id = sid(s);
              const checked = selected.has(id);
              return (
                <div key={id || s.display_name}
                     onClick={() => toggle(id)}
                     className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors select-none ${checked ? "bg-gold/[0.08]" : "hover:bg-white/[0.03]"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}} // controlled — click handled by parent div
                    onClick={(e) => e.stopPropagation()}
                    className="accent-gold w-4 h-4 shrink-0 pointer-events-none"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-parchment font-medium truncate">
                      {s.display_name || id}
                    </span>
                    <span className="block text-[10px] text-white/40 font-mono truncate">
                      {id}{s.group ? ` · ${s.group}` : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CLASSES PANEL ─────────────────────────────────────────────────────────────
// weekly_recurrence (§1) — 0=Mon..6=Sun, matching Python's own
// datetime.weekday() convention the backend generator uses directly.
const BLANK_WEEKLY_RECURRENCE = { enabled: false, weekdays: [], opens_time: "", closes_time: "" };
const BLANK_CLASS = {
  title_en: "", title_kh: "", teacher: "", recurrence: "", group: "", roster: [],
  weekly_recurrence: { ...BLANK_WEEKLY_RECURRENCE },
  // §1.9 — every session generate_sessions_for_class materializes from
  // this class's weekly template inherits this link automatically; no
  // more per-session manual entry after "Generate".
  default_meet_url: "",
};
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// §1.8 — global blackout calendar editor (Settings panel). Adding a date
// here means generate_sessions_for_class pre-marks any session it would
// otherwise create on that date as exception="holiday" automatically —
// no need to generate first and then except each date by hand.
function HolidayDatesEditor({ dates, onChange }) {
  const [draft, setDraft] = useState("");
  const sorted = [...(dates || [])].sort();

  const add = () => {
    if (!draft) return;
    if (!sorted.includes(draft)) onChange([...sorted, draft].sort());
    setDraft("");
  };
  const remove = (d) => onChange(sorted.filter((x) => x !== d));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-[12px] bg-white/[0.03] border border-white/10 text-white outline-none focus:border-gold/40"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft}
          className="px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-40"
          style={{ background: "#D4A843", color: "#241D0B" }}
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-[11px] text-white/35 italic">No blackout dates configured — every matching weekday generates a real session.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
              style={{ background: "rgba(255,84,112,0.10)", color: "#ff8fa3", border: "1px solid rgba(255,84,112,0.28)" }}
            >
              {d}
              <button type="button" onClick={() => remove(d)} className="hover:text-white">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekdayPicker({ selected, onChange }) {
  const toggle = (d) => {
    const next = selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d].sort();
    onChange(next);
  };
  return (
    <div className="flex gap-1.5 flex-wrap">
      {WEEKDAY_LABELS.map((label, d) => {
        const active = selected.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className="w-10 h-8 rounded-lg text-[11px] font-bold border transition-all"
            style={active
              ? { background: "#D4A843", borderColor: "#D4A843", color: "#241D0B" }
              : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ClassesPanel() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null); // null = closed, {} = new, {class_id,...} = edit
  const [saving, setSaving] = useState(false);
  const [genResult, setGenResult] = useState(null); // {class_id, created, skipped_existing} | null
  // §2.5 — fetched once here (separate from RosterPicker's own copy) purely
  // to show each class card's live auto-matched-via-Schedule-A/B count
  // instead of the old, misleading raw roster.length ("0 enrolled" for a
  // fully auto-matched class with no manual extras).
  const [allStudents, setAllStudents] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await api.listClasses();
      setClasses(d.classes || []);
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
    // Supplementary, display-only — a failure here must never block the
    // class list itself, only fall back to showing raw roster counts.
    try {
      const sd = await api.listAllStudents();
      setAllStudents(sd.students || []);
    } catch { setAllStudents([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setForm({ ...BLANK_CLASS, weekly_recurrence: { ...BLANK_WEEKLY_RECURRENCE } });
  const openEdit = (c) => setForm({
    ...c,
    roster: c.roster || [],
    // Existing classes created before §1 have no weekly_recurrence at all —
    // default to the same disabled/empty shape rather than crashing the form.
    weekly_recurrence: { ...BLANK_WEEKLY_RECURRENCE, ...(c.weekly_recurrence || {}) },
    default_meet_url: c.default_meet_url || "",
  });

  const handleSave = async () => {
    if (!form.title_en.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title_en: form.title_en.trim(),
        title_kh: form.title_kh?.trim() || "",
        teacher: form.teacher?.trim() || "",
        recurrence: form.recurrence?.trim() || "",
        group: form.group?.trim() || "",
        roster: Array.isArray(form.roster) ? form.roster : [],
        weekly_recurrence: form.weekly_recurrence || { ...BLANK_WEEKLY_RECURRENCE },
        default_meet_url: form.default_meet_url?.trim() || "",
      };
      if (form.class_id) await api.updateClass(form.class_id, payload);
      else await api.createClass(payload);
      setForm(null);
      load();
    } catch (e) { setErr(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (class_id) => {
    if (!window.confirm("Delete this class?")) return;
    try { await api.deleteClass(class_id); load(); }
    catch (e) { setErr(e); }
  };

  const handleGenerate = async (class_id) => {
    setErr(null);
    setGenResult(null);
    try {
      const res = await api.generateClassSessions(class_id, 14);
      setGenResult({ class_id, ...res });
    } catch (e) { setErr(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle icon={Users}>Classes</SectionTitle>
        <div className="flex gap-2">
          <Btn onClick={load} disabled={loading}><RefreshCw className="h-3 w-3" /> Refresh</Btn>
          <Btn variant="gold" onClick={openNew}><Plus className="h-3 w-3" /> New Class</Btn>
        </div>
      </div>

      <ErrMsg err={err} />

      {form && (
        <Card className="border-gold/20">
          <h3 className="text-[13px] font-bold text-gold mb-3">
            {form.class_id ? "Edit Class" : "New Class"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input label="Title (English)" value={form.title_en} onChange={(v) => setForm({ ...form, title_en: v })} required />
            <Input label="Title (Khmer)" value={form.title_kh || ""} onChange={(v) => setForm({ ...form, title_kh: v })} />
            <Input label="Teacher name" value={form.teacher || ""} onChange={(v) => setForm({ ...form, teacher: v })} />
            <Input label="Recurrence note (free text, e.g. Mon/Wed 9am)" value={form.recurrence || ""} onChange={(v) => setForm({ ...form, recurrence: v })} />
            <Input
              label="Schedule A/B tag"
              value={form.group || ""}
              onChange={(v) => setForm({ ...form, group: v })}
              placeholder="A, B, or AB — leave blank for a manually-rostered class"
            />
            <Input
              label="Google Meet link"
              value={form.default_meet_url || ""}
              onChange={(v) => setForm({ ...form, default_meet_url: v })}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
            />
          </div>
          <p className="text-[10.5px] text-white/35 -mt-2 mb-3">
            The Schedule A/B tag is what actually drives auto-roster assignment
            below (a student is added here the moment their own Schedule A/B is
            set to a matching value) — it isn't a free-form label like a CEFR
            level, since this codebase has no per-student CEFR data to match
            against. Leave it blank for a class you'll roster manually instead.
            The Google Meet link is saved on the class, not a session — every
            session "Generate" creates from here inherits it automatically, so
            you never have to paste it into each generated session by hand. A
            specific session can still override it individually afterward if
            one date genuinely needs a different link.
          </p>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3">
            <Toggle
              label="Recurs weekly — auto-generate real sessions ahead of time"
              checked={Boolean(form.weekly_recurrence?.enabled)}
              onChange={(v) => setForm({ ...form, weekly_recurrence: { ...form.weekly_recurrence, enabled: v } })}
            />
            {form.weekly_recurrence?.enabled && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-[11px] text-white/60 font-medium block mb-1.5">Days</label>
                  <WeekdayPicker
                    selected={form.weekly_recurrence?.weekdays || []}
                    onChange={(days) => setForm({ ...form, weekly_recurrence: { ...form.weekly_recurrence, weekdays: days } })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Opens at (24h, Cambodia time)" type="time"
                    value={form.weekly_recurrence?.opens_time || ""}
                    onChange={(v) => setForm({ ...form, weekly_recurrence: { ...form.weekly_recurrence, opens_time: v } })}
                  />
                  <Input
                    label="Closes at (24h, Cambodia time)" type="time"
                    value={form.weekly_recurrence?.closes_time || ""}
                    onChange={(v) => setForm({ ...form, weekly_recurrence: { ...form.weekly_recurrence, closes_time: v } })}
                  />
                </div>
                <p className="text-[10.5px] text-white/35">
                  Generates real sessions up to 14 days ahead — an existing
                  manually-created session, or one already marked cancelled/
                  holiday, for the same class and date is always left alone,
                  never duplicated or overwritten.
                </p>
              </div>
            )}
          </div>

          <RosterPicker
            selectedIds={form.roster || []}
            onChange={(ids) => setForm({ ...form, roster: ids })}
            autoMatchGroup={form.group || ""}
          />
          <div className="flex gap-2 mt-3">
            <Btn variant="gold" onClick={handleSave} disabled={saving || !form.title_en?.trim()}>
              <Check className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
            </Btn>
            <Btn onClick={() => setForm(null)}><X className="h-3 w-3" /> Cancel</Btn>
          </div>
        </Card>
      )}

      {loading && <p className="text-[12px] text-white/40">Loading classes…</p>}
      {!loading && classes.length === 0 && (
        <p className="text-[12px] text-white/40">No classes yet. Create one to get started.</p>
      )}

      <div className="space-y-2">
        {classes.map((c) => (
          <Card key={c.class_id}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-parchment truncate">{c.title_en}</p>
                {c.title_kh && <p className="text-[11px] text-white/50">{c.title_kh}</p>}
                <div className="flex flex-wrap gap-2 mt-1">
                  {c.teacher && <span className="text-[10px] text-white/50">Teacher: {c.teacher}</span>}
                  {c.recurrence && <span className="text-[10px] text-white/50">· {c.recurrence}</span>}
                  {c.group && <Pill color="#6b9fff">{c.group}</Pill>}
                  {c.weekly_recurrence?.enabled && (
                    <Pill color="#D4A843">
                      {(c.weekly_recurrence.weekdays || []).map((d) => WEEKDAY_LABELS[d]).join("/")}{" "}
                      {c.weekly_recurrence.opens_time}–{c.weekly_recurrence.closes_time}
                    </Pill>
                  )}
                  {c.weekly_recurrence?.enabled && (
                    c.default_meet_url ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "#8ab4f8" }} title={c.default_meet_url}>
                        <Video className="h-2.5 w-2.5" /> Meet link set
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400" title="Generated sessions will have no join link until you add one">
                        <Video className="h-2.5 w-2.5" /> No Meet link yet
                      </span>
                    )
                  )}
                  {normalizeScheduleTag(c.group) ? (
                    <span className="text-[10px] font-medium" style={{ color: "#6ee7b7" }} data-testid="class-card-auto-match-count">
                      {allStudents.filter((s) => classMatchesStudentScheduleDisplay(c.group, s.group)).length} auto-matched
                      {(c.roster || []).length > 0 ? ` +${(c.roster || []).length} extra` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/40">{(c.roster || []).length} enrolled</span>
                  )}
                </div>
                {genResult?.class_id === c.class_id && (
                  <p className="text-[10.5px] text-emerald-300 mt-1.5">
                    {genResult.created?.length
                      ? `Created ${genResult.created.length} session(s).`
                      : "No new sessions to create."}
                    {genResult.skipped_existing?.length
                      ? ` Skipped ${genResult.skipped_existing.length} date(s) — a session already exists.`
                      : ""}
                    {genResult.reason === "recurrence_disabled" && " Weekly recurrence isn't enabled for this class."}
                    {genResult.reason === "template_incomplete" && " Set days + opens/closes time first."}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {c.weekly_recurrence?.enabled && (
                  <Btn onClick={() => handleGenerate(c.class_id)} title="Generate the next 14 days of sessions from this class's weekly template">
                    <CalendarClock className="h-3 w-3" /> Generate
                  </Btn>
                )}
                <Btn onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Btn>
                <Btn variant="danger" onClick={() => handleDelete(c.class_id)}><Trash2 className="h-3 w-3" /></Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── SESSIONS PANEL ────────────────────────────────────────────────────────────
const BLANK_SESSION = {
  class_id: "", date: "", opens_at: "", closes_at: "", meet_url: "",
  grace_minutes: "", mid_session_enabled: true,
};

// A session that was never genuinely available to attend — excluded from
// every student's monthly denominator, and closing it never generates
// "absent" records (see attendance_tools.py's _do_close guard). Only these
// four values are backend-supported.
const EXCEPTION_LABELS = {
  cancelled: "Cancelled",
  teacher_unavailable: "Teacher unavailable",
  holiday: "Holiday / No class",
  technical_issue: "Technical issue",
};

function SessionsPanel() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [filterClass, setFilterClass] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [qrModal, setQrModal] = useState(null); // { loading, error, dataUri }

  const loadClasses = useCallback(async () => {
    try { const d = await api.listClasses(); setClasses(d.classes || []); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await api.listSessions(filterClass || undefined);
      setSessions(d.sessions || []);
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, [filterClass]);

  useEffect(() => { loadClasses(); }, [loadClasses]);
  useEffect(() => { load(); }, [load]);

  const toast = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3500); };

  const handleAction = async (fn, ...args) => {
    try { const r = await fn(...args); load(); return r; }
    catch (e) { setErr(e); }
  };

  const handleOpen = async (session_id) => {
    const r = await handleAction(api.openSession, session_id);
    if (r?.ok) toast(`Session opened. Push sent: ${r.live_now_push_sent ?? 0}`);
  };

  const handleClose = async (session_id) => {
    if (!window.confirm("Close session and finalize all attendance records?")) return;
    const r = await handleAction(api.closeSession, session_id);
    if (r?.ok)
      toast(`Closed. Present: ${r.present_count}, Absent: ${r.absent_count}, Rewards: ${r.rewards_credited}`);
  };

  const handleNudge = async (session_id) => {
    const r = await handleAction(api.closingSoonNudge, session_id);
    if (r?.ok) toast(`Closing-soon nudge sent to ${r.sent} students (${r.pending_count} pending)`);
  };

  const handleSetException = async (session_id, exception) => {
    let reason = "";
    if (exception) {
      reason = window.prompt(
        `Mark this session "${EXCEPTION_LABELS[exception]}"?\n\nStudents will not be penalized for it — it's excluded from their monthly attendance calculation entirely.\n\nReason (optional, kept in the audit trail):`,
        "",
      );
      if (reason === null) return; // cancelled the prompt
    } else if (!window.confirm("Restore this session to counting normally?")) {
      return;
    }
    try {
      await api.setSessionException(session_id, { exception, reason: reason || "" });
      toast(exception ? `Marked "${EXCEPTION_LABELS[exception]}" — excluded from attendance.` : "Session restored to counting normally.");
      load();
    } catch (e) { setErr(e); }
  };

  const handleSave = async () => {
    if (!form.class_id) return;
    setSaving(true);
    try {
      const payload = {
        class_id: form.class_id,
        date: form.date || undefined,
        opens_at: localDtToUtcIso(form.opens_at),    // local → UTC
        closes_at: localDtToUtcIso(form.closes_at),  // local → UTC
        meet_url: form.meet_url || "",
        grace_minutes: form.grace_minutes !== "" ? Number(form.grace_minutes) : undefined,
        mid_session_enabled: form.mid_session_enabled,
      };
      if (form.session_id) await api.updateSession(form.session_id, payload);
      else await api.createSession(payload);
      setForm(null);
      load();
    } catch (e) { setErr(e); }
    finally { setSaving(false); }
  };

  const copyJoinLink = (slug) => {
    const base = window.location.origin;
    navigator.clipboard?.writeText(`${base}/attendance/j/${slug}`);
    toast("Join link copied!");
  };

  const showQr = async (session_id, slug) => {
    const joinUrl = `${window.location.origin}/attendance/j/${slug}`;
    setQrModal({ loading: true, error: null, dataUri: null });
    try {
      const r = await api.getSessionQr(session_id, joinUrl);
      setQrModal({ loading: false, error: null, dataUri: r.qr_png_data_uri });
    } catch (e) {
      setQrModal({ loading: false, error: e.message || "Couldn't generate QR", dataUri: null });
    }
  };

  const className = (class_id) =>
    classes.find((c) => c.class_id === class_id)?.title_en || class_id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle icon={CalendarCheck}>Sessions</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-parchment focus:outline-none">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.title_en}</option>)}
          </select>
          <Btn onClick={load} disabled={loading}><RefreshCw className="h-3 w-3" /> Refresh</Btn>
          <Btn variant="gold" onClick={() => setForm({ ...BLANK_SESSION })}><Plus className="h-3 w-3" /> New Session</Btn>
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-4 py-2.5 text-[12px] text-emerald-300">
          {actionMsg}
        </div>
      )}
      <ErrMsg err={err} />

      {form && (
        <Card className="border-gold/20">
          <h3 className="text-[13px] font-bold text-gold mb-3">
            {form.session_id ? "Edit Session" : "New Session"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-white/60 font-medium">Class *</label>
              <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-parchment focus:outline-none">
                <option value="">Select a class…</option>
                {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.title_en}</option>)}
              </select>
            </div>
            <Input label="Date (YYYY-MM-DD)" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
            <Input label="Opens at (your local time)" type="datetime-local" value={form.opens_at || ""} onChange={(v) => setForm({ ...form, opens_at: v })} />
            <Input label="Closes at (your local time)" type="datetime-local" value={form.closes_at || ""} onChange={(v) => setForm({ ...form, closes_at: v })} />
            <Input label="Google Meet URL" value={form.meet_url || ""} onChange={(v) => setForm({ ...form, meet_url: v })} placeholder="https://meet.google.com/..." />
            <Input label="Grace window (minutes)" type="number" value={form.grace_minutes} onChange={(v) => setForm({ ...form, grace_minutes: v })} placeholder="10" />
          </div>
          <Toggle label="Mid-session confirmation required" checked={form.mid_session_enabled}
                  onChange={(v) => setForm({ ...form, mid_session_enabled: v })} />
          <div className="flex gap-2 mt-3">
            <Btn variant="gold" onClick={handleSave} disabled={saving || !form.class_id}>
              <Check className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
            </Btn>
            <Btn onClick={() => setForm(null)}><X className="h-3 w-3" /> Cancel</Btn>
          </div>
        </Card>
      )}

      {loading && <p className="text-[12px] text-white/40">Loading sessions…</p>}
      {!loading && sessions.length === 0 && (
        <p className="text-[12px] text-white/40">No sessions found.</p>
      )}

      <div className="space-y-2">
        {sessions.map((s) => (
          <Card key={s.session_id}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-semibold text-parchment">{className(s.class_id)}</p>
                  <StatusBadge status={s.status} />
                  {s.exception && <Pill color="#f59e0b">{EXCEPTION_LABELS[s.exception] || s.exception}</Pill>}
                  {s.date && <span className="text-[10px] text-white/40">{s.date}</span>}
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-white/45">
                  <span>Opens: {fmt(s.opens_at)}</span>
                  <span>Closes: {fmt(s.closes_at)}</span>
                  {s.grace_minutes && <span>Grace: {s.grace_minutes}m</span>}
                </div>
                {s.join_slug && (
                  <div className="mt-1 flex items-center gap-3 flex-wrap">
                    <button onClick={() => copyJoinLink(s.join_slug)}
                            className="flex items-center gap-1 text-[10px] text-gold/70 hover:text-gold transition-colors">
                      <Copy className="h-2.5 w-2.5" /> Copy join link (/attendance/j/{s.join_slug})
                    </button>
                    <button onClick={() => showQr(s.session_id, s.join_slug)}
                            data-testid="attendance-session-show-qr"
                            className="flex items-center gap-1 text-[10px] text-gold/70 hover:text-gold transition-colors">
                      <QrCode className="h-2.5 w-2.5" /> Show QR
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap shrink-0 items-center">
                <select
                  value={s.exception || ""}
                  onChange={(e) => handleSetException(s.session_id, e.target.value || null)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-parchment focus:outline-none"
                  title="Session status — mark cancelled/unavailable classes so they never count against students"
                  data-testid="attendance-session-exception-select"
                >
                  <option value="">Held (normal)</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="teacher_unavailable">Teacher unavailable</option>
                  <option value="holiday">Holiday / No class</option>
                  <option value="technical_issue">Technical issue</option>
                </select>
                {s.status === "scheduled" && (
                  <Btn variant="green" onClick={() => handleOpen(s.session_id)}>
                    <Play className="h-3 w-3" /> Open
                  </Btn>
                )}
                {s.status === "open" && (
                  <>
                    <Btn onClick={() => handleNudge(s.session_id)}>
                      <Bell className="h-3 w-3" /> Nudge
                    </Btn>
                    <Btn variant="danger" onClick={() => handleClose(s.session_id)}>
                      <Square className="h-3 w-3" /> Close
                    </Btn>
                  </>
                )}
                <Btn onClick={() => setForm({
                  ...s,
                  opens_at: utcIsoToLocalDt(s.opens_at),   // UTC → local for input
                  closes_at: utcIsoToLocalDt(s.closes_at), // UTC → local for input
                  roster: undefined,
                })}>
                  <Pencil className="h-3 w-3" />
                </Btn>
                <Btn variant="danger" onClick={() => handleAction(api.deleteSession, s.session_id)}>
                  <Trash2 className="h-3 w-3" />
                </Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
             onClick={() => setQrModal(null)} data-testid="attendance-qr-modal">
          <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 max-w-xs w-full text-center"
               onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold text-parchment mb-3">Scan to check in</p>
            {qrModal.loading && <p className="text-[12px] text-white/40 py-8">Generating…</p>}
            {qrModal.error && (
              <p className="text-[12px] text-red-400 py-8 flex items-center justify-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {qrModal.error}
              </p>
            )}
            {qrModal.dataUri && (
              <div className="rounded-xl p-3 bg-white inline-block">
                <img src={qrModal.dataUri} alt="Session join QR code" className="w-48 h-48"
                     data-testid="attendance-qr-image" />
              </div>
            )}
            <Btn onClick={() => setQrModal(null)} className="mt-4 mx-auto">
              <X className="h-3 w-3" /> Close
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TODAY'S CLASS PANEL ────────────────────────────────────────────────────────
// Merges the old Sessions-panel actions (Copy Link/Show QR/Close) with a REAL
// per-student roster (name, check-in time, status) for whichever session(s)
// are open right now — one glanceable card instead of separate Sessions/Live
// Roster tabs. Sessions (full CRUD/history across all time) stays a separate
// panel; this one is scoped to "what's live right now."
function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}

function TodaysClassPanel() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [rosters, setRosters] = useState({}); // session_id -> roster response
  const [selectedClass, setSelectedClass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [qrModal, setQrModal] = useState(null);

  const loadClasses = useCallback(async () => {
    try { const d = await api.listClasses(); setClasses(d.classes || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadClasses(); }, [loadClasses]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sessData = await api.listSessions(selectedClass || undefined);
      const open = (sessData.sessions || []).filter((s) => s.status === "open");
      setSessions(open);
      const entries = await Promise.all(
        open.map((s) =>
          api.getSessionRoster(s.session_id)
            .then((r) => [s.session_id, r])
            .catch(() => [s.session_id, null]),
        ),
      );
      setRosters(Object.fromEntries(entries));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, [selectedClass]);
  useEffect(() => { load(); }, [load]);

  const toast = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3500); };

  const copyJoinLink = (slug) => {
    const base = window.location.origin;
    navigator.clipboard?.writeText(`${base}/attendance/j/${slug}`);
    toast("Join link copied!");
  };

  const showQr = async (session_id, slug) => {
    const joinUrl = `${window.location.origin}/attendance/j/${slug}`;
    setQrModal({ loading: true, error: null, dataUri: null });
    try {
      const r = await api.getSessionQr(session_id, joinUrl);
      setQrModal({ loading: false, error: null, dataUri: r.qr_png_data_uri });
    } catch (e) {
      setQrModal({ loading: false, error: e.message || "Couldn't generate QR", dataUri: null });
    }
  };

  const handleClose = async (session_id) => {
    if (!window.confirm("Close attendance and finalize all records for this session?")) return;
    try {
      const r = await api.closeSession(session_id);
      if (r?.ok) toast(`Closed. Present: ${r.present_count}, Absent: ${r.absent_count}, Rewards: ${r.rewards_credited}`);
      load();
    } catch (e) { setErr(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle icon={Radio}>Today's Class</SectionTitle>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-parchment focus:outline-none">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.title_en}</option>)}
          </select>
          <Btn onClick={load} disabled={loading}><RefreshCw className="h-3 w-3" /> Refresh</Btn>
          {lastUpdated && <span className="text-[10px] text-white/30">Updated {lastUpdated}</span>}
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-4 py-2.5 text-[12px] text-emerald-300">
          {actionMsg}
        </div>
      )}
      <ErrMsg err={err} />

      {sessions.length === 0 && !loading && (
        <Card>
          <p className="text-[12px] text-white/50 text-center py-4">No class is live right now.</p>
        </Card>
      )}

      {sessions.map((s) => {
        const cls = classes.find((c) => c.class_id === s.class_id);
        const roster = rosters[s.session_id];
        return (
          <Card key={s.session_id} className="border-emerald-400/20">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[13px] font-bold text-emerald-300">{cls?.title_en || s.class_id}</p>
              <span className="text-[10px] text-white/40">Closes: {fmt(s.closes_at)}</span>
              {roster && (
                <span className="ml-auto text-[16px] font-extrabold text-parchment">
                  {roster.checked_in} / {roster.total} <span className="text-[10px] font-normal text-white/40">checked in</span>
                </span>
              )}
            </div>

            {roster && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg py-1.5 text-center bg-emerald-900/20">
                  <div className="text-[15px] font-extrabold text-emerald-400">{roster.present}</div>
                  <div className="text-[9px] uppercase tracking-wide text-white/40">Present</div>
                </div>
                <div className="rounded-lg py-1.5 text-center bg-amber-900/20">
                  <div className="text-[15px] font-extrabold text-amber-400">{roster.late}</div>
                  <div className="text-[9px] uppercase tracking-wide text-white/40">Late</div>
                </div>
                <div className="rounded-lg py-1.5 text-center bg-red-900/10">
                  <div className="text-[15px] font-extrabold text-red-400">{roster.absent}</div>
                  <div className="text-[9px] uppercase tracking-wide text-white/40">Absent</div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 mb-3">
              <Btn variant="gold" onClick={() => copyJoinLink(s.join_slug)}>
                <Copy className="h-3 w-3" /> Copy Attendance Link
              </Btn>
              <Btn onClick={() => showQr(s.session_id, s.join_slug)}>
                <QrCode className="h-3 w-3" /> Show QR
              </Btn>
              <Btn variant="danger" onClick={() => handleClose(s.session_id)}>
                <Square className="h-3 w-3" /> Close Attendance
              </Btn>
            </div>

            {loading && <p className="text-[11px] text-white/40">Loading roster…</p>}
            {!loading && roster && (
              <div className="max-h-[280px] overflow-y-auto divide-y divide-white/5">
                {roster.roster.map((r) => (
                  <div key={r.student_id} className="flex items-center gap-2.5 py-2">
                    <span className="h-6.5 w-6.5 rounded-full flex items-center justify-center shrink-0 bg-white/8 text-[10px] font-bold text-parchment">
                      {initials(r.display_name)}
                    </span>
                    <span className="flex-1 text-[12px] font-medium text-parchment truncate">{r.display_name}</span>
                    <span className="text-[10px] text-white/35">{r.checked_in_at ? fmt(r.checked_in_at) : "—"}</span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
                {roster.roster.length === 0 && (
                  <p className="text-[11px] text-white/40 py-3 text-center">No roster configured for this class yet.</p>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
             onClick={() => setQrModal(null)} data-testid="attendance-qr-modal">
          <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 max-w-xs w-full text-center"
               onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-bold text-parchment mb-3">Scan to check in</p>
            {qrModal.loading && <p className="text-[12px] text-white/40 py-8">Generating…</p>}
            {qrModal.error && (
              <p className="text-[12px] text-red-400 py-8 flex items-center justify-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {qrModal.error}
              </p>
            )}
            {qrModal.dataUri && (
              <div className="rounded-xl p-3 bg-white inline-block">
                <img src={qrModal.dataUri} alt="Session join QR code" className="w-48 h-48"
                     data-testid="attendance-qr-image" />
              </div>
            )}
            <Btn onClick={() => setQrModal(null)} className="mt-4 mx-auto">
              <X className="h-3 w-3" /> Close
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NEEDS ENCOURAGEMENT PANEL ─────────────────────────────────────────────────
function NeedsEncouragementPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [nudging, setNudging] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setData(await api.getAtRisk()); }
    catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNudge = async () => {
    setNudging(true);
    try {
      const r = await api.fireAtRiskNudge();
      setNudgeMsg(`Nudge sent to ${r.sent} student(s). Candidates: ${r.candidates}`);
    } catch (e) { setErr(e); }
    finally { setNudging(false); }
  };

  const students = data?.students || [];
  const threshold = data?.threshold ?? 70;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle icon={AlertTriangle}>Needs Encouragement</SectionTitle>
        <div className="flex gap-2">
          <Btn onClick={load} disabled={loading}><RefreshCw className="h-3 w-3" /> Refresh</Btn>
          <Btn variant="gold" onClick={handleNudge} disabled={nudging || students.length === 0}>
            <Bell className="h-3 w-3" /> {nudging ? "Sending…" : "Send Nudge to All"}
          </Btn>
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-900/10 px-4 py-3 text-[12px] text-amber-300/80">
        Private teacher view — these students have a risk score ≥ {threshold}. This list is never
        shown to students. Use nudges to offer support proactively.
      </div>

      <ErrMsg err={err} />
      {nudgeMsg && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-4 py-2.5 text-[12px] text-emerald-300">
          {nudgeMsg}
        </div>
      )}

      {loading && <p className="text-[12px] text-white/40">Loading…</p>}
      {!loading && students.length === 0 && (
        <Card>
          <p className="text-[13px] text-emerald-300 text-center py-4">
            No students currently need encouragement. Keep it up!
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {students.map((s) => (
          <Card key={s.student_id}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-parchment font-mono">{s.student_id}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-[10px] text-white/45">
                    Attendance: {s.attendance_rate != null ? `${Math.round(s.attendance_rate * 100)}%` : "—"}
                  </span>
                  <span className="text-[10px] text-white/45">
                    On-time: {s.on_time_rate_rolling != null ? `${Math.round(s.on_time_rate_rolling * 100)}%` : "—"}
                  </span>
                  <span className="text-[10px] text-white/45">Streak: {s.current_streak ?? 0}</span>
                  <Pill color={TIER_COLORS[s.reliability_tier] || "#a1a1aa"}>{s.reliability_tier || "bronze"}</Pill>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-bold" style={{ color: s.risk_score >= 85 ? "#f87171" : "#f59e0b" }}>
                  {s.risk_score ?? "—"}
                </p>
                <p className="text-[9px] text-white/30">risk score</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── SETTINGS PANEL ────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  checkin_window_minutes: 90,
  late_grace_minutes: 10,
  mid_session_enabled: true,
  miss_threshold: 3,
  escalation_threshold: 70,
  base_attendance_points: 5,
  v2_enabled: false,
  monthly_reward_enabled: false,
  monthly_reward_threshold_pct: 0.85,
  // References an existing Login Reward campaign by id — the reward's real
  // name/points/status are never duplicated into attendance settings.
  monthly_reward_campaign_id: null,
  // Attendance Cycle effective date (ISO "YYYY-MM-DD"). null = no cutoff —
  // sessions before it never count toward a student's monthly percentage,
  // so a mid-month launch doesn't retroactively penalize pre-launch classes.
  attendance_cycle_start: null,
  // §1.8 — global blackout calendar (public holidays / no-class days),
  // ISO "YYYY-MM-DD" strings. generate_sessions_for_class checks this for
  // every class's weekly template, so an admin sets it once here instead
  // of generating then manually marking each affected date one at a time.
  holiday_dates: [],
  notifications: {
    live_now_enabled: true,
    closing_soon_enabled: true,
    mid_session_push_enabled: true,
    predictive_at_risk_enabled: false,
  },
};

function SettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsErr, setCampaignsErr] = useState(null);
  const [preview, setPreview] = useState(null); // { qualifying, total } | null
  const [previewLoading, setPreviewLoading] = useState(false);
  // What's actually saved on the server — compared against the in-progress
  // edit at Save time so changing the Attendance Cycle date specifically
  // (it affects every student's eligibility) gets its own confirmation.
  const [savedCycleStart, setSavedCycleStart] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getSettings();
      const s = d.settings || DEFAULT_SETTINGS;
      setSettings(s);
      setSavedCycleStart(s.attendance_cycle_start || null);
    }
    catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const d = await listLoginRewardCampaigns();
      setCampaigns(d.campaigns || []);
    } catch (e) { setCampaignsErr(e); }
  }, []);

  useEffect(() => { load(); loadCampaigns(); }, [load, loadCampaigns]);

  // Live "N/M students currently qualify" preview — recalculated server-side
  // (never a client-side estimate) as the admin drags the threshold slider,
  // debounced so dragging doesn't fire a request per pixel.
  const thresholdPct = settings?.monthly_reward_threshold_pct;
  const cycleStartDraft = settings?.attendance_cycle_start;
  useEffect(() => {
    if (!settings?.monthly_reward_enabled || thresholdPct == null) { setPreview(null); return; }
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      // cycleStartDraft is the in-progress edit, not yet saved — the preview
      // reflects it as a candidate so an admin sees the eligibility impact
      // of BOTH the threshold slider and the cycle date before saving either.
      api.getMonthlyRewardPreview({ thresholdPct, cycleStart: cycleStartDraft || undefined })
        .then((d) => setPreview(d))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [thresholdPct, cycleStartDraft, settings?.monthly_reward_enabled]);

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));
  const setNotif = (key, value) =>
    setSettings((prev) => ({ ...prev, notifications: { ...(prev.notifications || {}), [key]: value } }));

  const handleSave = async () => {
    const newCycleStart = settings.attendance_cycle_start || null;
    if (newCycleStart !== savedCycleStart) {
      const msg = newCycleStart
        ? `Set the Attendance Cycle to start ${newCycleStart}?\n\nClasses before this date will no longer count toward any student's monthly attendance requirement or reward eligibility — this recalculates immediately for everyone.`
        : "Remove the Attendance Cycle start date?\n\nEvery class this month will count toward attendance again, including ones before the date you're removing.";
      if (!window.confirm(msg)) return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.saveSettings(settings);
      setSavedCycleStart(newCycleStart);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setErr(e); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-[12px] text-white/40">Loading settings…</p>;
  if (!settings) return <ErrMsg err={err} />;

  const notif = settings.notifications || {};
  const pointCampaigns = campaigns.filter(
    (c) => c.reward_kind !== "voucher" && Number(c.reward_points || 0) > 0
  );
  const selectedCampaign = pointCampaigns.find((c) => c.id === settings.monthly_reward_campaign_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle icon={SettingsIcon}>Settings</SectionTitle>
        <Btn variant="gold" onClick={handleSave} disabled={saving}>
          <Check className="h-3 w-3" /> {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
        </Btn>
      </div>

      <ErrMsg err={err} />

      <Card>
        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-3">Check-in Window</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Check-in window (minutes)" type="number" value={settings.checkin_window_minutes ?? 90}
                 onChange={(v) => set("checkin_window_minutes", Number(v))} />
          <Input label="Late grace period (minutes)" type="number" value={settings.late_grace_minutes ?? 10}
                 onChange={(v) => set("late_grace_minutes", Number(v))} />
          <Input label="Miss threshold (sessions)" type="number" value={settings.miss_threshold ?? 3}
                 onChange={(v) => set("miss_threshold", Number(v))} />
        </div>
        <div className="mt-3">
          <Toggle label="Mid-session confirmation required by default"
                  checked={!!settings.mid_session_enabled}
                  onChange={(v) => set("mid_session_enabled", v)} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <CalendarOff className="h-3.5 w-3.5" style={{ color: "#ff8fa3" }} />
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Holiday &amp; No-Class Dates</p>
        </div>
        <p className="text-[11px] text-white/40 mb-3">
          Applies across every class's weekly recurring schedule — a public
          holiday closes the whole school, not one class. On "Generate", any
          date here is still created as a real session (never a silent gap)
          but is automatically marked as a holiday exception, so student
          countdowns and attendance requirements skip past it correctly.
        </p>
        <HolidayDatesEditor
          dates={settings.holiday_dates || []}
          onChange={(dates) => set("holiday_dates", dates)}
        />
      </Card>

      <Card>
        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1">Attendance Points</p>
        <p className="text-[11px] text-white/40 mb-3">
          Points accumulated automatically when a student receives a
          qualifying Present attendance — every eligible session, no claim
          button. This is separate from the Monthly Attendance Reward
          below, which is claimed once per month after a percentage goal is
          met.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Points per eligible Present session"
                  value={String(settings.base_attendance_points ?? 1)}
                  onChange={(v) => set("base_attendance_points", Number(v))}
                  hint="Accumulated when a student receives a qualifying Present attendance.">
            <option value="1">1 point</option>
            <option value="2">2 points</option>
            <option value="3">3 points</option>
          </Select>
          <Input label="At-risk escalation threshold (risk score)" type="number"
                 value={settings.escalation_threshold ?? 70}
                 onChange={(v) => set("escalation_threshold", Number(v))} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <p className="text-[11px] text-white/40 mb-1">Tier multipliers (read-only — edit in code)</p>
          <table className="text-[11px] w-full">
            <thead>
              <tr className="text-white/30 border-b border-white/10">
                <th className="text-left pb-1 font-medium">Tier</th>
                <th className="text-center pb-1 font-medium">Min Attendance</th>
                <th className="text-center pb-1 font-medium">Min On-time</th>
                <th className="text-center pb-1 font-medium">Multiplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(settings.reward_tiers || []).map((t) => (
                <tr key={t.tier} className="text-white/60">
                  <td className="py-1 capitalize font-bold" style={{ color: TIER_COLORS[t.tier] }}>{t.tier}</td>
                  <td className="text-center">{Math.round(t.min_attendance_rate * 100)}%</td>
                  <td className="text-center">{Math.round(t.min_on_time_rate * 100)}%</td>
                  <td className="text-center">{t.multiplier}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1">Attendance v2</p>
        <p className="text-[11px] text-white/40 mb-3">
          This DB toggle is one of two switches — the ATTENDANCE_V2_ENABLED
          environment variable must also be set (infra-level, not editable
          here) before v2 activates for students. Both off by default.
        </p>
        <Toggle label="Enable attendance v2 (new analytics page + status model)"
                checked={!!settings.v2_enabled}
                onChange={(v) => set("v2_enabled", v)} />

        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mt-4 mb-1">
          Attendance Cycle
        </p>
        <p className="text-[11px] text-white/40 mb-2">
          Effective from — classes before this date are excluded from every
          student's monthly attendance requirement and reward eligibility.
          Set this when Attendance launches mid-month so no one is
          penalized for classes that happened before the system went live.
          Leave blank for no cutoff.
        </p>
        <Input label="Effective from" type="date"
               value={settings.attendance_cycle_start || ""}
               onChange={(v) => set("attendance_cycle_start", v || null)} />

        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mt-4 mb-1">
          Monthly Attendance Reward
        </p>
        <p className="text-[11px] text-white/40 mb-3">
          Students can claim this reward once after meeting the monthly
          attendance requirement — separate from Attendance Points above,
          which accumulate per session with no claim step.
        </p>
        <Toggle label="Enable monthly reward"
                checked={!!settings.monthly_reward_enabled}
                onChange={(v) => set("monthly_reward_enabled", v)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <ThresholdSlider label="Attendance required"
                 value={Math.round((settings.monthly_reward_threshold_pct ?? 0.85) * 100)}
                 onChange={(v) => set("monthly_reward_threshold_pct", v / 100)}
                 hint="Percentage of scheduled classes a student must attend" />
          <Select label="Reward campaign (Login Rewards)"
                  value={settings.monthly_reward_campaign_id || ""}
                  onChange={(v) => set("monthly_reward_campaign_id", v || null)}
                  hint={
                    campaignsErr
                      ? "Couldn't load campaigns — reload to try again."
                      : selectedCampaign
                        ? `${selectedCampaign.reward_points} pts · ${selectedCampaign.status === "live" ? "live now" : selectedCampaign.status}`
                        : "The reward's real name and points come from this campaign — configured in Login Rewards, not here."
                  }>
            <option value="">— No reward attached —</option>
            {pointCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reward_label || c.name} · {c.reward_points} pts
                {c.status !== "live" ? ` (${c.status})` : ""}
              </option>
            ))}
          </Select>
        </div>

        {settings.monthly_reward_enabled && settings.monthly_reward_campaign_id && (
          <StudentRewardPreview campaign={selectedCampaign} threshold={settings.monthly_reward_threshold_pct} />
        )}

        {settings.monthly_reward_enabled && (
          <div className="mt-4 rounded-xl border border-emerald-400/25 px-4 py-3 flex items-center gap-3"
               style={{ background: "rgba(74,222,128,0.08)" }}>
            <span className="text-[22px] font-extrabold text-emerald-400 tabular-nums shrink-0">
              {previewLoading ? "…" : preview ? `${preview.qualifying} / ${preview.total}` : "—"}
            </span>
            <p className="text-[11.5px] text-white/60 leading-snug">
              students currently meet this threshold for {(preview?.period) || "this month"} — recalculated
              live as you adjust the slider, before you save.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-3">Notifications</p>
        <div className="flex flex-col gap-3">
          <Toggle label="Send 'Live Now' push when session opens"
                  checked={!!notif.live_now_enabled} onChange={(v) => setNotif("live_now_enabled", v)} />
          <Toggle label="Enable 'Closing Soon' nudge for pending check-ins"
                  checked={!!notif.closing_soon_enabled} onChange={(v) => setNotif("closing_soon_enabled", v)} />
          <Toggle label="Mid-session confirmation push"
                  checked={!!notif.mid_session_push_enabled} onChange={(v) => setNotif("mid_session_push_enabled", v)} />
          <Toggle label="Predictive at-risk nudges (auto-fires daily)"
                  checked={!!notif.predictive_at_risk_enabled} onChange={(v) => setNotif("predictive_at_risk_enabled", v)} />
        </div>
      </Card>
    </div>
  );
}

// ── REPORTS PANEL ─────────────────────────────────────────────────────────────
function ReportsPanel() {
  const [classes, setClasses] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [classId, setClassId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.listClasses().then((d) => setClasses(d.classes || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setReport(await api.getReport(month, classId || undefined)); }
    catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, [month, classId]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!report?.per_student?.length) return;
    const rows = [
      ["Student ID", "Present", "Late", "Absent", "Attendance%", "On-time%", "Streak", "Tier"],
      ...report.per_student.map((s) => [
        s.student_id, s.present_full, (s.late || 0) + (s.present_partial || 0), s.absent,
        s.attendance_pct, s.on_time_pct, s.current_streak, s.reliability_tier,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${month}${classId ? `-${classId}` : ""}.csv`;
    a.click();
  };

  const [expandedDate, setExpandedDate] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle icon={BarChart2}>Reports</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          <Btn onClick={exportCSV} disabled={!report?.per_student?.length}>
            <Download className="h-3 w-3" /> Export CSV
          </Btn>
          <Btn onClick={load} disabled={loading}><RefreshCw className="h-3 w-3" /> Refresh</Btn>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-white/50">Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                 className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-parchment focus:outline-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-white/50">Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-parchment focus:outline-none">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.title_en}</option>)}
          </select>
        </div>
      </div>

      <ErrMsg err={err} />
      {loading && <p className="text-[12px] text-white/40">Loading report…</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Sessions", value: report.sessions, color: "#6b9fff" },
              { label: "On-time", value: report.per_class?.present_full || 0, color: "#4ade80" },
              { label: "Late", value: (report.per_class?.late || 0) + (report.per_class?.present_partial || 0), color: "#f59e0b" },
              { label: "Absent", value: report.per_class?.absent || 0, color: "#f87171" },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <p className="text-[11px] text-white/40">{label}</p>
                <p className="text-[22px] font-bold mt-0.5" style={{ color }}>{value}</p>
              </Card>
            ))}
          </div>

          {report.by_date?.length > 0 && (
            <Card>
              <button onClick={() => setExpandedDate(expandedDate ? null : "all")}
                      className="flex items-center gap-2 w-full text-left text-[12px] font-bold text-parchment">
                By Date {expandedDate ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expandedDate && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-white/30 border-b border-white/10">
                        <th className="text-left pb-1 font-medium">Date</th>
                        <th className="text-center pb-1 font-medium">Present</th>
                        <th className="text-center pb-1 font-medium">Partial</th>
                        <th className="text-center pb-1 font-medium">Late</th>
                        <th className="text-center pb-1 font-medium">Absent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {report.by_date.map((d) => (
                        <tr key={d.date} className="text-white/65">
                          <td className="py-1">{d.date}</td>
                          <td className="text-center text-emerald-400">{d.present}</td>
                          <td className="text-center text-amber-400">{d.partial}</td>
                          <td className="text-center text-amber-300">{d.late}</td>
                          <td className="text-center text-red-400">{d.absent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <Card>
            <p className="text-[12px] font-bold text-parchment mb-3">Per-student Breakdown</p>
            {report.per_student.length === 0 && (
              <p className="text-[11px] text-white/40">No records for this filter.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-white/30 border-b border-white/10">
                    <th className="text-left pb-1.5 font-medium">Student ID</th>
                    <th className="text-center pb-1.5 font-medium">On-time</th>
                    <th className="text-center pb-1.5 font-medium">Late</th>
                    <th className="text-center pb-1.5 font-medium">Absent</th>
                    <th className="text-center pb-1.5 font-medium">Att%</th>
                    <th className="text-center pb-1.5 font-medium">On-time%</th>
                    <th className="text-center pb-1.5 font-medium">Streak</th>
                    <th className="text-center pb-1.5 font-medium">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {report.per_student.map((s) => (
                    <tr key={s.student_id} className="text-white/65">
                      <td className="py-1.5 font-mono text-parchment">{s.student_id}</td>
                      <td className="text-center text-emerald-400">{s.present_full}</td>
                      <td className="text-center text-amber-400">{(s.late || 0) + (s.present_partial || 0)}</td>
                      <td className="text-center text-red-400">{s.absent}</td>
                      <td className="text-center">{s.attendance_pct}%</td>
                      <td className="text-center">{s.on_time_pct}%</td>
                      <td className="text-center">{s.current_streak}</td>
                      <td className="text-center capitalize font-bold"
                          style={{ color: TIER_COLORS[s.reliability_tier] || "#a1a1aa" }}>
                        {s.reliability_tier || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── CORRECTIONS PANEL ────────────────────────────────────────────────────────
// A secondary/advanced tool (kept out of the primary Classes/Sessions/Today
// flow per the "don't overbuild the admin UI" guidance): Class → Session →
// per-student recorded status → an authorized correction with a mandatory
// reason. No manual recalculation step exists or is needed — monthly
// percentage/eligibility/reward are always computed live from
// attendance_records, so a correction here is reflected on the student's
// very next page load.
const CORRECTION_STATUS_LABELS = {
  present_full: "Present",
  present_partial: "Present (partial)",
  late: "Late",
  absent: "Absent",
};

function CorrectionsPanel() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // { student_id, display_name, status } | null
  const [newStatus, setNewStatus] = useState("present_full");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.listClasses().then((d) => setClasses(d.classes || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedSession("");
    setRoster(null);
    if (!selectedClass) { setSessions([]); return; }
    api.listSessions(selectedClass).then((d) => setSessions(d.sessions || [])).catch(() => setSessions([]));
  }, [selectedClass]);

  const loadRoster = useCallback(async (session_id) => {
    if (!session_id) { setRoster(null); return; }
    setLoading(true);
    setErr(null);
    try { setRoster(await api.getSessionRoster(session_id)); }
    catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRoster(selectedSession); }, [selectedSession, loadRoster]);

  const openCorrection = (row) => {
    setEditing(row);
    setNewStatus(row.status === "pending" ? "present_full" : row.status);
    setReason("");
  };

  const saveCorrection = async () => {
    if (!reason.trim()) { setErr(new Error("A reason is required for every correction.")); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.correctRecord(selectedSession, editing.student_id, { status: newStatus, reason: reason.trim() });
      setEditing(null);
      setToast(`${editing.display_name}'s record was updated. Their monthly percentage reflects this immediately.`);
      setTimeout(() => setToast(null), 4000);
      loadRoster(selectedSession);
    } catch (e) { setErr(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionTitle icon={ClipboardEdit}>Attendance Corrections</SectionTitle>
      <p className="text-[11px] text-white/40 -mt-2">
        Fix a record when the system didn't capture what actually happened —
        e.g. a student attended but automatic check-in failed. Every
        correction requires a reason and is kept in the audit trail.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Class" value={selectedClass} onChange={setSelectedClass}>
          <option value="">Select a class…</option>
          {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.title_en}</option>)}
        </Select>
        <Select label="Session" value={selectedSession} onChange={setSelectedSession} hint={!selectedClass ? "Pick a class first" : undefined}>
          <option value="">Select a session…</option>
          {sessions.map((s) => (
            <option key={s.session_id} value={s.session_id}>
              {s.date || fmtDate(s.opens_at)} · {s.status}{s.exception ? ` · ${EXCEPTION_LABELS[s.exception] || s.exception}` : ""}
            </option>
          ))}
        </Select>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-4 py-2.5 text-[12px] text-emerald-300">
          {toast}
        </div>
      )}
      <ErrMsg err={err} />

      {loading && <p className="text-[12px] text-white/40">Loading roster…</p>}

      {roster && !loading && (
        <Card>
          {roster.exception && (
            <p className="text-[11px] text-amber-300 mb-2">
              This session is marked "{EXCEPTION_LABELS[roster.exception] || roster.exception}" —
              it's already excluded from attendance for everyone; corrections here won't change that.
            </p>
          )}
          <div className="space-y-1.5">
            {roster.roster.map((row) => (
              <div key={row.student_id} className="flex items-center gap-3 py-1.5 border-t border-white/5 first:border-t-0">
                <p className="text-[12.5px] text-parchment flex-1 min-w-0 truncate">{row.display_name}</p>
                <StatusBadge status={row.status} />
                {row.corrected && <Pill color="#6b9fff">Corrected</Pill>}
                <Btn onClick={() => openCorrection(row)}>
                  <Pencil className="h-3 w-3" /> Correct
                </Btn>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
             onClick={() => setEditing(null)}>
          <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 max-w-sm w-full"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13px] font-bold text-gold mb-3">Correct attendance</h3>
            <p className="text-[12px] text-white/60 mb-1">Student: <span className="text-parchment">{editing.display_name}</span></p>
            <p className="text-[12px] text-white/60 mb-3">
              Current: <span className="text-parchment">{CORRECTION_STATUS_LABELS[editing.status] || editing.status}</span>
            </p>
            <Select label="Change to" value={newStatus} onChange={setNewStatus}>
              <option value="present_full">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </Select>
            <div className="mt-3 flex flex-col gap-1">
              <label className="text-[11px] text-white/60 font-medium">Reason *</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                        placeholder="e.g. Student attended but automatic check-in failed; confirmed by teacher."
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] text-parchment focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <Btn variant="gold" onClick={saveCorrection} disabled={saving || !reason.trim()}>
                <Check className="h-3 w-3" /> {saving ? "Saving…" : "Save correction"}
              </Btn>
              <Btn onClick={() => setEditing(null)}><X className="h-3 w-3" /> Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN SHELL ─────────────────────────────────────────────────────────────────
const PANELS = [
  { key: "classes",       label: "Classes",             Icon: Users },
  { key: "sessions",      label: "Sessions",            Icon: CalendarCheck },
  { key: "today",         label: "Today's Class",       Icon: Radio },
  { key: "encouragement", label: "Needs Encouragement", Icon: AlertTriangle },
  { key: "settings",      label: "Settings",            Icon: SettingsIcon },
  { key: "reports",       label: "Reports",             Icon: BarChart2 },
  { key: "corrections",   label: "Corrections",         Icon: ClipboardEdit },
];

export default function AttendanceStudio() {
  const [panel, setPanel] = useState("classes");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-white/8 pb-4 flex-wrap">
        <CalendarCheck className="h-5 w-5 text-gold" />
        <h1 className="font-display text-[16px] text-parchment">Attendance Studio</h1>
        <span className="text-[11px] text-white/30">Constellation Check-In</span>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {PANELS.map(({ key, label, Icon }) => {
          const active = panel === key;
          return (
            <button key={key} onClick={() => setPanel(key)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: active
                        ? "linear-gradient(135deg,#FFE19A 0%,#D4A843 50%,#9C7A2C 100%)"
                        : "rgba(45,31,62,0.65)",
                      color: active ? "#1a1420" : "#F4E5C1",
                      border: active ? "1px solid rgba(255,225,154,0.6)" : "1px solid rgba(212,168,67,0.25)",
                      boxShadow: active ? "0 4px 12px rgba(212,168,67,0.3)" : "none",
                    }}>
              <Icon className="h-3 w-3" /> {label}
            </button>
          );
        })}
      </nav>

      <div>
        {panel === "classes"       && <ClassesPanel />}
        {panel === "sessions"      && <SessionsPanel />}
        {panel === "today"         && <TodaysClassPanel />}
        {panel === "encouragement" && <NeedsEncouragementPanel />}
        {panel === "settings"      && <SettingsPanel />}
        {panel === "reports"       && <ReportsPanel />}
        {panel === "corrections"   && <CorrectionsPanel />}
      </div>
    </div>
  );
}
