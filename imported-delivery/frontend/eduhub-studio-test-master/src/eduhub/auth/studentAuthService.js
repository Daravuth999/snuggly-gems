/**
 * studentAuthService.js — Student auth via Render backend.
 *
 * v10.0 — replaces the legacy GAS Web App URL for student login.
 *
 * Mobile Safari ITP fallback: in addition to the httpOnly cookie that
 * the backend sets, the JSON response carries `session_token`. We mirror
 * it into localStorage and send it back on every subsequent request as
 * an `Authorization: Bearer` header so the API remains usable in
 * Safari's third-party-cookie sandbox (where the cookie is dropped on
 * cross-site PWA fetches).
 *
 * The bearer fallback is purely additive — when the cookie is present
 * it takes precedence and the bearer is ignored by the backend.
 *
 * v10.0.1 (hotfix) — Teacher endpoints now also send the admin Bearer
 *   token cached by studio/api.js (`studio_session_token_v1`). Without
 *   this, the Students tab returned 401 on iOS Safari/Chrome (WebKit
 *   ITP drops cross-site cookies between *.vercel.app and *.onrender.com),
 *   producing "Failed to fetch students" on every iPhone. Desktop Chrome
 *   was unaffected because it still ships the cross-site cookie.
 *   Symmetric to the student-side `_bearerHeaders()` above — purely
 *   additive, no backend change.
 */
const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const LS_KEY = "student_session_token";
// v12.0 — /me response cache keys (stale-while-revalidate, 30-day TTL)
const ME_CACHE_KEY    = "eduhub_render_me_v1";
const ME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Admin session token key — must stay in sync with studio/api.js TOKEN_KEY.
// Duplicated here (instead of imported) to avoid a circular module dep
// between studio/api.js and eduhub/auth/* during the React build.
const ADMIN_LS_KEY = "studio_session_token_v1";

function _bearerHeaders() {
  const t = localStorage.getItem(LS_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Admin Bearer fallback used by all /api/teacher/* calls below.
 * Reads the studio session token that StudioCallback writes to
 * localStorage at login. On iOS Safari/Chrome the cross-site cookie
 * is silently dropped by ITP, so this header is the only thing that
 * authenticates the request.
 */
function _adminHeaders(extra = {}) {
  const t = localStorage.getItem(ADMIN_LS_KEY);
  return { ...extra, ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

/* ────────────────────────────  student auth  ───────────────────────────── */

export async function studentLogin({ cleanId, password, turnstileToken = "" }) {
  const res = await fetch(`${BASE}/api/auth/student/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clean_id: cleanId,
      password,
      turnstile_token: turnstileToken,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  if (data.session_token) localStorage.setItem(LS_KEY, data.session_token);
  return data;
}

export async function studentMe() {
  // v12.1 — network-first with cache fallback.
  //
  // Return contract (AuthContext depends on this):
  //   success         → write ME_CACHE_KEY, return data     (setRenderStudent)
  //   401 / 403       → clear ME_CACHE_KEY, return null     (confirmed unauthorized → clearSession)
  //   network / 5xx   → return cached identity if valid TTL  (keep logged in during cold start)
  //   network / 5xx   → throw Error if no valid cache        (AuthContext .catch keeps existing state)
  //
  // The distinction between null (confirmed 401) and throw (network failure)
  // lets AuthContext.then() handle real logouts while .catch() handles
  // transient failures — never force-logging-out a student due to a blip.
  let networkOrServerError = false;
  try {
    const res = await fetch(`${BASE}/api/auth/student/me`, {
      credentials: "include",
      headers: { ..._bearerHeaders() },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.clean_id) {
        try {
          localStorage.setItem(
            ME_CACHE_KEY,
            JSON.stringify({ ...data, _ts: Date.now() }),
          );
        } catch { /* quota / private mode */ }
      }
      return data;
    }
    // Confirmed unauthorized — session is definitively expired on the server.
    // Clear the /me cache AND the stale Bearer token so the next call
    // doesn't keep sending a dead `Authorization: Bearer …` header.
    // Returning null is the AuthContext signal to clearSession() + setStudent(null).
    if (res.status === 401 || res.status === 403) {
      try { localStorage.removeItem(ME_CACHE_KEY); } catch { /* ignore */ }
      // v1.3 — also evict the bearer-fallback token. Without this, any
      // subsequent fetch from a sibling module (Library, Portal, Game)
      // would still attach the dead token via _bearerHeaders(), causing
      // a noisy stream of 401s and confusing the points sync pipeline.
      // Safe to remove: the server already rejected it, so it's worthless.
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      return null;
    }
    // 5xx or unexpected status — transient server problem, fall through to cache.
    networkOrServerError = true;
  } catch {
    // Network error (offline, Render cold start timeout) — fall through to cache.
    networkOrServerError = true;
  }

  if (networkOrServerError) {
    // Try the cached /me response before giving up.
    try {
      const raw = localStorage.getItem(ME_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.clean_id && Date.now() - (cached._ts || 0) < ME_CACHE_TTL_MS) {
          // Valid cache — return it so the student stays logged in during
          // a Render cold start or brief offline period.
          return cached;
        }
      }
    } catch { /* corrupt cache — fall through */ }
    // No valid cache and server unreachable — throw so AuthContext .catch()
    // handles it by keeping whatever state it already has (never force-logout).
    throw new Error("studentMe: network or server error, no valid cache");
  }

  return null;
}

// EduHub Smart Login — QR-based alternative to Student ID + Password.
// `qrPayload` is the raw decoded string a QR scan/upload produced
// client-side (decoding pixels is a mechanical step — this call is where
// the backend makes the actual, only, validity decision). Same cookie +
// Bearer session_token contract as studentLogin() above; on success the
// student is authenticated into the identical session mechanism.
export async function smartLogin({ qrPayload, turnstileToken = "" }) {
  const res = await fetch(`${BASE}/api/auth/student/smart-login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      qr_payload: qrPayload,
      turnstile_token: turnstileToken,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Smart Login failed");
  }
  const data = await res.json();
  if (data.session_token) localStorage.setItem(LS_KEY, data.session_token);
  return data;
}

export async function studentLogout() {
  try {
    await fetch(`${BASE}/api/auth/student/logout`, {
      method: "POST",
      credentials: "include",
      headers: { ..._bearerHeaders() },
    });
  } finally {
    localStorage.removeItem(LS_KEY);
    // v12.0 — clear the /me cache so the next app open shows login form.
    try { localStorage.removeItem(ME_CACHE_KEY); } catch { /* ignore */ }
  }
}

/* ──────────────────────  teacher / admin endpoints  ────────────────────── */

export async function createStudent({ cleanId, displayName, group = "", purgePreviousHistory = false }) {
  const res = await fetch(`${BASE}/api/teacher/students`, {
    method: "POST",
    credentials: "include",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      clean_id: cleanId,
      display_name: displayName,
      group,
      // Data-integrity fix (2026-09): defaults to false everywhere this is
      // called without explicitly opting in, so plain "this same student
      // is coming back" reactivation behaves exactly as it always has.
      // Only set true when the admin has explicitly confirmed, via the
      // dedicated checkbox in CreateForm, that this ID slot is being
      // handed to a genuinely different, new person.
      purge_previous_history: purgePreviousHistory,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || "Failed to create student");
    e.status = res.status;
    throw e;
  }
  return res.json(); // includes plain password — show once, never cache
}

export async function listStudents() {
  const res = await fetch(`${BASE}/api/teacher/students`, {
    credentials: "include",
    headers: _adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch students");
  const data = await res.json();
  return data.students || [];
}

export async function updateStudent(studentId, { displayName, group }) {
  const body = {};
  if (displayName !== undefined) body.display_name = displayName;
  if (group !== undefined) body.group = group;
  const res = await fetch(`${BASE}/api/teacher/students/${studentId}`, {
    method: "PATCH",
    credentials: "include",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update student");
  }
  return res.json();
}

/**
 * Speaking Lab persistent Schedule A/B assignment — a thin client for the
 * existing `POST /api/speaking-lab/students/{id}/schedule-assignment` route
 * in teacher_admission.py (conflict detection, confirm-flag semantics, and
 * audit logging all live server-side; this is not a second implementation).
 *
 * The response is always 200 with a structured `outcome` field, even for
 * "blocked" or "needs confirmation" cases — those are not HTTP errors, they
 * are meaningful states the caller must branch on:
 *   "updated"                 — write succeeded.
 *   "unchanged"                — already at that schedule, no-op.
 *   "not_found"                — student id didn't resolve.
 *   "confirmation_required"    — student already has a DIFFERENT schedule;
 *                                 retry with confirm:true if the admin agrees.
 *   "blocked_active_elsewhere" — student has an active Speaking Lab session
 *                                 in the other schedule. `confirm` CANNOT
 *                                 override this — it must be resolved in
 *                                 Speaking Lab first.
 *   "error"                    — unexpected per-item failure (bulk only).
 * Only a genuinely malformed `schedule` value (not "A"/"B"/"") raises an
 * HTTP 422, which this function still throws on, same as every other call
 * in this file.
 */
export async function assignStudentSchedule(studentId, { schedule, confirm = false, sessionContextId } = {}) {
  const res = await fetch(
    `${BASE}/api/speaking-lab/students/${encodeURIComponent(studentId)}/schedule-assignment`,
    {
      method: "POST",
      credentials: "include",
      headers: _adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        schedule: schedule || null,
        confirm,
        session_context_id: sessionContextId || null,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || "Failed to assign schedule");
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function bulkAssignStudentSchedule({ studentIds, schedule, confirm = false, sessionContextId } = {}) {
  const res = await fetch(`${BASE}/api/speaking-lab/students/schedule-assignment/bulk`, {
    method: "POST",
    credentials: "include",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      student_ids: studentIds,
      schedule: schedule || null,
      confirm,
      session_context_id: sessionContextId || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || "Failed to bulk-assign schedule");
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/**
 * Schedule A/B admin-configurable time windows — a thin client for the
 * new `/api/admin/schedule-time-windows*` routes (schedule_time_windows.py),
 * built on eduhub_platform.config's existing generic three-tier resolver.
 * Purely additive metadata alongside the schedule-assignment endpoints
 * above — has no bearing on eligibility/assignment, which those existing
 * endpoints continue to own exclusively.
 */
export async function listScheduleTimeWindows() {
  const res = await fetch(`${BASE}/api/admin/schedule-time-windows`, {
    credentials: "include",
    headers: _adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch schedule time windows");
  const data = await res.json();
  return data.schedules || [];
}

export async function setScheduleTimeWindow(label, { start, end, timezone } = {}) {
  const res = await fetch(`${BASE}/api/admin/schedule-time-windows/${encodeURIComponent(label)}`, {
    method: "POST",
    credentials: "include",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ start, end, timezone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || "Failed to save time window");
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function getScheduleTimeWindowHistory(label) {
  const res = await fetch(
    `${BASE}/api/admin/schedule-time-windows/${encodeURIComponent(label)}/history`,
    { credentials: "include", headers: _adminHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch time window history");
  const data = await res.json();
  return data.history || [];
}

/** Student-facing: the authenticated student's own resolved schedule +
 * time window, or {schedule: "", window: null} when unassigned/unset. */
export async function getMyScheduleTimeWindow() {
  const res = await fetch(`${BASE}/api/student/schedule-time-window`, {
    credentials: "include",
    headers: { ..._bearerHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch schedule time window");
  return res.json();
}

export async function resetStudentPassword(studentId) {
  const res = await fetch(
    `${BASE}/api/teacher/students/${studentId}/reset-password`,
    {
      method: "POST",
      credentials: "include",
      headers: _adminHeaders(),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to reset password");
  }
  return res.json(); // includes new plain password — show once
}

export async function deactivateStudent(studentId) {
  const res = await fetch(`${BASE}/api/teacher/students/${studentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: _adminHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to deactivate student");
  }
  return res.json();
}

/* ─────────────────────  EduHub Smart Login — admin side  ───────────────── */
// Generate is also how "Regenerate" is implemented — Author Studio's two
// buttons differ only in label; the backend replaces any existing
// credential either way (never a side effect of merely opening Author
// Studio — only an explicit click reaches these).

export async function generateSmartLoginCredential(studentId) {
  const res = await fetch(
    `${BASE}/api/teacher/students/${studentId}/smart-login/generate`,
    { method: "POST", credentials: "include", headers: _adminHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to generate Smart Login credential");
  }
  return res.json(); // includes the plain QR payload — show once, never cache
}

export async function revokeSmartLoginCredential(studentId) {
  const res = await fetch(
    `${BASE}/api/teacher/students/${studentId}/smart-login/revoke`,
    { method: "POST", credentials: "include", headers: _adminHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to revoke Smart Login credential");
  }
  return res.json();
}

export async function getSmartLoginStatus(studentId) {
  const res = await fetch(
    `${BASE}/api/teacher/students/${studentId}/smart-login`,
    { credentials: "include", headers: _adminHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch Smart Login status");
  return res.json();
}

/**
 * Force All Users to Sign Out — operational recovery control (Author
 * Studio, admin-only). Invalidates every currently active student AND
 * admin/teacher session at the backend (see admin_security.py). Does not
 * touch accounts, passwords, wallets, or Smart Login credentials — a
 * signed-out student can scan their existing QR the instant they land
 * back on /login.
 */
export async function forceLogoutAllUsers() {
  const res = await fetch(`${BASE}/api/admin/security/force-logout-all`, {
    method: "POST",
    credentials: "include",
    headers: _adminHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to sign out all users");
  }
  return res.json();
}

/* ───────────────  Milestone 4 — teacher-assisted password reset  ───────── */

// Student-facing: flags "I forgot my password" for a teacher to review.
// Always resolves the same generic { ok, message } regardless of whether
// cleanId is registered — never throws on a "not found" case, since the
// backend deliberately never reveals whether an ID exists.
export async function requestPasswordReset(cleanId, turnstileToken = "") {
  const res = await fetch(`${BASE}/api/auth/student/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clean_id: cleanId, turnstile_token: turnstileToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export async function listPasswordResetRequests() {
  const res = await fetch(`${BASE}/api/teacher/password-reset-requests`, {
    credentials: "include",
    headers: _adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch password reset requests");
  const data = await res.json();
  return data.requests || [];
}

export async function dismissPasswordResetRequest(requestId) {
  const res = await fetch(
    `${BASE}/api/teacher/password-reset-requests/${requestId}/dismiss`,
    {
      method: "POST",
      credentials: "include",
      headers: _adminHeaders(),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to dismiss request");
  }
  return res.json();
}

/* ─────────────  Premium Student Profile & Settings — self-service  ─────── */

// Full profile snapshot (extends the 4-field /me contract AuthContext
// already caches — this is a separate, independent fetch used only by the
// Profile page, so AuthContext's existing caching/session-clearing
// behavior is never touched).
export async function getStudentProfile() {
  const res = await fetch(`${BASE}/api/auth/student/me`, {
    credentials: "include",
    headers: { ..._bearerHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function changeStudentPassword(currentPassword, newPassword) {
  const res = await fetch(`${BASE}/api/auth/student/change-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ..._bearerHeaders() },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to change password");
  }
  return res.json();
}

// Bounded so a network hang (dead endpoint, Render cold start, dropped
// connection) can never leave the upload spinner running indefinitely —
// it always resolves to a clear error within this window instead. Uses
// a plain AbortController (not the newer AbortSignal.timeout() sugar)
// for broader runtime compatibility.
const AVATAR_REQUEST_TIMEOUT_MS = 30000;

async function _fetchWithTimeout(url, opts, timeoutMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AVATAR_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(timeoutMessage);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadStudentAvatar(file) {
  const body = new FormData();
  body.append("file", file);
  const res = await _fetchWithTimeout(
    `${BASE}/api/auth/student/avatar`,
    {
      method: "POST",
      credentials: "include",
      headers: { ..._bearerHeaders() }, // no Content-Type — browser sets multipart boundary
      body,
    },
    "Upload timed out. Check your connection and try again.",
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload avatar");
  }
  return res.json();
}

export async function deleteStudentAvatar() {
  const res = await _fetchWithTimeout(
    `${BASE}/api/auth/student/avatar`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { ..._bearerHeaders() },
    },
    "Request timed out. Check your connection and try again.",
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to remove avatar");
  }
  return res.json();
}
