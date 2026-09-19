// bootVersionGate.js — the launch-time half of the installed-PWA
// stale-version fix. pwaUpdateController.js already handles updates
// detected WHILE the app is running (visibility/focus/online/interval
// triggers + a guarded silent reload) — that stays exactly as-is. This
// module handles the OTHER half: the very first paint of a fresh launch,
// BEFORE the app tree mounts at all, so a pending update can never be
// visible as "old dashboard, then a jarring reload" — it resolves before
// there is anything on screen to look stale.
//
// Reuses appVersion.js's existing buildId primitives (stamp-sw.js already
// writes the same build id into the SW, the <meta> tag, and version.json
// on every build) — no new versioning infrastructure is introduced.
import { getRunningBuildId, fetchDeployedBuildId } from "./appVersion";

const RELOAD_ONCE_KEY = "__eduhub_boot_gate_reload_ts";
// Never more than one gate-triggered reload per window — a broken/stuck
// deploy (version.json never converging) can never reload-loop the app;
// after one attempt this session, subsequent boots just render with
// whatever is currently installed (the "unknown" outcome below).
const RELOAD_ONCE_WINDOW_MS = 30 * 1000;
// Bounded — offline, a slow network, or a hung request must never hold
// the launch screen open indefinitely. Reliability and speed come before
// verifying the absolute latest build.
const CHECK_TIMEOUT_MS = 1200;

function alreadyReloadedRecently() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_ONCE_KEY) || 0);
    return Boolean(last) && Date.now() - last < RELOAD_ONCE_WINDOW_MS;
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_ONCE_KEY, String(Date.now()));
  } catch {
    /* ignore — a failed write just means no loop-guard this session */
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Resolves to one of:
 *   "current" — the running build already matches the deployed build (or
 *               there's no build stamp at all, e.g. local dev via `npm
 *               start`) — safe to render immediately.
 *   "reload"  — a newer build is deployed and this session hasn't already
 *               tried reloading for it — the caller must navigate away
 *               and never render the current (stale) app tree.
 *   "unknown" — offline, the check timed out, or a reload was already
 *               attempted this session and the mismatch persists (a
 *               broken deploy) — render with whatever is currently
 *               installed rather than hang or reload-loop.
 */
export async function checkBootVersion() {
  const runningId = getRunningBuildId();
  if (!runningId) return "current";
  if (alreadyReloadedRecently()) return "unknown";
  const deployedId = await withTimeout(fetchDeployedBuildId(), CHECK_TIMEOUT_MS);
  if (!deployedId) return "unknown";
  if (deployedId === runningId) return "current";
  markReloaded();
  return "reload";
}

export function reloadForLatestVersion() {
  window.location.reload();
}
