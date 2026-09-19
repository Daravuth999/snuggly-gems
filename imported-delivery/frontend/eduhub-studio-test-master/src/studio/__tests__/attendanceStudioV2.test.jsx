/**
 * attendanceStudioV2.test.jsx — Teacher-side additions from the attendance
 * v2 redesign: Show QR (session join link) and Monthly Attendance Reward
 * settings. Kept as a separate file from attendanceStudio.test.jsx (which
 * already covers the 6 pre-existing panels) so that file's own numbered
 * "Coverage" list stays accurate without editing it.
 *
 * Follows the same source-inspection convention already established by
 * attendanceStudio.test.jsx (fs.readFileSync + structural assertions) for
 * AttendanceStudio.jsx itself, since it's the same large, fetch-heavy file
 * with no existing RTL mount harness. attendanceAdminApi.js's tiny new
 * export gets the same treatment. AttendanceOverview.jsx and
 * AttendanceRouteGate.jsx (new, self-contained files) get real RTL tests
 * in their own __tests__ directory instead — see
 * src/eduhub/pages/attendance/__tests__/attendanceOverview.test.jsx and
 * attendanceRouteGate.test.jsx.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath) {
  return fs.readFileSync(path.resolve(ROOT, "src", relPath), "utf8");
}

describe("AttendanceStudio.jsx — Show QR (session join link)", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("imports QrCode icon", () => {
    expect(src).toMatch(/QrCode/);
  });

  test("Show QR button calls showQr with the session's own session_id and join_slug", () => {
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*showQr\(s\.session_id,\s*s\.join_slug\)\}/);
  });

  test("showQr builds the join URL the SAME way copyJoinLink already does", () => {
    const copyIdx = src.indexOf("const copyJoinLink");
    const showIdx = src.indexOf("const showQr");
    const copyBlock = src.slice(copyIdx, copyIdx + 300);
    const showBlock = src.slice(showIdx, showIdx + 400);
    expect(copyBlock).toMatch(/window\.location\.origin/);
    expect(showBlock).toMatch(/window\.location\.origin/);
    expect(showBlock).toMatch(/\/attendance\/j\/\$\{slug\}/);
  });

  test("showQr calls the admin API's getSessionQr and never fabricates a client-side QR", () => {
    expect(src).toMatch(/api\.getSessionQr\(session_id,\s*joinUrl\)/);
  });

  test("QR modal renders the returned data URI, a loading state, and an error state", () => {
    const modalIdx = src.indexOf("attendance-qr-modal");
    const modalBlock = src.slice(modalIdx, modalIdx + 1200);
    expect(modalBlock).toMatch(/qrModal\.loading/);
    expect(modalBlock).toMatch(/qrModal\.error/);
    expect(modalBlock).toMatch(/qrModal\.dataUri/);
    expect(modalBlock).toMatch(/src=\{qrModal\.dataUri\}/);
  });

  test("QR modal can be dismissed", () => {
    const modalIdx = src.indexOf("attendance-qr-modal");
    const modalBlock = src.slice(modalIdx, modalIdx + 1200);
    expect(modalBlock).toMatch(/setQrModal\(null\)/);
  });
});

describe("attendanceAdminApi.js — getSessionQr", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/attendanceAdminApi.js"); });

  test("hits the session-scoped QR route with an encoded join_url query param", () => {
    expect(src).toMatch(
      /\/api\/admin\/attendance\/sessions\/\$\{session_id\}\/qr\?join_url=\$\{encodeURIComponent\(join_url\)\}/,
    );
  });

  test("does not construct the join URL itself — only encodes what it's given", () => {
    const idx = src.indexOf("getSessionQr");
    const block = src.slice(idx, idx + 300);
    expect(block).not.toMatch(/window\.location/);
  });
});

describe("AttendanceStudio.jsx — Settings panel: Attendance v2 + Monthly Reward", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("DEFAULT_SETTINGS includes the new v2 and monthly-reward fields, all off/sane by default", () => {
    const idx = src.indexOf("const DEFAULT_SETTINGS");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/v2_enabled:\s*false/);
    expect(block).toMatch(/monthly_reward_enabled:\s*false/);
    expect(block).toMatch(/monthly_reward_threshold_pct:\s*0\.85/);
    expect(block).toMatch(/monthly_reward_campaign_id:\s*null/);
  });

  test("v2 toggle documents that the env var is a SEPARATE, infra-level switch", () => {
    const idx = src.indexOf("Attendance v2");
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/ATTENDANCE_V2_ENABLED/);
    expect(block).toMatch(/environment variable/i);
  });

  test("v2 toggle is wired to settings.v2_enabled via the existing set() helper", () => {
    expect(src).toMatch(/checked=\{!!settings\.v2_enabled\}/);
    expect(src).toMatch(/onChange=\{\(v\)\s*=>\s*set\("v2_enabled",\s*v\)\}/);
  });

  test("monthly reward toggle and fields are wired to the matching settings keys", () => {
    expect(src).toMatch(/checked=\{!!settings\.monthly_reward_enabled\}/);
    expect(src).toMatch(/onChange=\{\(v\)\s*=>\s*set\("monthly_reward_enabled",\s*v\)\}/);
    expect(src).toMatch(/monthly_reward_threshold_pct/);
    expect(src).toMatch(/monthly_reward_campaign_id/);
  });

  test("threshold slider round-trips between a 0-100 percent field and the stored 0-1 fraction", () => {
    const idx = src.indexOf("Attendance required");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/Math\.round\(\(settings\.monthly_reward_threshold_pct[^)]*\)\s*\*\s*100\)/);
    expect(block).toMatch(/v\s*\/\s*100/);
  });

  test("live threshold preview is debounced and recomputed server-side, never a client estimate", () => {
    expect(src).toMatch(/getMonthlyRewardPreview/);
    expect(src).toMatch(/setTimeout\(/);
    const idx = src.indexOf("const thresholdPct");
    const block = src.slice(idx, idx + 900);
    // Also carries the in-progress cycle-start edit as a live candidate
    // (see attendanceFairness.test.jsx) — still debounced, still recomputed
    // server-side only.
    expect(block).toMatch(/api\.getMonthlyRewardPreview\(\{\s*thresholdPct,\s*cycleStart:/);
  });

  test("reward campaign picker fetches real Login Reward campaigns and never hardcodes points", () => {
    expect(src).toMatch(/import\s*\{\s*listLoginRewardCampaigns\s*\}\s*from\s*"\.\/api"/);
    expect(src).toMatch(/loadCampaigns/);
    expect(src).toMatch(/reward_kind\s*!==\s*"voucher"/);
    expect(src).not.toMatch(/monthly_reward_points/);
  });

  test("Student Preview reuses the REAL student RewardSurface component, never a separate mockup", () => {
    expect(src).toMatch(/import RewardSurface from "\.\.\/eduhub\/pages\/attendance\/RewardSurface"/);
    expect(src).toMatch(/function StudentRewardPreview/);
    const idx = src.indexOf("function StudentRewardPreview");
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/<RewardSurface/);
    expect(block).toMatch(/rewardName=\{campaign\.reward_label \|\| campaign\.name\}/);
    expect(block).toMatch(/rewardPoints=\{campaign\.reward_points\}/);
  });

  test("Student Preview is only shown once a campaign is actually attached", () => {
    expect(src).toMatch(/settings\.monthly_reward_enabled && settings\.monthly_reward_campaign_id && \(/);
  });

  test("settings save uses the SAME existing Save Settings button/route — no new admin endpoint", () => {
    // Only one PUT /admin/attendance/settings call in the whole studio API
    // client — the new fields ride along inside the existing settings blob.
    const apiSrc = readSrc("studio/attendanceAdminApi.js");
    const matches = apiSrc.match(/admin\/attendance\/settings/g) || [];
    expect(matches.length).toBe(2); // one GET, one PUT — unchanged from before
  });
});

describe("AttendanceStudio.jsx — Today's Class (merges Sessions + Live Roster)", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("TodaysClassPanel exists and is wired into the panel switch under the 'today' key", () => {
    expect(src).toMatch(/function TodaysClassPanel/);
    expect(src).toMatch(/panel === "today"\s*&&\s*<TodaysClassPanel/);
    expect(src).toMatch(/key:\s*"today",\s*label:\s*"Today's Class"/);
  });

  test("fetches the real per-student roster via getSessionRoster, not the monthly report", () => {
    const idx = src.indexOf("function TodaysClassPanel");
    const end = src.indexOf("\nfunction ", idx + 1);
    const block = src.slice(idx, end);
    expect(block).toMatch(/api\.getSessionRoster\(s\.session_id\)/);
  });

  test("Copy Link / Show QR / Close Attendance actions all present in Today's Class", () => {
    const idx = src.indexOf("function TodaysClassPanel");
    const end = src.indexOf("\nfunction ", idx + 1);
    const block = src.slice(idx, end);
    expect(block).toMatch(/copyJoinLink/);
    expect(block).toMatch(/showQr\(s\.session_id,\s*s\.join_slug\)/);
    expect(block).toMatch(/handleClose\(s\.session_id\)/);
  });
});

describe("attendanceAdminApi.js — getSessionRoster / getMonthlyRewardPreview", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/attendanceAdminApi.js"); });

  test("getSessionRoster hits the session-scoped roster route", () => {
    expect(src).toMatch(/getSessionRoster\s*=\s*\(session_id\)\s*=>/);
    expect(src).toMatch(/\/api\/admin\/attendance\/sessions\/\$\{session_id\}\/roster/);
  });

  test("getMonthlyRewardPreview sends threshold_pct as a query param", () => {
    expect(src).toMatch(/getMonthlyRewardPreview/);
    expect(src).toMatch(/threshold_pct/);
  });
});
