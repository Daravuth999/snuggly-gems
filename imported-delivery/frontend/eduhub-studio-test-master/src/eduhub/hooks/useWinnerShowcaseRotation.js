/**
 * useWinnerShowcaseRotation.js — Automatic Winner Showcase (architecture
 * continuation: "no manual dashboard editing" — after an Event settles,
 * the backend auto-publishes an experienceType="winner_showcase" config
 * per event; the PWA auto-displays it until its own activeWindow.endsAt
 * expiration, then auto-rotates to the next one).
 *
 * Unlike useExperienceConfig (which resolves to a single "best" config),
 * a winner_showcase has one instance PER settled event and several can be
 * simultaneously active — this hook fetches the whole active list and
 * rotates through it client-side. Zero legacy source; there is no
 * pre-Event-Engine equivalent to fall back to.
 */
import { useEffect, useState } from "react";
import {
  fetchActiveExperienceConfigList, getCachedActiveExperienceConfigList,
} from "../lib/experienceConfig/experienceConfigApi";

const EXPERIENCE_TYPE = "winner_showcase";
const ROTATION_INTERVAL_MS = 8000;
const POLL_INTERVAL_MS = 60000;

/**
 * `options.sourceFilter` / `options.excludeSource` (both optional, both
 * additive — omit either and behavior is byte-for-byte the pre-Friday-
 * Speaking-Labs default): restrict rotation to configs whose
 * `content.source` matches/doesn't match a given value. Added so a
 * dedicated panel (e.g. FridaySpeakingWinnersPanel, source
 * "speaking_lab_classroom_draw") can run its OWN independent rotation
 * over just its own showcases, while the general WinnerShowcaseBanner
 * excludes that same source so the two never double-display the same
 * showcase. The rotation/polling mechanics themselves are unchanged.
 *
 * `loading` (new, additive): true until the FIRST fetch resolves, so a
 * caller can tell "genuinely nothing active yet" apart from "haven't
 * heard back yet" and show a skeleton only for the latter — the cached
 * synchronous seed on mount means this is almost always false already
 * by first paint, and never blocks WinnerShowcaseBanner's existing
 * render-nothing-until-active contract (it simply doesn't read it).
 */
export function useWinnerShowcaseRotation(options = {}) {
  const { sourceFilter, excludeSource } = options;
  const [configs, setConfigs] = useState(() => getCachedActiveExperienceConfigList(EXPERIENCE_TYPE));
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(() => getCachedActiveExperienceConfigList(EXPERIENCE_TYPE).length === 0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchActiveExperienceConfigList(EXPERIENCE_TYPE).then((list) => {
        if (cancelled) return;
        setConfigs(list);
        setLoading(false);
      });
    };
    load();
    // Re-poll periodically so a NEW settlement's showcase (or an
    // expiration the backend's own activeWindow already enforces) shows
    // up without requiring a page reload.
    const pollId = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(pollId); };
  }, []);

  const filtered = configs.filter((c) => {
    const source = c?.content?.source;
    if (sourceFilter && source !== sourceFilter) return false;
    if (excludeSource && source === excludeSource) return false;
    return true;
  });

  useEffect(() => {
    if (filtered.length < 2) {
      setIndex(0);
      return;
    }
    const rotateId = setInterval(() => {
      setIndex((i) => (i + 1) % filtered.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(rotateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  const safeIndex = filtered.length ? index % filtered.length : 0;
  return {
    current: filtered[safeIndex] || null,
    count: filtered.length,
    index: safeIndex,
    setIndex,
    loading,
  };
}

export default useWinnerShowcaseRotation;
