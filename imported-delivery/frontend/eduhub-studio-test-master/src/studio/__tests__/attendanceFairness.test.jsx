/**
 * attendanceFairness.test.jsx — Author Studio additions from the fairness
 * directive: Attendance Cycle effective date, session exceptions
 * (cancelled / teacher unavailable / holiday / technical issue), and the
 * individual Attendance Corrections tool.
 *
 * Same source-inspection convention as attendanceStudioV2.test.jsx
 * (fs.readFileSync + structural assertions) — AttendanceStudio.jsx is a
 * large, fetch-heavy file with no existing RTL mount harness.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath) {
  return fs.readFileSync(path.resolve(ROOT, "src", relPath), "utf8");
}

describe("attendanceAdminApi.js — fairness endpoints", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/attendanceAdminApi.js"); });

  test("setSessionException PATCHes the session's exception route", () => {
    const idx = src.indexOf("setSessionException");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/\/api\/admin\/attendance\/sessions\/\$\{session_id\}\/exception/);
    expect(block).toMatch(/method:\s*"PATCH"/);
  });

  test("correctRecord PATCHes the per-student record route with an encoded student id", () => {
    const idx = src.indexOf("correctRecord");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(
      /\/api\/admin\/attendance\/records\/\$\{session_id\}\/\$\{encodeURIComponent\(student_id\)\}/,
    );
    expect(block).toMatch(/method:\s*"PATCH"/);
  });

  test("getAuditLog reads the read-only admin audit trail", () => {
    expect(src).toMatch(/\/api\/admin\/attendance\/audit/);
  });

  test("getMonthlyRewardPreview forwards an optional candidate cycleStart without requiring it", () => {
    const idx = src.indexOf("getMonthlyRewardPreview");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/cycleStart/);
    expect(block).toMatch(/cycle_start/);
  });
});

describe("AttendanceStudio.jsx — Attendance Cycle control", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("DEFAULT_SETTINGS includes attendance_cycle_start, defaulting to no cutoff", () => {
    const idx = src.indexOf("const DEFAULT_SETTINGS");
    const block = src.slice(idx, idx + 1000);
    expect(block).toMatch(/attendance_cycle_start:\s*null/);
  });

  test("changing the cycle date requires confirmation before saving, mentioning eligibility impact", () => {
    const panelIdx = src.indexOf("function SettingsPanel");
    const idx = src.indexOf("const handleSave", panelIdx);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/newCycleStart\s*!==\s*savedCycleStart/);
    expect(block).toMatch(/window\.confirm/);
    expect(block).toMatch(/eligibility/i);
  });

  test("saving with no cycle-date change never prompts for confirmation", () => {
    const panelIdx = src.indexOf("function SettingsPanel");
    const idx = src.indexOf("const handleSave", panelIdx);
    const block = src.slice(idx, idx + 900);
    // The confirm call is INSIDE the changed-value branch, not unconditional.
    const confirmIdx = block.indexOf("window.confirm");
    const guardIdx = block.indexOf("if (newCycleStart !== savedCycleStart)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeGreaterThan(guardIdx);
  });

  test("the preview call includes the in-progress cycle-start edit as a live candidate", () => {
    const idx = src.indexOf("api.getMonthlyRewardPreview({ thresholdPct");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/cycleStart:\s*cycleStartDraft/);
  });
});

describe("AttendanceStudio.jsx — Session exceptions", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("EXCEPTION_LABELS covers exactly the four backend-supported values", () => {
    const idx = src.indexOf("const EXCEPTION_LABELS");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/cancelled:\s*"Cancelled"/);
    expect(block).toMatch(/teacher_unavailable:\s*"Teacher unavailable"/);
    expect(block).toMatch(/holiday:\s*"Holiday \/ No class"/);
    expect(block).toMatch(/technical_issue:\s*"Technical issue"/);
  });

  test("handleSetException calls the admin API and reloads the list", () => {
    const idx = src.indexOf("const handleSetException");
    const block = src.slice(idx, idx + 1000);
    expect(block).toMatch(/api\.setSessionException\(session_id,\s*\{\s*exception,\s*reason:\s*reason\s*\|\|\s*""\s*\}\)/);
    expect(block).toMatch(/load\(\)/);
  });

  test("an excepted session shows a badge alongside its normal status", () => {
    expect(src).toMatch(/\{s\.exception && <Pill color="#f59e0b">\{EXCEPTION_LABELS\[s\.exception\] \|\| s\.exception\}<\/Pill>\}/);
  });

  test("the exception select offers exactly the four supported values plus Held (normal)", () => {
    const idx = src.indexOf('data-testid="attendance-session-exception-select"');
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/Held \(normal\)/);
    expect(block).toMatch(/value="cancelled"/);
    expect(block).toMatch(/value="teacher_unavailable"/);
    expect(block).toMatch(/value="holiday"/);
    expect(block).toMatch(/value="technical_issue"/);
  });
});

describe("AttendanceStudio.jsx — Corrections panel", () => {
  let src;
  beforeAll(() => { src = readSrc("studio/AttendanceStudio.jsx"); });

  test("is registered as its own secondary tab, not merged into an existing primary panel", () => {
    expect(src).toMatch(/\{ key:\s*"corrections",\s*label:\s*"Corrections",\s*Icon:\s*ClipboardEdit\s*\}/);
    expect(src).toMatch(/\{panel === "corrections"\s*&&\s*<CorrectionsPanel \/>\}/);
  });

  test("only accepts the real Attendance model's statuses — never an invented one", () => {
    const idx = src.indexOf("function CorrectionsPanel");
    const block = src.slice(idx, idx + 6000);
    expect(block).toMatch(/<option value="present_full">Present<\/option>/);
    expect(block).toMatch(/<option value="late">Late<\/option>/);
    expect(block).toMatch(/<option value="absent">Absent<\/option>/);
  });

  test("saveCorrection requires a non-empty reason before calling the API", () => {
    const idx = src.indexOf("const saveCorrection");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/if\s*\(!reason\.trim\(\)\)/);
  });

  test("calls api.correctRecord with the session, student, chosen status, and reason", () => {
    const idx = src.indexOf("const saveCorrection");
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(
      /api\.correctRecord\(selectedSession,\s*editing\.student_id,\s*\{\s*status:\s*newStatus,\s*reason:\s*reason\.trim\(\)\s*\}\)/,
    );
  });

  test("Save is disabled while a reason hasn't been entered", () => {
    const idx = src.indexOf("Save correction");
    const block = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(block).toMatch(/disabled=\{saving \|\| !reason\.trim\(\)\}/);
  });

  test("flags a session that's already excepted so an admin doesn't correct records that don't count anyway", () => {
    const idx = src.indexOf("function CorrectionsPanel");
    const block = src.slice(idx, idx + 6000);
    expect(block).toMatch(/roster\.exception/);
  });

  test("a corrected record shows a distinguishing badge in the roster list", () => {
    const idx = src.indexOf("function CorrectionsPanel");
    const block = src.slice(idx, idx + 6000);
    expect(block).toMatch(/row\.corrected && <Pill color="#6b9fff">Corrected<\/Pill>/);
  });
});
