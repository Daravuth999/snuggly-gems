import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { claimAdmin } from "@/lib/studio.functions";

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
      <div className="min-h-dvh bg-slate-950 text-slate-400 flex items-center justify-center">
        Checking your access…
      </div>
    );
  }

  if (!data?.admin) {
    return (
      <div className="min-h-dvh bg-slate-950 text-slate-100 flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Not an admin yet</h1>
          <p className="mt-2 text-sm text-slate-400">
            Ask an existing admin to add your email to the invite list, then sign in again.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              await navigate({ to: "/auth" });
            }}
            className="mt-6 rounded-lg border border-slate-700 px-4 py-2 text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
