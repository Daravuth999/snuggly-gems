import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AttendanceOverview from "../AttendanceOverview";
import { getMonthlySummary, claimMonthlyReward, getMonthlyHistory } from "../api";
import { requestPointsRefresh } from "../../../utils/pointsSync";
import useAttendance from "../../../hooks/useAttendance";
import { LanguageProvider } from "../../portal/contexts/LanguageContext";

jest.mock("../api", () => ({
  getMonthlySummary: jest.fn(),
  claimMonthlyReward: jest.fn(),
  getMonthlyHistory: jest.fn(),
}));

jest.mock("../../../hooks/useAttendance", () => jest.fn());

jest.mock("../../../utils/pointsSync", () => ({
  requestPointsRefresh: jest.fn(),
}));

// react-router-dom isn't Jest-resolvable in this project (see the existing
// jest.mock("react-router-dom", ...) precedent in
// voiceTreasure_passB21.mounted.test.jsx) — AttendanceOverview only uses
// <Link>, so a minimal virtual stand-in is enough; no MemoryRouter needed.
jest.mock("react-router-dom", () => ({
  __esModule: true,
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

const BASE_ME = {
  history: [
    { session_id: "s1", title_en: "English Speaking", status: "present_partial",
      session_date: "2026-08-17", verification_status: "pending" },
    { session_id: "s2", title_en: "English Speaking", status: "late",
      session_date: "2026-08-13", verification_status: "confirmed" },
  ],
};

function baseStats(overrides = {}) {
  return { present: 0, partial: 0, late: 0, absent: 0, attended: 0, total: 0, attendance_pct: 0, ...overrides };
}

function baseSummary(overrides = {}) {
  return {
    stats: baseStats(),
    required_pct: 85,
    eligible: false,
    reward_enabled: false,
    reward_configured: false,
    reward_name: null,
    reward_points: null,
    reward_campaign_status: null,
    already_claimed: false,
    can_claim: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <LanguageProvider>
      <AttendanceOverview />
    </LanguageProvider>,
  );
}

describe("AttendanceOverview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useAttendance.mockReturnValue({ me: BASE_ME, live: { live: false } });
    getMonthlyHistory.mockResolvedValue({ months: [] });
  });

  test("shows a loading state before the summary resolves", () => {
    getMonthlySummary.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId("attendance-overview-loading")).toBeInTheDocument();
  });

  test("shows an error state with retry on failure", async () => {
    getMonthlySummary.mockRejectedValue(new Error("network down"));
    renderPage();
    expect(await screen.findByTestId("attendance-overview-error")).toHaveTextContent("network down");
    getMonthlySummary.mockResolvedValue(baseSummary());
    fireEvent.click(screen.getByTestId("attendance-overview-retry"));
    expect(await screen.findByTestId("attendance-overview")).toBeInTheDocument();
  });

  test("zero classes: rich empty state — hero, goal, reward card and how-it-works all present, no stray placeholder glyph", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({ reward_enabled: true, reward_configured: false }));
    renderPage();

    const empty = await screen.findByTestId("attendance-hero-empty");
    expect(empty).toHaveTextContent("Your attendance journey begins here");
    expect(empty).toHaveTextContent("85% required");
    expect(screen.queryByTestId("attendance-hero-pct")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attendance-status-pill")).not.toBeInTheDocument();

    // The richer zero-state: the goal is folded into the hero itself, and
    // reward + how-it-works stay present even with nothing recorded yet —
    // never a giant blank area.
    expect(screen.getByTestId("attendance-reward-card")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-how-it-works")).toBeInTheDocument();
    expect(screen.queryByTestId("attendance-stat-row")).not.toBeInTheDocument();
  });

  test("reward not configured: neutral copy, no invented points, no claim button", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: false,
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("No reward configured yet.");
    expect(screen.queryByTestId("attendance-claim-btn")).not.toBeInTheDocument();
    expect(within(card).queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  test("not started: reward is configured but the student hasn't attended yet — claim button visible but locked/disabled", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      eligible: false, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("Attend your classes this month to work toward your reward.");
    // Never hidden entirely — a locked/disabled button so the student
    // understands the reward exists, they just haven't earned it yet.
    const btn = screen.getByTestId("attendance-claim-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Claim Reward");
  });

  test("in progress: shows live percent against the requirement, claim button locked/disabled", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 5, attended: 5, total: 8, attendance_pct: 62.5 }),
      eligible: false, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("You're currently at 62.5%. Reach 85% to unlock your reward.");
    expect(card).toHaveTextContent("August Attendance Bonus");
    expect(screen.getByTestId("attendance-claim-btn")).toBeDisabled();
  });

  test("almost there: within a small gap of the goal, encouragement copy replaces the raw percentage", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 8, attended: 8, total: 10, attendance_pct: 80 }),
      eligible: false, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("You're almost at your monthly goal.");
    // Never a fabricated "N classes left" count the backend doesn't compute.
    expect(card).not.toHaveTextContent(/\d+ (more )?class(es)? (to go|left|remaining)/i);
    expect(screen.getByTestId("attendance-claim-btn")).toBeDisabled();
  });

  test("reward panel shows its own distance-to-goal track while in progress", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 5, attended: 5, total: 8, attendance_pct: 62.5 }),
      eligible: false, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(within(card).getByTestId("attendance-reward-track")).toBeInTheDocument();
    expect(card).toHaveTextContent("62.5%");
    expect(card).toHaveTextContent("Reach 85% to unlock");
  });

  test("reward panel omits the distance track once unlocked", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
      can_claim: true,
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(within(card).queryByTestId("attendance-reward-track")).not.toBeInTheDocument();
  });

  test("unlocked: shows the real campaign name/points and a working Claim Reward button", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, late: 1, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
      can_claim: true,
    }));
    claimMonthlyReward.mockResolvedValue({ ok: true, points: 50, reward_name: "August Attendance Bonus" });
    renderPage();

    expect(await screen.findByTestId("attendance-hero-pct")).toHaveTextContent("90%");
    expect(screen.getByTestId("attendance-status-pill")).toHaveTextContent("Requirement met");
    const card = screen.getByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("August Attendance Bonus");
    expect(card).toHaveTextContent("You've qualified for this month's reward.");
    expect(card).toHaveTextContent("+50");

    const claimBtn = screen.getByTestId("attendance-claim-btn");
    fireEvent.click(claimBtn);
    await waitFor(() => expect(claimMonthlyReward).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(card).toHaveTextContent("+50 pts added to your account."));
    // The shared points display (DashboardHeader's pill etc.) must catch
    // up with the real credited balance — never a frontend-fabricated one.
    expect(requestPointsRefresh).toHaveBeenCalledWith("attendance_monthly_claim");
  });

  test("already claimed: shows Claimed, never a re-claimable button", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
      already_claimed: true,
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("+50 pts added to your account.");
    expect(card).toHaveTextContent("Added to your balance");
    expect(card).toHaveTextContent("View my points");
    const btn = screen.getByTestId("attendance-claim-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Reward claimed");
  });

  test("unavailable: eligibility met but the campaign isn't live — button visible but never falsely claimable", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "expired",
      can_claim: false, already_claimed: false,
    }));
    renderPage();
    const card = await screen.findByTestId("attendance-reward-card");
    expect(card).toHaveTextContent("Your attendance requirement is complete, but this reward is currently unavailable.");
    expect(screen.getByTestId("attendance-claim-btn")).toBeDisabled();
  });

  test("reward disabled: eligibility still shown, but no reward card at all", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: false,
    }));
    renderPage();
    expect(await screen.findByTestId("attendance-status-pill")).toHaveTextContent("Requirement met");
    expect(screen.queryByTestId("attendance-reward-card")).not.toBeInTheDocument();
  });

  test("claim failure shows an error and leaves the button re-clickable", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
      can_claim: true,
    }));
    claimMonthlyReward.mockRejectedValue(new Error("not_eligible"));
    renderPage();
    fireEvent.click(await screen.findByTestId("attendance-claim-btn"));
    expect(await screen.findByTestId("attendance-claim-error")).toHaveTextContent("not_eligible");
    expect(screen.getByTestId("attendance-claim-btn")).toBeInTheDocument(); // still there to retry
  });

  test("recent sessions render Present/Late only from Present/Late/Absent — never a Verifying tag or an internal enum", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 1, late: 1, attended: 2, total: 2, attendance_pct: 100 }),
      eligible: true,
    }));
    renderPage();
    const rows = await screen.findByTestId("attendance-recent-sessions");
    // s1 is "present_partial" in BASE_ME — must normalise to "Present".
    expect(rows).toHaveTextContent("Present");
    expect(rows).toHaveTextContent("Late");
    expect(screen.queryByText(/verify/i)).not.toBeInTheDocument();
    expect(screen.queryByText("present_full")).not.toBeInTheDocument();
    expect(screen.queryByText("present_partial")).not.toBeInTheDocument();
    expect(screen.queryByText(/pending|confirmed/i)).not.toBeInTheDocument();
  });

  test("attendance history: shows past months with Eligible/Not eligible badges, skips zero-class months", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true,
    }));
    getMonthlyHistory.mockResolvedValue({
      months: [
        { period: "2026-08", stats: baseStats({ total: 10, attendance_pct: 90 }), required_pct: 85, eligible: true },
        { period: "2026-07", stats: baseStats({ total: 8, attendance_pct: 62.5 }), required_pct: 85, eligible: false },
        { period: "2026-06", stats: baseStats({ total: 0, attendance_pct: 0 }), required_pct: 85, eligible: false },
      ],
    });
    renderPage();
    const card = await screen.findByTestId("attendance-history");
    expect(card).toHaveTextContent("90%");
    expect(card).toHaveTextContent("Eligible");
    expect(card).toHaveTextContent("62.5%");
    expect(card).toHaveTextContent("Not eligible");
    // The zero-class month never renders a fake 0%/Not-eligible row.
    expect(within(card).queryAllByText("0%")).toHaveLength(0);
  });

  test("attendance history: empty note when no past months have any classes yet", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary());
    getMonthlyHistory.mockResolvedValue({ months: [] });
    renderPage();
    const card = await screen.findByTestId("attendance-history");
    expect(card).toHaveTextContent("Your monthly history will appear here.");
  });

  test("How your monthly reward works: collapsed by default, shows the 5 steps when expanded", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary());
    renderPage();
    await screen.findByTestId("attendance-overview");
    expect(screen.getByTestId("attendance-how-it-works")).toHaveTextContent("How your monthly reward works");
    expect(screen.queryByText("Your attendance is recorded automatically for each class.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("attendance-how-it-works-toggle"));
    expect(await screen.findByText("Your attendance is recorded automatically for each class.")).toBeInTheDocument();
    // Transparency: the guide explicitly says only ELIGIBLE classes count,
    // never just "classes" — matches the same framing as the hero fraction.
    expect(screen.getByText("Only eligible classes in the current month are counted.")).toBeInTheDocument();
    expect(screen.getByText("Meet the required attendance percentage.")).toBeInTheDocument();
    expect(screen.getByText("Once eligible, the Claim Reward button becomes available.")).toBeInTheDocument();
    // Monthly reset must be explained clearly, and must NOT say credited
    // points get removed — only that progress doesn't carry over.
    expect(screen.getByText(/Previous-month progress doesn't carry over/)).toBeInTheDocument();
    expect(screen.getByText(/points you've already earned stay in your account/)).toBeInTheDocument();
  });

  test("mid-month launch: shows the cycle-start explanation only during the launch month", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({ cycle_start: "2026-08-18" }));
    renderPage();
    const hero = await screen.findByTestId("attendance-hero");
    // Day-of-month can shift by one depending on the test runner's local
    // timezone (shortDate() renders in local time from a UTC-midnight ISO
    // date) — the surrounding copy and month are what matter here.
    expect(within(hero).getByTestId("attendance-cycle-banner")).toHaveTextContent(
      /Your Attendance cycle started on Aug 1[78]\. Only classes from then on count toward this month's requirement\./,
    );
  });

  test("mid-month launch: banner is absent when no cycle_start is configured", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({ cycle_start: null }));
    renderPage();
    await screen.findByTestId("attendance-hero");
    expect(screen.queryByTestId("attendance-cycle-banner")).not.toBeInTheDocument();
  });

  test("recent sessions: a corrected record shows an 'Updated' marker, not a silent percentage change", async () => {
    useAttendance.mockReturnValue({
      me: {
        history: [
          { session_id: "s1", title_en: "English Speaking", status: "present_full",
            session_date: "2026-08-17", corrected: true },
          { session_id: "s2", title_en: "English Speaking", status: "late",
            session_date: "2026-08-13", corrected: false },
        ],
      },
      live: { live: false },
    });
    getMonthlySummary.mockResolvedValue(baseSummary());
    renderPage();
    const rows = await screen.findByTestId("attendance-recent-sessions");
    expect(rows).toHaveTextContent("Updated");
    // Only the corrected row carries the marker.
    const updatedCount = (rows.textContent.match(/Updated/g) || []).length;
    expect(updatedCount).toBe(1);
  });

  test("live session shows a check-in prompt linking to the join page", async () => {
    useAttendance.mockReturnValue({ me: BASE_ME, live: { live: true, slug: "abc123" } });
    getMonthlySummary.mockResolvedValue(baseSummary());
    renderPage();
    const liveCard = await screen.findByTestId("attendance-live-card");
    expect(liveCard).toHaveAttribute("href", "/attendance/j/abc123");
  });

  test("never fetches or renders risk_score", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary());
    renderPage();
    await screen.findByTestId("attendance-overview");
    expect(screen.queryByText(/risk.?score/i)).not.toBeInTheDocument();
  });
});

describe("AttendanceOverview — Khmer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("myportal-lang", "km");
    useAttendance.mockReturnValue({ me: BASE_ME, live: { live: false } });
    getMonthlyHistory.mockResolvedValue({ months: [] });
  });

  test("renders natural Khmer copy and Khmer numerals, never the raw campaign name translated", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary({
      stats: baseStats({ present: 9, attended: 9, total: 10, attendance_pct: 90 }),
      eligible: true, reward_enabled: true, reward_configured: true,
      reward_name: "August Attendance Bonus", reward_points: 50, reward_campaign_status: "live",
      can_claim: true,
    }));
    renderPage();

    expect(await screen.findByTestId("attendance-hero-pct")).toHaveTextContent("៩០%");
    expect(screen.getByTestId("attendance-status-pill")).toHaveTextContent("បានបំពេញលក្ខខណ្ឌ");
    const card = screen.getByTestId("attendance-reward-card");
    // The campaign's real name is never overwritten/translated by Attendance.
    expect(card).toHaveTextContent("August Attendance Bonus");
    expect(card).toHaveTextContent("អ្នកមានលក្ខណៈសម្បត្តិគ្រប់គ្រាន់សម្រាប់រង្វាន់ប្រចាំខែនេះ។");
    expect(screen.getByTestId("attendance-claim-btn")).toHaveTextContent("ទទួលរង្វាន់");
  });

  test("zero classes in Khmer: no English fallback text leaks through", async () => {
    getMonthlySummary.mockResolvedValue(baseSummary());
    renderPage();
    const empty = await screen.findByTestId("attendance-hero-empty");
    expect(empty).toHaveTextContent("ដំណើររៀនរបស់អ្នកចាប់ផ្តើមនៅទីនេះ");
    expect(empty).not.toHaveTextContent("Your attendance journey begins here");
  });
});
