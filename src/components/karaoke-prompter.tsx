import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./app-ui";

export interface KaraokeWord {
  idx: number;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  text: string;
}

interface KaraokePrompterProps {
  videoUrl: string;
  words: KaraokeWord[];
}

function speakerName(speaker: string | null) {
  if (!speaker) return "Speaker";
  const number = speaker.match(/\d+/)?.[0];
  return number ? `Speaker ${Number(number) + 1}` : speaker.replaceAll("_", " ");
}

export function KaraokePrompter({ videoUrl, words }: KaraokePrompterProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) setCurrentMs(video.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const activeIndex = useMemo(
    () => words.findIndex((word) => currentMs >= word.start_ms && currentMs < word.end_ms),
    [currentMs, words],
  );
  const activeWord = activeIndex >= 0 ? words[activeIndex] : null;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [activeIndex]);

  function seek(word: KaraokeWord) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = word.start_ms / 1000;
    setCurrentMs(word.start_ms);
    void video.play();
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-app)] border border-white/10 bg-black shadow-[0_24px_60px_-34px_rgba(0,0,0,1)]">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onSeeked={(event) => setCurrentMs(event.currentTarget.currentTime * 1000)}
        className="aspect-video w-full bg-black object-contain"
      />

      <div className="relative min-h-52 overflow-hidden bg-ink-900 px-5 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase text-accent-soft">
            Karaoke
          </span>
          <span className="text-[12px] font-medium capitalize text-ink-400">
            {activeWord ? speakerName(activeWord.speaker) : "Ready"}
          </span>
        </div>

        <div className="karaoke-scroll max-h-64 overflow-y-auto py-5 text-center" aria-live="off">
          <p className="flex flex-wrap justify-center gap-x-2 gap-y-3 text-[22px] font-semibold leading-relaxed">
            {words.map((word, index) => {
              const active = index === activeIndex;
              const spoken = word.end_ms <= currentMs;
              const speakerChanged = index > 0 && words[index - 1]?.speaker !== word.speaker;
              return (
                <span key={`${word.idx}-${word.start_ms}`} className={speakerChanged ? "basis-full" : undefined}>
                  <button
                    ref={active ? activeRef : undefined}
                    type="button"
                    onClick={() => seek(word)}
                    aria-label={`Play from ${word.text}`}
                    className={`karaoke-word rounded-lg px-1.5 py-0.5 transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${
                      active
                        ? "karaoke-word-active bg-accent text-white"
                        : spoken
                          ? "text-ink-300"
                          : "text-ink-400"
                    }`}
                  >
                    {word.text}
                  </button>
                </span>
              );
            })}
          </p>
        </div>

        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.currentTime = 0;
            setCurrentMs(0);
            void video.play();
          }}
        >
          Play from beginning
        </Button>
      </div>
    </section>
  );
}