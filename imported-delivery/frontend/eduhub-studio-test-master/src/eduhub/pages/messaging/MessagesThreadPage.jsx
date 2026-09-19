/**
 * MessagesThreadPage.jsx — one conversation's message history + composer
 * ("/messages/:conversationId").
 *
 * Optimistic send (rule 1.3): a sent message appears in the sender's own
 * view immediately via a local `pending` message keyed by a generated
 * `clientMessageId`, replaced with the server-confirmed message (or
 * marked failed) once the request settles — never waits on a round-trip
 * before showing the sender their own message.
 *
 * Reconnect-and-catch-up (rule 1.4): re-fetches this thread's history
 * whenever MessagingContext's WS transitions to connected — including
 * the very first connect (a harmless redundant fetch) and, critically,
 * any RE-connect after a drop, so nothing sent while disconnected is
 * silently missed.
 *
 * v2 (layout/header overhaul) — this route now renders OUTSIDE AppShell
 * (see App.js) rather than inside it, fixing a real double-header bug:
 * the global Dashboard header no longer stacks above this page's own
 * back/name header. Because it fully owns its own screen, this
 * component is now responsible for its own root background/text color
 * (App.js's `.App` wrapper — `text-ink dark:text-white` — no longer
 * applies here). `min-h-0` on the inner flex column is required for the
 * `flex-1 overflow-y-auto` message list to actually scroll within a
 * flex column instead of silently growing its parent. The header also
 * carries its own top-safe-area padding (`env(safe-area-inset-top)`),
 * the same treatment the composer already has on its bottom edge, so it
 * clears the device status bar/notch instead of rendering underneath it.
 *
 * v3 (real keyboard docking — do not rely on `dvh` alone) — v2's
 * `h-[100dvh]` looked correct on desktop/emulated inspection but left a
 * visible dead gap between the composer and the keyboard on a real
 * installed iOS PWA. This is not a one-off: this exact codebase already
 * has a documented prior incident of `100dvh` on a root PWA container
 * failing the same way (see the "No dvh on root containers w/o iOS PWA
 * validation" project memory) — WebKit's `dvh` support in STANDALONE
 * display mode has genuinely inconsistent live-tracking behavior across
 * iOS versions, so a second dvh-only attempt was never going to be
 * reliable. Root height now comes from `useVisualViewportHeight()`
 * (src/eduhub/hooks/), which measures `window.visualViewport.height`
 * directly and updates on its own `resize`/`scroll` events — the same
 * event-wiring convention `useVisualViewportKeyboard.js` (used by
 * AppShell) already established, just returning the real number
 * instead of a boolean. `h-[100dvh]` is kept ONLY as the same-frame
 * placeholder class for the instant before the hook's first
 * measurement lands, matching the "never a flash of the wrong state"
 * pattern already used for MessagingContext's `enabled: null`.
 *
 * This deliberately does NOT copy StickyComposer.jsx's now-removed v3
 * approach (manual `position: fixed` + computed keyboard-inset offset
 * math) — that file's own history documents that approach causing
 * "jumping or overlapping". The lesson taken from it instead: keep the
 * composer a perfectly normal flex child (no fixed positioning, no
 * offset math) of a container whose HEIGHT is simply set correctly —
 * the same shape Assistant.jsx's `.ai-shell-v2` already uses
 * successfully, just sourcing that height from a live JS measurement
 * instead of CSS `dvh`, since dvh is the one part of that pattern with
 * a proven failure history in this exact app.
 *
 * The message list also now auto-scrolls to the newest message —
 * "intelligent" follow (only when the reader is already near the
 * bottom, mirroring Assistant.jsx's own `isNearBottomRef` pattern
 * exactly) — re-run whenever the measured viewport height changes, so
 * the last message stays visible as the keyboard opens and shrinks the
 * visible area, not just when a new message arrives.
 *
 * Every color below is a REAL, VERIFIED token already used elsewhere in
 * this exact app — no stock Tailwind gray-scale:
 *   - Root background:        var(--bgfx-1)        (src/index.css)
 *   - Header/input glass:     var(--shell-glass)    (same one Header.jsx
 *     uses for its own background — src/index.css)
 *   - Primary text:           text-ink dark:text-white
 *     (the exact pair App.js's own `.App` div uses)
 *   - Secondary/muted text:   text-zinc-500 dark:text-white/45
 *     (MessagesInboxPage.jsx's own established muted-text pair)
 *   - Borders:                border-zinc-900/[0.06] dark:border-white/[0.06]
 *     (already used by this exact file's header/input borders, and by
 *     Header.jsx/MessagesInboxPage.jsx)
 *   - Outgoing bubble accent: GOLD = "#D4A843" (unchanged — this app's
 *     real brand accent, already correct, not touched)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Mic, Send, Square, Trophy, Flag, ShieldOff, MessageCircle } from "lucide-react";
import { useMessaging } from "../../context/MessagingContext";
import { easing, duration } from "../../styles/tokens/motionTokens";
import useVisualViewportHeight from "../../hooks/useVisualViewportHeight";
// Same on-device diagnostic panel AppShell already mounts for every
// other route (invisible unless the URL has ?kbdebug=1) — this route
// now lives OUTSIDE AppShell, so it needs its own copy to stay
// available here, for exactly the class of bug this file's own history
// is about: real numbers off a real device beat another round of
// inspection that only looks right on desktop.
import KeyboardDebugOverlay from "../../components/KeyboardDebugOverlay";
import {
  getConversation, getConversationHistory, markConversationRead, sendTextMessage,
  sendVoiceMessage, blockStudent, reportMessage,
} from "../../lib/messagingApi";

const GOLD = "#D4A843";
const GLASS = "var(--shell-glass)";

function genClientId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function VoiceBubble({ attachment }) {
  if (!attachment) return null;
  if (attachment.expired || !attachment.url) {
    return <p className="text-[0.8rem] italic text-zinc-500 dark:text-white/45">🎤 Voice message no longer available</p>;
  }
  return <audio controls src={attachment.url} className="max-w-full h-9" data-testid="voice-message-player" />;
}

function AchievementCard({ card }) {
  if (!card) return null;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "rgba(212,168,67,0.12)", border: "1px solid rgba(212,168,67,0.32)" }}>
      <Trophy size={22} style={{ color: GOLD }} />
      <div className="min-w-0">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider" style={{ color: GOLD }}>Achievement unlocked</div>
        <div className="text-[0.85rem] font-semibold text-ink dark:text-white truncate">{card.name}</div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, isOwn, onReport }) {
  const [showActions, setShowActions] = useState(false);
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} px-4 py-1`}>
      <div className="max-w-[78%]">
        <div
          onClick={() => !isOwn && setShowActions((v) => !v)}
          className={[
            "rounded-2xl px-3.5 py-2.5",
            isOwn
              ? "rounded-br-sm"
              : "rounded-bl-sm cursor-pointer border border-zinc-900/[0.08] dark:border-white/[0.10]",
          ].join(" ")}
          style={isOwn
            ? { background: GOLD, color: "#241D0B" }
            : { background: "rgba(120,120,130,0.10)" }}
          data-testid={`message-bubble-${msg.id}`}
        >
          {msg.kind === "text" && <p className="text-[0.88rem] whitespace-pre-wrap break-words">{msg.body}</p>}
          {msg.kind === "voice" && <VoiceBubble attachment={msg.attachment} />}
          {msg.kind === "card_achievement" && <AchievementCard card={msg.card} />}
          {msg.pending && <span className="block text-[0.65rem] opacity-60 mt-1">Sending…</span>}
          {msg.failed && <span className="block text-[0.65rem] text-red-600 mt-1">Failed to send</span>}
        </div>
        <div className={`text-[0.65rem] text-zinc-400 dark:text-white/35 mt-0.5 ${isOwn ? "text-right" : "text-left"}`}>
          {fmtTime(msg.createdAt)}
        </div>
        {showActions && !isOwn && (
          <button
            onClick={() => onReport(msg.id)}
            data-testid={`report-message-${msg.id}`}
            className="mt-1 inline-flex items-center gap-1 text-[0.7rem] text-red-500 font-semibold"
          >
            <Flag size={11} /> Report
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyThreadState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: duration.fast, ease: easing.premiumEaseOut }}
      className="flex flex-col items-center justify-center text-center px-6 py-16"
      data-testid="thread-empty-state"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
        style={{ background: "rgba(212,168,67,0.12)" }}
      >
        <MessageCircle size={24} style={{ color: GOLD }} />
      </div>
      <p className="text-[0.9rem] font-semibold text-ink dark:text-white">No messages yet</p>
      <p className="text-[0.8rem] text-zinc-500 dark:text-white/45 mt-1">Say hello to start the conversation.</p>
    </motion.div>
  );
}

export default function MessagesThreadPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const ctx = useMessaging();
  const vh = useVisualViewportHeight();
  const reducedMotion = useReducedMotion();

  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const listRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  // Track scroll position so auto-scroll never fights a reader who has
  // scrolled up to reread something — mirrors Assistant.jsx's own
  // isNearBottomRef pattern exactly (same 120px "still following along"
  // threshold).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const NEAR_BOTTOM_PX = 120;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distance < NEAR_BOTTOM_PX;
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to the newest message — on the very first load (instant,
  // no animation), on any new message while already near the bottom, and
  // whenever the measured viewport height changes (the keyboard opening
  // shrinks the visible area exactly like new content would, and must
  // keep the latest message in view the same way).
  useEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    const isFirst = !didInitialScrollRef.current;
    if (isFirst || isNearBottomRef.current) {
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight, behavior: isFirst || reducedMotion ? "auto" : "smooth" });
      } else {
        // Defensive fallback — not every environment implements
        // Element.scrollTo (older WebViews, jsdom in tests); a direct
        // scrollTop assignment achieves the same end state without the
        // smooth-scroll animation.
        el.scrollTop = el.scrollHeight;
      }
    }
    didInitialScrollRef.current = true;
  }, [messages, vh, reducedMotion]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await getConversationHistory(conversationId, { limit: 50 });
      setMessages((prev) => {
        // Merge, never drop anything already visible (e.g. an
        // optimistic pending message not yet reflected server-side).
        const byId = new Map(res.items.map((m) => [m.id, m]));
        const pendingOnly = prev.filter((m) => m.pending && !byId.has(m.clientMessageId));
        return [...res.items, ...pendingOnly];
      });
      setHasMore(Boolean(res.hasMore));
      setError(null);
      markConversationRead(conversationId).catch(() => {});
    } catch (err) {
      if (err?.status === 403) setError("You don't have access to this conversation.");
      else if (err?.status === 404) setError("This conversation could not be found.");
    }
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    getConversation(conversationId)
      .then((c) => { if (!cancelled) setConv(c); })
      .catch((err) => {
        if (cancelled) return;
        if (err?.status === 403) setError("You don't have access to this conversation.");
        else if (err?.status === 404) setError("This conversation could not be found.");
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reconnect-and-catch-up (rule 1.4) — including the very first connect.
  useEffect(() => {
    if (ctx?.wsConnected) loadHistory();
  }, [ctx?.wsConnected, loadHistory]);

  // Live arrival for THIS open thread.
  useEffect(() => {
    const item = ctx?.lastArrival;
    if (!item || item.conversationId !== conversationId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === item.id)) return prev;
      return [...prev.filter((m) => m.clientMessageId !== item.clientMessageId), item];
    });
    markConversationRead(conversationId).catch(() => {});
  }, [ctx?.lastArrival, conversationId]);

  const myId = conv?.viewerId || "";

  const handleSendText = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    const clientMessageId = genClientId();
    const optimistic = {
      id: clientMessageId, conversationId, kind: "text", body,
      createdAt: new Date().toISOString(), clientMessageId, pending: true, senderId: myId,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const real = await sendTextMessage(conversationId, { body, clientMessageId });
      // The server's own `senderId` is already correct (it's the real
      // authenticated sender) — no need to override it, unlike the
      // stale approach this replaced.
      setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? real : m)));
    } catch {
      setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true } : m)));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const durationSec = (Date.now() - recordStartRef.current) / 1000;
        const clientMessageId = genClientId();
        const optimistic = {
          id: clientMessageId, conversationId, kind: "voice", clientMessageId, pending: true,
          createdAt: new Date().toISOString(), senderId: myId,
          attachment: { url: URL.createObjectURL(blob), expired: false },
        };
        setMessages((prev) => [...prev, optimistic]);
        try {
          const real = await sendVoiceMessage(conversationId, blob, durationSec, { clientMessageId });
          setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? real : m)));
        } catch {
          setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true } : m)));
        }
      };
      recordStartRef.current = Date.now();
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access is needed to send a voice message.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleReport = async (messageId) => {
    const reason = window.prompt("What's wrong with this message?");
    if (!reason) return;
    try {
      await reportMessage(conversationId, messageId, reason);
      window.alert("Thanks — this has been reported for review.");
    } catch {
      window.alert("Couldn't submit the report. Please try again.");
    }
  };

  const handleBlock = async () => {
    if (!conv || conv.kind !== "dm") return;
    const other = (conv.participantIds || []).find((p) => p !== myId);
    if (!other) return;
    if (!window.confirm(`Block ${conv.otherDisplayName || "this student"}? They won't be able to message you anywhere, and you won't be able to message them.`)) return;
    try {
      await blockStudent(other);
      navigate("/messages");
    } catch {
      window.alert("Couldn't block this student. Please try again.");
    }
  };

  if (error) {
    return (
      <div
        className="h-[100dvh] flex flex-col items-center justify-center text-center p-8 text-ink dark:text-white"
        style={{ background: "var(--bgfx-1)", height: vh != null ? `${vh}px` : undefined }}
      >
        <p className="text-[0.85rem] text-zinc-500 dark:text-white/50 mb-3">{error}</p>
        <button onClick={() => navigate("/messages")} className="text-[0.8rem] font-semibold" style={{ color: GOLD }}>
          Back to Messages
        </button>
      </div>
    );
  }

  return (
    <div
      className="h-[100dvh] flex flex-col text-ink dark:text-white"
      style={{ background: "var(--bgfx-1)", height: vh != null ? `${vh}px` : undefined }}
      data-testid="thread-root"
    >
      <div className="flex-1 flex flex-col min-h-0 w-full max-w-lg mx-auto">
        {/* ── Single header for this whole screen (fixes the double-header
            bug: the global app header no longer renders on this route at
            all — see App.js). paddingTop clears the status bar/notch —
            the same env(safe-area-inset-bottom) treatment the composer
            already has, just for the top edge. ── */}
        <div
          className="flex-none sticky top-0 z-10 flex items-center gap-2 px-3 border-b border-zinc-900/[0.06] dark:border-white/[0.06]"
          style={{
            background: GLASS,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
            paddingBottom: "0.75rem",
          }}
          data-testid="thread-header"
        >
          <button onClick={() => navigate("/messages")} aria-label="Back" className="p-1.5">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 font-semibold text-[0.9rem] truncate">
            {conv?.title || conv?.otherDisplayName || "Conversation"}
          </div>
          {conv?.kind === "dm" && (
            <button onClick={handleBlock} aria-label="Block" data-testid="block-student-button" className="p-1.5 text-zinc-400 hover:text-red-500">
              <ShieldOff size={16} />
            </button>
          )}
        </div>

        {/* ── Scrollable message list — the only region that scrolls ── */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain py-2">
          {hasMore && (
            <button
              onClick={() => getConversationHistory(conversationId, { limit: 50, before: messages[0]?.createdAt }).then((r) => {
                setMessages((prev) => [...r.items, ...prev]);
                setHasMore(Boolean(r.hasMore));
              })}
              className="block w-full text-[0.75rem] py-2 text-center opacity-60"
            >
              Load earlier messages
            </button>
          )}
          {messages.length === 0 ? (
            <EmptyThreadState />
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} msg={m} isOwn={Boolean(myId) && m.senderId === myId} onReport={handleReport} />
            ))
          )}
        </div>

        {/* ── Composer — edge-to-edge frosted glass, safe-area aware ── */}
        {conv?.archived ? (
          <div
            className="flex-none px-4 py-3 text-center text-[0.8rem] opacity-60 border-t border-zinc-900/[0.06] dark:border-white/[0.06]"
            style={{ background: GLASS, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            data-testid="archived-banner"
          >
            This conversation is archived and read-only.
          </div>
        ) : (
          <div
            className="flex-none px-3 pt-2.5 border-t border-zinc-900/[0.06] dark:border-white/[0.06]"
            style={{
              background: GLASS,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="relative flex-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder="Message…"
                data-testid="message-input"
                className="w-full min-w-0 rounded-full pl-4 pr-12 py-2.5 text-[0.85rem] bg-zinc-900/[0.04] dark:bg-white/[0.06] border border-zinc-900/[0.08] dark:border-white/[0.10] focus:outline-none focus:border-[rgba(212,168,67,0.5)]"
              />
              {recording ? (
                <button
                  onClick={stopRecording}
                  data-testid="stop-recording-button"
                  aria-label="Stop recording"
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: "#E23D6B" }}
                >
                  <Square size={14} className="text-white" fill="white" />
                </button>
              ) : text.trim() ? (
                <button
                  onClick={handleSendText}
                  data-testid="send-message-button"
                  aria-label="Send"
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: GOLD }}
                >
                  <Send size={14} style={{ color: "#241D0B" }} />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  data-testid="start-recording-button"
                  aria-label="Record a voice message"
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(212,168,67,0.14)" }}
                >
                  <Mic size={14} style={{ color: GOLD }} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
