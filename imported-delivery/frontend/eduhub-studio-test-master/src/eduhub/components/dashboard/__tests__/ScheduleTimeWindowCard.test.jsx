/**
 * ScheduleTimeWindowCard.test.jsx — Dashboard's display of the student's
 * own schedule + admin-configured time window. Must render nothing while
 * loading or on a genuine fetch failure (never surface a raw error on
 * this frozen, premium dashboard), but — unlike AssessmentPendingCard's
 * own "render null when empty" convention — must show an HONEST message
 * for "no schedule assigned" and "schedule assigned but no window
 * configured yet", never hide the element and never invent a time.
 *
 * Round 4 additions — live-state awareness (§3): reuses useAttendance's
 * existing GET /api/attendance/live poll (mocked directly here, the same
 * convention this session already uses for hook-level mocking elsewhere)
 * rather than mocking fetch/attendanceApi at a lower level.
 *
 * Round 5 additions — premium flip-clock countdown + live-glow upgrade.
 * The visible countdown is now a real Days/Hours/Minutes/Seconds tile
 * row (countdownParts) rather than a single text line; formatCountdown
 * is kept as the accessible aria-label alternative, so its own unit
 * tests below remain valid and meaningful.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import ScheduleTimeWindowCard, { formatCountdown, countdownParts } from "../ScheduleTimeWindowCard";
import { getMyScheduleTimeWindow } from "../../../auth/studentAuthService";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  __esModule: true,
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("../../../auth/studentAuthService", () => ({
  getMyScheduleTimeWindow: jest.fn(),
}));

let mockLive = { live: false };
jest.mock("../../../hooks/useAttendance", () => ({
  __esModule: true,
  useAttendance: () => ({ live: mockLive }),
}));

let mockAmbientActive = false;
jest.mock("../../../hooks/useAmbientActive", () => ({
  __esModule: true,
  default: () => ({ ref: { current: null }, active: mockAmbientActive }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockLive = { live: false };
  mockAmbientActive = false;
});

test("renders nothing while the fetch is in flight", () => {
  getMyScheduleTimeWindow.mockReturnValue(new Promise(() => {})); // never resolves
  const { container } = render(<ScheduleTimeWindowCard />);
  expect(container).toBeEmptyDOMElement();
});

test("renders nothing on a genuine fetch failure — never a raw error on the dashboard", async () => {
  getMyScheduleTimeWindow.mockRejectedValue(new Error("network down"));
  const { container } = render(<ScheduleTimeWindowCard />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

test("a fully-configured student sees their real schedule badge and formatted time window", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({
    schedule: "A",
    window: { start: "19:00", end: "20:00", timezone: "Asia/Phnom_Penh" },
  });
  render(<ScheduleTimeWindowCard />);

  expect(await screen.findByTestId("schedule-time-window-badge")).toHaveTextContent("Schedule A");
  expect(screen.getByTestId("schedule-time-window-card-line")).toHaveTextContent("7:00 PM – 8:00 PM");
});

test("a student with no schedule assigned sees an honest message, not a hidden card or a guessed schedule", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "", window: null });
  render(<ScheduleTimeWindowCard />);

  expect(await screen.findByTestId("schedule-time-window-card")).toBeInTheDocument();
  expect(screen.getByTestId("schedule-time-window-card-line")).toHaveTextContent("No schedule assigned yet");
  expect(screen.queryByTestId("schedule-time-window-badge")).not.toBeInTheDocument();
});

test("a student with a schedule but no configured window sees the label plus an honest 'not yet set' message, never a fabricated time", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "B", window: null });
  render(<ScheduleTimeWindowCard />);

  expect(await screen.findByTestId("schedule-time-window-badge")).toHaveTextContent("Schedule B");
  const line = screen.getByTestId("schedule-time-window-card-line");
  expect(line).toHaveTextContent("Time not yet set");
  expect(line).not.toHaveTextContent(/\d{1,2}:\d{2}/);
});

// ── Round 4 — live state (§3) ────────────────────────────────────────────────
test("when genuinely live, the whole card becomes a tappable link to the real join slug", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  mockLive = { live: true, slug: "abc123", title_en: "English A1" };
  render(<ScheduleTimeWindowCard />);

  const link = await screen.findByTestId("schedule-time-window-join-link");
  expect(link.getAttribute("href")).toBe("/attendance/j/abc123");
  expect(screen.getByTestId("schedule-time-window-card")).toHaveAttribute("data-live", "true");
  expect(screen.getByTestId("schedule-time-window-card-line")).toHaveTextContent("English A1 is live — tap to join");
  // The not-live-only Schedule badge is not shown while live.
  expect(screen.queryByTestId("schedule-time-window-badge")).not.toBeInTheDocument();
});

test("regression: not-live renders as a plain, non-interactive div — no tap affordance when there's nothing to join", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  mockLive = { live: false };
  render(<ScheduleTimeWindowCard />);

  await screen.findByTestId("schedule-time-window-card");
  expect(screen.queryByTestId("schedule-time-window-join-link")).not.toBeInTheDocument();
  expect(screen.getByTestId("schedule-time-window-card")).toHaveAttribute("data-live", "false");
});

// ── Round 5 — flip-clock countdown ───────────────────────────────────────────
test("not live: shows a real flip-clock countdown sourced from next_session, never an estimate", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
  mockLive = { live: false, next_session: { opens_at: inTwoHours, title_en: "English A1" } };
  render(<ScheduleTimeWindowCard />);

  const countdown = await screen.findByTestId("schedule-time-window-countdown");
  expect(countdown).toHaveAttribute("role", "timer");
  // The accessible label carries the same real-instant math as before —
  // formatCountdown is unchanged, just repurposed as the a11y alternative
  // to the now-visual-only flip tiles.
  expect(countdown.getAttribute("aria-label")).toMatch(/Next in 2h/);
  // The Hours and Minutes tiles are real, padded two-digit values — no
  // Days tile at all for a same-day gap (never a stray "00" days flap).
  expect(countdown).toHaveTextContent("02");
  expect(countdown).toHaveTextContent("15");
  expect(screen.queryByTestId("schedule-time-window-no-upcoming")).not.toBeInTheDocument();
});

test("the flip-clock shows a Days tile only when the gap actually spans a day or more", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  const inThreeDays = new Date(Date.now() + 3 * 86400000 + 3600000).toISOString();
  mockLive = { live: false, next_session: { opens_at: inThreeDays } };
  render(<ScheduleTimeWindowCard />);

  const countdown = await screen.findByTestId("schedule-time-window-countdown");
  expect(countdown).toHaveTextContent("03");
});

test("regression: a target that has JUST passed shows 'starting any moment', never a frozen 00:00:00:00", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  const justPassed = new Date(Date.now() - 5000).toISOString();
  mockLive = { live: false, next_session: { opens_at: justPassed } };
  render(<ScheduleTimeWindowCard />);

  expect(await screen.findByTestId("schedule-time-window-starting-now")).toHaveTextContent("Starting any moment");
  expect(screen.queryByTestId("schedule-time-window-countdown")).not.toBeInTheDocument();
});

test("regression: a student with no upcoming session at all gets an honest message, never a stale or guessed countdown", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  mockLive = { live: false, next_session: null };
  render(<ScheduleTimeWindowCard />);

  await screen.findByTestId("schedule-time-window-card");
  expect(screen.getByTestId("schedule-time-window-no-upcoming")).toHaveTextContent("No upcoming session scheduled");
  expect(screen.queryByTestId("schedule-time-window-countdown")).not.toBeInTheDocument();
});

// ── Round 5 — live-glow upgrade ───────────────────────────────────────────────
test("the live glow/shimmer ambient effects only render when on-screen and motion-safe (useAmbientActive gate)", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  mockLive = { live: true, slug: "abc123", title_en: "English A1" };
  mockAmbientActive = false;
  render(<ScheduleTimeWindowCard />);
  await screen.findByTestId("schedule-time-window-join-link");
  // The decorative glow/shimmer/ring group is gated as a whole — none of
  // it renders while ambientActive is false, matching every other
  // continuous Dashboard ambient effect's established contract.
  expect(screen.queryByTestId("schedule-time-window-live-glow")).not.toBeInTheDocument();
});

test("the live glow/shimmer ambient effects render once on-screen and motion-safe", async () => {
  getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
  mockLive = { live: true, slug: "abc123", title_en: "English A1" };
  mockAmbientActive = true;
  render(<ScheduleTimeWindowCard />);
  await screen.findByTestId("schedule-time-window-join-link");
  expect(screen.getByTestId("schedule-time-window-live-glow")).toBeInTheDocument();
});

describe("formatCountdown", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");

  test("formats a multi-day gap", () => {
    expect(formatCountdown("2026-01-03T15:00:00Z", now)).toBe("in 2d 3h");
  });

  test("formats an hours+minutes gap", () => {
    expect(formatCountdown("2026-01-01T14:30:00Z", now)).toBe("in 2h 30m");
  });

  test("formats a minutes-only gap", () => {
    expect(formatCountdown("2026-01-01T12:05:00Z", now)).toBe("in 5m");
  });

  test("a target in the past or right now reads as starting, never a negative countdown", () => {
    expect(formatCountdown("2026-01-01T11:00:00Z", now)).toBe("starting now");
    expect(formatCountdown("2026-01-01T12:00:00Z", now)).toBe("starting now");
  });

  test("returns an empty string for missing/invalid input rather than throwing or showing garbage", () => {
    expect(formatCountdown(null, now)).toBe("");
    expect(formatCountdown("not-a-date", now)).toBe("");
  });
});

describe("countdownParts", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");

  test("breaks a multi-day gap into days/hours/minutes/seconds", () => {
    expect(countdownParts("2026-01-03T15:04:05Z", now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  test("breaks a same-day gap with zero days", () => {
    expect(countdownParts("2026-01-01T14:30:20Z", now)).toEqual({ days: 0, hours: 2, minutes: 30, seconds: 20 });
  });

  test("a target in the past or exactly now returns null, never a negative or all-zero breakdown", () => {
    expect(countdownParts("2026-01-01T11:59:59Z", now)).toBeNull();
    expect(countdownParts("2026-01-01T12:00:00Z", now)).toBeNull();
  });

  test("returns null for missing/invalid input rather than throwing or showing garbage", () => {
    expect(countdownParts(null, now)).toBeNull();
    expect(countdownParts("not-a-date", now)).toBeNull();
  });
});

// ── Regression — light-mode contrast (real bug, reported from production) ───
// The flip-clock tiles and "starting any moment" text originally used ONE
// hardcoded dark-only color set (a near-black gradient + bright gold text)
// with no light-mode variant at all — since jsdom/RTL renders don't apply
// Tailwind's compiled dark: media/class rules, that bug was invisible to the
// render tests above and only showed up live: on a light background the
// same near-black tile read as a washed-out gray blob with barely-visible
// text. These are source-level checks (this file's own render tests can't
// see compiled Tailwind dark: variants) proving every themed element now
// ships BOTH a light-mode color and an explicit dark: override, not one
// color reused for both.
describe("light/dark theme coverage — regression for the washed-out light-mode tiles", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../ScheduleTimeWindowCard.jsx"),
    "utf8"
  );

  test("the flip tile has an explicit light-mode background/border/text distinct from its dark: override", () => {
    const start = src.indexOf("function FlipUnit");
    const end = src.indexOf("\nfunction ", start + 1);
    const block = src.slice(start, end);
    expect(block).toMatch(/dark:from-white\/\[0\.08\]|dark:bg-/);
    expect(block).toMatch(/dark:text-\[#F0C869\]/);
    // A light-mode background/text must be present ALONGSIDE the dark:
    // variant, not just the dark-only value reused unconditionally.
    expect(block).toMatch(/from-\[#FFF6DE\]|bg-\[#FFF6DE\]/);
    expect(block).toMatch(/text-\[#5C3B08\]/);
  });

  test("no bare GOLD_BRIGHT-style single-color inline style remains on themed text (the original bug shape)", () => {
    expect(src).not.toMatch(/GOLD_BRIGHT/);
  });

  test("the 'starting any moment' text carries both a light and dark text color", () => {
    const idx = src.indexOf("Starting any moment");
    const block = src.slice(Math.max(0, idx - 200), idx);
    expect(block).toMatch(/text-\[#5C3B08\]/);
    expect(block).toMatch(/dark:text-\[#F0C869\]/);
  });

  test("the flip-tile label and separator both carry a light and dark color, not one shared translucent gold", () => {
    const labelIdx = src.indexOf("tracking-widest uppercase");
    const labelBlock = src.slice(labelIdx, labelIdx + 120);
    expect(labelBlock).toMatch(/text-\[#8A6212\]/);
    expect(labelBlock).toMatch(/dark:text-\[rgba\(212,168,67,0\.7\)\]/);

    const sepStart = src.indexOf("function FlipSeparator");
    const sepEnd = src.indexOf("\nfunction ", sepStart + 1);
    const sepBlock = src.slice(sepStart, sepEnd);
    expect(sepBlock).toMatch(/text-\[rgba\(140,95,10,0\.45\)\]/);
    expect(sepBlock).toMatch(/dark:text-\[rgba\(212,168,67,0\.35\)\]/);
  });
});

// ── Odometer-style digit motion (per direct product feedback: "same as
// vehicle's counter move, some digits might have moved in the middle") ──
// Each digit position now spins as its OWN independent reel — like a real
// odometer's separate wheels — instead of the whole 2-character tile
// sliding as one block, and its direction is computed from the ACTUAL
// previous-vs-new digit comparison (a real borrow makes a digit briefly
// increase, e.g. seconds 00→59 when a minute ticks over), not a fixed
// direction. Motion-prop values (spring initial/exit y offsets) aren't
// reliably inspectable through JSDOM's rendered output, so the directional
// LOGIC is verified at the source level (same convention as the light/dark
// coverage block above); rendering is verified for what testing-library
// CAN reliably assert — the final digits are correct after a real carry.
describe("odometer-style digit reels — real per-digit motion, not a fixed direction", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../ScheduleTimeWindowCard.jsx"),
    "utf8"
  );

  test("each tile splits its two digits into independent reels, not one sliding 2-character block", () => {
    const start = src.indexOf("function FlipUnit");
    const end = src.indexOf("\nfunction ", start + 1);
    const block = src.slice(start, end);
    expect(block).toMatch(/pad2\(value\)\.split\(""\)/);
    expect(block).toMatch(/<DigitReel digit={tensDigit}/);
    expect(block).toMatch(/<DigitReel digit={onesDigit}/);
  });

  test("a reel's slide direction is computed from the real previous-vs-new digit comparison, never fixed", () => {
    const start = src.indexOf("function DigitReel");
    const end = src.indexOf("\nfunction ", start + 1);
    const block = src.slice(start, end);
    // The comparison is against this reel's OWN previously rendered
    // digit (a ref, updated after each render) — not a module-level or
    // hardcoded "always down" assumption.
    expect(block).toMatch(/useRef\(digit\)/);
    expect(block).toMatch(/Number\(digit\)\s*>\s*Number\(prevDigitRef\.current\)/);
    // Both the entering and exiting element's offset are conditioned on
    // that real comparison, in opposite directions from each other.
    expect(block).toMatch(/initial=\{\{\s*y:\s*increased\s*\?\s*"-70%"\s*:\s*"70%"/);
    expect(block).toMatch(/exit=\{\{\s*y:\s*increased\s*\?\s*"70%"\s*:\s*"-70%"/);
  });

  test("the spring transition settles completely rather than oscillating indefinitely (a real damped spring, not decoration)", () => {
    const start = src.indexOf("function DigitReel");
    const end = src.indexOf("\nfunction ", start + 1);
    const block = src.slice(start, end);
    expect(block).toMatch(/type:\s*"spring"/);
    expect(block).toMatch(/damping:\s*\d+/);
  });

  test("regression: after a real borrow/carry (09 -> 10), both digit positions land on the correct final value", async () => {
    getMyScheduleTimeWindow.mockResolvedValue({ schedule: "A", window: { start: "19:00", end: "20:00" } });
    const inTenMinutes = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockLive = { live: false, next_session: { opens_at: inTenMinutes } };
    render(<ScheduleTimeWindowCard />);

    const countdown = await screen.findByTestId("schedule-time-window-countdown");
    // 10 minutes away with 0 seconds elapsed renders as minutes="10",
    // seconds="00" — both the tens and ones digit of the Minutes tile are
    // real, correct values (never a stale half-updated pair).
    expect(countdown).toHaveTextContent("10");
    expect(countdown).toHaveTextContent("00");
  });
});
