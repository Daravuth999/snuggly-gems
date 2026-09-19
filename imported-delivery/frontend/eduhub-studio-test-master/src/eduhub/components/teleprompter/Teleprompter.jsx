/**
 * Teleprompter.jsx — EduHub's shared premium educational teleprompter.
 *
 * Consumes the APPROVED canonical synchronization document (sync_schema.py
 * shape: paragraphs → sentences → words, speakers[]). It NEVER performs
 * speech recognition — everything it shows was generated during content
 * processing and reviewed in the Synchronization Review Studio.
 *
 * Two clock sources, media element first:
 *   - `mediaRef` (preferred — the Video Library player passes its own
 *     <video>/<audio> ref): a rAF loop samples el.currentTime while
 *     playing, so word highlighting is visually immediate. See
 *     useSyncHighlight.js for the full engine contract.
 *   - `currentTime` prop (legacy — Author Studio previews): identical
 *     behavior to the previous implementation for those consumers.
 *
 * Rendering is per-sentence memoized: a word transition re-renders only
 * the affected sentence(s), never the whole transcript — the fix for the
 * render-storm-induced highlight latency on long lessons.
 *
 * Auto-scroll happens inside this component's OWN viewport (never the
 * page), keeps the active sentence at the author-configured anchor
 * (config.scrollSpeed — unchanged formula unless config.centerFocus is on,
 * see below), fades previous phrases behind a gradient mask, suspends when
 * the student scrolls manually, and offers a "Follow playback" chip to
 * resume.
 *
 * config.centerFocus ("center focus" cinematic reading mode, opt-in,
 * default false — see teleprompterConfig.js): the active sentence is
 * anchored to a RESPONSIVE fraction of the viewport's own real height
 * (focusZone.js's computeFocusAnchorRatio — never a hardcoded percentage,
 * it reacts to the viewport's actual clientHeight plus bilingual mode and
 * font scale), and already-spoken/upcoming sentences get a graduated
 * distance-based fade + rise/approach transform (focusZone.js's
 * focusZoneStyle) instead of the flat past/future opacity used otherwise.
 * This only changes CSS opacity/transform on top of the existing
 * scroll/highlight mechanics below — it never touches word/sentence
 * timing, the sync engine, or which sentence is "active".
 *
 * In centerFocus mode the trailing spacer after the last sentence is also
 * measured (not fixed) — see computeTrailingSpacerPx — so the LAST
 * sentence in a lesson can still scroll all the way up to the anchor
 * despite useAutoFollow's own scrollHeight-based clamp having no more real
 * content below it to work with. A short transcript that never needed to
 * scroll gets no extra space beyond a small floor; the clamp/tween/anchor
 * math in useAutoFollow itself is untouched.
 *
 * Fully author-configurable via `config` (see teleprompterConfig.js).
 */
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  useSyncHighlight, useActiveSentence, useSentenceState, useSentenceDistance, buildSentenceMetas,
} from "../../lib/useSyncHighlight";
import useAutoFollow from "../../lib/useAutoFollow";
import { mergeTeleprompterConfig, FONT_FAMILIES } from "./teleprompterConfig";
import { computeFocusAnchorRatio, focusZoneStyle, computeTrailingSpacerPx, computeStandardAnchorPx } from "./focusZone";
import "./teleprompter.css";

const GOLD = "#D4A843";
const SOFT_GOLD = "#A8967A"; // desaturated relative to GOLD — the "uncertain" tier's own color, never the same as a confident highlight
const SPEAKER_COLORS = ["#D4A843", "#7DB8F0", "#8FD6A8", "#E8A0BF", "#C7A8F0", "#F0C987"];
const LOW_CONFIDENCE = 0.7;

// §4 confidence-tiered rendering (Teleprompter karaoke structural fix).
// A word only earns CRISP, per-word karaoke precision when it carries
// EITHER a real measured alignment confidence at or above this bar (old
// ElevenLabs-Scribe-produced lessons already in the database — preserved
// exactly, never migrated or recomputed) OR the `measured: true`
// provenance flag supplied by the current alignment engine. An
// interpolated estimate (confidence.alignment always None/omitted, no
// `measured` flag) never qualifies either way, by construction, since an
// estimate is not a measurement no matter how plausible it looks. 0.6 was
// a deliberately real, honest threshold for ElevenLabs Scribe specifically:
// its confidence was derived from its ASR logprob, where a well-recognized
// common word routinely clears 0.85+ and a genuinely uncertain/noisy one
// commonly falls below this bar.
const HIGH_CONFIDENCE_ALIGNMENT = 0.6;

/**
 * Per-sentence confidence tier for §4's graceful degradation — computed
 * from real per-word alignment evidence, never guessed:
 *   "high"      — every word in the sentence earns real, measured status,
 *                  either via a numeric alignment confidence >=
 *                  HIGH_CONFIDENCE_ALIGNMENT (legacy aligned lessons) or
 *                  via `word.measured === true`. This is a
  *                  plain fact about timing provenance, never a fabricated
 *                  confidence value standing in for one — the full
 *                  karaoke experience is earned either way.
 *   "uncertain" — the sentence has words, but at least one lacks either
 *                 signal above (Gemini's interpolated estimate, or a
 *                 genuinely low-confidence legacy match) — falls back to
 *                 a softer, honest sentence-level highlight instead of
 *                 pretending word-level precision it doesn't have.
 *   "none"      — nothing to highlight (no words) or documentAligned is
 *                 false (the lesson's alignment pipeline stage never
 *                 completed at all, so there is no trustworthy timing
 *                 data of ANY kind, not even an interpolated estimate).
 */
export function computeSentenceConfidenceTier(sentence, documentAligned) {
  if (!documentAligned) return "none";
  const words = sentence?.words || [];
  if (!words.length) return "none";
  const allHighConfidence = words.every((w) => {
    if (w?.measured === true) return true;
    const c = (w?.confidence || {}).alignment;
    return typeof c === "number" && c >= HIGH_CONFIDENCE_ALIGNMENT;
  });
  return allHighConfidence ? "high" : "uncertain";
}

// Guarded the same way useAutoFollow.js already reads this — jsdom (this
// codebase's Jest environment) does not implement matchMedia, so an
// unguarded call would throw in every test that mounts the Teleprompter.
function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function wordConfidence(w) {
  const c = w?.confidence || {};
  const vals = Object.values(c).filter((v) => typeof v === "number");
  return vals.length ? Math.min(...vals) : null;
}

/** Bilingual learning layer: the Khmer translation for the sentence
 * CURRENTLY playing only — never the whole lesson's Khmer at once (see
 * teleprompterConfig.js's showTranslation docstring). Purely a display
 * concern: `sentence.translationKm` carries no timing of its own and this
 * component never reads word/sentence start-end, so it cannot affect
 * karaoke highlighting or auto-scroll in any way. Renders nothing when the
 * sentence has no translation (legacy lesson, or Gemini translation never
 * attached) — no fabricated Khmer text ever appears. */
function TranslationLine({ sentence, active, config }) {
  if (!config.showTranslation || !active || !sentence.translationKm) return null;
  return (
    <span className="tp-translation" data-testid="teleprompter-translation-line" lang="km">
      {sentence.translationKm}
    </span>
  );
}

/** state: "past" | "future" | localActiveWordIdx (see useSentenceState).
 * `tier` (§4): "high" | "uncertain" | "none" — from
 * computeSentenceConfidenceTier. Word-level karaoke coloring only ever
 * applies at tier "high"; at "uncertain"/"none" the SENTENCE-level
 * highlight (ConversationSentence/StorySentence) carries the "this is
 * active" signal instead, so per-word precision is never shown for data
 * that doesn't earn it. */
function SentenceWords({ sentence, state, config, onSeek, tier = "high" }) {
  const sentenceActive = typeof state === "number";
  const sentencePast = state === "past";
  return (sentence.words || []).map((w, i) => {
    const isActive = sentenceActive && i === state;
    const isPast = sentencePast || (sentenceActive && state >= 0 && i < state);
    const conf = config.showConfidence ? wordConfidence(w) : null;
    const lowConf = conf !== null && conf < LOW_CONFIDENCE;
    const karaokeActive = config.karaoke && isActive && tier === "high";
    // wordHighlight/karaoke's plain-highlight fallback is ALSO a claim of
    // word-level precision (exactly one word marked active) — gated the
    // same way for the same honesty reason: at "uncertain"/"none" tier,
    // ConversationSentence/StorySentence's own sentence-level highlight
    // carries the "this is active" signal instead.
    const highlightActive = (config.wordHighlight || config.karaoke) && isActive && tier === "high";
    // Only color/background-color/opacity ever change here — never padding
    // or font-weight, both of which alter the word's rendered width and
    // would shift every subsequent word on the line (see teleprompter.css's
    // .tp-word comment for the reserved-footprint technique that makes
    // this safe: the highlight pill's box is the same size whether it's
    // visible or fully transparent).
    return (
      <span
        key={i}
        onClick={onSeek ? () => onSeek(w.start) : undefined}
        className={`tp-word${onSeek ? " cursor-pointer" : ""}`}
        data-word-active={isActive || undefined}
        style={{
          color: karaokeActive ? "#111" : highlightActive ? GOLD : lowConf ? "#f0a8a8" : undefined,
          background: karaokeActive
            ? GOLD
            : highlightActive
              ? "rgba(212,168,67,0.14)"
              : lowConf ? "rgba(240,80,80,0.10)" : "transparent",
          opacity: sentenceActive ? (isPast ? 0.72 : 1) : sentencePast ? 1 : 0.9,
        }}
      >
        {w.word}{" "}
      </span>
    );
  });
}

// Center-focus opacity/transform for a sentence — falls back to the
// original flat past/future values when config.centerFocus is off, so
// every non-opted-in consumer (Author Studio's preview) renders bit-for-
// bit as before.
function focusVisual({ centerFocus, distance, reducedMotion, past, future }) {
  if (centerFocus && distance !== null) return focusZoneStyle(distance, { reducedMotion });
  return { opacity: past ? 0.45 : future ? 0.8 : 1, transform: undefined };
}

const ConversationSentence = memo(function ConversationSentence({
  meta, idx, store, config, onSeek, registerRef, speakerLabel, speakerColor, side, reducedMotion, documentAligned,
}) {
  const state = useSentenceState(store, idx, meta.wordOffset, meta.count);
  // Always subscribed (rules of hooks) — cost is applied only when
  // config.centerFocus reads it below; see useSentenceDistance's own
  // docstring for why this never adds per-word-tick re-renders.
  const distance = useSentenceDistance(store, idx);
  const isCurrent = typeof state === "number";
  // §4 — computeSentenceConfidenceTier is a pure function of meta.s
  // (stable per sync-doc reference, cached upstream) and documentAligned;
  // useMemo here just skips redundant recomputation across word-tick
  // re-renders of THIS sentence, never a source of truth on its own.
  const tier = useMemo(() => computeSentenceConfidenceTier(meta.s, documentAligned), [meta.s, documentAligned]);
  const active = isCurrent && config.sentenceHighlight && tier !== "none";
  const uncertain = active && tier === "uncertain";
  const past = state === "past";
  const sid = meta.s.speakerId || "";
  const visual = focusVisual({ centerFocus: config.centerFocus, distance, reducedMotion, past, future: state === "future" });
  return (
    <div ref={(el) => registerRef(idx, el)}
         className={`flex ${config.centered ? "justify-center" : side ? "justify-end" : "justify-start"}`}>
      <div
        className="tp-sentence max-w-[85%] rounded-2xl px-3.5 py-2.5"
        data-testid={`teleprompter-sentence-${idx}`}
        data-confidence-tier={isCurrent ? tier : undefined}
        style={{
          background: uncertain ? "rgba(168,150,122,0.09)" : active ? "rgba(212,168,67,0.13)" : "rgba(255,255,255,0.045)",
          border: `1px ${uncertain ? "dashed" : "solid"} ${
            uncertain ? "rgba(168,150,122,0.4)" : active ? "rgba(212,168,67,0.45)" : "rgba(255,255,255,0.08)"
          }`,
          opacity: visual.opacity,
          transform: visual.transform,
        }}
      >
        {sid && (
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: speakerColor }}>
            {speakerLabel || sid}
          </div>
        )}
        <div style={{ fontSize: `${14 * config.fontScale}px`, lineHeight: config.lineSpacing }}>
          <SentenceWords sentence={meta.s} state={state} config={config} onSeek={onSeek} tier={tier} />
        </div>
        <TranslationLine sentence={meta.s} active={isCurrent} config={config} />
      </div>
    </div>
  );
});

const StorySentence = memo(function StorySentence({ meta, idx, store, config, onSeek, registerRef, reducedMotion, documentAligned }) {
  const state = useSentenceState(store, idx, meta.wordOffset, meta.count);
  const distance = useSentenceDistance(store, idx);
  const isCurrent = typeof state === "number";
  const tier = useMemo(() => computeSentenceConfidenceTier(meta.s, documentAligned), [meta.s, documentAligned]);
  const active = isCurrent && config.sentenceHighlight && tier !== "none";
  const uncertain = active && tier === "uncertain";
  const past = state === "past";
  const visual = focusVisual({ centerFocus: config.centerFocus, distance, reducedMotion, past, future: state === "future" });
  // tp-sentence-story reserves its highlight padding at all times (see
  // teleprompter.css) — activation only changes background/opacity, never
  // the sentence's footprint within the flowing paragraph.
  return (
    <span
      ref={(el) => registerRef(idx, el)}
      data-testid={`teleprompter-sentence-${idx}`}
      data-confidence-tier={isCurrent ? tier : undefined}
      className={`tp-sentence tp-sentence-story${uncertain ? " tp-sentence-uncertain" : ""}`}
      style={{
        background: uncertain ? "rgba(168,150,122,0.08)" : active ? "rgba(212,168,67,0.10)" : "transparent",
        opacity: visual.opacity,
        // CSS transforms have no effect on non-replaced inline boxes — a
        // plain <span> ignores `transform` entirely in every browser. The
        // rise/approach motion only needs to apply when centerFocus is on,
        // so inline-block is scoped to that mode alone: its shrink-to-fit
        // width algorithm still wraps a long sentence within the
        // paragraph's own width (it is NOT sized to its unwrapped
        // max-content width), so this cannot cause horizontal overflow on
        // narrow screens the way a naive width:auto inline-block might.
        display: config.centerFocus ? "inline-block" : undefined,
        transform: visual.transform,
      }}
    >
      <SentenceWords sentence={meta.s} state={state} config={config} onSeek={onSeek} tier={tier} />
      <TranslationLine sentence={meta.s} active={isCurrent} config={config} />
    </span>
  );
});

function Teleprompter({
  sync,
  currentTime,
  mediaRef,      // preferred clock source — the host page's media element ref
  store: externalStore, // optional — reuse a caller-owned engine instead of
                         // spinning up a second, redundant one (see
                         // useSyncHighlight.js's `externalStore` contract)
  mode,          // legacy prop — config.mode wins when config is passed
  fontScale,     // legacy prop
  autoScroll,    // legacy prop
  config: configProp,
  onSeek,
  className = "",
}) {
  const containerRef = useRef(null);
  const sentenceRefs = useRef({});
  const registerRef = useCallback((idx, el) => { sentenceRefs.current[idx] = el; }, []);

  const config = useMemo(() => mergeTeleprompterConfig(
    {},
    mode !== undefined ? { mode } : {},
    fontScale !== undefined ? { fontScale } : {},
    autoScroll !== undefined ? { autoScroll } : {},
    configProp || {},
  ), [mode, fontScale, autoScroll, configProp]);

  const store = useSyncHighlight(mediaRef, sync, currentTime, externalStore);
  const activeSentenceIdx = useActiveSentence(store);

  const metas = useMemo(() => buildSentenceMetas(sync), [sync]);
  // §4 — "no usable alignment data at all for this lesson" tier: the
  // pipeline's alignment stage never completed (still processing/failed/
  // awaiting a provider), so there is no trustworthy timing of ANY kind
  // to highlight against, not even Gemini's own interpolated estimate.
  // Every REAL sync document already defaults alignmentStatus to
  // "complete" (sync_schema.build_sync_document) unless explicitly
  // marked otherwise — treated as aligned when the field is absent
  // entirely too (never fabricated as a NEW reason to degrade a document
  // that simply predates this field, e.g. a hand-built preview/test
  // fixture), so this preserves full karaoke behavior for every lesson
  // that already had it before this feature existed. Only an EXPLICIT
  // non-"complete" value degrades.
  const documentAligned = sync?.alignmentStatus == null || sync.alignmentStatus === "complete";
  const measuredTiming = sync?.wordAlignment?.status === "complete"
    && (sync?.wordAlignment?.matchedWords || 0) > 0;
  const speakers = useMemo(() => sync?.speakers || [], [sync]);
  const speakerLabel = useMemo(() => {
    const out = {};
    speakers.forEach((sp) => { out[sp.id] = sp.label || sp.id; });
    return out;
  }, [speakers]);
  const speakerColor = useMemo(() => {
    const out = {};
    speakers.forEach((sp, i) => { out[sp.id] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]; });
    return out;
  }, [speakers]);

  const resolvedMode = config.mode === "auto"
    ? (speakers.length >= 2 ? "conversation" : "storytelling")
    : config.mode;

  const reducedMotion = useMemo(prefersReducedMotion, []);

  // Center-focus mode: the anchor is a RESPONSIVE fraction of the
  // viewport's own real clientHeight (computeFocusAnchorRatio), so a small
  // iPhone and a large iPhone naturally land on different real pixel
  // anchors from the exact same calculation — never a fixed percentage of
  // the screen. Falls back to the original scrollSpeed-driven formula
  // (unchanged) for every consumer that hasn't opted into centerFocus.
  //
  // UX request (not a bug fix): the active line used to settle at
  // roughly 33–67% down the viewport (the "Low"/"Center"/"Leading"
  // TeleprompterSettings slider's own real range at scrollSpeed 0.5–2.0,
  // confirmed by reading TeleprompterSettings.jsx directly — "Center" is
  // literally scrollSpeed≈1.0, i.e. 50%), which put real vertical
  // distance between the video above and the highlighted line a student
  // is trying to read. STANDARD_ANCHOR_SCALE uniformly compresses that
  // SAME formula's output toward the top — same inputs, same monotonic
  // direction, same relative Low→Center→Leading feel for anyone who has
  // already tuned this setting — so "Center" still sits between "Low"
  // and "Leading", just all three now land just below the video frame
  // instead of partway down the page. 0.26 was chosen so the existing
  // default (scrollSpeed=1.0, "Center") moves from 50% down to ~13% down.
  // The 60px floor keeps the anchor clear of .tp-viewport's own 44px top
  // fade mask (teleprompter.css) on a short/embedded container, where a
  // pure percentage could otherwise land inside the fade itself.
  const anchorFor = useCallback((c) => {
    if (config.centerFocus) {
      const ratio = computeFocusAnchorRatio({ bilingual: config.showTranslation, fontScale: config.fontScale });
      return c.clientHeight * ratio;
    }
    return computeStandardAnchorPx(c.clientHeight, config.scrollSpeed);
  }, [config.centerFocus, config.showTranslation, config.fontScale, config.scrollSpeed]);

  // Center-focus mode only: the trailing spacer after the last sentence is
  // sized to exactly the extra scroll room that sentence needs to still
  // reach the anchor — see focusZone.js's computeTrailingSpacerPx and the
  // "end of transcript" investigation it fixes. Presentation-only: never
  // touches useAutoFollow's own tween/clamp logic, word/sentence timing, or
  // which sentence is active. 96 (the non-centerFocus h-24 spacer's own
  // height) is the initial value purely to avoid a visible size jump on the
  // very first paint, before the real measurement below runs.
  const [trailingSpacerPx, setTrailingSpacerPx] = useState(96);
  useLayoutEffect(() => {
    if (!config.centerFocus) return undefined;
    const c = containerRef.current;
    if (!c || metas.length === 0) return undefined;
    const measure = () => {
      const lastEl = sentenceRefs.current[metas.length - 1];
      const ratio = computeFocusAnchorRatio({ bilingual: config.showTranslation, fontScale: config.fontScale });
      setTrailingSpacerPx(computeTrailingSpacerPx({
        containerHeight: c.clientHeight,
        anchorPx: c.clientHeight * ratio,
        lastElementHeight: lastEl ? lastEl.clientHeight : 0,
      }));
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(c);
    return () => ro?.disconnect();
  }, [config.centerFocus, config.showTranslation, config.fontScale, metas.length]);

  const getTargetEl = useCallback(() => sentenceRefs.current[activeSentenceIdx], [activeSentenceIdx]);
  const { following, resumeFollow } = useAutoFollow({
    containerRef, activeIdx: activeSentenceIdx, getTargetEl, enabled: config.autoScroll, anchorFor,
  });

  // Tapping a sentence/word to seek is an explicit "take me there" — resume following.
  const handleSeek = useCallback((t) => {
    onSeek?.(t);
    if (config.autoScroll) resumeFollow();
  }, [onSeek, config.autoScroll, resumeFollow]);
  const seekHandler = onSeek ? handleSeek : undefined;

  if (!sync || metas.length === 0) {
    return (
      <div className={`p-6 text-center text-[13px] opacity-50 ${className}`} data-testid="teleprompter-empty">
        Synchronized transcript is still being prepared for this lesson.
      </div>
    );
  }

  const fontFamily = FONT_FAMILIES[config.fontFamily] || FONT_FAMILIES.default;
  const followChip = config.autoScroll && !following && (
    <button className="tp-follow-chip" onClick={resumeFollow} data-testid="teleprompter-follow-chip">
      Follow playback
    </button>
  );

  if (resolvedMode === "conversation") {
    return (
      <div className={`tp-stage relative flex flex-col min-h-0 ${className}`}>
        <div className="tp-sync-status" aria-label={measuredTiming ? "Audio-synced word timing" : "Estimated word timing"}>
          <span className={`tp-sync-dot${measuredTiming ? " tp-sync-dot-live" : ""}`} aria-hidden="true" />
          {measuredTiming ? "Audio-synced" : "Estimated timing"}
        </div>
        <div ref={containerRef} className="tp-viewport flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-3"
             data-testid="teleprompter-conversation"
             style={{ fontFamily }}>
          {metas.map((meta, idx) => (
            <ConversationSentence
              key={meta.s.id || idx}
              meta={meta} idx={idx} store={store} config={config} onSeek={seekHandler}
              registerRef={registerRef}
              speakerLabel={speakerLabel[meta.s.speakerId || ""]}
              speakerColor={speakerColor[meta.s.speakerId || ""] || GOLD}
              side={speakers.findIndex((sp) => sp.id === (meta.s.speakerId || "")) % 2 === 1}
              reducedMotion={reducedMotion}
              documentAligned={documentAligned}
            />
          ))}
          {config.centerFocus
            ? <div style={{ height: trailingSpacerPx }} data-testid="teleprompter-trailing-spacer" />
            : <div className="h-24" />}
        </div>
        {followChip}
      </div>
    );
  }

  // Storytelling: flowing paragraphs, generous line-height for reading along.
  let flatIdx = -1;
  return (
    <div className={`tp-stage relative flex flex-col min-h-0 ${className}`}>
      <div className="tp-sync-status" aria-label={measuredTiming ? "Audio-synced word timing" : "Estimated word timing"}>
        <span className={`tp-sync-dot${measuredTiming ? " tp-sync-dot-live" : ""}`} aria-hidden="true" />
        {measuredTiming ? "Audio-synced" : "Estimated timing"}
      </div>
      <div ref={containerRef}
           className="tp-viewport flex-1 min-h-0 overflow-y-auto px-5 py-6 space-y-5"
           data-testid="teleprompter-storytelling"
           style={{ fontFamily }}>
        {(sync.paragraphs || []).map((p) => {
          const paragraphActive = config.paragraphHighlight
            && activeSentenceIdx >= 0 && metas[activeSentenceIdx]?.paragraphId === p.id;
          return (
            <p key={p.id}
               className={`${config.centered ? "text-center mx-auto max-w-2xl" : ""} ${paragraphActive ? "rounded-lg px-2 -mx-2" : ""}`}
               style={{
                 fontSize: `${15.5 * config.fontScale}px`,
                 lineHeight: config.lineSpacing,
                 background: paragraphActive ? "rgba(212,168,67,0.06)" : undefined,
                 transition: "background 250ms ease",
               }}>
              {(p.sentences || []).map((s) => {
                flatIdx += 1;
                const idx = flatIdx;
                return (
                  <StorySentence key={s.id || idx}
                                 meta={metas[idx]} idx={idx} store={store} config={config}
                                 onSeek={seekHandler} registerRef={registerRef} reducedMotion={reducedMotion}
                                 documentAligned={documentAligned} />
                );
              })}
            </p>
          );
        })}
        {config.centerFocus
          ? <div style={{ height: trailingSpacerPx }} data-testid="teleprompter-trailing-spacer" />
          : <div className="h-24" />}
      </div>
      {followChip}
    </div>
  );
}

export default memo(Teleprompter);
