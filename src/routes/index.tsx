import { createFileRoute } from "@tanstack/react-router";
import videoAsset from "@/assets/maya-and-kip-narrated.mp4.asset.json";
import narrationAudio from "/videos/Maya-and-Kip-narration.mp3?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Download — Maya & Kip Narrated Story" },
      {
        name: "description",
        content:
          "Download the finished narrated story video and the narration audio for your shadowing class.",
      },
      { property: "og:title", content: "Download — Maya & Kip Narrated Story" },
      {
        property: "og:description",
        content:
          "Download the finished narrated story video and the narration audio for your shadowing class.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function Index() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <p className="text-sm uppercase tracking-[0.2em] text-neutral-400 mb-2">
          Finished story
        </p>
        <h1 className="text-3xl font-bold mb-1">Maya &amp; Kip — Narrated</h1>
        <p className="text-neutral-400 mb-6">
          Original voice removed, new narrator and soft scene sounds added.
          3:04 &middot; 720p
        </p>

        <video
          src={videoAsset.url}
          controls
          playsInline
          className="w-full rounded-xl bg-black border border-neutral-800"
        />

        <div className="mt-6 grid gap-3">
          <a
            href={videoAsset.url}
            download="Maya-and-Kip-narrated.mp4"
            className="flex items-center justify-between rounded-xl bg-emerald-500 px-5 py-4 font-semibold text-emerald-950 hover:bg-emerald-400 transition-colors"
          >
            <span>Download video (MP4)</span>
            <span className="text-sm font-normal">
              {formatSize(videoAsset.size)}
            </span>
          </a>

          <a
            href={narrationAudio}
            download="Maya-and-Kip-narration.mp3"
            className="flex items-center justify-between rounded-xl bg-neutral-800 px-5 py-4 font-semibold hover:bg-neutral-700 transition-colors"
          >
            <span>Download narration audio only (MP3)</span>
            <span className="text-sm font-normal">4 MB</span>
          </a>
        </div>
      </div>
    </div>
  );
}
