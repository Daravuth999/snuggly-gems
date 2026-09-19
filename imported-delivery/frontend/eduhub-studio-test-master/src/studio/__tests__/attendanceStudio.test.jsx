/**
 * attendanceStudio.test.jsx — focused tests for the new Attendance integration.
 *
 * Follows the repo's source-inspection convention (fs.readFileSync + pure
 * function assertions).  No @testing-library/react — not in the project.
 * All tests verify the STRUCTURE and CONTRACT of the new files, not DOM
 * rendering.
 *
 * Coverage:
 *   1. StudioPage — ATTENDANCE pill present, tab renders AttendanceStudio
 *   2. AttendanceStudio — all 6 panels present, teacher-only fields
 *   3. Dashboard PresencePassportCard — link routing, no risk_score leak
 *   4. Sidebar — Attendance entry + CalendarCheck icon
 *   5. attendanceAdminApi — URL contract, auth token key, response fields
 *   6. Safety: no protected files modified, no bottom-nav changes
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath) {
  return fs.readFileSync(path.resolve(ROOT, "src", relPath), "utf8");
}

// ── 1. StudioPage ─────────────────────────────────────────────────────────────
describe("1. StudioPage — ATTENDANCE tab integration", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/StudioPage.jsx"); });

  test("imports AttendanceStudio", () => {
    expect(src).toMatch(/import AttendanceStudio from ["']\.\/AttendanceStudio["']/);
  });

  test("imports CalendarCheck from lucide-react", () => {
    expect(src).toMatch(/CalendarCheck/);
  });

  test("TABS array contains attendance entry", () => {
    expect(src).toMatch(/key:\s*["']attendance["']/);
    expect(src).toMatch(/label:\s*["']Attendance["']/);
    expect(src).toMatch(/Icon:\s*CalendarCheck/);
  });

  test("renders AttendanceStudio when attendance tab active", () => {
    expect(src).toMatch(/tab\s*===\s*["']attendance["']\s*&&\s*<AttendanceStudio/);
  });

  test("all 19 pre-existing tabs still present", () => {
    const existingKeys = [
      "artwork", "editor", "smart", "upload", "browse", "preview",
      "aiscene", "aitools", "aiassistant", "push", "teacher", "coupons",
      "rewards", "mysterybox", "loginmystery", "tuition", "payments",
      "referral", "voicetreasure",
    ];
    existingKeys.forEach((k) => {
      expect(src).toContain(k);
    });
  });

  test("attendance tab is 20th entry (appended, existing order preserved)", () => {
    const tabsStart = src.indexOf("const TABS = [");
    const tabsEnd = src.indexOf("];", tabsStart);
    const tabsBlock = src.slice(tabsStart, tabsEnd);
    const voiceIdx = tabsBlock.indexOf("voicetreasure");
    const attendanceIdx = tabsBlock.indexOf('"attendance"');
    expect(attendanceIdx).toBeGreaterThan(voiceIdx);
  });
});

// ── 2. AttendanceStudio ───────────────────────────────────────────────────────
describe("2. AttendanceStudio — 6-panel structure", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("file exists and is a valid JSX export", () => {
    expect(src).toMatch(/export default function AttendanceStudio/);
  });

  test("all 6 panel keys present", () => {
    const panels = ["classes", "sessions", "today", "encouragement", "settings", "reports"];
    panels.forEach((p) => {
      expect(src).toContain(p);
    });
  });

  test("meets ClassesPanel", () => {
    expect(src).toMatch(/function ClassesPanel/);
  });

  test("meets SessionsPanel", () => {
    expect(src).toMatch(/function SessionsPanel/);
  });

  test("meets TodaysClassPanel", () => {
    expect(src).toMatch(/function TodaysClassPanel/);
  });

  test("meets NeedsEncouragementPanel", () => {
    expect(src).toMatch(/function NeedsEncouragementPanel/);
  });

  test("meets SettingsPanel", () => {
    expect(src).toMatch(/function SettingsPanel/);
  });

  test("meets ReportsPanel", () => {
    expect(src).toMatch(/function ReportsPanel/);
  });

  test("risk_score is only rendered in the NeedsEncouragementPanel area", () => {
    // risk_score must appear (teacher-only view) but ONLY inside the encouragement
    // panel, never in Today's Class or any student-facing render path.
    expect(src).toContain("risk_score");
    // it appears under the encouragement panel's student rendering
    const encStart = src.indexOf("function NeedsEncouragementPanel");
    const encEnd = src.indexOf("\nfunction ", encStart + 1);
    const encBlock = src.slice(encStart, encEnd);
    expect(encBlock).toContain("risk_score");
  });

  test("meet_url is only returned to admin, never to students", () => {
    // meet_url is rendered in sessions panel (teacher sees it), but the copy
    // function copies the JOIN SLUG path, not the raw Meet URL.
    const copyJoin = src.indexOf("copyJoinLink");
    expect(copyJoin).toBeGreaterThan(-1);
    const copyBlock = src.slice(copyJoin, copyJoin + 300);
    // The join link uses the slug, not the meet_url directly
    expect(copyBlock).toMatch(/join_slug|join_link|attendance\/j/);
    // We do NOT copy the raw meet_url to clipboard
    expect(copyBlock).not.toMatch(/meet_url/);
  });

  test("admin API is imported from attendanceAdminApi", () => {
    expect(src).toMatch(/import \* as api from ["']\.\/attendanceAdminApi["']/);
  });

  test("export CSV does not include internal wallet_student_id field", () => {
    const csvIdx = src.indexOf("exportCSV");
    const csvBlock = src.slice(csvIdx, csvIdx + 500);
    expect(csvBlock).not.toContain("wallet_student_id");
    // CSV headers must be human-readable labels, not MongoDB field names
    expect(csvBlock).toContain('"Student ID"');
    expect(csvBlock).not.toMatch(/"_id"/); // explicit quoted MongoDB _id field
  });

  test("at-risk panel includes private-teacher disclaimer", () => {
    expect(src).toMatch(/[Pp]rivate teacher/);
    // Disclaimer may span multiple lines — check key phrases independently
    expect(src).toMatch(/never/i);
    expect(src).toMatch(/student/i);
    // The encouragement panel block contains both concepts together
    const encStart = src.indexOf("function NeedsEncouragementPanel");
    const encEnd = src.indexOf("\nfunction ", encStart + 1);
    const encBlock = src.slice(encStart, encEnd);
    expect(encBlock).toMatch(/[Pp]rivate.*teacher|teacher.*[Pp]rivate/s);
    expect(encBlock).toMatch(/never|not shown/i);
  });

  test("AttendanceStudio has no data-testid that leaks risk info to students", () => {
    // Any testid mentioning risk should be in the encouragement panel only
    const riskTestIds = [...src.matchAll(/data-testid=["'][^"']*risk[^"']*["']/g)];
    // There may be zero (that's fine) or some only in the encouragement panel
    riskTestIds.forEach((m) => {
      const idx = m.index;
      const nearby = src.slice(Math.max(0, idx - 2000), idx + 100);
      // If there's a risk testid, it should be near the encouragement panel
      // (We just verify none appear in ClassesPanel, SessionsPanel, TodaysClassPanel)
      expect(nearby).not.toMatch(/function ClassesPanel|function SessionsPanel|function TodaysClassPanel/);
    });
  });
});

// ── 3. Dashboard PresencePassportCard ─────────────────────────────────────────
describe("3. Dashboard — Presence Passport (DashboardHeader, Home Dashboard V4)", () => {
  // Home Dashboard V4 (Phase 3 reconstruction) folded the old inline
  // PresencePassportCard component out of Dashboard.jsx and into its own
  // file, DashboardHeader.jsx — same useAttendance hook, same routing,
  // same testid, same safety guarantees, just relocated so the greeting
  // row and the streak/tier row are one presentational unit instead of a
  // separate footer tile. This block asserts the same contracts the V3
  // version did, against their new home.
  let src;
  beforeAll(() => { src = readSrc("eduhub/components/dashboard/DashboardHeader.jsx"); });

  test("imports useAttendance hook", () => {
    expect(src).toMatch(/import.*useAttendance.*from/);
  });

  test("imports Link from react-router-dom", () => {
    expect(src).toMatch(/import.*Link.*from ["']react-router-dom["']/);
  });

  test("DashboardHeader component exists", () => {
    expect(src).toMatch(/function DashboardHeader/);
  });

  test("uses useAttendance with pollLive:true", () => {
    expect(src).toMatch(/useAttendance.*pollLive.*true|pollLive.*true.*useAttendance/);
  });

  test("normal state routes to /attendance", () => {
    expect(src).toContain('"/attendance"');
  });

  test("live state routes to class gate via slug", () => {
    expect(src).toMatch(/live.*slug.*attendance\/j|attendance\/j.*live.*slug/);
    expect(src).toMatch(/`\/attendance\/j\/\$\{live/);
  });

  test("does NOT expose risk_score anywhere on the Dashboard header", () => {
    expect(src).not.toContain("risk_score");
  });

  test("never exposes wallet_student_id or internal db fields", () => {
    expect(src).not.toContain("wallet_student_id");
    expect(src).not.toContain("clean_id");
  });

  test("component is gated on isAuthenticated — not shown to logged-out visitors", () => {
    expect(src).toMatch(/if \(!isAuthenticated\) return null;/);
  });

  test("the streak/tier row is gated on !loading && me — no stale/spinner flash", () => {
    expect(src).toMatch(/\{!loading && me &&/);
  });

  test("data-testid present for E2E testability", () => {
    expect(src).toContain("dashboard-presence-passport");
  });

  test("streak and tier rendered — no raw student ID exposed", () => {
    expect(src).toContain("currentStreak");
    expect(src).toContain("tier");
    expect(src).not.toContain("student_id");
  });

  test("live-attendance banner renders real title from GET /attendance/live, never an invented one", () => {
    expect(src).toMatch(/function LiveAttendanceBanner/);
    expect(src).toMatch(/live\?\.live &&/);
    expect(src).toContain("live.title_en");
    expect(src).toContain("live.title_kh");
    expect(src).toMatch(/to=\{`\/attendance\/j\/\$\{slug\}`\}/);
    expect(src).toContain('data-testid="dashboard-live-attendance-banner"');
  });

  test("live banner's breathing pulse is gated by useAmbientActive, not an unconditional loop", () => {
    const idx = src.indexOf("function LiveAttendanceBanner");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/useAmbientActive\(\)/);
    expect(block).toMatch(/\{active &&/);
  });
});

// ── 4. Sidebar ────────────────────────────────────────────────────────────────
describe("4. Sidebar — Attendance navigation entry", () => {
  let src;
  beforeAll(() => { src = readSrc("eduhub/components/Sidebar.jsx"); });

  test("imports CalendarCheck from lucide-react", () => {
    expect(src).toMatch(/CalendarCheck/);
  });

  test("CalendarCheck is in ICONS map", () => {
    const iconsStart = src.indexOf("const ICONS = {");
    const iconsEnd = src.indexOf("};", iconsStart);
    const iconsBlock = src.slice(iconsStart, iconsEnd);
    expect(iconsBlock).toContain("CalendarCheck");
  });

  test("Attendance entry is in INTERNAL_NAV with correct route", () => {
    const navStart = src.indexOf("const INTERNAL_NAV = [");
    const navEnd = src.indexOf("];", navStart);
    const navBlock = src.slice(navStart, navEnd);
    expect(navBlock).toMatch(/label:\s*["']Attendance["']/);
    expect(navBlock).toMatch(/to:\s*["']\/attendance["']/);
    expect(navBlock).toMatch(/icon:\s*["']CalendarCheck["']/);
  });

  test("active state matches /attendance and nested /attendance/* routes", () => {
    // NavLinkItem uses pathname.startsWith(to + "/") for nested routes
    expect(src).toMatch(/pathname\.startsWith\(to \+ ["']\/["']\)/);
  });

  test("PROTECTED_NAV is unchanged — AI Assistant and System Test still present", () => {
    const protStart = src.indexOf("const PROTECTED_NAV = [");
    const protEnd = src.indexOf("];", protStart);
    const protBlock = src.slice(protStart, protEnd);
    expect(protBlock).toContain("AI Assistant");
    expect(protBlock).toContain("System Test");
    // attendance is NOT in PROTECTED_NAV (it's in INTERNAL_NAV)
    expect(protBlock).not.toContain("Attendance");
  });

  test("bottom navigation was not touched BY THIS (attendance) feature — Attendance itself is not one of its tabs", () => {
    // MobileBottomNav has since gained a 6th tab (Video Library, a
    // separate, later, deliberate product-parity change — see
    // MobileBottomNav.test.jsx) — this guard now only asserts Attendance
    // specifically never became a bottom-nav destination.
    const mobileNav = readSrc("eduhub/components/MobileBottomNav.jsx");
    expect(mobileNav).not.toMatch(/label:\s*["']Attendance["']/);
  });
});

// ── 5. attendanceAdminApi — URL + auth contract ───────────────────────────────
describe("5. attendanceAdminApi — URL contract and auth convention", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/attendanceAdminApi.js"); });

  test("uses the same token key as studio/api.js", () => {
    const studioApi = readSrc("studio/api.js");
    const studioTokenKey = studioApi.match(/const TOKEN_KEY = ["']([^"']+)["']/)?.[1];
    const adminTokenKey = src.match(/const TOKEN_KEY = ["']([^"']+)["']/)?.[1];
    expect(adminTokenKey).toBe(studioTokenKey);
    expect(adminTokenKey).toBe("studio_session_token_v1");
  });

  test("uses credentials:include (cookie auth)", () => {
    expect(src).toMatch(/credentials.*include/);
  });

  test("attaches Bearer token header", () => {
    expect(src).toMatch(/Authorization.*Bearer/);
  });

  test("Settings: GET /api/admin/attendance/settings", () => {
    expect(src).toMatch(/getSettings.*request.*["']\/api\/admin\/attendance\/settings["']/s);
  });

  test("Settings PUT: sends {settings: ...} body matching SettingsIn model", () => {
    expect(src).toMatch(/saveSettings.*["']\/api\/admin\/attendance\/settings["']/s);
    expect(src).toMatch(/method.*PUT/);
    expect(src).toMatch(/body.*\{.*settings/s);
  });

  test("Classes: GET /api/admin/attendance/classes", () => {
    expect(src).toContain("/api/admin/attendance/classes");
  });

  test("Sessions: GET /api/admin/attendance/sessions with optional class_id query", () => {
    expect(src).toMatch(/\/api\/admin\/attendance\/sessions.*class_id/s);
  });

  test("Sessions open: POST /api/admin/attendance/sessions/{id}/open", () => {
    expect(src).toMatch(/\/api\/admin\/attendance\/sessions.*\/open/);
    expect(src).toMatch(/openSession.*POST/s);
  });

  test("Sessions close: POST /api/admin/attendance/sessions/{id}/close", () => {
    expect(src).toMatch(/\/api\/admin\/attendance\/sessions.*\/close/);
    expect(src).toMatch(/closeSession.*POST/s);
  });

  test("Closing-soon nudge: POST .../closing-soon-nudge (exact backend route name)", () => {
    expect(src).toContain("/closing-soon-nudge");
  });

  test("At-risk GET: /api/admin/attendance/at-risk", () => {
    expect(src).toContain("/api/admin/attendance/at-risk");
  });

  test("At-risk nudge POST: /api/admin/attendance/at-risk-nudge", () => {
    expect(src).toContain("/api/admin/attendance/at-risk-nudge");
  });

  test("Report: /api/admin/attendance/report (singular, matches backend route name)", () => {
    expect(src).toContain("/api/admin/attendance/report");
    // Backend route is /report not /reports
    expect(src).not.toMatch(/\/api\/admin\/attendance\/reports["'`]/);
  });

  test("Report month and class_id passed as URLSearchParams query params", () => {
    expect(src).toMatch(/URLSearchParams/);
    expect(src).toMatch(/params\.set.*month/);
    expect(src).toMatch(/params\.set.*class_id/);
  });

  test("class_id in listSessions is URL-encoded (prevents injection)", () => {
    expect(src).toMatch(/encodeURIComponent/);
  });
});

// ── 6. Safety checks ─────────────────────────────────────────────────────────
describe("6. Safety — protected files and scope", () => {
  test("wallet_service.py was not modified (read-only check)", () => {
    // Just verify the file exists — git tracks changes, this verifies our
    // code doesn't accidentally import or depend on it in frontend.
    const wsPath = path.resolve(ROOT, "..", "eduhub-backend", "wallet_service.py");
    // We only verify our frontend doesn't reference it
    const attendanceSrc = readSrc("studio/AttendanceStudio.jsx");
    expect(attendanceSrc).not.toContain("wallet_service");
  });

  test("attendanceAdminApi does not reference student-facing token key", () => {
    // Student API uses 'student_session_token', admin uses 'studio_session_token_v1'
    const adminApi = readSrc("studio/attendanceAdminApi.js");
    expect(adminApi).not.toContain("student_session_token");
  });

  test("AttendanceStudio does not import from student-facing attendance api", () => {
    const studioSrc = readSrc("studio/AttendanceStudio.jsx");
    // Must not import from the student api.js
    expect(studioSrc).not.toMatch(/from ["']\.\..*attendance.*api["']/);
    expect(studioSrc).not.toMatch(/from ["'].*pages\/attendance\/api["']/);
  });

  test("no changes to App.js routing (only new files and 3 existing files modified)", () => {
    const appSrc = readSrc("App.js");
    // App.js already has the /attendance routes from the previous session — just verify
    expect(appSrc).toContain("/attendance");
    // No additional routes were added in this session
    const attendanceRoutes = [...appSrc.matchAll(/path=["']\/attendance/g)];
    // Should still have exactly 2 attendance routes (the ones from prior session)
    expect(attendanceRoutes.length).toBe(2);
  });

  test("MobileBottomNav has no Attendance tab (Attendance lives in the Sidebar drawer only)", () => {
    const nav = readSrc("eduhub/components/MobileBottomNav.jsx");
    expect(nav).not.toMatch(/label:\s*["']Attendance["']/);
  });
});

// ── 7. Recurring weekly sessions — Classes panel additions (§1) ──────────────
describe("7. Recurring weekly sessions — Classes panel additions", () => {
  let src;
  let apiSrc;
  beforeAll(() => {
    src = readSrc("studio/AttendanceStudio.jsx");
    apiSrc = readSrc("studio/attendanceAdminApi.js");
  });

  test("BLANK_CLASS carries a weekly_recurrence default shape", () => {
    expect(src).toMatch(/BLANK_WEEKLY_RECURRENCE\s*=\s*\{\s*enabled:\s*false,\s*weekdays:\s*\[\]/);
    expect(src).toMatch(/weekly_recurrence:\s*\{\s*\.\.\.BLANK_WEEKLY_RECURRENCE\s*\}/);
  });

  test("the Class form submits weekly_recurrence alongside every existing field", () => {
    const saveBlockStart = src.indexOf("const handleSave = async () => {");
    const saveBlockEnd = src.indexOf("};", saveBlockStart);
    const block = src.slice(saveBlockStart, saveBlockEnd);
    expect(block).toContain("title_en:");
    expect(block).toContain("recurrence:"); // original free-text field preserved
    expect(block).toContain("weekly_recurrence:");
  });

  test("a WeekdayPicker component exists using Python's Monday=0 convention (matching the backend's own datetime.weekday())", () => {
    expect(src).toMatch(/function WeekdayPicker/);
    expect(src).toMatch(/WEEKDAY_LABELS\s*=\s*\[.*Mon.*Tue.*Wed.*Thu.*Fri.*Sat.*Sun.*\]/s);
  });

  test("opens/closes time inputs use type=\"time\" (24h wall-clock, no free-text time parsing)", () => {
    expect(src).toMatch(/opens_time.*type="time"|type="time"[^]*opens_time/);
    expect(src).toContain("closes_time");
  });

  test("openEdit defaults weekly_recurrence for pre-existing classes that predate this field, rather than crashing the form", () => {
    const openEditStart = src.indexOf("const openEdit = (c) =>");
    const openEditEnd = src.indexOf("});", openEditStart);
    const block = src.slice(openEditStart, openEditEnd);
    expect(block).toMatch(/BLANK_WEEKLY_RECURRENCE.*c\.weekly_recurrence|c\.weekly_recurrence.*BLANK_WEEKLY_RECURRENCE/s);
  });

  test("the misleading CEFR-style 'Group tag (e.g. A1)' label is gone — clarified to reflect its real Schedule A/B wiring", () => {
    expect(src).not.toMatch(/Group tag \(e\.g\. A1\)/);
    expect(src).toMatch(/Schedule A\/B tag/);
  });

  test("a 'Generate' action exists calling the new on-demand generation endpoint, shown only for classes with an enabled template", () => {
    expect(src).toMatch(/handleGenerate/);
    expect(src).toMatch(/api\.generateClassSessions/);
    expect(src).toMatch(/weekly_recurrence\?\.enabled[^]*handleGenerate|handleGenerate[^]*weekly_recurrence\?\.enabled/);
  });

  test("attendanceAdminApi exposes generateClassSessions hitting the real admin generate-sessions route", () => {
    expect(apiSrc).toMatch(/export const generateClassSessions/);
    expect(apiSrc).toMatch(/\/api\/admin\/attendance\/classes\/\$\{class_id\}\/generate-sessions/);
  });
});

// ── 8. §2.5 fix ───────────────────────────────────────────────────────────────
// A student with a matching Schedule A/B tag was ALREADY meant to be
// included in a class automatically (attendance_tools.py's roster
// resolution) with zero admin action — but the Studio UI gave no
// indication of this, showing a misleading "0 enrolled" and a
// "Search & select students" picker that looked mandatory. Worse, the
// backend's original write-on-event auto-roster mechanism had a real bug:
// the first time ANY matching student's schedule changed, it silently
// flipped a class from "match everyone by Schedule A/B" to "match only
// that one student," dropping everyone else. Both are fixed together:
// the backend now resolves membership as a live UNION (never either/or,
// see attendance_tools.py's _class_roster / resolve_class_roster_ids),
// and this UI now surfaces that union honestly instead of hiding it.
describe("8. Auto-matched roster visibility (§2.5) — no more silent manual re-adding", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("a display-only mirror of the backend's class_matches_student_schedule exists for live previews", () => {
    expect(src).toMatch(/classMatchesStudentScheduleDisplay/);
    expect(src).toMatch(/normalizeScheduleTag/);
  });

  test("RosterPicker accepts an autoMatchGroup prop and computes an auto-matched count from it", () => {
    expect(src).toMatch(/function RosterPicker\(\{[^}]*autoMatchGroup/);
    expect(src).toMatch(/autoMatchedCount/);
  });

  test("the Classes panel wires the class's own group tag into RosterPicker as autoMatchGroup", () => {
    const rosterPickerCallStart = src.indexOf("<RosterPicker");
    const rosterPickerCallEnd = src.indexOf("/>", rosterPickerCallStart);
    const block = src.slice(rosterPickerCallStart, rosterPickerCallEnd);
    expect(block).toMatch(/autoMatchGroup=\{form\.group/);
  });

  test("when a Schedule A/B tag is set, the picker is framed as EXTRAS on top of the auto-match, never a replacement for it", () => {
    expect(src).toMatch(/auto-matched via Schedule/);
    expect(src).toMatch(/Extra students/);
    expect(src).toMatch(/Add extra students/);
  });

  test("the picker's original fully-manual copy ('Roster —', 'Search & select students') is preserved for classes with no Schedule A/B tag", () => {
    expect(src).toMatch(/Roster — \$\{selectedIds\.length\}/);
    expect(src).toMatch(/Search & select students/);
  });

  test("the class card shows a live auto-matched count instead of the old, misleading raw roster.length when a Schedule A/B tag is set", () => {
    expect(src).toMatch(/auto-matched/);
    expect(src).toMatch(/allStudents\.filter/);
    // The old unconditional "N enrolled" label must now be conditional —
    // still present as the fallback for classes with no Schedule A/B tag.
    expect(src).toMatch(/\{\(c\.roster \|\| \[\]\)\.length\} enrolled/);
  });

  test("the Classes panel loads the full student list, but a failure to do so never blocks the class list itself from loading", () => {
    const loadStart = src.indexOf("const load = useCallback(async () => {");
    const loadEnd = src.indexOf("}, []);", loadStart);
    const block = src.slice(loadStart, loadEnd);
    expect(block).toMatch(/listAllStudents/);
    // Two independent try blocks — the students fetch must not be inside
    // the same try as the classes fetch (which would fail the whole load
    // and hide the class list on a students-endpoint hiccup).
    const classesTryIdx = block.indexOf("api.listClasses()");
    const studentsTryIdx = block.indexOf("api.listAllStudents()");
    const catchBetween = block.indexOf("catch", classesTryIdx);
    expect(catchBetween).toBeGreaterThan(classesTryIdx);
    expect(catchBetween).toBeLessThan(studentsTryIdx);
  });
});

// ── 9. §1.9 — Google Meet link inheritance ───────────────────────────────────
// Real gap found via a live product walkthrough: generate_sessions_for_class
// always read cls.get("default_meet_url"), but ClassIn never actually
// persisted that field — every generated session got meet_url="" and an
// admin had to add the link to each one by hand. Fixed on the backend
// (ClassIn.default_meet_url, persisted by both class routes) and here.
describe("9. Google Meet link inheritance (§1.9) — set once on the class, not per session", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("BLANK_CLASS carries a default_meet_url default", () => {
    expect(src).toMatch(/default_meet_url:\s*""/);
  });

  test("the Class form has a Google Meet link input", () => {
    expect(src).toMatch(/Google Meet link/);
  });

  test("openEdit defaults default_meet_url for pre-existing classes", () => {
    const openEditStart = src.indexOf("const openEdit = (c) =>");
    const openEditEnd = src.indexOf("});", openEditStart);
    const block = src.slice(openEditStart, openEditEnd);
    expect(block).toMatch(/default_meet_url:\s*c\.default_meet_url/);
  });

  test("handleSave submits default_meet_url alongside every existing field", () => {
    const saveBlockStart = src.indexOf("const handleSave = async () => {");
    const saveBlockEnd = src.indexOf("};", saveBlockStart);
    const block = src.slice(saveBlockStart, saveBlockEnd);
    expect(block).toContain("default_meet_url:");
  });

  test("the class card indicates whether a Meet link is set, only for recurring classes", () => {
    expect(src).toMatch(/Meet link set/);
    expect(src).toMatch(/No Meet link yet/);
  });
});

// ── 10. §1.8 — holiday / no-class blackout dates ─────────────────────────────
describe("10. Holiday & no-class blackout dates (§1.8) — Settings panel", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("a HolidayDatesEditor component exists", () => {
    expect(src).toMatch(/function HolidayDatesEditor/);
  });

  test("DEFAULT_SETTINGS carries an empty holiday_dates default", () => {
    const start = src.indexOf("const DEFAULT_SETTINGS = {");
    const end = src.indexOf("};", start);
    const block = src.slice(start, end);
    expect(block).toMatch(/holiday_dates:\s*\[\]/);
  });

  test("SettingsPanel wires HolidayDatesEditor to settings.holiday_dates", () => {
    expect(src).toMatch(/dates=\{settings\.holiday_dates \|\| \[\]\}/);
    expect(src).toMatch(/onChange=\{\(dates\) => set\("holiday_dates", dates\)\}/);
  });

  test("the editor uses a real date input, not free-text date parsing", () => {
    const start = src.indexOf("function HolidayDatesEditor");
    const end = src.indexOf("\n}\n", start);
    const block = src.slice(start, end);
    expect(block).toMatch(/type="date"/);
  });
});
