/**
 * attendanceAdminApi.js — admin-side Attendance Studio API client.
 * Mirrors studio/api.js auth pattern (Bearer token + cookie).
 */
const BASE = process.env.REACT_APP_BACKEND_URL; // eslint-disable-line no-undef
const TOKEN_KEY = "studio_session_token_v1";

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

function url(path) {
  if (!BASE) return path;
  return `${BASE.replace(/\/$/, "")}${path}`;
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const init = { method, credentials: "include", headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url(path), init);
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    // FastAPI validation errors return detail as an array of objects, not a string.
    const detail = data?.detail;
    const message = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : detail
          ? JSON.stringify(detail)
          : `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── Settings ─────────────────────────────────────────────────────────────────
export const getSettings = () =>
  request("/api/admin/attendance/settings");

export const saveSettings = (settings) =>
  request("/api/admin/attendance/settings", { method: "PUT", body: { settings } });

// ── Classes ───────────────────────────────────────────────────────────────────
export const listClasses = () =>
  request("/api/admin/attendance/classes");

export const createClass = (data) =>
  request("/api/admin/attendance/classes", { method: "POST", body: data });

export const updateClass = (class_id, data) =>
  request(`/api/admin/attendance/classes/${class_id}`, { method: "PUT", body: data });

export const deleteClass = (class_id) =>
  request(`/api/admin/attendance/classes/${class_id}`, { method: "DELETE" });

// §1 — on-demand generation from a class's weekly_recurrence template.
export const generateClassSessions = (class_id, days_ahead = 14) =>
  request(`/api/admin/attendance/classes/${class_id}/generate-sessions?days_ahead=${days_ahead}`, { method: "POST" });

// ── Sessions ──────────────────────────────────────────────────────────────────
export const listSessions = (class_id) =>
  request(`/api/admin/attendance/sessions${class_id ? `?class_id=${encodeURIComponent(class_id)}` : ""}`);

export const createSession = (data) =>
  request("/api/admin/attendance/sessions", { method: "POST", body: data });

export const updateSession = (session_id, data) =>
  request(`/api/admin/attendance/sessions/${session_id}`, { method: "PUT", body: data });

export const deleteSession = (session_id) =>
  request(`/api/admin/attendance/sessions/${session_id}`, { method: "DELETE" });

export const openSession = (session_id) =>
  request(`/api/admin/attendance/sessions/${session_id}/open`, { method: "POST" });

export const closeSession = (session_id) =>
  request(`/api/admin/attendance/sessions/${session_id}/close`, { method: "POST" });

export const closingSoonNudge = (session_id) =>
  request(`/api/admin/attendance/sessions/${session_id}/closing-soon-nudge`, { method: "POST" });

// join_url is built the SAME way copyJoinLink() already does
// (${window.location.origin}/attendance/j/${slug}) — the backend only
// encodes it into a QR image, never constructs URLs itself.
export const getSessionQr = (session_id, join_url) =>
  request(`/api/admin/attendance/sessions/${session_id}/qr?join_url=${encodeURIComponent(join_url)}`);

// ── At-risk ───────────────────────────────────────────────────────────────────
export const getAtRisk = () =>
  request("/api/admin/attendance/at-risk");

export const fireAtRiskNudge = () =>
  request("/api/admin/attendance/at-risk-nudge", { method: "POST" });

// ── Students (for roster picker) ─────────────────────────────────────────────
// Re-uses the existing /api/teacher/students route — same admin Bearer token.
export const listAllStudents = () =>
  request("/api/teacher/students");

// ── Reports ───────────────────────────────────────────────────────────────────
export const getReport = (month, class_id) => {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (class_id) params.set("class_id", class_id);
  const qs = params.toString();
  return request(`/api/admin/attendance/report${qs ? `?${qs}` : ""}`);
};

// ── Today's Class roster ─────────────────────────────────────────────────────
export const getSessionRoster = (session_id) =>
  request(`/api/admin/attendance/sessions/${session_id}/roster`);

// ── Monthly reward threshold preview ─────────────────────────────────────────
// Recomputed server-side from the same eligibility functions the real
// per-student summary/claim routes use — never a client-side estimate.
// cycleStart is an optional CANDIDATE override (never persisted) so the
// Settings panel can preview "students currently eligible: N/M" for a date
// being considered, before Save is pressed.
export const getMonthlyRewardPreview = ({ thresholdPct, month, classId, cycleStart } = {}) => {
  const params = new URLSearchParams();
  params.set("threshold_pct", String(thresholdPct));
  if (month) params.set("month", month);
  if (classId) params.set("class_id", classId);
  if (cycleStart) params.set("cycle_start", cycleStart);
  return request(`/api/admin/attendance/monthly-reward/preview?${params.toString()}`);
};

// ── Session exceptions (a class that was never genuinely available to
// attend) ─────────────────────────────────────────────────────────────────
export const setSessionException = (session_id, { exception, reason } = {}) =>
  request(`/api/admin/attendance/sessions/${session_id}/exception`, {
    method: "PATCH", body: { exception: exception || null, reason: reason || "" },
  });

// ── Individual attendance correction ────────────────────────────────────────
export const correctRecord = (session_id, student_id, { status, reason } = {}) =>
  request(`/api/admin/attendance/records/${session_id}/${encodeURIComponent(student_id)}`, {
    method: "PATCH", body: { status, reason },
  });

// ── Admin audit trail (read-only) ───────────────────────────────────────────
export const getAuditLog = ({ studentId, sessionId, limit } = {}) => {
  const params = new URLSearchParams();
  if (studentId) params.set("student_id", studentId);
  if (sessionId) params.set("session_id", sessionId);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return request(`/api/admin/attendance/audit${qs ? `?${qs}` : ""}`);
};
