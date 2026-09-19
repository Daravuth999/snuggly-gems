/**
 * ChampionShimmer.jsx — subtle looping shimmer behind the Friday Speaking
 * Winners Champion avatar (Dashboard Polish Round 2, Feature 1).
 *
 * Mirrors TopUpLottie.jsx's "bulletproof" contract exactly (same package,
 * same fallback discipline) rather than inventing a second Lottie-loading
 * pattern:
 *   • Lazy-fetches /lotties/champion-shimmer.json at runtime so the
 *     Dashboard's first paint never blocks on it.
 *   • Falls back to a pure-CSS radial glow if the JSON 404s, errors, or
 *     lottie-react throws — the panel stays usable either way.
 *   • Respects prefers-reduced-motion (renders the static glow only).
 *   • Purely decorative (aria-hidden), absolutely positioned BEHIND the
 *     avatar it sits under — never intercepts taps.
 *
 * The JSON itself is the same sparkle asset already shipped for the
 * Library reader's WelcomeOverlay.jsx (src/eduhub/pages/library/reader/
 * lotties/sparkles.json), copied to /public/lotties/ so it can be
 * runtime-fetched the same way topup-payment.json is — reusing an
 * existing, already-reviewed asset rather than authoring new Lottie JSON
 * by hand (not something to hand-write reliably).
 */
import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";

const LOTTIE_PATH = "/lotties/champion-shimmer.json";

function FallbackGlow() {
  return (
    <div
      aria-hidden
      data-testid="champion-shimmer-fallback"
      className="absolute inset-0 rounded-full pointer-events-none"
      style={{
        background: "radial-gradient(circle, rgba(255,225,154,0.35) 0%, rgba(212,168,67,0.12) 55%, transparent 75%)",
        animation: "champion-shimmer-pulse 3.2s ease-in-out infinite",
      }}
    >
      <style>{`
        @keyframes champion-shimmer-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50%      { opacity: 0.9;  transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}

export default function ChampionShimmer() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const reducedRef = useRef(false);

  useEffect(() => {
    try {
      reducedRef.current =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reducedRef.current = false;
    }

    if (reducedRef.current) return; // skip fetch, show static fallback

    let alive = true;
    fetch(LOTTIE_PATH, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("404"))))
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (reducedRef.current || failed || !data) {
    return <FallbackGlow />;
  }

  // lottie-react may throw if the JSON is malformed; wrap defensively.
  try {
    return (
      <div
        aria-hidden
        data-testid="champion-shimmer-player"
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0.4 }}
      >
        <Lottie
          animationData={data}
          loop
          autoplay
          rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    );
  } catch {
    return <FallbackGlow />;
  }
}
