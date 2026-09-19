/**
 * MessagingContext.jsx — in-app messaging global state + realtime bridge.
 *
 * Mirrors NotificationContext.jsx's structure closely (same session
 * gating, same exponential-backoff WS reconnect, same visible-tab-only
 * fallback poll) — this is a second real usage of that exact pattern,
 * not a new one, per this feature's own "reuse existing infrastructure"
 * directive.
 *
 * FEATURE TOGGLE (rule 8.2 — fully omit the nav entry point when off,
 * not just disable it): there is no separate "is messaging enabled"
 * endpoint. The bootstrap fetch (GET /api/messaging/unread-count)
 * itself 403s when an admin has the feature off server-side
 * (messaging_tools.py's `_require_enabled`) — that response IS the
 * enablement signal. `enabled` starts `null` ("still checking") so the
 * header icon can render nothing at all during that brief window
 * rather than flashing on then off; it resolves to `true`/`false` once
 * the very first bootstrap call settles, and is deliberately NOT
 * re-checked afterward — rule 8.2 explicitly wants "next app load"
 * semantics here, not live push-based hiding.
 *
 * NO mock data. Every payload comes from real backend state.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  buildMessagingWsUrl, getMessagingUnreadCount, listConversations,
} from "../lib/messagingApi";

const MessagingContext = createContext(null);
export const useMessaging = () => useContext(MessagingContext);

export function MessagingProvider({ children }) {
  const { isAuthenticated, student } = useAuth() || {};
  const authed = Boolean(isAuthenticated && student?.studentId);

  const [enabled, setEnabled] = useState(null); // null = still checking, per rule 8.2
  const [conversations, setConversations] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastArrival, setLastArrival] = useState(null); // realtime pulse for the header icon

  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      const [list, count] = await Promise.all([listConversations(), getMessagingUnreadCount()]);
      setEnabled(true);
      setConversations(list.items || []);
      setUnreadCount(count.count || 0);
    } catch (err) {
      if (err?.status === 403) {
        // Either the feature is off, or (rare) this specific student is
        // blocked from everything — either way, the honest UI response
        // is "no messaging entry point", never a broken/error state.
        setEnabled(false);
        setConversations([]);
        setUnreadCount(0);
      }
      /* other errors (network) — keep whatever we have, never fabricate */
    }
  }, [authed]);

  // ── realtime WS with reconnect — identical shape to NotificationContext's ──
  useEffect(() => {
    if (!authed) {
      setEnabled(null); setConversations([]); setUnreadCount(0); setLastArrival(null);
      return undefined;
    }
    closedRef.current = false;
    refresh();

    let timer = null;
    const connect = () => {
      if (closedRef.current) return;
      const url = buildMessagingWsUrl();
      if (!url) return;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        retryRef.current = 0;
        setWsConnected(true);
      };
      ws.onmessage = (ev) => {
        let msg = null;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg?.type === "message" && msg.item) {
          setUnreadCount((c) => Math.min(99, c + 1));
          setLastArrival(msg.item);
          // Reconnect-and-catch-up (rule 1.4): a live push is a signal
          // to refetch the conversation list (real unread counts, real
          // ordering), never trusted as the sole source of truth on its
          // own — refresh() re-derives everything from the server.
          refresh();
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        scheduleRetry();
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* ignore */ }
      };
    };
    const scheduleRetry = () => {
      if (closedRef.current) return;
      const delay = Math.min(30000, 2000 * 2 ** Math.min(retryRef.current, 4));
      retryRef.current += 1;
      timer = setTimeout(connect, delay);
    };
    connect();

    return () => {
      closedRef.current = true;
      if (timer) clearTimeout(timer);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [authed, refresh]);

  // ── light fallback poll — ONLY when the socket is down + tab visible ────
  useEffect(() => {
    if (!authed || wsConnected || enabled === false) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [authed, wsConnected, enabled, refresh]);

  const value = useMemo(
    () => ({
      enabled, conversations, unreadCount, wsConnected, lastArrival, refresh,
    }),
    [enabled, conversations, unreadCount, wsConnected, lastArrival, refresh],
  );

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

export default MessagingProvider;
