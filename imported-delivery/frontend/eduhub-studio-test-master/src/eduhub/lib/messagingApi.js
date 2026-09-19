/**
 * eduhub/lib/messagingApi.js — in-app messaging student API client.
 *
 * Same session model as notificationApi.js (cookie credentials + the
 * mobile-Safari Bearer fallback from `student_session_token`): REST for
 * conversation list/history/send/block/report, WebSocket for realtime
 * delivery. Mirrors that file's structure closely — this is the SAME
 * pattern, a second real usage of it, not a new one.
 *
 * Feature-toggle detection: there is no separate "is messaging enabled"
 * endpoint. GET /api/messaging/unread-count already 403s when an admin
 * has the feature off (messaging_tools.py's `_require_enabled`) — that
 * exact response IS the enablement signal MessagingContext uses at
 * bootstrap, so the nav icon can be fully omitted (rule 8.2) without a
 * second round-trip or a bespoke flag-check endpoint.
 *
 * NO mock data. Every payload comes from real backend state.
 */
const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const LS_KEY = "student_session_token";

function getSessionToken() {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return "";
  }
}

function bearer() {
  const t = getSessionToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...bearer(),
      ...(init.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = new Error((data && data.detail) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function listConversations() {
  return fetchJson("/api/messaging/conversations");
}

/** Single-conversation fetch — deliberately separate from
 * listConversations, which excludes archived conversations (they drop
 * off the active list, per rule 5.7, but must still be directly
 * openable/readable). Used by the thread page so an archived
 * conversation is never unreachable. */
export function getConversation(conversationId) {
  return fetchJson(`/api/messaging/conversations/${encodeURIComponent(conversationId)}`);
}

export function getMessagingUnreadCount() {
  return fetchJson("/api/messaging/unread-count");
}

export function startDm(targetStudentId) {
  return fetchJson(`/api/messaging/dm/${encodeURIComponent(targetStudentId)}`, { method: "POST" });
}

/** opts: { before, limit } */
export function getConversationHistory(conversationId, opts = {}) {
  const p = new URLSearchParams();
  if (opts.before) p.set("before", opts.before);
  if (opts.limit) p.set("limit", String(opts.limit));
  const qs = p.toString();
  return fetchJson(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ""}`);
}

export function markConversationRead(conversationId) {
  return fetchJson(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" });
}

/** Sends a text message. For voice, use sendVoiceMessage. For an
 * achievement share card, pass { kind: "card_achievement", trophyId }. */
export function sendTextMessage(conversationId, { body, clientMessageId }) {
  const form = new FormData();
  form.set("kind", "text");
  form.set("body", body);
  if (clientMessageId) form.set("client_message_id", clientMessageId);
  return fetchJson(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", body: form,
  });
}

export function sendAchievementCard(conversationId, trophyId, { clientMessageId } = {}) {
  const form = new FormData();
  form.set("kind", "card_achievement");
  form.set("trophy_id", trophyId);
  if (clientMessageId) form.set("client_message_id", clientMessageId);
  return fetchJson(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", body: form,
  });
}

/** `audioBlob` — a Blob from MediaRecorder (webm/ogg/mp4 depending on
 * browser); `durationSec` is the real recorded length, never guessed. */
export function sendVoiceMessage(conversationId, audioBlob, durationSec, { clientMessageId } = {}) {
  const form = new FormData();
  form.set("kind", "voice");
  form.set("audio", audioBlob, "voice-message");
  form.set("duration_sec", String(durationSec || 0));
  if (clientMessageId) form.set("client_message_id", clientMessageId);
  return fetchJson(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", body: form,
  });
}

export function blockStudent(targetStudentId) {
  return fetchJson(`/api/messaging/block/${encodeURIComponent(targetStudentId)}`, { method: "POST" });
}

export function unblockStudent(targetStudentId) {
  return fetchJson(`/api/messaging/unblock/${encodeURIComponent(targetStudentId)}`, { method: "POST" });
}

export function listMyBlocks() {
  return fetchJson("/api/messaging/blocks");
}

export function reportMessage(conversationId, messageId, reason) {
  return fetchJson(
    `/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/report`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

/** wss:// URL for the realtime layer (cookie also sent by browser). */
export function buildMessagingWsUrl() {
  if (!BASE) return "";
  const wsBase = BASE.replace(/^http/i, "ws");
  const t = getSessionToken();
  return `${wsBase}/api/messaging/ws${t ? `?token=${encodeURIComponent(t)}` : ""}`;
}
