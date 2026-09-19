import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  generateNarration,
  getVideo,
  saveTranscript,
  signAudio,
  synthesizeLine,
  transcribeSegment,
} from "@/lib/studio.functions";
import { buildSrt, downloadText, extractSpeechSegments } from "@/lib/audio";
import { Banner, Button, Card, Screen, Spinner, TopBar } from "@/components/app-ui";

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

      const { segments, durationSec } = await extractSpeechSegments(file, (m) => setStatus(m));

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
      await save({ data: { videoId, durationSec, cues: out } });
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
    <Screen>
      <TopBar
        title={data?.video.title ?? "Video"}
        subtitle={
          data
            ? `${data.video.narration_language === "km" ? "Khmer" : "English"} · ${Math.round(
                Number(data.video.duration_sec ?? 0),
              )}s`
            : undefined
        }
        left={
          <Link to="/studio" className="press text-[15px] text-ink-300">
            ‹ Back
          </Link>
        }
      />

      <div className="mx-auto max-w-lg space-y-5 px-5 pt-5">
        {q.isPending && <Spinner label="Loading…" />}

        {data && (
          <>
            {data.videoUrl && (
              <video
                src={data.videoUrl}
                controls
                playsInline
                className="rise w-full rounded-[var(--radius-app)] border border-white/10 bg-black shadow-[0_24px_60px_-34px_rgba(0,0,0,1)]"
              />
            )}

            {status && <Card><Spinner label={status} /></Card>}
            {error && <Banner tone="bad">{error}</Banner>}

            <Card className="space-y-2.5">
              <Button onClick={runTranscription} disabled={Boolean(status)}>
                {cues.length ? "Transcribe again" : "1 · Transcribe the original audio"}
              </Button>

              {cues.length > 0 && (
                <Button variant="outline" onClick={runScript} disabled={Boolean(status)}>
                  {narration.length ? "Rewrite the narration" : "2 · Write the narration script"}
                </Button>
              )}

              {narration.length > 0 && (
                <Button variant="outline" onClick={voiceAll} disabled={Boolean(status)}>
                  3 · Record every narration line
                </Button>
              )}
            </Card>

            {cues.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <h2 className="text-[13px] font-semibold uppercase tracking-widest text-ink-400">
                    Original transcript
                  </h2>
                  <button
                    onClick={() =>
                      downloadText(`${data.video.title}-original.srt`, buildSrt(cues, true))
                    }
                    className="press shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold"
                  >
                    ↓ SRT
                  </button>
                </div>
                <ul className="space-y-2">
                  {cues.map((c) => (
                    <li key={c.idx} className="glass rounded-2xl p-3.5 text-[14px] leading-relaxed">
                      <span className="mb-1 block text-[11px] tabular-nums text-ink-400">
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
              <section>
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <h2 className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-widest text-ink-400">
                    Narration
                  </h2>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={loadAudio}
                      className="press rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-ink-300"
                    >
                      Load audio
                    </button>
                    <button
                      onClick={() =>
                        downloadText(`${data.video.title}-narration.srt`, buildSrt(narration))
                      }
                      className="press rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold"
                    >
                      ↓ SRT
                    </button>
                  </div>
                </div>
                <ul className="space-y-2">
                  {narration.map((l) => (
                    <li key={l.idx} className="glass rounded-2xl p-3.5">
                      <span className="block text-[11px] tabular-nums text-ink-400">
                        {(l.start_ms / 1000).toFixed(1)}s – {(l.end_ms / 1000).toFixed(1)}s
                        {l.audio_ms ? ` · voiced ${(l.audio_ms / 1000).toFixed(1)}s` : ""}
                      </span>
                      <p className="mt-1 text-[14px] leading-relaxed">{l.text}</p>
                      {l.audio_path && audioUrls[l.audio_path] && (
                        <audio src={audioUrls[l.audio_path]} controls className="mt-2.5 w-full" />
                      )}
                      <button
                        onClick={() => voiceLine(l.idx)}
                        disabled={Boolean(status)}
                        className="press mt-2.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-45"
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
    </Screen>
  );
}
