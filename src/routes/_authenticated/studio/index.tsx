import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createVideo, listVideos } from "@/lib/studio.functions";
import { Banner, Button, Card, Screen, Spinner, TopBar } from "@/components/app-ui";

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
  const fileRef = useRef<HTMLInputElement>(null);

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
    <Screen>
      <TopBar
        title="Voice-Over Studio"
        subtitle="Admin workspace"
        right={
          <button
            onClick={async () => {
              await qc.cancelQueries();
              qc.clear();
              await supabase.auth.signOut();
              await navigate({ to: "/auth", replace: true });
            }}
            className="press text-[13px] text-ink-400"
          >
            Sign out
          </button>
        }
      />

      <div className="mx-auto max-w-lg space-y-5 px-5 pt-5">
        <Card>
          <h2 className="text-[17px] font-semibold tracking-tight">New video</h2>
          <p className="mt-1 text-[13px] text-ink-400">Pick a narration language, then choose a clip.</p>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-1.5">
            {(["en", "km"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`press rounded-xl py-3 text-[14px] font-semibold transition ${
                  language === l
                    ? "bg-[linear-gradient(120deg,oklch(0.62_0.19_295),oklch(0.66_0.15_240))] text-white"
                    : "text-ink-400"
                }`}
              >
                {l === "en" ? "English" : "ខ្មែរ Khmer"}
              </button>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            onChange={onFile}
            disabled={Boolean(busy)}
            className="hidden"
          />
          <Button className="mt-4" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading…" : "Choose a video"}
          </Button>

          {busy && <div className="mt-4"><Spinner label={busy} /></div>}
          {error && <div className="mt-4"><Banner tone="bad">{error}</Banner></div>}
        </Card>

        <section>
          <h2 className="ml-1 text-[13px] font-semibold uppercase tracking-widest text-ink-400">
            Your videos
          </h2>

          {videos.isPending && <div className="mt-4 ml-1"><Spinner label="Loading…" /></div>}

          {videos.data?.length === 0 && (
            <Card className="mt-3 text-center">
              <p className="text-[13px] text-ink-400">Nothing uploaded yet.</p>
            </Card>
          )}

          <ul className="mt-3 space-y-2.5">
            {videos.data?.map((v) => (
              <li key={v.id}>
                <Link
                  to="/studio/$videoId"
                  params={{ videoId: v.id }}
                  className="press glass grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-app)] px-4 py-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(140deg,oklch(0.42_0.2_290),oklch(0.5_0.16_240))] text-[15px]">
                    ▶
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{v.title}</span>
                    <span className="block truncate text-[12px] text-ink-400">
                      {v.narration_language === "km" ? "Khmer" : "English"} · {v.status}
                    </span>
                  </span>
                  <span className="shrink-0 text-ink-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Screen>
  );
}
