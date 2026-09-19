import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin sign in · Voice-Over Studio" },
      { name: "description", content: "Private sign in for the Voice-Over Studio admin team." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin sign in · Voice-Over Studio" },
      { property: "og:description", content: "Private sign in for the Voice-Over Studio admin team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If this email belongs to an admin account, a secure reset link is on its way. Check your inbox and spam folder.");
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        const signedIn = await supabase.auth.signInWithPassword({ email, password });
        if (signedIn.error) {
          setNotice("Account created. Sign in below.");
          setMode("in");
        } else {
          await navigate({ to: "/studio" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await navigate({ to: "/studio" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(
        /invalid login credentials/i.test(msg)
          ? "That email and password don't match. Check for typos or reset your password below."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">{mode === "forgot" ? "Reset your password" : "Voice-Over Studio"}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {mode === "forgot" ? "We’ll email a secure link to your admin account." : "Private tool — admin team only."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-slate-300" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-3 text-base outline-none focus:border-emerald-500"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="text-sm text-slate-300" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-3 text-base outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create admin account" : "Send reset link"}
          </button>
        </form>

        <div className="mt-5 flex flex-col items-start gap-3 text-sm">
          {mode === "in" && (
            <button onClick={() => { setMode("forgot"); setError(null); setNotice(null); }} className="text-slate-300 underline">
              Forgot password?
            </button>
          )}
          <button
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); setNotice(null); }}
            className="text-slate-400 underline"
          >
            {mode === "in" ? "First time? Create the admin account" : "Back to sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
