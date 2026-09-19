import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Banner, Button, Card, Field, Screen, Spinner, Wave } from "@/components/app-ui";

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
    <Screen>
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-14">
        <div className="rise mb-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[22px] bg-[linear-gradient(140deg,oklch(0.42_0.2_290),oklch(0.5_0.16_240))]">
            <Wave />
          </div>
          <h1 className="text-[26px] font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-1.5 text-[13px] text-ink-400">At least 8 characters for your admin account.</p>
        </div>

        <Card>
          {checking ? (
            <Spinner label="Checking your secure link…" />
          ) : recoveryReady ? (
            <form onSubmit={submit} className="space-y-4">
              <Field
                label="New password"
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                label="Confirm new password"
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {error && <Banner tone="bad">{error}</Banner>}
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <Banner tone="bad">
                This reset link is invalid or has expired. Request a new one from the sign-in page.
              </Banner>
              <Button variant="outline" onClick={() => navigate({ to: "/auth", replace: true })}>
                Return to sign in
              </Button>
            </div>
          )}
        </Card>
      </div>
    </Screen>
  );
}
