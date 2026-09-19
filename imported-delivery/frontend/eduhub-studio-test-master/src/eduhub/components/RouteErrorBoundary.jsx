import React from "react";

/**
 * RouteErrorBoundary.jsx
 *
 * Guards the AppShell's main route content (Home/Dashboard and every path
 * under "/*"). Header, Sidebar, and MobileBottomNav are siblings OUTSIDE
 * this boundary (see App.js), so they keep working even if the routed page
 * itself throws — the same pattern already proven by ReaderErrorBoundary
 * and VideoLibraryErrorBoundary, just not previously applied to the Home
 * route, which is the one every visitor lands on first.
 *
 * Self-heals once automatically: a stale/incompatible chunk after a deploy
 * (ChunkLoadError, "Failed to fetch dynamically imported module") is
 * usually fixed by a single hard reload, which re-fetches index.html fresh
 * (the service worker's htmlNetworkFirst strategy guarantees that) and
 * with it the current chunk manifest. A sessionStorage latch caps this at
 * one silent reload per 30s so a persistent error can never reload-loop —
 * it falls through to the visible retry card instead.
 */
const RELOAD_LATCH_KEY = "__eduhub_route_error_reload_ts";
const RELOAD_LATCH_WINDOW_MS = 30 * 1000;

function alreadyAutoReloadedRecently() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_LATCH_KEY) || 0);
    return last && Date.now() - last < RELOAD_LATCH_WINDOW_MS;
  } catch {
    return false;
  }
}

function markAutoReloaded() {
  try {
    sessionStorage.setItem(RELOAD_LATCH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export default class RouteErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", err);
    if (!alreadyAutoReloadedRecently()) {
      markAutoReloaded();
      window.location.reload();
    }
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    // Auto-reload is already in flight (componentDidCatch fired above) —
    // render nothing rather than flash the retry card for a moment.
    if (!alreadyAutoReloadedRecently() || Date.now() - Number(sessionStorage.getItem(RELOAD_LATCH_KEY) || 0) < 1500) {
      return null;
    }
    return (
      <div
        data-testid="route-error-boundary"
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            textAlign: "center",
            borderRadius: 24,
            padding: 28,
            background: "linear-gradient(160deg, #134B34 0%, #0E1F18 100%)",
            border: "1px solid rgba(217,184,114,0.35)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#F4E5C1" }}>
            This page hit a snag
          </h2>
          <p style={{ margin: "0 0 20px", fontSize: 13.5, opacity: 0.8, lineHeight: 1.5, color: "#F4E5C1" }}>
            That's usually a one-time hiccup after an update. Reloading fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            data-testid="route-error-reload"
            style={{
              padding: "10px 22px",
              borderRadius: 12,
              border: "1px solid rgba(217,184,114,0.55)",
              background: "#D9B872",
              color: "#0E1F18",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
