/**
 * SecurityPanel.jsx — Author Studio "Force All Users to Sign Out".
 *
 * Operational recovery tool, not a daily-use feature: after a major
 * PWA/authentication upgrade, an admin needs one reliable action that
 * makes every currently-authenticated student AND admin/teacher session
 * invalid, so everyone lands back on /login and can immediately use the
 * latest build (Smart Login QR still works — only sessions are dropped,
 * never credentials or accounts; see admin_security.py for the backend
 * rationale).
 *
 * This action also invalidates the admin's OWN session (the button says
 * "ALL users" and means it). Author Studio only re-checks /api/auth/me
 * once per mount (no resume-revalidation loop like the student side), so
 * rather than leave the admin to stumble into a raw 401 on their next
 * click, this panel proactively calls the existing useStudioAuth().signOut()
 * right after a successful call — the same sign-out path the header's own
 * "Sign out" button already uses.
 */
import { useState } from "react";
import { ShieldAlert, LogOut, Loader2, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { forceLogoutAllUsers } from "../../eduhub/auth/studentAuthService";
import { useStudioAuth } from "../StudioAuth";

const css = {
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text: "#F4E5C1",
  textMuted: "rgba(244,229,193,0.55)",
  danger: "rgba(239, 68, 68, 0.9)",
  dangerBg: "rgba(239, 68, 68, 0.10)",
  dangerBorder: "rgba(239, 68, 68, 0.35)",
  good: "rgba(74, 222, 128, 0.9)",
};

export default function SecurityPanel() {
  const { signOut } = useStudioAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { total } | { error }

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await forceLogoutAllUsers();
      setResult({ total: r.total_invalidated });
      setConfirming(false);
      // Sign the admin's own session out too, one beat later so they can
      // actually read the success message before the Studio sign-in
      // screen replaces it.
      setTimeout(() => { signOut(); }, 1800);
    } catch (e) {
      setResult({ error: e.message || "Failed to sign out all users" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="security-panel"
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${css.border}`, background: css.card }}
    >
      <div
        className="px-5 py-3 flex items-center gap-2"
        style={{ borderBottom: `1px solid ${css.border}`, background: "rgba(239,68,68,0.06)" }}
      >
        <ShieldAlert className="h-4 w-4" style={{ color: css.danger }} />
        <span className="text-[13px] font-semibold" style={{ color: css.text }}>
          Security
        </span>
      </div>

      <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="max-w-md">
          <p className="text-[13px] font-semibold" style={{ color: css.text }}>
            Force All Users to Sign Out
          </p>
          <p className="mt-1 text-[12px]" style={{ color: css.textMuted }}>
            Require all currently signed-in users to authenticate again.
            Use this after deploying a major EduHub update — students and
            teachers are returned to login and can sign back in
            immediately with Smart Login or Student ID + Password.
            Accounts, passwords, and Smart Login QR credentials are not
            affected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          data-testid="security-force-logout-open"
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider shrink-0"
          style={{ background: css.dangerBg, color: css.danger, border: `1px solid ${css.dangerBorder}` }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Force All Users to Sign Out
        </button>
      </div>

      {result && !result.error && (
        <div
          className="px-5 pb-4 flex items-start gap-2 text-[12px]"
          style={{ color: css.good }}
          data-testid="security-force-logout-success"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            All active sessions have been invalidated ({result.total} session
            {result.total === 1 ? "" : "s"}). You will be signed out of
            Author Studio too in a moment — sign back in to continue.
          </span>
        </div>
      )}
      {result && result.error && (
        <div
          className="px-5 pb-4 flex items-start gap-2 text-[12px]"
          style={{ color: css.danger }}
          data-testid="security-force-logout-error"
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          data-testid="security-force-logout-confirm"
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${css.dangerBorder}`, background: "#0a0a0f" }}
          >
            <div className="px-5 py-4 flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" style={{ color: css.danger }} />
              <div>
                <p className="text-[14px] font-bold" style={{ color: css.text }}>
                  Force all users to sign out?
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: css.textMuted }}>
                  All currently active EduHub sessions — students and
                  Author Studio admins, including this one — will be
                  invalidated. Everyone can sign in again immediately
                  using Smart Login or Student ID + Password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                aria-label="Cancel"
                className="ml-auto shrink-0"
                style={{ color: css.textMuted }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                data-testid="security-force-logout-cancel"
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
                style={{ background: "rgba(255,255,255,0.06)", color: css.text, border: `1px solid ${css.border}` }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={busy}
                data-testid="security-force-logout-confirm-btn"
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
                style={{ background: css.danger, color: "#1a0a0a", border: "1px solid rgba(239,68,68,0.6)" }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                Force Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
