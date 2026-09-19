import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { claimAdmin } from "@/lib/studio.functions";
import { Button, Card, Screen, Spinner } from "@/components/app-ui";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const claim = useServerFn(claimAdmin);
  const { data, isPending } = useQuery({
    queryKey: ["admin-claim"],
    queryFn: () => claim({ data: undefined }),
    staleTime: Infinity,
  });

  if (isPending) {
    return (
      <Screen>
        <div className="flex min-h-dvh items-center justify-center px-6">
          <Spinner label="Checking your access…" />
        </div>
      </Screen>
    );
  }

  if (!data?.admin) {
    return (
      <Screen>
        <div className="mx-auto flex min-h-dvh w-full max-w-sm items-center px-6">
          <Card className="w-full text-center">
            <h1 className="text-[20px] font-bold tracking-tight">Not an admin yet</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
              Ask an existing admin to add your email to the invite list, then sign in again.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={async () => {
                await supabase.auth.signOut();
                await navigate({ to: "/auth" });
              }}
            >
              Sign out
            </Button>
          </Card>
        </div>
      </Screen>
    );
  }

  return <Outlet />;
}
