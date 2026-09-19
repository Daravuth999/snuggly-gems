import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Gem,
  Unlock,
  Sparkles,
  X,
  Check,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Ticket,
  Loader2,
  Clock,
  BookOpen,
  BookOpenCheck,
  Gift,
  WifiOff,
} from "lucide-react";
import { readActiveVoucherCode } from "./VoucherBanner.jsx";

/**
 * Theme-aware color system — CRITICAL CORRECTION (see git history).
 *
 * The previous version used static Tailwind custom colors (parchment,
 * faded, walnut, ink — all fixed hex values in tailwind.config.js) on a
 * hardcoded dark-plum card background. Neither responds to the app's real
 * day/night theme system at all — they're just permanently-dark-mode
 * colors, unconditionally. That's why "premium white/light foundation"
 * was never actually achieved, and why the modal risked becoming
 * unreadable the moment it (or a global rule reacting to the app's real
 * theme) assumed a light surface: a dark-plum-only card was never
 * connected to light mode in the first place, so nothing about it could
 * correctly track "the app switched to Day/Light mode."
 *
 * Fixed by building on the SAME --bgfx-* CSS custom properties every
 * other theme-aware surface in this app already uses (see index.css:
 * html[data-theme="light"] sets --bgfx-card:255 255 255 (white),
 * --bgfx-ink:13 10 20 (near-black text); html[data-theme="dark"] sets
 * --bgfx-card:13 10 20 (near-black), --bgfx-ink:244 244 245 (near-white)
 * — themeAuto.js flips the attribute on <html>, including for the
 * automatic time-based day/night switch). Because these are plain CSS
 * variables (not React state), color(var(--bgfx-ink)) resolves correctly
 * regardless of WHERE in the DOM this component renders — including via
 * createPortal to document.body, since <body> is still a descendant of
 * <html>. No JS theme-detection, no scattered hex literals, no risk of a
 * future global override silently breaking contrast again.
 *
 * The few remaining literal colors below (gold/emerald/red accents) are
 * BRAND/semantic colors, not ink-on-background contrast — each is picked
 * in a light-safe and a dark-safe variant (mirroring the established
 * attendanceTokens.js gold/goldDeep duality) via the tiny useIsLightTheme
 * hook, and are used only for icons/badges/button-fills that carry their
 * own contrasting background, never as body text sitting directly on the
 * card.
 */
// Fallback values (dark-theme numbers, matching index.css's own
// `color: rgb(var(--bgfx-ink, 244 244 245))` defensive pattern on body)
// — a real, if brief, window exists before themeAuto.js stamps
// data-theme onto <html> where html[data-theme="..."] never matches,
// leaving --bgfx-* completely undefined. Without a fallback, var() with
// an undefined custom property makes the WHOLE declaration invalid (not
// "falls back to black" — the property is dropped entirely), which is
// exactly the class of bug this correction exists to eliminate. Every
// reference below carries the same fallback index.css itself already
// uses, so the modal is never invisible even in that pre-bootstrap window.
const T = {
  card: "rgb(var(--bgfx-card, 13 10 20))",
  ink: "rgb(var(--bgfx-ink, 244 244 245))",
  inkMuted: "rgb(var(--bgfx-ink, 244 244 245) / 0.66)",
  inkFaint: "rgb(var(--bgfx-ink, 244 244 245) / 0.46)",
  line: "rgb(var(--bgfx-line, 255 255 255) / 0.14)",
  lineFaint: "rgb(var(--bgfx-line, 255 255 255) / 0.09)",
  surface: "rgb(var(--bgfx-line, 255 255 255) / 0.05)",
  surfaceStrong: "rgb(var(--bgfx-line, 255 255 255) / 0.08)",
};

const ACCENT = {
  gold:       { light: "#8A5A12", dark: "#FFE19A" },
  goldBorder: { light: "rgba(138,90,18,0.35)", dark: "rgba(255,225,154,0.35)" },
  goldSoft:   { light: "rgba(138,90,18,0.07)", dark: "rgba(255,225,154,0.07)" },
  emerald:      { light: "#0E7A55", dark: "#6ee7b7" },
  emeraldBg:    { light: "rgba(14,122,85,0.08)", dark: "rgba(16,73,58,0.28)" },
  emeraldBorder:{ light: "rgba(14,122,85,0.30)", dark: "rgba(16,185,129,0.30)" },
  red:      { light: "#B3261E", dark: "#FFAEAE" },
  redBg:    { light: "rgba(179,38,30,0.07)", dark: "rgba(120,20,20,0.22)" },
  redBorder:{ light: "rgba(179,38,30,0.28)", dark: "rgba(255,120,120,0.32)" },
};

/** Live-updates on theme changes (manual toggle or the app's automatic
 * time-based day/night switch) via a MutationObserver on <html>'s
 * data-theme attribute — never a one-time read that could go stale
 * while the modal is open. */
function useIsLightTheme() {
  const read = () => {
    if (typeof document === "undefined") return false;
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit === "light") return true;
    if (explicit === "dark") return false;
    return typeof window !== "undefined" && window.matchMedia
      ? !window.matchMedia("(prefers-color-scheme: dark)").matches
      : true;
  };
  const [isLight, setIsLight] = useState(read);
  useEffect(() => {
    const html = document.documentElement;
    const obs = new MutationObserver(() => setIsLight(read()));
    obs.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    let mq;
    if (typeof window !== "undefined" && window.matchMedia) {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => setIsLight(read());
      mq.addEventListener?.("change", onChange);
      return () => { obs.disconnect(); mq?.removeEventListener?.("change", onChange); };
    }
    return () => obs.disconnect();
  }, []);
  return isLight;
}

/* Animated number ticker — counts from `from` → `to` smoothly */
function AnimatedNumber({ from, to, duration = 900 }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const d = Math.max(0, to - from);
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + d * eased * (to < from ? -1 : 1)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration]);
  return <>{v}</>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Local unlock push — bilingual (Khmer + English) WITH remaining balance.
 * (Unchanged from the previous version — not part of this correction.)
 * ────────────────────────────────────────────────────────────────────────── */
async function fireUnlockNotification(book, remainingBalance) {
  const title = book?.title || "សៀវភៅថ្មី · Your new book";
  const bookId = book?.id ?? "x";
  const balanceLine =
    typeof remainingBalance === "number" && Number.isFinite(remainingBalance)
      ? `Remaining Balance: ${Math.max(0, Math.round(remainingBalance))} pts\n`
      : "";
  const payload = {
    title: "🔓 Unlocked Successfully! · បានដោះសោជោគជ័យ!",
    options: {
      body:
        `${balanceLine}` +
        `«${title}» ត្រៀមរួចរាល់សម្រាប់អាន។\n` +
        `'${title}' is ready to read.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: `/library/read/${book?.id ?? ""}` },
      tag: `unlock-${bookId}`,
    },
  };
  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      "serviceWorker" in navigator
    ) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(payload.title, payload.options);
      return;
    }
  } catch (e) {
    /* swallow — never break unlock flow */
  }
}

/* ── Coupon validation (calls backend — never trusts frontend calc) ── */
const BACKEND =
  (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) ||
  "https://eduhub-backend-td3a.onrender.com";

function _getStudentId() {
  try {
    const raw = sessionStorage.getItem("eduhub_student");
    if (!raw) return "";
    const v = JSON.parse(raw);
    return (v?.studentId || v?.clean_id || "").toString().trim();
  } catch {
    return "";
  }
}

/**
 * Every thrown error carries a machine-readable `.reason` (mirroring the
 * backend's structured {reason, message} error body — see coupon_tools.py's
 * _coupon_error) so the caller can pick an exact state instead of
 * pattern-matching text. Network failures and malformed responses are
 * normalized the same way.
 */
async function fetchValidateCoupon({ code, book_slug, original_price }) {
  const student_id = _getStudentId();
  let res;
  try {
    res = await fetch(`${BACKEND}/api/coupons/validate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, book_slug, original_price, student_id }),
    });
  } catch (networkErr) {
    const err = new Error("Could not reach the server. Please check your connection.");
    err.reason = "network";
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.detail;
    const structured = detail && typeof detail === "object";
    const err = new Error(
      (structured && detail.message) ||
      (typeof detail === "string" ? detail : null) ||
      `HTTP ${res.status}`
    );
    err.reason = (structured && detail.reason) || "server_error";
    throw err;
  }
  if (!data || typeof data !== "object") {
    const err = new Error("Unexpected response from the server.");
    err.reason = "server_error";
    throw err;
  }
  return data;
}

/* ── Reason → full-panel presentation. One entry per distinct redemption
 * outcome. `retry-code` clears the applied voucher and returns to
 * Initial; `open-book` hands off to the book directly; `retry-action`
 * re-attempts whichever step failed. ── */
const FAIL_PRESETS = {
  not_found: {
    Icon: Ticket, tone: "warn",
    title: "Voucher code not found",
    body: "Double-check the code and try again.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  disabled: {
    Icon: AlertTriangle, tone: "warn",
    title: "This voucher isn't available",
    body: "It's currently turned off. Try another code, or continue without one.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  not_yet_active: {
    Icon: Clock, tone: "warn",
    title: "This voucher isn't active yet",
    body: "It hasn't started. Try another code, or continue without one.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  expired: {
    Icon: Clock, tone: "warn",
    title: "This voucher has expired",
    body: "It's no longer valid. Try another code, or continue without one.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  wrong_book: {
    Icon: BookOpen, tone: "warn",
    title: "Doesn't apply to this book",
    body: "This code works on a different book. Try another code, or continue without one.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  usage_limit_reached: {
    Icon: AlertTriangle, tone: "warn",
    title: "This voucher is no longer available",
    body: "It's reached its usage limit. Try another code, or continue without one.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  already_used: {
    Icon: AlertTriangle, tone: "warn",
    title: "Already used",
    body: "You've already used this code for this book.",
    primaryLabel: "Try another code", primaryAction: "retry-code",
  },
  promotion_already_redeemed: {
    Icon: Gift, tone: "info",
    title: "Offer already redeemed",
    body: "You've already used this public offer. This promotion is limited to one redemption per user.",
    primaryLabel: "Continue without a voucher", primaryAction: "retry-code",
  },
  already_owned: {
    Icon: BookOpenCheck, tone: "success",
    title: "You already own this book",
    body: "It's already in your library — no need to unlock it again.",
    primaryLabel: "Open Book", primaryAction: "open-book",
  },
  insufficient: {
    Icon: Gem, tone: "warn",
    title: "Not enough points",
    body: "Your balance changed since you opened this. Check your balance and try again.",
    primaryLabel: "Try again", primaryAction: "retry-action",
  },
  network: {
    Icon: WifiOff, tone: "warn",
    title: "Couldn't connect",
    body: "Check your connection and try again.",
    primaryLabel: "Try again", primaryAction: "retry-action",
  },
  server_error: {
    Icon: AlertTriangle, tone: "warn",
    title: "Something went wrong",
    body: "Please try again in a moment.",
    primaryLabel: "Try again", primaryAction: "retry-action",
  },
};

function FailBadge({ Icon, tone, isLight }) {
  const p = tone === "success"
    ? { bg: ACCENT.emeraldBg[isLight ? "light" : "dark"], ring: ACCENT.emeraldBorder[isLight ? "light" : "dark"], color: ACCENT.emerald[isLight ? "light" : "dark"] }
    : tone === "info"
    ? { bg: ACCENT.goldSoft[isLight ? "light" : "dark"], ring: ACCENT.goldBorder[isLight ? "light" : "dark"], color: ACCENT.gold[isLight ? "light" : "dark"] }
    : { bg: ACCENT.redBg[isLight ? "light" : "dark"], ring: ACCENT.redBorder[isLight ? "light" : "dark"], color: ACCENT.red[isLight ? "light" : "dark"] };
  return (
    <div
      className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full"
      style={{ background: p.bg, boxShadow: `0 0 0 1px ${p.ring} inset` }}
      aria-hidden
    >
      <Icon className="h-6 w-6" style={{ color: p.color }} />
    </div>
  );
}

let purchaseModalTitleSeq = 0;

export default function PurchaseModal({
  book,
  meta,
  price,
  balance,
  error,
  errorReason,
  onCancel,
  onConfirm,
  onFinished,
  onOpenOwnedBook,
}) {
  const prefersReducedMotion = useReducedMotion();
  const isLight = useIsLightTheme();
  const gold = ACCENT.gold[isLight ? "light" : "dark"];
  const emerald = ACCENT.emerald[isLight ? "light" : "dark"];
  const emeraldBg = ACCENT.emeraldBg[isLight ? "light" : "dark"];
  const emeraldBorder = ACCENT.emeraldBorder[isLight ? "light" : "dark"];
  const red = ACCENT.red[isLight ? "light" : "dark"];

  const [couponCode, setCouponCode]       = useState(() => readActiveVoucherCode() || "");
  const [couponResult, setCouponResult]   = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const effectivePrice = couponResult ? couponResult.discounted_price : price;
  const canAfford = balance >= effectivePrice;
  const [phase, setPhase] = useState("idle"); // idle | deducting | unlocked | failed
  const [failReason, setFailReason] = useState(null);
  const [failMessage, setFailMessage] = useState(null);
  const [lastAction, setLastAction] = useState(null); // "apply-coupon" | "purchase"
  const [displayBalance, setDisplayBalance] = useState(balance);
  const confettiRef = useRef(null);
  const finishedFiredRef = useRef(false);

  const dialogRef = useRef(null);
  const codeInputRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = useRef(`purchase-modal-title-${++purchaseModalTitleSeq}`).current;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      try { previouslyFocusedRef.current?.focus?.(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusables = node.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [phase]);

  useEffect(() => {
    if (!error) return;
    setFailMessage(error);
    setFailReason(errorReason || "server_error");
    setPhase("failed");
  }, [error, errorReason]);

  useEffect(() => {
    if (phase !== "unlocked") return;
    finishedFiredRef.current = false;
    const t = setTimeout(() => {
      if (finishedFiredRef.current) return;
      finishedFiredRef.current = true;
      onFinished?.();
    }, 1200);
    return () => clearTimeout(t);
  }, [phase, onFinished]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && (phase === "idle" || phase === "failed")) onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, phase]);

  const applyCoupon = useCallback(async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setLastAction("apply-coupon");
    try {
      const result = await fetchValidateCoupon({
        code,
        book_slug: book?.slug || "",
        original_price: price,
      });
      setCouponResult(result);
      setCouponCode(result.code);
    } catch (e) {
      setFailReason(e.reason || "server_error");
      setFailMessage(e.message || "Invalid coupon code.");
      setPhase("failed");
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, book?.slug, price]);

  const removeCoupon = useCallback(() => {
    setCouponCode("");
    setCouponResult(null);
  }, []);

  const retryFromCode = useCallback(() => {
    removeCoupon();
    setFailReason(null);
    setFailMessage(null);
    setPhase("idle");
    setTimeout(() => codeInputRef.current?.focus(), 50);
  }, [removeCoupon]);

  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (autoTriedRef.current) return;
    if (phase !== "idle") return;
    if (couponResult || couponLoading) return;
    if (!couponCode || !couponCode.trim()) return;
    if (!book?.slug) return;
    autoTriedRef.current = true;
    applyCoupon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.slug, phase]);

  const handleBuy = useCallback(async ({ force = false } = {}) => {
    if (!canAfford) return;
    if (!force && phase !== "idle") return;
    setPhase("deducting");
    setLastAction("purchase");
    setTimeout(() => setDisplayBalance(balance - effectivePrice), 120);
    try {
      await Promise.resolve(onConfirm?.(couponResult ? couponResult.code : null, effectivePrice));
      setPhase("unlocked");
      fireUnlockNotification(book, balance - effectivePrice);
    } catch {
      setFailReason((r) => r || "server_error");
      setFailMessage((m) => m || "Please try again in a moment.");
      setPhase("failed");
    }
  }, [canAfford, phase, balance, effectivePrice, onConfirm, couponResult, book]);

  const handleRetry = useCallback(() => {
    setFailReason(null);
    setFailMessage(null);
    setPhase("idle");
    if (lastAction === "apply-coupon") {
      setTimeout(applyCoupon, 0);
    } else if (lastAction === "purchase") {
      setTimeout(() => handleBuy({ force: true }), 0);
    }
  }, [lastAction, applyCoupon, handleBuy]);

  const handleOpenNow = useCallback(() => {
    if (finishedFiredRef.current) return;
    finishedFiredRef.current = true;
    onFinished?.();
  }, [onFinished]);

  const preset = failReason ? (FAIL_PRESETS[failReason] || FAIL_PRESETS.server_error) : null;

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase === "idle") onCancel();
      }}
      // Root-cause fix: LibraryPage's own root wrapper establishes ITS OWN
      // CSS stacking context (position:relative + z-index). A z-index
      // here can only ever compete against siblings WITHIN that same
      // context — it could never outrank the app shell's MobileBottomNav
      // (z-[400]) or Header (z-[200]), which live in a separate stacking
      // context at the app root. Same escape hatch already established
      // elsewhere in this codebase (SubmitAssessmentModal.jsx,
      // AssessmentResultsSheet.jsx, AssessmentDetailSheet.jsx): portal to
      // <body>, z-[500].
      className="fixed inset-0 z-[500] grid place-items-center px-4 bg-black/70 backdrop-blur-md"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      data-testid="purchase-modal"
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.88, y: 26, opacity: 0 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { scale: 0.92, y: 14, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
        className="relative w-full max-w-[420px] max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl outline-none"
        style={{
          background: T.card,
          boxShadow: isLight
            ? "0 30px 80px -20px rgba(13,10,20,0.22), 0 0 0 1px rgba(13,10,20,0.06)"
            : "0 40px 100px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Faint gold wash — a brand accent, not a contrast-bearing
            surface, so it's safe to layer over either theme's card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{ background: `radial-gradient(130% 90% at 10% 0%, ${ACCENT.goldSoft[isLight ? "light" : "dark"]}, transparent 55%)` }}
        />

        {(phase === "idle" || phase === "failed") && (
          <button
            onClick={onCancel}
            aria-label="Close"
            data-testid="purchase-close"
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full active:scale-95 transition"
            style={{ color: T.inkMuted }}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div ref={confettiRef} className="pointer-events-none absolute inset-0 overflow-hidden">
          <AnimatePresence>
            {phase === "unlocked" && !prefersReducedMotion && (
              <>
                {Array.from({ length: 22 }).map((_, i) => {
                  const angle = (i * 360) / 22 + Math.random() * 15;
                  const distance = 150 + Math.random() * 120;
                  const dx = Math.cos((angle * Math.PI) / 180) * distance;
                  const dy = Math.sin((angle * Math.PI) / 180) * distance;
                  const hue = ["#FFD700", "#D4A843", "#E97A7A", "#7DA8E0", "#00BFA5"][i % 5];
                  return (
                    <motion.span
                      key={i}
                      initial={{ opacity: 1, x: 0, y: 0, scale: 0 }}
                      animate={{
                        opacity: [1, 1, 0],
                        x: dx,
                        y: dy,
                        scale: [0, 1, 0.8],
                        rotate: Math.random() * 360,
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                      style={{ background: hue, boxShadow: `0 0 14px ${hue}` }}
                    />
                  );
                })}
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative p-7 pt-10">
          {phase !== "failed" && (
            <div className="flex items-start gap-4 mb-5">
              <motion.div
                initial={prefersReducedMotion ? false : { rotateY: -24, scale: 0.9 }}
                animate={{ rotateY: 0, scale: 1 }}
                transition={{ delay: 0.1, type: "spring", damping: 18 }}
                className="relative flex-none h-[96px] w-[72px] rounded-lg overflow-hidden"
                style={{
                  background: meta?.gradient || book?.coverGradient || "linear-gradient(155deg, #3A1B1B, #6A2D2D)",
                  boxShadow: "0 14px 28px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <span className="absolute left-0 top-0 h-full w-[4px]" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 50%, rgba(0,0,0,0.5))" }} />
                <span className="absolute inset-0 grid place-items-center text-3xl">
                  {book?.coverEmoji || meta?.emoji || "📖"}
                </span>
              </motion.div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.22em] mb-0.5" style={{ color: T.inkFaint }}>Unlock this book</p>
                <h3
                  id={titleId}
                  className="font-display text-[20px] leading-tight line-clamp-2"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif', color: T.ink }}
                  data-testid="purchase-title"
                >
                  {book?.title}
                </h3>
                {book?.subtitle && (
                  <p className="text-[12px] italic mt-1 line-clamp-2" style={{ color: T.inkFaint }}>{book.subtitle}</p>
                )}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {book?.readingMinutes ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: T.surfaceStrong, color: T.inkMuted, border: `1px solid ${T.lineFaint}` }}>
                      ⏱ {book.readingMinutes} min
                    </span>
                  ) : null}
                  {book?.level && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: T.surfaceStrong, color: T.inkMuted, border: `1px solid ${T.lineFaint}` }}>
                      {book.level}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === "idle" && (
            <div
              className="rounded-2xl p-4 mb-4"
              style={{ background: ACCENT.goldSoft[isLight ? "light" : "dark"], border: `1px solid ${ACCENT.goldBorder[isLight ? "light" : "dark"]}` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: T.inkFaint }}>Price</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-full"
                      style={{
                        background: "linear-gradient(135deg, #FFE19A 0%, #D4A843 55%, #9C7A2C 100%)",
                        boxShadow: "0 8px 20px rgba(212,168,67,0.35), inset 0 1px 0 rgba(255,255,255,0.55)",
                      }}
                    >
                      <Gem className="h-5 w-5" style={{ color: "#1B1408" }} />
                    </div>
                    <span
                      className="tabular font-display text-[28px] font-bold leading-none"
                      style={{ color: couponResult ? emerald : T.ink }}
                      data-testid="purchase-price"
                    >
                      {effectivePrice}
                    </span>
                    {couponResult && (
                      <span className="ml-2 text-[12px] line-through" style={{ color: T.inkFaint }}>{price}</span>
                    )}
                    <span className="text-[11px] uppercase tracking-wider ml-0.5" style={{ color: T.inkFaint }}>pts</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: T.inkFaint }}>Your balance</p>
                  <p
                    className="tabular font-display text-[22px] font-semibold leading-none"
                    style={{ color: canAfford ? emerald : red }}
                    data-testid="purchase-balance"
                  >
                    <AnimatedNumber from={balance} to={displayBalance} />
                    <span className="text-[10px] font-normal uppercase tracking-wider opacity-70 ml-1">pts</span>
                  </p>
                  {!canAfford && (
                    <p className="mt-1 text-[10px] uppercase tracking-wider inline-flex items-center gap-1" style={{ color: red }}>
                      <AlertTriangle className="h-3 w-3" />
                      Need {price - balance} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === "idle" && (
            <div className="mb-4">
              {!couponResult ? (
                <div className="flex gap-2">
                  <input
                    ref={codeInputRef}
                    type="text"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && applyCoupon()}
                    placeholder="Coupon code (optional)"
                    maxLength={24}
                    disabled={couponLoading}
                    aria-label="Voucher code"
                    className="flex-1 rounded-xl px-3 py-2 text-[12px] focus:outline-none transition disabled:opacity-60"
                    style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.ink }}
                    data-testid="coupon-input"
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    aria-label="Apply voucher code"
                    aria-busy={couponLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold active:scale-95 transition disabled:opacity-40"
                    style={{ background: ACCENT.goldSoft[isLight ? "light" : "dark"], border: `1px solid ${ACCENT.goldBorder[isLight ? "light" : "dark"]}`, color: gold }}
                    data-testid="coupon-apply-btn"
                  >
                    {couponLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Ticket className="h-3.5 w-3.5" />}
                    {couponLoading ? "Checking…" : "Apply"}
                  </button>
                </div>
              ) : (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ background: emeraldBg, border: `1px solid ${emeraldBorder}` }}
                >
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: emerald }}>
                    <Ticket className="h-3.5 w-3.5 flex-none" />
                    <span><b>{couponResult.code}</b> — {couponResult.coupon_type === "percent" ? `${couponResult.coupon_value}%` : `${couponResult.coupon_value} pts`} off · saving {couponResult.discount_amount} pts</span>
                  </div>
                  <button onClick={removeCoupon} aria-label="Remove voucher" className="ml-2 text-[10px]" style={{ color: T.inkFaint }} data-testid="coupon-remove-btn">✕</button>
                </motion.div>
              )}
            </div>
          )}

          {phase === "idle" && couponResult && (
            <div
              className="mb-4 rounded-xl px-3 py-2.5 text-[12px]"
              style={{ background: emeraldBg, border: `1px solid ${emeraldBorder}` }}
              data-testid="purchase-price-breakdown"
            >
              <div className="flex items-center justify-between" style={{ color: T.inkMuted }}>
                <span>Original price</span>
                <span className="tabular line-through" style={{ color: T.inkFaint }}>{price} pts</span>
              </div>
              <div className="mt-1 flex items-center justify-between" style={{ color: emerald }}>
                <span>Voucher discount{couponResult.code ? ` (${couponResult.code})` : ""}</span>
                <span className="tabular">− {couponResult.discount_amount} pts</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 font-bold" style={{ borderColor: T.lineFaint, color: T.ink }}>
                <span>You pay</span>
                <span className="tabular" style={{ color: emerald }}>{couponResult.discounted_price} pts</span>
              </div>
            </div>
          )}

          {phase === "idle" && canAfford && (
            <>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: T.inkMuted }}>
                Spend <span className="font-bold" style={{ color: gold }}>{effectivePrice} pts</span> to unlock
                this book forever. Read at your own pace, bookmark pages, and earn
                points back when you finish it. ✨
              </p>
              <div
                className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]"
                style={{ background: emeraldBg, border: `1px solid ${emeraldBorder}`, color: emerald }}
                data-testid="purchase-live-badge"
              >
                <ShieldCheck className="h-3.5 w-3.5 flex-none" />
                <span><b>Live deduction</b> — points are debited from your real balance instantly.</span>
              </div>
            </>
          )}
          {phase === "idle" && !canAfford && (
            <>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: T.inkMuted }}>
                You're <span className="font-bold" style={{ color: red }}>{price - balance} pts</span> short.
                Earn more points by spinning the wheel or finishing free lessons — you'll
                be back in no time.
              </p>
              <Link
                to="/game"
                onClick={onCancel}
                data-testid="purchase-topup-link"
                className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-colors"
                style={{ background: ACCENT.goldSoft[isLight ? "light" : "dark"], border: `1px solid ${ACCENT.goldBorder[isLight ? "light" : "dark"]}`, color: gold }}
              >
                <Zap className="h-3.5 w-3.5" />
                Top up at Lucky Spin
              </Link>
            </>
          )}

          {phase === "failed" && preset && (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-2"
              data-testid="purchase-error"
              data-fail-reason={failReason}
            >
              <FailBadge Icon={preset.Icon} tone={preset.tone} isLight={isLight} />
              <p className="font-display text-[18px] leading-tight" style={{ fontFamily: '"Playfair Display", Georgia, serif', color: T.ink }}>
                {preset.title}
              </p>
              <p className="text-[12.5px] mt-2 leading-relaxed max-w-[30ch] mx-auto" style={{ color: T.inkMuted }}>
                {failMessage || preset.body}
              </p>
            </motion.div>
          )}

          {phase === "idle" && (
            <div className="flex gap-2.5">
              <button
                onClick={onCancel}
                data-testid="purchase-cancel"
                className="flex-1 rounded-xl py-3 text-sm font-medium active:scale-[0.98] transition-colors"
                style={{ background: T.surfaceStrong, border: `1px solid ${T.line}`, color: T.ink }}
              >
                Not now
              </button>
              <motion.button
                whileHover={canAfford ? { y: -2, scale: 1.02 } : {}}
                whileTap={canAfford ? { scale: 0.97 } : {}}
                onClick={() => handleBuy()}
                disabled={!canAfford}
                data-testid="purchase-confirm"
                className="flex-[1.4] relative overflow-hidden rounded-xl py-3 text-sm font-bold tracking-wide transition-transform disabled:cursor-not-allowed"
                style={{
                  background: canAfford
                    ? "linear-gradient(135deg, #FFE19A 0%, #D4A843 50%, #9C7A2C 100%)"
                    : "linear-gradient(135deg, rgba(212,168,67,0.30), rgba(120,85,30,0.30))",
                  color: "#1B1408",
                  boxShadow: canAfford ? "0 14px 28px rgba(212,168,67,0.35), inset 0 1px 0 rgba(255,255,255,0.5)" : "none",
                  opacity: canAfford ? 1 : 0.6,
                }}
              >
                {canAfford && !prefersReducedMotion && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 -left-1/3 w-1/3 pointer-events-none"
                    animate={{ x: ["-20%", "420%"] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)", filter: "blur(2px)" }}
                  />
                )}
                <span className="relative inline-flex items-center justify-center gap-2">
                  <Unlock className="h-4 w-4" />
                  {`Unlock for ${effectivePrice} pts`}
                </span>
              </motion.button>
            </div>
          )}

          {phase === "failed" && preset && (
            <div className="flex gap-2.5">
              <button
                onClick={onCancel}
                data-testid="purchase-cancel"
                className="flex-1 rounded-xl py-3 text-sm font-medium active:scale-[0.98] transition-colors"
                style={{ background: T.surfaceStrong, border: `1px solid ${T.line}`, color: T.ink }}
              >
                Close
              </button>
              <motion.button
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (preset.primaryAction === "open-book") onOpenOwnedBook?.();
                  else if (preset.primaryAction === "retry-action") handleRetry();
                  else retryFromCode();
                }}
                data-testid="purchase-error-primary"
                className="flex-[1.4] inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold tracking-wide transition-transform"
                style={{
                  background: "linear-gradient(135deg, #FFE19A 0%, #D4A843 50%, #9C7A2C 100%)",
                  color: "#1B1408",
                  boxShadow: "0 14px 28px rgba(212,168,67,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                {preset.primaryAction === "open-book" ? <BookOpen className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
                {preset.primaryLabel}
              </motion.button>
            </div>
          )}

          {phase === "deducting" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 py-3"
              role="status"
              aria-live="polite"
            >
              <motion.div
                animate={prefersReducedMotion ? {} : { rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                className="h-5 w-5 rounded-full border-2"
                style={{ borderColor: ACCENT.goldBorder[isLight ? "light" : "dark"], borderTopColor: gold }}
              />
              <span className="text-[13px] uppercase tracking-[0.2em] font-bold" style={{ color: gold }}>
                Deducting points…
              </span>
            </motion.div>
          )}

          {phase === "unlocked" && (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 12, stiffness: 180 }}
              className="text-center py-2"
              data-testid="purchase-success"
              role="status"
              aria-live="polite"
            >
              <motion.div
                animate={prefersReducedMotion ? {} : { rotate: [0, -10, 10, -6, 0] }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full"
                style={{ background: "linear-gradient(135deg, #B8F3D2 0%, #00BFA5 100%)", boxShadow: "0 18px 40px rgba(0,191,165,0.4)" }}
              >
                <Check className="h-8 w-8" style={{ color: "#04231B" }} strokeWidth={3} />
              </motion.div>
              <p className="font-display text-[20px] leading-tight" style={{ color: T.ink }}>
                Unlocked!
              </p>
              <p className="text-[12px] mt-1 mb-4 inline-flex items-center gap-1.5" style={{ color: T.inkFaint }}>
                <Sparkles className="h-3 w-3" style={{ color: gold }} />
                Added to your library
              </p>
              <button
                onClick={handleOpenNow}
                data-testid="purchase-open-book"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold tracking-wide transition-transform hover:scale-[1.01] active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #B8F3D2 0%, #00BFA5 100%)", color: "#04231B", boxShadow: "0 14px 28px rgba(0,191,165,0.35)" }}
              >
                <BookOpen className="h-4 w-4" />
                Open Book
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
