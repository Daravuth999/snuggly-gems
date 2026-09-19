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
  const [mode, setMode] = useState<"in" | "up">("in");
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
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/studio` },
        });
        if (error) throw error;
        setNotice("Account created. Sign in below.");
        setMode("in");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await navigate({ to: "/studio" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Voice-Over Studio</h1>
        <p className="mt-1 text-sm text-slate-400">Private tool — admin team only.</p>

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

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create admin account"}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}
          className="mt-5 text-sm text-slate-400 underline"
        >
          {mode === "in" ? "First time? Create the admin account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
