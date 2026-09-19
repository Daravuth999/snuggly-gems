/**
 * usePushNotifications.js — Web Push subscription hook for EduHub students.
 *
 * - Asks for Notification permission lazily (only on enable())
 * - Registers/uses the existing service worker (sw.js)
 * - POSTs the subscription to /api/push/subscribe with the studentId + group
 *   so the Push Studio can target by student or by group.
 *
 * Usage:
 *   const { enabled, supported, enable, disable } =
 *     usePushNotifications(studentId, groupName);
 */
import { useCallback, useEffect, useState } from "react";
// TEMPORARY — installed-PWA stale-version investigation. See
// src/eduhub/lib/__pwaDiag.js for removal instructions.
import { logDiag } from "../lib/__pwaDiag";

/* eslint-disable no-undef */
const BASE = process.env.REACT_APP_BACKEND_URL || "";
/* eslint-enable no-undef */

function urlBase64ToUint8Array(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  // pwaUpdateController.js (registered synchronously at app boot — see
  // src/index.js — before any React component mounts) is now the SINGLE
  // owner of navigator.serviceWorker.register() for this app. This hook
  // used to fall back to its own register("/sw.js") call — WITHOUT
  // updateViaCache:'none' — whenever it ran before that owner's
  // registration had resolved yet. That was a genuine race between two
  // independently-configured registrations of the same script, and this
  // exact branch was flagged (see the removed "suspected gap" diagnostic
  // comment, __pwaDiag.js) as a likely contributor to the installed-PWA
  // stale-version incident. It now only ever READS the registration —
  // never creates one.
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    logDiag("ensure_registration_reused", {
      activeScriptURL: existing.active ? existing.active.scriptURL : null,
      waitingScriptURL: existing.waiting ? existing.waiting.scriptURL : null,
    });
    return existing;
  }
  // No registration yet — the owner's register() call (started earlier,
  // at app boot) may simply not have resolved in this tick. `ready`
  // resolves once a worker is actually controlling the page, with no new
  // registration created; bounded by a timeout so a push-notification
  // opt-in can never hang indefinitely if registration genuinely failed.
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    logDiag("ensure_registration_awaited_owner", {
      activeScriptURL: ready && ready.active ? ready.active.scriptURL : null,
      timedOut: !ready,
    });
    return ready;
  } catch {
    return null;
  }
}

export default function usePushNotifications(studentId, groupName) {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState(
    supported ? Notification.permission : "default"
  );

  // On mount: if the user already granted permission AND has a
  // subscription, mark enabled.
  useEffect(() => {
    if (!supported || !studentId) return;
    let alive = true;
    (async () => {
      const reg = await ensureRegistration();
      if (!reg || !alive) return;
      try {
        const sub = await reg.pushManager.getSubscription();
        if (alive && sub) setEnabled(true);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [supported, studentId]);

  const enable = useCallback(async () => {
    if (!supported || !studentId) return false;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return false;

    const reg = await ensureRegistration();
    if (!reg) return false;

    // Fetch the server's VAPID public key
    let publicKey = "";
    try {
      const r = await fetch(`${BASE}/api/push/vapid-public-key`);
      const j = await r.json();
      publicKey = j.publicKey || "";
    } catch { /* ignore */ }
    if (!publicKey) return false;

    let sub;
    try {
      sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
    } catch {
      return false;
    }

    const json = sub.toJSON();
    const body = {
      studentId,
      endpoint: json.endpoint,
      keys: json.keys || {},
      userAgent: navigator.userAgent || "",
      group: groupName || "default",
    };

    try {
      const res = await fetch(`${BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
    } catch {
      return false;
    }

    setEnabled(true);
    return true;
  }, [supported, studentId, groupName]);

  const disable = useCallback(async () => {
    if (!supported) return;
    const reg = await ensureRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try {
        await fetch(`${BASE}/api/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch { /* ignore */ }
      try { await sub.unsubscribe(); } catch { /* ignore */ }
    }
    setEnabled(false);
  }, [supported]);

  return { enabled, supported, permission, enable, disable };
}
