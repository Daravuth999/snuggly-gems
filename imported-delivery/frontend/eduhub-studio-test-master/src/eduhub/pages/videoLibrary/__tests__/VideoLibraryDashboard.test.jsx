/**
 * react-router-dom@7 ships an ESM-only `exports` map Jest's CRA harness
 * cannot resolve — same problem documented in
 * readerRouteRemountIntegration.test.jsx / voiceTreasure_passA1.mounted
 * .test.jsx. VideoLibraryDashboard only calls useNavigate(), so the stub
 * only needs to cover that one hook.
 */
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
}), { virtual: true });

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import VideoLibraryDashboard from "../VideoLibraryDashboard";

jest.mock("../videoLibraryApi", () => ({
  listLessons: jest.fn(),
  listContinueWatching: jest.fn(),
  listBookmarks: jest.fn(),
  listRecentlyWatched: jest.fn(),
  listMyPurchases: jest.fn(),
  // VideoLibraryCouponCard (rendered inside the welcome header) checks this
  // on mount — default to disabled in beforeEach so the "Have a voucher?"
  // trigger and its own coupon API calls stay out of scope for these
  // dashboard-rail tests.
  getVideoLibraryCouponStatus: jest.fn(),
  // §2.7/§3 (2026-09): the restricted-points badge and the new available-
  // coupons panel both self-fetch on mount, same pattern as
  // getVideoLibraryCouponStatus above — defaulted to "nothing to show" in
  // beforeEach so these dashboard-rail tests are unaffected by default.
  getRestrictedPointsBalance: jest.fn(),
  listAvailableVideoLibraryCoupons: jest.fn(),
}));

import {
  listLessons, listContinueWatching, listBookmarks, listRecentlyWatched, listMyPurchases,
  getVideoLibraryCouponStatus, getRestrictedPointsBalance, listAvailableVideoLibraryCoupons,
} from "../videoLibraryApi";

function lesson(overrides) {
  return {
    lessonId: "vid_1", title: "Ordering Coffee", price: 0, owned: true,
    category: "conversation", difficulty: "beginner", durationSec: 60,
    createdAt: "2026-01-01T00:00:00Z", featured: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  listContinueWatching.mockResolvedValue([]);
  listBookmarks.mockResolvedValue([]);
  listRecentlyWatched.mockResolvedValue([]);
  listMyPurchases.mockResolvedValue([]);
  getVideoLibraryCouponStatus.mockResolvedValue({ enabled: false });
  getRestrictedPointsBalance.mockResolvedValue(0);
  listAvailableVideoLibraryCoupons.mockResolvedValue([]);
});

test("shows an empty state when there are no published lessons", async () => {
  listLessons.mockResolvedValue([]);
  render(<VideoLibraryDashboard />);
  expect(await screen.findByText(/No lessons published yet/i)).toBeInTheDocument();
});

test("renders Featured Lessons and category rows for real lessons", async () => {
  listLessons.mockResolvedValue([lesson()]);
  render(<VideoLibraryDashboard />);
  expect(await screen.findByTestId("video-library-row-featured")).toBeInTheDocument();
  expect(await screen.findByTestId("video-library-row-conversation")).toBeInTheDocument();
  expect(screen.queryByTestId("video-library-row-business")).not.toBeInTheDocument(); // no lesson in that category
});

test("Featured Lessons row is driven by the real admin-set featured flag, not a fallback heuristic", async () => {
  listLessons.mockResolvedValue([lesson({ featured: false, lessonId: "vid_not_featured" })]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-conversation"); // lessons did load
  expect(screen.queryByTestId("video-library-row-featured")).not.toBeInTheDocument();
});

test("renders My Bookmarks only for lessons the student has actually bookmarked", async () => {
  listLessons.mockResolvedValue([lesson(), lesson({ lessonId: "vid_2", title: "Unbookmarked Lesson", featured: false })]);
  listBookmarks.mockResolvedValue([{ lessonId: "vid_1" }]);
  render(<VideoLibraryDashboard />);
  const row = await screen.findByTestId("video-library-row-bookmarks");
  expect(row).toHaveTextContent("Ordering Coffee");
  expect(row).not.toHaveTextContent("Unbookmarked Lesson");
});

test("does not render My Bookmarks row when there are no bookmarks", async () => {
  listLessons.mockResolvedValue([lesson()]);
  listBookmarks.mockResolvedValue([]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(screen.queryByTestId("video-library-row-bookmarks")).not.toBeInTheDocument();
});

test("does not render a Continue Learning row when there is no saved progress", async () => {
  listLessons.mockResolvedValue([lesson()]);
  listContinueWatching.mockResolvedValue([]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(screen.queryByTestId("video-library-row-continue")).not.toBeInTheDocument();
});

test("renders Continue Learning only for lessons with real saved progress", async () => {
  listLessons.mockResolvedValue([lesson(), lesson({ lessonId: "vid_2", title: "Untouched Lesson" })]);
  listContinueWatching.mockResolvedValue([{ lessonId: "vid_1", positionSec: 20, durationSec: 60, completed: false }]);
  render(<VideoLibraryDashboard />);
  const row = await screen.findByTestId("video-library-row-continue");
  expect(row).toHaveTextContent("Ordering Coffee");
  expect(row).not.toHaveTextContent("Untouched Lesson");
});

test("switching difficulty tabs re-fetches with the selected filter", async () => {
  listLessons.mockResolvedValue([lesson()]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");

  fireEvent.click(screen.getByTestId("video-library-difficulty-tab-advanced"));
  await waitFor(() => expect(listLessons).toHaveBeenCalledWith({ difficulty: "advanced" }));
});

test("load failure shows an inline error instead of crashing", async () => {
  listLessons.mockRejectedValue(new Error("network down"));
  render(<VideoLibraryDashboard />);
  expect(await screen.findByTestId("video-library-error")).toHaveTextContent("network down");
});

test("renders Recently Watched from every progress record, including completed ones", async () => {
  listLessons.mockResolvedValue([lesson(), lesson({ lessonId: "vid_2", title: "Finished Lesson", featured: false })]);
  listRecentlyWatched.mockResolvedValue([
    { lessonId: "vid_1", positionSec: 10, durationSec: 60, completed: false },
    { lessonId: "vid_2", positionSec: 60, durationSec: 60, completed: true },
  ]);
  render(<VideoLibraryDashboard />);
  const row = await screen.findByTestId("video-library-row-recent");
  expect(row).toHaveTextContent("Ordering Coffee");
  expect(row).toHaveTextContent("Finished Lesson");
});

test("typing in the search box debounces then re-fetches with the query", async () => {
  jest.useFakeTimers({ advanceTimers: true });
  listLessons.mockResolvedValue([lesson()]);
  render(<VideoLibraryDashboard />);
  await waitFor(() => expect(listLessons).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByTestId("video-library-search-input"), { target: { value: "coffee" } });
  jest.advanceTimersByTime(400);
  await waitFor(() => expect(listLessons).toHaveBeenCalledWith(expect.objectContaining({ q: "coffee" })));
  jest.useRealTimers();
});

test("clearing the search box removes the query and shows the search-specific empty state", async () => {
  listLessons.mockResolvedValueOnce([lesson()]).mockResolvedValue([]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");

  fireEvent.change(screen.getByTestId("video-library-search-input"), { target: { value: "zzz-no-match" } });
  await waitFor(() => expect(screen.getByText(/No lessons match your search/i)).toBeInTheDocument());

  fireEvent.click(screen.getByTestId("video-library-search-clear"));
  expect(screen.getByTestId("video-library-search-input")).toHaveValue("");
});

test("renders My Lessons only for successfully purchased lessons, never failed/reconcile attempts", async () => {
  listLessons.mockResolvedValue([
    lesson({ lessonId: "vid_1", title: "Bought Lesson", price: 50, featured: false }),
    lesson({ lessonId: "vid_2", title: "Failed Attempt Lesson", price: 30, featured: false }),
    lesson({ lessonId: "vid_3", title: "Reconcile Pending Lesson", price: 20, featured: false }),
  ]);
  listMyPurchases.mockResolvedValue([
    { lessonId: "vid_1", state: "succeeded" },
    { lessonId: "vid_2", state: "failed" },
    { lessonId: "vid_3", state: "reconcile" },
  ]);
  render(<VideoLibraryDashboard />);
  const row = await screen.findByTestId("video-library-row-my-lessons");
  expect(row).toHaveTextContent("Bought Lesson");
  expect(row).not.toHaveTextContent("Failed Attempt Lesson");
  expect(row).not.toHaveTextContent("Reconcile Pending Lesson");
});

test("does not render My Lessons row when there are no successful purchases", async () => {
  listLessons.mockResolvedValue([lesson()]);
  listMyPurchases.mockResolvedValue([]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(screen.queryByTestId("video-library-row-my-lessons")).not.toBeInTheDocument();
});

test("shows the subtle voucher entry point in the header only once the coupon flag is confirmed on", async () => {
  listLessons.mockResolvedValue([lesson()]);
  getVideoLibraryCouponStatus.mockResolvedValue({ enabled: true });
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(await screen.findByTestId("video-library-coupon-trigger")).toBeInTheDocument();
});

test("does not render the voucher entry point while the coupon flag is off", async () => {
  listLessons.mockResolvedValue([lesson()]);
  getVideoLibraryCouponStatus.mockResolvedValue({ enabled: false });
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(screen.queryByTestId("video-library-coupon-trigger")).not.toBeInTheDocument();
});

test("clicking a lesson card navigates to its watch page", async () => {
  // A single lesson legitimately appears in more than one row (Featured,
  // New Releases, its category) — scope the query to one row to avoid an
  // ambiguous multi-match, matching how a real user would click one
  // specific card instance.
  listLessons.mockResolvedValue([lesson()]);
  render(<VideoLibraryDashboard />);
  const row = await screen.findByTestId("video-library-row-featured");
  fireEvent.click(within(row).getByTestId("video-lesson-card-vid_1"));
  expect(mockNavigate).toHaveBeenCalledWith("/video-library/watch/vid_1");
});

// ── §2.7: restricted-points badge, distinct from the general points pill ──
test("restricted-points badge is hidden when the balance is zero (the common case)", async () => {
  listLessons.mockResolvedValue([lesson()]);
  getRestrictedPointsBalance.mockResolvedValue(0);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(screen.queryByTestId("video-library-restricted-points-badge")).not.toBeInTheDocument();
});

test("restricted-points badge shows the earmarked balance distinctly, once known", async () => {
  listLessons.mockResolvedValue([lesson()]);
  getRestrictedPointsBalance.mockResolvedValue(20);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  const badge = await screen.findByTestId("video-library-restricted-points-badge");
  expect(badge).toHaveTextContent("20");
  expect(badge).toHaveTextContent(/video/i);
});

// ── §3: proactive available-coupons panel ───────────────────────────────────
test("available-coupons panel is absent when the student has no usable coupons", async () => {
  listLessons.mockResolvedValue([lesson()]);
  listAvailableVideoLibraryCoupons.mockResolvedValue([]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(screen.queryByTestId("available-coupons-panel")).not.toBeInTheDocument();
});

test("available-coupons panel renders each real, server-verified coupon", async () => {
  listLessons.mockResolvedValue([lesson()]);
  listAvailableVideoLibraryCoupons.mockResolvedValue([
    { code: "SAVE25", type: "percent", percentOff: 25, expiresAt: null },
    { code: "BONUS20", type: "points", benefitAmount: 20, expiresAt: null },
  ]);
  render(<VideoLibraryDashboard />);
  await screen.findByTestId("video-library-row-featured");
  expect(await screen.findByTestId("available-coupons-panel")).toBeInTheDocument();
  expect(screen.getByTestId("available-coupon-SAVE25")).toHaveTextContent("25% off");
  expect(screen.getByTestId("available-coupon-BONUS20")).toHaveTextContent("+20 pts");
});
