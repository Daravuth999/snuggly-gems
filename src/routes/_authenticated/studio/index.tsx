import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createVideo, listVideos } from "@/lib/studio.functions";

export const Route = createFileRoute("/_authenticated/studio/")({
  head: () => ({
    meta: [
      { title: "Videos · Voice-Over Studio" },
      { name: "description", content: "Upload a video and generate narration, subtitles and voice-over." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Videos · Voice-Over Studio" },
      { property: "og:description", content: "Upload a video and generate narration, subtitles and voice-over." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioHome,
});

function StudioHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listVideos);
  const create = useServerFn(createVideo);

  const videos = useQuery({ queryKey: ["videos"], queryFn: () => list({ data: undefined }) });

  const [language, setLanguage] = useState<"en" | "km">("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy("Uploading the video…");
    try {
      // Best-effort duration; some browsers can't read metadata for every
      // container, and the real duration is measured during transcription.
      const durationSec = await new Promise<number>((resolve) => {
        const el = document.createElement("video");
        el.preload = "metadata";
        const done = (v: number) => resolve(Number.isFinite(v) && v > 0 ? v : 0);
        el.onloadedmetadata = () => done(el.duration);
        el.onerror = () => done(0);
        setTimeout(() => done(0), 8000);
        el.src = URL.createObjectURL(file);
      });

      const path = `${crypto.randomUUID()}/source-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await supabase.storage.from("studio").upload(path, file, {
        contentType: file.type || "video/mp4",
        upsert: false,
      });
      if (up.error) throw up.error;

      const row = await create({
        data: {
          title: file.name.replace(/\.[^.]+$/, ""),
          storagePath: path,
          durationSec,
          language,
        },
      });
      await qc.invalidateQueries({ queryKey: ["videos"] });
      await navigate({ to: "/studio/$videoId", params: { videoId: row.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      e.target.value = "";
    }
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100 px-5 py-8">
      <div className="mx-auto max-w-lg">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Voice-Over Studio</h1>
            <p className="mt-1 text-sm text-slate-400">Admin only. Upload a video to begin.</p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              await navigate({ to: "/auth" });
            }}
            className="text-sm text-slate-400 underline shrink-0"
          >
            Sign out
          </button>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="font-medium">New video</h2>

          <div className="mt-4">
            <span className="text-sm text-slate-300">Narration language</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["en", "km"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`rounded-lg px-3 py-3 text-sm border ${
                    language === l
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 text-slate-300"
                  }`}
                >
                  {l === "en" ? "English" : "ខ្មែរ Khmer"}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-5 block">
            <span className="sr-only">Choose a video</span>
            <input
              type="file"
              accept="video/*"
              onChange={onFile}
              disabled={Boolean(busy)}
              className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-4 file:py-3 file:text-slate-950 file:font-medium"
            />
          </label>

          {busy && <p className="mt-3 text-sm text-emerald-400">{busy}</p>}
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </section>

        <section className="mt-8">
          <h2 className="font-medium">Your videos</h2>
          {videos.isPending && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
          {videos.data?.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">Nothing uploaded yet.</p>
          )}
          <ul className="mt-3 space-y-2">
            {videos.data?.map((v) => (
              <li key={v.id}>
                <Link
                  to="/studio/$videoId"
                  params={{ videoId: v.id }}
                  className="block rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
                >
                  <span className="block font-medium">{v.title}</span>
                  <span className="block text-xs text-slate-500">
                    {v.narration_language === "km" ? "Khmer" : "English"} · {v.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
