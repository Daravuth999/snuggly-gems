/**
 * BootGate.jsx — renders LaunchScreen while checkBootVersion() resolves,
 * then either reloads once (a newer build is deployed — never renders the
 * stale app tree) or renders `children` (the real app, already-current).
 *
 * This is the fix for "closing and reopening the PWA sometimes shows an
 * old Home Dashboard first": the app tree — Header, Sidebar, AuthProvider,
 * every route — simply doesn't mount until this resolves, so there is
 * nothing stale to paint in the interim. checkBootVersion() is bounded
 * (see bootVersionGate.js) so offline/slow-network users are never stuck
 * here — they fall through to "ready" with whatever's currently installed.
 *
 * A minimum visible time keeps the brand moment from flashing on/off when
 * the check resolves instantly (e.g. local dev, where there's no build
 * stamp at all) — it should read as an intentional introduction, not a
 * layout glitch.
 */
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import LaunchScreen from "./LaunchScreen";
import { checkBootVersion, reloadForLatestVersion } from "../lib/bootVersionGate";

const MIN_VISIBLE_MS = 550;

export default function BootGate({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    checkBootVersion().then((result) => {
      if (cancelled) return;
      if (result === "reload") {
        // A newer build is deployed — navigate away now, before the
        // stale tree ever mounts. Never set ready=true on this path.
        reloadForLatestVersion();
        return;
      }
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
      setTimeout(() => {
        if (!cancelled) setReady(true);
      }, wait);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <AnimatePresence>{!ready && <LaunchScreen key="launch" />}</AnimatePresence>
      {ready && children}
    </>
  );
}
