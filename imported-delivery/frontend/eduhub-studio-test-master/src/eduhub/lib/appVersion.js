// appVersion.js — VERSION PROOF for the installed-PWA stale-version
// investigation. stamp-sw.js writes the SAME build id into three places on
// every production build: build/sw.js's SW_VERSION, a <meta
// name="eduhub-build-id"> tag in build/index.html, and build/version.json.
// This module reads the first two so the RUNNING REACT APP — independent of
// whatever the service worker itself reports — can answer two different
// questions with hard evidence:
//   - getRunningBuildId(): what build is THIS already-loaded page/tab
//     actually running (read from the DOM the browser parsed at load time,
//     zero network calls, cannot be fooled by a CDN edge cache serving
//     something else on a later request).
//   - fetchDeployedBuildId(): what build is the server serving RIGHT NOW,
//     via a cache:"no-store" fetch of /version.json — the same kind of
//     network-bypassing fetch pwaUpdateController.js's update checks use.
// A mismatch between the two, persisting after a controllerchange/reload
// cycle should have applied it, is the hard evidence a real stale-version
// incident (as opposed to a not-yet-deployed build) requires.
//
// TEMPORARY, same lifecycle as __pwaDiag.js — see that file for the full
// removal list once the fix is confirmed on real devices across a few
// deploys. Safe to keep permanently if useful; not required for the fix
// itself (pwaUpdateController.js + the vercel.json header fix are).

export function getRunningBuildId() {
  const meta = document.querySelector('meta[name="eduhub-build-id"]');
  return meta ? meta.getAttribute("content") : null;
}

export async function fetchDeployedBuildId() {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.buildId ? data.buildId : null;
  } catch {
    return null;
  }
}
