/**
 * NotificationBell.test.jsx — Activity Center header bell.
 *
 * Currently covers just the light/dark contrast regression found while
 * investigating why MessagingBell (built to mirror this component's
 * exact visual recipe) was invisible in light theme: the resting
 * (no-unread) state used `text-white/80` with no light-mode
 * counterpart, which is white-on-white against the header's light-theme
 * `--shell-glass` background (rgba(255,255,255,0.80) — src/index.css).
 * The bug was latent here too (same shared classes), it just never
 * surfaced because this bell almost always has an unread badge in
 * daily use, which uses a different, colored branch.
 */
import { render, screen } from "@testing-library/react";
import NotificationBell from "../NotificationBell";

let mockCtx = null;
jest.mock("../../../context/NotificationContext", () => ({
  useNotifications: () => mockCtx,
}));

test("regression: the resting (no-unread) icon has a light-mode-visible color, not just text-white on a white glass header", () => {
  mockCtx = { unreadCount: 0, toggleDrawer: jest.fn(), drawerOpen: false, lastArrival: null };
  render(<NotificationBell />);
  const btn = screen.getByTestId("activity-bell-btn");
  expect(btn.className).toMatch(/\btext-ink\b/);
  expect(btn.className).not.toMatch(/(^|\s)text-white\/80\b/);
});
