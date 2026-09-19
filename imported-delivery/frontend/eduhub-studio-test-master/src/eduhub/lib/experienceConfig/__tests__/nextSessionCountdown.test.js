/**
 * nextSessionCountdown.test.js — pure date math for the "next Friday
 * Speaking Lab session" live countdown.
 */
import { computeNextSessionCountdown, formatCountdown } from "../nextSessionCountdown";

describe("computeNextSessionCountdown", () => {
  test("counts forward to a later day this week", () => {
    // Wednesday 2026-09-09 10:00 -> next Friday (weekday 5) at 15:00.
    const now = new Date(2026, 8, 9, 10, 0, 0);
    const { targetDate, days } = computeNextSessionCountdown({ weekday: 5, hour: 15, minute: 0 }, now);
    expect(targetDate.getDay()).toBe(5);
    expect(targetDate.getDate()).toBe(11); // Sep 11, 2026 is the Friday
    expect(days).toBe(2);
  });

  test("rolls forward to NEXT week when today IS the weekday but the time already passed", () => {
    // Friday 2026-09-11 18:00 (past the 15:00 slot) -> the FOLLOWING Friday.
    const now = new Date(2026, 8, 11, 18, 0, 0);
    const { targetDate } = computeNextSessionCountdown({ weekday: 5, hour: 15, minute: 0 }, now);
    expect(targetDate.getDate()).toBe(18); // Sep 18, 2026
  });

  test("counts down within TODAY when the slot hasn't happened yet", () => {
    // Friday 2026-09-11 09:00, slot at 15:00 the same day.
    const now = new Date(2026, 8, 11, 9, 0, 0);
    const { targetDate, days, hours } = computeNextSessionCountdown({ weekday: 5, hour: 15, minute: 0 }, now);
    expect(targetDate.getDate()).toBe(11);
    expect(days).toBe(0);
    expect(hours).toBe(6);
  });

  test("msRemaining is never negative", () => {
    const now = new Date(2026, 8, 11, 15, 0, 1); // 1 second past the exact slot
    const { msRemaining } = computeNextSessionCountdown({ weekday: 5, hour: 15, minute: 0 }, now);
    expect(msRemaining).toBeGreaterThanOrEqual(0);
  });

  test("missing/invalid schedule fields fall back to sensible defaults instead of crashing", () => {
    expect(() => computeNextSessionCountdown({}, new Date())).not.toThrow();
    expect(() => computeNextSessionCountdown(null, new Date())).not.toThrow();
  });
});

describe("formatCountdown", () => {
  test("shows days/hours/minutes when at least a day remains", () => {
    expect(formatCountdown({ days: 2, hours: 3, minutes: 5 })).toBe("2d 3h 5m");
  });

  test("drops the days segment under 24 hours", () => {
    expect(formatCountdown({ days: 0, hours: 4, minutes: 12 })).toBe("4h 12m");
  });

  test("shows just minutes under an hour", () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 42 })).toBe("42m");
  });
});
