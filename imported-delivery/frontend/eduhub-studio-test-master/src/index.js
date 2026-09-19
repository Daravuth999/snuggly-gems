// index.js — bootstrap with BrowserRouter so route-level components can
//   read `useLocation`/`useNavigate` (used by AuthContext + Sidebar).
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import { startThemeAuto } from "@/eduhub/lib/themeAuto";
// TEMPORARY — installed-PWA stale-version investigation. See __pwaDiag.js
// for removal instructions once the fix below is confirmed working on
// real devices across a few deploys.
import { initPwaDiag } from "@/eduhub/lib/__pwaDiag";
// Production fix — installed PWAs now proactively check for and safely
// apply service-worker updates instead of silently running stale code
// indefinitely. See pwaUpdateController.js for the full root-cause writeup.
import { initPwaUpdateController } from "@/eduhub/lib/pwaUpdateController";
// Launch-time half of the same stale-version fix — pwaUpdateController.js
// covers updates detected WHILE the app is already running; BootGate
// covers the very first paint of a fresh launch, so a pending update can
// never be visible as "old dashboard, then a reload." See BootGate.jsx.
import BootGate from "@/eduhub/components/BootGate";
// Top-level defensive boundary — nothing previously caught a render
// exception thrown above the route tree (AuthProvider, Header, Sidebar,
// BootGate itself). Reuses RouteErrorBoundary's existing self-heal-once
// then show-retry-card behavior rather than introducing a second pattern.
import RouteErrorBoundary from "@/eduhub/components/RouteErrorBoundary";

// v10 (Heat Surgery, Feb 2026) — boot the auto day/night controller
// before first paint so initial CSS variables are correct (no FOUC).
startThemeAuto();
initPwaDiag();
initPwaUpdateController();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <RouteErrorBoundary>
      <BrowserRouter>
        <BootGate>
          <App />
        </BootGate>
      </BrowserRouter>
    </RouteErrorBoundary>
  </React.StrictMode>,
);
