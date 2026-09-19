import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/studio" });
  },
  head: () => ({
    meta: [
      { title: "Voice-Over Studio" },
      { name: "description", content: "Private admin tool for AI narration, dubbing and subtitles." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Voice-Over Studio" },
      { property: "og:description", content: "Private admin tool for AI narration, dubbing and subtitles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
