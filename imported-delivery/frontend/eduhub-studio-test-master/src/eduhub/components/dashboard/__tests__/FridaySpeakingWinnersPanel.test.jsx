/**
 * FridaySpeakingWinnersPanel.test.jsx — Friday Speaking Labs Feature 1,
 * rebuilt on the Winner Showcase Theme Engine (clone of Achievement
 * Experience). Mocks useWinnerShowcaseRotation, useExperienceConfig, and
 * useTheme entirely (each has its own dedicated tests elsewhere); this
 * file proves the UI CONTRACT: filters to
 * source="speaking_lab_classroom_draw", renders the top 3 winners themed
 * via the resolved winner_showcase_theme preset, shows a skeleton while
 * loading, renders nothing when empty, and the "Rotates in Nd" /
 * "Next Friday Speaking Lab in…" countdowns both still work.
 */
import { render, screen } from "@testing-library/react";
import FridaySpeakingWinnersPanel from "../FridaySpeakingWinnersPanel";
import useWinnerShowcaseRotation from "../../../hooks/useWinnerShowcaseRotation";
import useExperienceConfig from "../../../hooks/useExperienceConfig";
import { useTheme } from "../../../pages/portal/hooks/useTheme";

jest.mock("../../../hooks/useWinnerShowcaseRotation");
jest.mock("../../../hooks/useExperienceConfig");
jest.mock("../../../pages/portal/hooks/useTheme");

beforeEach(() => {
  jest.clearAllMocks();
  useExperienceConfig.mockReturnValue({ config: null, source: "default", loading: false });
  useTheme.mockReturnValue({ theme: "light" });
});

test("calls the rotation hook filtered to the classroom-draw source", () => {
  useWinnerShowcaseRotation.mockReturnValue({ current: null, count: 0, loading: false, setIndex: jest.fn() });
  render(<FridaySpeakingWinnersPanel />);
  expect(useWinnerShowcaseRotation).toHaveBeenCalledWith({ sourceFilter: "speaking_lab_classroom_draw" });
});

test("self-fetches its own winner_showcase_theme config when no themeConfig prop is supplied", () => {
  useWinnerShowcaseRotation.mockReturnValue({ current: null, count: 0, loading: false, setIndex: jest.fn() });
  render(<FridaySpeakingWinnersPanel />);
  expect(useExperienceConfig).toHaveBeenCalledWith("winner_showcase_theme");
});

test("renders nothing when no classroom showcase is active", () => {
  useWinnerShowcaseRotation.mockReturnValue({ current: null, count: 0, loading: false, setIndex: jest.fn() });
  const { container } = render(<FridaySpeakingWinnersPanel />);
  expect(container).toBeEmptyDOMElement();
});

test("shows a skeleton while the first fetch is still pending", () => {
  useWinnerShowcaseRotation.mockReturnValue({ current: null, count: 0, loading: true, setIndex: jest.fn() });
  render(<FridaySpeakingWinnersPanel />);
  expect(screen.getByTestId("friday-speaking-winners-panel-loading")).toBeInTheDocument();
  expect(screen.getByTestId("friday-winner-skeleton-0")).toBeInTheDocument();
  expect(screen.getByTestId("friday-winner-skeleton-1")).toBeInTheDocument();
  expect(screen.getByTestId("friday-winner-skeleton-2")).toBeInTheDocument();
});

const THREE_WINNERS = {
  key: "sl:sess-1",
  content: {
    eventName: "Friday Speaking Lab",
    source: "speaking_lab_classroom_draw",
    topWinners: [
      { student_id: "stu1", display_name: "Sok", amount: 300 },
      { student_id: "stu2", display_name: "Dara", amount: 180 },
      { student_id: "stu3", display_name: "Vuthy", amount: 120 },
      { student_id: "stu4", display_name: "Chan", amount: 90 },
    ],
  },
};

test("renders exactly the top 3 winners with names, points, and champion rank treatment", () => {
  useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
  render(<FridaySpeakingWinnersPanel />);
  const panel = screen.getByTestId("friday-speaking-winners-panel");
  expect(panel).toHaveTextContent("Friday's Speaking Winners");
  expect(screen.getByTestId("friday-winner-card-0")).toHaveTextContent("Sok");
  expect(screen.getByTestId("friday-winner-card-0")).toHaveTextContent("300 pts");
  expect(screen.getByTestId("friday-winner-card-0")).toHaveTextContent("Champion");
  expect(screen.getByTestId("friday-winner-card-1")).toHaveTextContent("Dara");
  expect(screen.getByTestId("friday-winner-card-2")).toHaveTextContent("Vuthy");
  // Exactly top 3 — the 4th winner never renders a card.
  expect(screen.queryByText("Chan")).not.toBeInTheDocument();
});

test("differentiates rank visually via per-rank labels (Champion/2nd Place/3rd Place), not just position", () => {
  useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
  render(<FridaySpeakingWinnersPanel />);
  expect(screen.getByTestId("friday-winner-card-1")).toHaveTextContent("2nd Place");
  expect(screen.getByTestId("friday-winner-card-2")).toHaveTextContent("3rd Place");
});

test("shows a rotation countdown derived from the showcase's own activeWindow.endsAt", () => {
  // Comfortably inside day 3 (not within a second of the day-4 rounding
  // edge) so Math.ceil is unambiguous regardless of test execution jitter.
  const endsAt = new Date(Date.now() + 2.5 * 86400000).toISOString();
  useWinnerShowcaseRotation.mockReturnValue({
    current: {
      key: "sl:sess-1",
      activeWindow: { endsAt },
      content: { eventName: "Friday Speaking Lab", topWinners: [{ student_id: "stu1", display_name: "Sok", amount: 300 }] },
    },
    count: 1, loading: false, setIndex: jest.fn(),
  });
  render(<FridaySpeakingWinnersPanel />);
  expect(screen.getByTestId("friday-winners-rotation-hint")).toHaveTextContent("Rotates in 3d");
});

test("renders nothing when the active classroom showcase has zero winners", () => {
  useWinnerShowcaseRotation.mockReturnValue({
    current: { key: "sl:sess-2", content: { eventName: "Friday Speaking Lab", topWinners: [] } },
    count: 1, loading: false, setIndex: jest.fn(),
  });
  const { container } = render(<FridaySpeakingWinnersPanel />);
  expect(container).toBeEmptyDOMElement();
});

describe("Winner Showcase Theme Engine — themed rendering", () => {
  test("Day mode (light) renders the Emerald Achievement surface by default", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    useTheme.mockReturnValue({ theme: "light" });
    render(<FridaySpeakingWinnersPanel />);
    expect(screen.getByTestId("friday-speaking-winners-panel")).toHaveAttribute("data-winner-theme", "day");
    expect(screen.getByTestId("friday-speaking-winners-panel")).toHaveAttribute("data-winner-preset", "emeraldAchievement");
  });

  test("Night mode (dark) renders the Midnight Achievement surface by default", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    useTheme.mockReturnValue({ theme: "dark" });
    render(<FridaySpeakingWinnersPanel />);
    expect(screen.getByTestId("friday-speaking-winners-panel")).toHaveAttribute("data-winner-theme", "night");
  });

  test("an independent preset published via the theme config actually changes the rendered panel", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    useExperienceConfig.mockReturnValue({
      config: { appearance: { syncMode: "independent", themeId: "halloween" }, content: { visible: true } },
      source: "published", loading: false,
    });
    render(<FridaySpeakingWinnersPanel />);
    expect(screen.getByTestId("friday-speaking-winners-panel")).toHaveAttribute("data-winner-preset", "halloween");
  });

  test("a themeConfig prop (Studio live preview) overrides the self-fetched published config", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    useExperienceConfig.mockReturnValue({
      config: { appearance: { syncMode: "independent", themeId: "christmas" }, content: { visible: true } },
      source: "published", loading: false,
    });
    render(<FridaySpeakingWinnersPanel themeConfig={{ appearance: { syncMode: "independent", themeId: "graduation" }, content: { visible: true } }} />);
    expect(screen.getByTestId("friday-speaking-winners-panel")).toHaveAttribute("data-winner-preset", "graduation");
  });

  test("content.visible=false on the resolved theme hides the whole panel", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    useExperienceConfig.mockReturnValue({
      config: { appearance: {}, content: { visible: false } },
      source: "published", loading: false,
    });
    const { container } = render(<FridaySpeakingWinnersPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Next Session Countdown — additive, admin-configurable", () => {
  test("shown by default (DEFAULT_NEXT_SESSION_COUNTDOWN.enabled = true)", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    render(<FridaySpeakingWinnersPanel />);
    expect(screen.getByTestId("friday-winners-next-session")).toHaveTextContent("Next Friday Speaking Lab in");
  });

  test("hidden when the admin disables it via the theme config", () => {
    useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
    useExperienceConfig.mockReturnValue({
      config: { appearance: { nextSessionCountdown: { enabled: false } }, content: { visible: true } },
      source: "published", loading: false,
    });
    render(<FridaySpeakingWinnersPanel />);
    expect(screen.queryByTestId("friday-winners-next-session")).not.toBeInTheDocument();
  });
});
