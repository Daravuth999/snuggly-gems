// LoginPage.jsx — Student PWA sign-in screen.
//
// v12.0 (Feb 2026) — EduHub Premium DY Authentication Experience v1
// ------------------------------------------------------------------
// The visual shell has been reconstructed into a calm, white,
// official DY-branded premium login surface inspired by Apple's
// sign-in flow (NOT copied). Every interactive piece, payload,
// AuthContext call, redirect logic, Turnstile token plumbing and
// fallback GAS->Render chain is preserved BYTE-FOR-BYTE from v11.0.
//
// What changed:
//   • The aurora/glassmorphism canvas is replaced by <PremiumAuthShell>
//     (white background, soft accent halos, safe-area aware).
//   • The credential card is now <PremiumCredentialCard> with the
//     DY brand mark above the form, premium gray-200 inputs, and
//     polished inline error text instead of a red block.
//   • Submitting the form opens a full-screen <DYSigningOverlay>
//     with the DY orbit animation and rotating supportive status
//     copy. The overlay closes automatically on success/failure.
//   • Turnstile widget is unchanged; rendered via the same ref and
//     reset() / getToken() contract.
//
// What did NOT change:
//   • The Render-first loginStudent() call still runs with the same
//     (studentId, password, tsToken) signature, and the legacy GAS
//     fallback through `login(studentId, password)` is preserved.
//   • The redirect query parameter behavior is identical (default
//     "/portal/me" — matches v11.0 of this file).
//   • Error/hint copy strings still flow through the existing
//     LanguageContext `t(...)` keys.
//   • No new dependencies. framer-motion + lucide-react already in
//     package.json and used here exactly like before.
import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, ShieldCheck, CheckCircle2, Lock, ChevronRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../pages/portal/contexts/LanguageContext";
import { api as portalApi } from "../pages/portal/lib/api";
import TurnstileWidget from "../auth/TurnstileWidget";
import SmartLoginPanel from "../auth/SmartLoginPanel";
import { requestPasswordReset } from "../auth/studentAuthService";
import {
  PremiumAuthShell,
  PremiumCredentialCard,
  DYSigningOverlay,
} from "../auth/premium";
import DYLogo from "../auth/premium/DYLogo";

// Smart Login is EduHub's primary, recommended sign-in method — a student
// with a teacher-issued QR should be able to sign in in one scan, with
// Student ID + Password remaining a fully-supported fallback for anyone
// who doesn't have their QR handy.
const SMART_LOGIN_STATUSES = [
  "Verifying your EduHub QR…",
  "Checking your learning profile…",
  "Loading your points wallet…",
  "Almost ready…",
];

export default function LoginPage() {
  const { login, loginStudent, loginWithSmartCredential } = useAuth();
  const { t, lang, toggle: toggleLang } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/portal/me";

  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hint, setHint] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);

  // Milestone 4 (teacher-assisted password reset) — additive, separate
  // from the existing GAS "hint" mechanism above (kept untouched).
  const [resetRequestSending, setResetRequestSending] = useState(false);
  const [resetRequestMessage, setResetRequestMessage] = useState(null);

  // v11.0 — Centralized Turnstile widget ref. Untouched in v12.0.
  const turnstileRef = useRef(null);
  const [turnstileReady, setTurnstileReady] = useState(false);

  // EduHub Smart Login — QR scan/upload is now the primary, recommended
  // method (defaults to "smart"). Student ID + Password remains fully
  // functional and unchanged as the fallback; `method` only switches which
  // card renders inside the same shell.
  const [method, setMethod] = useState("smart"); // "smart" | "password"
  const [smartError, setSmartError] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const smartTurnstileRef = useRef(null);
  const [smartTurnstileReady, setSmartTurnstileReady] = useState(false);

  async function handleSmartDecoded(qrPayload) {
    setSmartError(null);
    setSmartLoading(true);
    try {
      const tsToken = smartTurnstileRef.current ? smartTurnstileRef.current.getToken() : "";
      const result = await loginWithSmartCredential(qrPayload, tsToken);
      if (result && result.error) {
        if (smartTurnstileRef.current) smartTurnstileRef.current.reset();
        setSmartError(result.error);
        return;
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      if (smartTurnstileRef.current) smartTurnstileRef.current.reset();
      setSmartError(
        (err && err.message) ||
          "We couldn't verify this QR. Please try another QR or use Student ID + Password.",
      );
    } finally {
      setSmartLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tsToken = turnstileRef.current ? turnstileRef.current.getToken() : "";
      // Prefer the v10.0.1 Render-backed login when available; fall back
      // to the legacy GAS-backed login() for any code path that has not
      // yet been migrated. Both signatures coexist inside AuthContext.
      if (typeof loginStudent === "function") {
        let renderOk = false;
        try {
          const result = await loginStudent(studentId, password, tsToken);
          if (result && result.error) {
            // Render responded but flagged an application-level error
            // (e.g. bot check). Do NOT fall through to legacy — show it.
            if (turnstileRef.current) turnstileRef.current.reset();
            setError(result.error);
            setLoading(false);
            return;
          }
          renderOk = true;
        } catch (renderErr) {
          // Render login failed (e.g. student has no bcrypt password
          // yet). Silently fall through to the legacy GAS-backed login
          // below so students registered before the Render backend can
          // still sign in.
          renderOk = false;
        }
        if (!renderOk) {
          // Legacy GAS fallback — verifies password against Google Sheet.
          await login(studentId, password);
        }
      } else {
        await login(studentId, password);
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      if (turnstileRef.current) turnstileRef.current.reset();
      setError((err && err.message) || t("loginGenericError"));
    } finally {
      setLoading(false);
    }
  }

  async function getHint() {
    if (!studentId.trim()) {
      setError(t("enterIdFirst"));
      return;
    }
    setError(null);
    setHintLoading(true);
    try {
      const res = await portalApi.passwordHint(studentId.trim());
      setHint(res?.hint || res?.error || t("noHint"));
    } catch {
      setHint(t("hintFetchError"));
    } finally {
      setHintLoading(false);
    }
  }

  // Milestone 4 — teacher-assisted password reset request. Reuses the
  // same Turnstile token already obtained for the login form (no second
  // widget). Backend never reveals whether studentId is registered, so
  // the success message is identical regardless — shown from our own
  // bilingual copy rather than the backend's (English-only) message.
  async function handleForgotPassword() {
    if (!studentId.trim()) {
      setResetRequestMessage(t("enterIdForReset"));
      return;
    }
    setResetRequestMessage(null);
    setResetRequestSending(true);
    try {
      const tsToken = turnstileRef.current ? turnstileRef.current.getToken() : "";
      await requestPasswordReset(studentId.trim(), tsToken);
      setResetRequestMessage(t("forgotPasswordSent"));
    } catch {
      setResetRequestMessage(t("forgotPasswordGenericError"));
    } finally {
      setResetRequestSending(false);
    }
  }

  // Language toggle pill — sits in the shell's top-right slot.
  const langToggle = (
    <button
      type="button"
      onClick={toggleLang}
      data-testid="login-lang-toggle"
      className="text-[12px] font-semibold uppercase tracking-[0.16em]"
      style={{
        color: "#0B1B36",
        background: "transparent",
        border: "1px solid #E5E7EB",
        borderRadius: 999,
        padding: "6px 12px",
      }}
    >
      {lang === "en" ? "ខ្មែរ" : "EN"}
    </button>
  );

  // Telegram / "Need help?" support link under the form.
  const supportSlot = (
    <span>
      <span style={{ display: "block", marginBottom: 6 }}>
        {t("forgotPasswordPrompt")}{" "}
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetRequestSending || !turnstileReady}
          data-testid="login-forgot-password-btn"
          style={{
            color: "#1A56DB", fontWeight: 600, textDecoration: "underline",
            background: "none", border: "none", padding: 0, cursor: "pointer",
            font: "inherit",
          }}
        >
          {resetRequestSending ? t("forgotPasswordSending") : t("forgotPasswordLink")}
        </button>
      </span>
      {resetRequestMessage && (
        <span
          data-testid="login-forgot-password-message"
          style={{ display: "block", marginBottom: 6, color: "#6B7280" }}
        >
          {resetRequestMessage}
        </span>
      )}
      Need help?{" "}
      <a
        href="https://t.me/alita995"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="login-support-link"
        style={{ color: "#1A56DB", fontWeight: 600, textDecoration: "none" }}
      >
        Contact us on Telegram
      </a>
    </span>
  );

  // Bilingual footer under the shell content.
  const footer = (
    <>
      <p>EduHub by DY Learning · {new Date().getFullYear()}</p>
      <p className="font-khmer" lang="km" style={{ color: "#9CA3AF" }}>
        ប្រព័ន្ធអប់រំឆ្លាតវៃរបស់អ្នក
      </p>
    </>
  );

  // Small link back into Smart Login from the manual-login screen — the
  // manual form has no toggle anymore (Smart Login isn't a competing tab),
  // so this is the only way back short of leaving and returning to /login.
  const backToSmartLink = (
    <button
      type="button"
      onClick={() => setMethod("smart")}
      data-testid="login-method-smart"
      className="mx-auto mb-5 flex items-center gap-1.5 text-[12.5px] font-semibold"
      style={{ color: "#1A56DB" }}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Use Smart Login instead
    </button>
  );

  return (
    <>
      <PremiumAuthShell
        backTo="/"
        backLabel="Back to Dashboard"
        rightSlot={langToggle}
        footer={footer}
        testID="login-shell"
      >
        {method === "smart" ? (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            data-testid="smart-login-card"
            className="w-full"
          >
            {/* Shared brand hero — compact: this sits above the fold on a
                real phone alongside the whole Smart Login card down to
                Turnstile, so every pixel here is spent deliberately. */}
            <div className="flex flex-col items-center text-center">
              <DYLogo size={52} testID="smart-login-card-brand" />
              <p
                className="mt-2 text-[10px] font-semibold tracking-[0.2em] uppercase"
                style={{ color: "#9CA3AF" }}
              >
                DY · EduHub
              </p>
              <h1
                className="mt-1 font-display text-[21px] sm:text-[23px] font-bold"
                style={{ color: "#0B1B36", letterSpacing: "-0.01em" }}
              >
                Welcome to <span style={{ color: "#1A56DB" }}>EduHub</span>
              </h1>
            </div>

            {/* Smart Login — the flagship card */}
            <div
              className="mt-4 mx-auto w-full rounded-[24px] border bg-white"
              style={{
                maxWidth: 400,
                borderColor: "#EDEFF2",
                boxShadow: "0 1px 2px rgba(11,27,54,0.04), 0 16px 40px -20px rgba(11,27,54,0.22)",
                padding: "18px 20px 18px",
              }}
              data-testid="smart-login-hero-card"
            >
              <div className="flex justify-center">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                  style={{ background: "linear-gradient(135deg, #E9CD97, #D4A843)", color: "#3D2E0A" }}
                >
                  <Zap className="h-2.5 w-2.5" fill="currentColor" />
                  Recommended
                </span>
              </div>

              <div className="mt-2 text-center">
                <h2
                  className="flex items-center justify-center gap-1.5 text-[19px] sm:text-[21px] font-bold"
                  style={{ color: "#0B1B36" }}
                >
                  <span aria-hidden>⚡</span> Smart Login
                </h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "#6B7280" }}>
                  Scan your QR code to sign in instantly
                </p>
              </div>

              <div className="mt-3">
                <SmartLoginPanel
                  theme="light"
                  onDecoded={handleSmartDecoded}
                  onCancel={() => setSmartError(null)}
                />
              </div>

              {smartError && (
                <motion.div
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="dy-error-text mt-3"
                  role="alert"
                  data-testid="login-smart-error"
                >
                  <span className="dy-error-dot" />
                  <span>{smartError}</span>
                </motion.div>
              )}

              {/* Or → manual sign-in */}
              <div className="mt-3 flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1" style={{ background: "#EDEFF2" }} />
                <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                  Or
                </span>
                <div className="h-px flex-1" style={{ background: "#EDEFF2" }} />
              </div>

              <button
                type="button"
                onClick={() => setMethod("password")}
                data-testid="login-method-password"
                className="mt-3 flex w-full items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition hover:bg-[#F7F8FA]"
                style={{ borderColor: "#EDEFF2", background: "#FAFBFC", minHeight: 44 }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "#EEF1F5" }}
                >
                  <Lock className="h-3.5 w-3.5" style={{ color: "#0B1B36" }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold" style={{ color: "#0B1B36" }}>
                    Use Student ID &amp; Password
                  </span>
                  <span className="block text-[11px]" style={{ color: "#9CA3AF" }}>
                    Traditional sign in method
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#9CA3AF" }} />
              </button>

              {/* Security verification */}
              <div className="mt-3">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "#6B7280" }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#1A56DB" }} />
                  Verify you are human
                </div>
                <div className="mt-1.5 flex justify-center" data-testid="login-smart-turnstile-slot">
                  <TurnstileWidget
                    ref={smartTurnstileRef}
                    theme="light"
                    size="flexible"
                    onError={(msg) => setSmartError(msg)}
                    onToken={() => setSmartTurnstileReady(true)}
                  />
                </div>
                {!smartTurnstileReady && (
                  <p className="mt-1.5 text-center text-[11px]" style={{ color: "#9CA3AF" }}>
                    Preparing security check…
                  </p>
                )}
              </div>
            </div>

            {/* Benefit strip */}
            <div className="mt-4 mx-auto grid grid-cols-3 gap-2" style={{ maxWidth: 400 }}>
              {[
                { Icon: Zap, label: "Fast", sub: "One scan to go" },
                { Icon: ShieldCheck, label: "Secure", sub: "Your account is safe" },
                { Icon: CheckCircle2, label: "Easy", sub: "No typing needed" },
              ].map(({ Icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center text-center gap-1 px-1">
                  <Icon className="h-4 w-4" style={{ color: "#D4A843" }} />
                  <span className="text-[11.5px] font-bold" style={{ color: "#0B1B36" }}>
                    {label}
                  </span>
                  <span className="text-[10px] leading-tight" style={{ color: "#9CA3AF" }}>
                    {sub}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="mt-5 mx-auto text-center text-[12.5px]"
              style={{ maxWidth: 400, color: "#6B7280" }}
            >
              {supportSlot}
            </div>
          </motion.section>
        ) : (
          <>
            {backToSmartLink}
            <PremiumCredentialCard
              title="Sign in to EduHub"
              subtitle="Your smart English learning ecosystem"
              idLabel={t("studentId")}
              idValue={studentId}
              onIdChange={setStudentId}
              idPlaceholder="e.g. stu001"
              passwordLabel={t("password")}
              passwordValue={password}
              onPasswordChange={setPassword}
              passwordPlaceholder="••••••••"
              showPassword={showPw}
              onTogglePassword={() => setShowPw((v) => !v)}
              onSubmit={handleSubmit}
              submitLabel={t("signInBtn")}
              submittingLabel={t("signingIn")}
              submitting={loading}
              submitDisabled={!turnstileReady}
              error={error}
              onHint={getHint}
              hintLoading={hintLoading}
              hintMessage={hint}
              hintLabel={t("hint")}
              turnstileSlot={
                <TurnstileWidget
                  ref={turnstileRef}
                  theme="light"
                  size="flexible"
                  onError={(msg) => setError(msg)}
                  onToken={() => setTurnstileReady(true)}
                />
              }
              supportSlot={supportSlot}
              testID="login-card"
            />
          </>
        )}
      </PremiumAuthShell>

      {/* Full-screen DY signing-in overlay — shown while EITHER auth
          request is pending. Closes automatically on success/failure
          because both `loading` and `smartLoading` flip back to false
          in their own finally blocks. Smart Login gets its own status
          copy (opens on "Verifying your EduHub QR…" instead of jumping
          straight to the generic profile-loading steps). */}
      <DYSigningOverlay
        open={loading || smartLoading}
        title={smartLoading ? "Verifying your EduHub QR…" : (t("signingIn") || "Signing in…")}
        statuses={
          smartLoading
            ? SMART_LOGIN_STATUSES
            : [
                "Checking your learning profile…",
                "Loading your points wallet…",
                "Preparing EduTalk and AI Coach…",
                "Almost ready…",
              ]
        }
        testID="login-signing-overlay"
      />
    </>
  );
}
