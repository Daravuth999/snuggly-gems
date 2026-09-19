import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Banner, Button, Card, Field, Screen, Wave } from "@/components/app-ui";

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
    <Screen>
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-14">
        <div className="rise mb-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[22px] bg-[linear-gradient(140deg,oklch(0.42_0.2_290),oklch(0.5_0.16_240))] shadow-[0_24px_50px_-24px_oklch(0.62_0.19_295)]">
            <Wave />
          </div>
          <h1 className="text-[26px] font-bold tracking-tight">
            {mode === "forgot" ? "Reset password" : "Voice-Over Studio"}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-400">
            {mode === "forgot"
              ? "We’ll email a secure link to your admin account."
              : "Private tool — admin team only."}
          </p>
        </div>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Email"
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {mode !== "forgot" && (
              <Field
                label="Password"
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}

            {error && <Banner tone="bad">{error}</Banner>}
            {notice && <Banner tone="ok">{notice}</Banner>}

            <Button type="submit" disabled={busy} className="mt-1">
              {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create admin account" : "Send reset link"}
            </Button>
          </form>
        </Card>

        <div className="mt-6 flex flex-col items-center gap-3 text-[13px]">
          {mode === "in" && (
            <button
              onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}
              className="press text-ink-300"
            >
              Forgot password?
            </button>
          )}
          <button
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); setNotice(null); }}
            className="press text-ink-400"
          >
            {mode === "in" ? "First time? Create the admin account" : "Back to sign in"}
          </button>
        </div>
      </div>
    </Screen>
  );
}
