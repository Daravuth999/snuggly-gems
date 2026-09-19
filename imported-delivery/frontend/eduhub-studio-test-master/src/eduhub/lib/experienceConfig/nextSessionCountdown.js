/**
 * nextSessionCountdown.js — pure date math for "how long until the next
 * Friday Speaking Lab classroom session," driven by a winner_showcase_theme
 * config's `nextSessionCountdown` field (weekday/hour/minute, admin-set via
 * WinnerShowcaseThemeStudio.jsx). Kept separate from
 * winnerShowcaseConfigResolver.js (which resolves PRESENTATION, not time)
 * so the date math is independently testable without mocking theme
 * resolution.
 *
 * Local time only — this targets one physical classroom's own wall clock,
 * not a UTC-normalized schedule; the admin sets the weekday/hour/minute
 * exactly as they'd say it aloud ("Friday at 3pm").
 */

/**
 * @param {{weekday:number, hour:number, minute:number}} schedule
 *   weekday: 0=Sunday..6=Saturday (JS Date convention)
 * @param {Date} [now]
 * @returns {{ targetDate: Date, msRemaining: number, days: number, hours: number, minutes: number }}
 *   msRemaining is always >= 0 — if `now` is past this week's slot, the
 *   target rolls forward to next week's occurrence (never a negative
 *   countdown, never "today" if the time already passed today).
 */
export function computeNextSessionCountdown(schedule, now = new Date()) {
  const weekday = Number.isInteger(schedule?.weekday) ? schedule.weekday : 5;
  const hour = Number.isInteger(schedule?.hour) ? schedule.hour : 15;
  const minute = Number.isInteger(schedule?.minute) ? schedule.minute : 0;

  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  let dayDelta = (weekday - now.getDay() + 7) % 7;
  if (dayDelta === 0 && target.getTime() <= now.getTime()) {
    dayDelta = 7; // today's slot already passed — roll to next week
  }
  target.setDate(target.getDate() + dayDelta);

  const msRemaining = Math.max(0, target.getTime() - now.getTime());
  const totalMinutes = Math.floor(msRemaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return { targetDate: target, msRemaining, days, hours, minutes };
}

/** Short display string, e.g. "3d 4h 12m" or "42m" when under an hour. */
export function formatCountdown({ days, hours, minutes }) {
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default { computeNextSessionCountdown, formatCountdown };
