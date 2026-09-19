import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  generateNarration,
  getVideo,
  saveTranscript,
  signAudio,
  synthesizeLine,
  transcribeSegment,
} from "@/lib/studio.functions";
import { buildSrt, downloadText, extractSpeechSegments } from "@/lib/audio";

export const Route = createFileRoute("/_authenticated/studio/$videoId")({
  head: () => ({
    meta: [
      { title: "Video · Voice-Over Studio" },
      { name: "description", content: "Transcribe, narrate and export subtitles for this video." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Video · Voice-Over Studio" },
      { property: "og:description", content: "Transcribe, narrate and export subtitles for this video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VideoDetail,
});

function VideoDetail() {
  const { videoId } = Route.useParams();
  const qc = useQueryClient();

  const fetchVideo = useServerFn(getVideo);
  const transcribe = useServerFn(transcribeSegment);
  const save = useServerFn(saveTranscript);
  const script = useServerFn(generateNarration);
  const synth = useServerFn(synthesizeLine);
  const sign = useServerFn(signAudio);

  const q = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => fetchVideo({ data: { id: videoId } }),
  });

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const data = q.data;
  const cues = data?.cues ?? [];
  const narration = data?.narration ?? [];

  async function runTranscription() {
    if (!data?.videoUrl) return;
    setError(null);
    try {
      setStatus("Downloading the video…");
      const res = await fetch(data.videoUrl);
      const blob = await res.blob();
      const file = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });

      const { segments } = await extractSpeechSegments(file, (m) => setStatus(m));

      const out: { start_ms: number; end_ms: number; text: string }[] = [];
      for (let i = 0; i < segments.length; i++) {
        setStatus(`Transcribing part ${i + 1} of ${segments.length}…`);
        const seg = segments[i]!;
        const r = await transcribe({
          data: {
            wavBase64: seg.wavBase64,
            language: data.video.narration_language === "km" ? null : "en",
          },
        });
        if (r.text) out.push({ start_ms: seg.start_ms, end_ms: seg.end_ms, text: r.text });
      }

      setStatus("Working out who speaks each line…");
      await save({ data: { videoId, cues: out } });
      await qc.invalidateQueries({ queryKey: ["video", videoId] });
      setStatus(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Transcription failed.");
    }
  }

  async function runScript() {
    setError(null);
    setStatus("Writing the narration script…");
    try {
      await script({
        data: { videoId, language: (data?.video.narration_language ?? "en") as "en" | "km" },
      });
      await qc.invalidateQueries({ queryKey: ["video", videoId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the script.");
    } finally {
      setStatus(null);
    }
  }

  async function voiceLine(idx: number) {
    setError(null);
    setStatus(`Recording line ${idx + 1}…`);
    try {
      const r = await synth({ data: { videoId, idx } });
      const s = await sign({ data: { paths: [r.audio_path] } });
      setAudioUrls((prev) => ({ ...prev, ...s.urls }));
      await qc.invalidateQueries({ queryKey: ["video", videoId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice generation failed.");
    } finally {
      setStatus(null);
    }
  }

  async function voiceAll() {
    for (let i = 0; i < narration.length; i++) {
      if (narration[i]!.audio_path) continue;
      await voiceLine(i);
    }
  }

  async function loadAudio() {
    const paths = narration.map((l) => l.audio_path).filter((p): p is string => Boolean(p));
    if (!paths.length) return;
    const s = await sign({ data: { paths } });
    setAudioUrls(s.urls);
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100 px-5 py-8">
      <div className="mx-auto max-w-lg">
        <Link to="/studio" className="text-sm text-slate-400 underline">← All videos</Link>

        {q.isPending && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

        {data && (
          <>
            <h1 className="mt-4 text-xl font-semibold">{data.video.title}</h1>
            <p className="text-sm text-slate-400">
              {data.video.narration_language === "km" ? "Khmer narration" : "English narration"} ·{" "}
              {Math.round(Number(data.video.duration_sec ?? 0))}s
            </p>

            {data.videoUrl && (
              <video
                src={data.videoUrl}
                controls
                playsInline
                className="mt-4 w-full rounded-xl border border-slate-800 bg-black"
              />
            )}

            {status && <p className="mt-4 text-sm text-emerald-400">{status}</p>}
            {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

            <section className="mt-6 space-y-3">
              <button
                onClick={runTranscription}
                disabled={Boolean(status)}
                className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:opacity-50"
              >
                {cues.length ? "Transcribe again" : "1 · Transcribe the original audio"}
              </button>

              {cues.length > 0 && (
                <button
                  onClick={runScript}
                  disabled={Boolean(status)}
                  className="w-full rounded-lg border border-emerald-500 px-4 py-3 font-medium text-emerald-300 disabled:opacity-50"
                >
                  {narration.length ? "Rewrite the narration" : "2 · Write the narration script"}
                </button>
              )}

              {narration.length > 0 && (
                <button
                  onClick={voiceAll}
                  disabled={Boolean(status)}
                  className="w-full rounded-lg border border-slate-700 px-4 py-3 font-medium disabled:opacity-50"
                >
                  3 · Record every narration line
                </button>
              )}
            </section>

            {cues.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Original transcript</h2>
                  <button
                    onClick={() =>
                      downloadText(`${data.video.title}-original.srt`, buildSrt(cues, true))
                    }
                    className="text-sm text-emerald-400 underline"
                  >
                    Download SRT
                  </button>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {cues.map((c) => (
                    <li key={c.idx} className="rounded-lg border border-slate-800 p-3">
                      <span className="block text-xs text-slate-500">
                        {(c.start_ms / 1000).toFixed(2)}s – {(c.end_ms / 1000).toFixed(2)}s
                        {c.speaker ? ` · ${c.speaker}` : ""}
                      </span>
                      {c.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {narration.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Narration</h2>
                  <div className="flex gap-3">
                    <button onClick={loadAudio} className="text-sm text-slate-400 underline">
                      Load audio
                    </button>
                    <button
                      onClick={() =>
                        downloadText(`${data.video.title}-narration.srt`, buildSrt(narration))
                      }
                      className="text-sm text-emerald-400 underline"
                    >
                      Download SRT
                    </button>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {narration.map((l) => (
                    <li key={l.idx} className="rounded-lg border border-slate-800 p-3">
                      <span className="block text-xs text-slate-500">
                        {(l.start_ms / 1000).toFixed(1)}s – {(l.end_ms / 1000).toFixed(1)}s
                        {l.audio_ms ? ` · voiced ${(l.audio_ms / 1000).toFixed(1)}s` : ""}
                      </span>
                      <p className="mt-1">{l.text}</p>
                      {l.audio_path && audioUrls[l.audio_path] && (
                        <audio src={audioUrls[l.audio_path]} controls className="mt-2 w-full" />
                      )}
                      <button
                        onClick={() => voiceLine(l.idx)}
                        disabled={Boolean(status)}
                        className="mt-2 rounded-md border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        {l.audio_path ? "Record again" : "Record this line"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
