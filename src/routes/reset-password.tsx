import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · Voice-Over Studio" },
      { name: "description", content: "Choose a new password for your Voice-Over Studio admin account." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Reset password · Voice-Over Studio" },
      { property: "og:description", content: "Choose a new password for your Voice-Over Studio admin account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const isRecoveryLink = hash.get("type") === "recovery";

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (!active || event !== "PASSWORD_RECOVERY") return;
      setRecoveryReady(true);
      setChecking(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setRecoveryReady(isRecoveryLink && Boolean(data.session));
      setChecking(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-400">Use at least 8 characters for your admin account.</p>

        {checking ? (
          <p className="mt-8 text-sm text-slate-400">Checking your secure link…</p>
        ) : recoveryReady ? (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="text-sm text-slate-300" htmlFor="new-password">New password</label>
              <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-3 text-base outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-sm text-slate-300" htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-3 text-base outline-none focus:border-emerald-500" />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:opacity-50">
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        ) : (
          <div className="mt-8">
            <p className="text-sm text-rose-400">This reset link is invalid or has expired. Request a new one from the sign-in page.</p>
            <button onClick={() => navigate({ to: "/auth", replace: true })} className="mt-5 text-sm text-slate-300 underline">Return to sign in</button>
          </div>
        )}
      </div>
    </main>
  );
}