/**
 * WinnerShowcaseThemeStudio.test.jsx — Author Studio "Winner Showcase
 * Theme" management screen, structural twin of
 * AchievementExperienceStudio.test.jsx. Mocks ./api entirely (network
 * layer covered by the backend's own experience-config tests) plus the
 * REAL FridaySpeakingWinnersPanel's own data hooks
 * (useWinnerShowcaseRotation/useExperienceConfig/useTheme) so the live
 * preview renders deterministically. Asserts on the UI's CONTRACT: lists
 * configs scoped to winner_showcase_theme, creates/edits via the real API
 * functions, exposes preset/decoration/trophy/card/scheduling/countdown
 * controls, and its live preview renders the real
 * FridaySpeakingWinnersPanel.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import WinnerShowcaseThemeStudio from "../WinnerShowcaseThemeStudio";
import * as api from "../api";
import useWinnerShowcaseRotation from "../../eduhub/hooks/useWinnerShowcaseRotation";
import useExperienceConfig from "../../eduhub/hooks/useExperienceConfig";
import { useTheme } from "../../eduhub/pages/portal/hooks/useTheme";

jest.mock("../api", () => ({
  listExperienceConfigs: jest.fn(),
  createExperienceConfig: jest.fn(),
  updateExperienceConfig: jest.fn(),
  publishExperienceConfig: jest.fn(),
  unpublishExperienceConfig: jest.fn(),
  duplicateExperienceConfig: jest.fn(),
  deleteExperienceConfig: jest.fn(),
  uploadHeroArtwork: jest.fn(),
  listHeroArtworkLibrary: jest.fn(),
  deleteHeroArtworkAsset: jest.fn(),
}));

jest.mock("../../eduhub/hooks/useWinnerShowcaseRotation");
jest.mock("../../eduhub/hooks/useExperienceConfig");
jest.mock("../../eduhub/pages/portal/hooks/useTheme");

const THREE_WINNERS = {
  key: "sl:sess-1",
  content: {
    eventName: "Friday Speaking Lab",
    topWinners: [
      { student_id: "stu1", display_name: "Sok Dara", amount: 300 },
      { student_id: "stu2", display_name: "Chan", amount: 180 },
      { student_id: "stu3", display_name: "Vuthy", amount: 120 },
    ],
  },
};

const DRAFT_CONFIG = {
  id: "wst-1",
  experienceType: "winner_showcase_theme",
  key: "default",
  status: "draft",
  version: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  content: { visible: true },
  appearance: { syncMode: "followWelcome", themeId: "emeraldAchievement", overrides: {}, artwork: null, nextSessionCountdown: { enabled: true, weekday: 5, hour: 15, minute: 0 } },
  activeWindow: { startsAt: null, endsAt: null, recurringAnnual: false },
};

const PUBLISHED_KNY = {
  ...DRAFT_CONFIG, id: "wst-2", key: "khmer-new-year", status: "published",
  appearance: { syncMode: "independent", themeId: "khmerNewYear", overrides: {}, artwork: null, nextSessionCountdown: { enabled: true, weekday: 5, hour: 15, minute: 0 } },
  activeWindow: { startsAt: "2026-04-13T00:00:00Z", endsAt: "2026-04-16T23:59:00Z", recurringAnnual: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.listExperienceConfigs.mockResolvedValue({ configs: [] });
  useWinnerShowcaseRotation.mockReturnValue({ current: THREE_WINNERS, count: 1, loading: false, setIndex: jest.fn() });
  useExperienceConfig.mockReturnValue({ config: null, source: "default", loading: false });
  useTheme.mockReturnValue({ theme: "light" });
});

test("loads and lists configs scoped to winner_showcase_theme on mount", async () => {
  api.listExperienceConfigs.mockResolvedValue({ configs: [DRAFT_CONFIG] });
  render(<WinnerShowcaseThemeStudio />);
  await waitFor(() => expect(api.listExperienceConfigs).toHaveBeenCalledWith("winner_showcase_theme"));
  expect(await screen.findByTestId(`winnerthemeexp-row-${DRAFT_CONFIG.id}`)).toBeInTheDocument();
});

test("shows an empty state explaining the Day/Night auto-fallback when no configs exist", async () => {
  render(<WinnerShowcaseThemeStudio />);
  expect(await screen.findByTestId("winnerthemeexp-empty")).toHaveTextContent(/Day\/Night theme/i);
});

test("draft configs show a Draft badge, published show Live, recurring windows show a Recurring badge", async () => {
  api.listExperienceConfigs.mockResolvedValue({ configs: [DRAFT_CONFIG, PUBLISHED_KNY] });
  render(<WinnerShowcaseThemeStudio />);
  const draftRow = await screen.findByTestId(`winnerthemeexp-row-${DRAFT_CONFIG.id}`);
  const knyRow = await screen.findByTestId(`winnerthemeexp-row-${PUBLISHED_KNY.id}`);
  expect(within(draftRow).getByText("Draft")).toBeInTheDocument();
  expect(within(knyRow).getByText("Live")).toBeInTheDocument();
  expect(within(knyRow).getByText("Recurring")).toBeInTheDocument();
  expect(within(draftRow).queryByText("Recurring")).not.toBeInTheDocument();
});

test("New config opens a form defaulting to Follow Welcome Theme sync mode (no preset grid shown)", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  expect(screen.getByTestId("winnerthemeexp-syncmode-followWelcome")).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByTestId("winnerthemeexp-preset-grid")).not.toBeInTheDocument();
});

test("switching to Independent Theme reveals the preset grid with all 11 presets", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-syncmode-independent"));

  const grid = screen.getByTestId("winnerthemeexp-preset-grid");
  expect(within(grid).getByTestId("winnerthemeexp-preset-halloween")).toBeInTheDocument();
  expect(within(grid).getByTestId("winnerthemeexp-preset-khmerNewYear")).toBeInTheDocument();
  expect(within(grid).getAllByRole("button")).toHaveLength(11);
});

test("all 10 decoration toggles are exposed, each independently", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  const types = ["confetti", "stars", "sparkles", "fireworks", "snow", "lanterns", "balloons", "flowers", "ribbons", "seasonalOrnaments"];
  types.forEach((t) => {
    expect(screen.getByTestId(`winnerthemeexp-decoration-toggle-${t}`)).toBeInTheDocument();
  });
});

test("toggling a decoration on reveals its intensity selector", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  expect(screen.queryByTestId("winnerthemeexp-decoration-intensity-confetti")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("winnerthemeexp-decoration-toggle-confetti"));
  expect(screen.getByTestId("winnerthemeexp-decoration-intensity-confetti")).toBeInTheDocument();
});

test("trophy style/medal/animation/color controls are present", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  expect(screen.getByTestId("winnerthemeexp-trophy-style").tagName).toBe("SELECT");
  expect(screen.getByTestId("winnerthemeexp-trophy-medal").tagName).toBe("SELECT");
  expect(screen.getByTestId("winnerthemeexp-trophy-animation").tagName).toBe("SELECT");
  expect(screen.getByTestId("winnerthemeexp-trophy-color")).toHaveAttribute("type", "color");
});

test("player card shape/border controls are present", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  expect(screen.getByTestId("winnerthemeexp-card-shape").tagName).toBe("SELECT");
  expect(screen.getByTestId("winnerthemeexp-card-border").tagName).toBe("SELECT");
});

test("the Hero Artwork panel is reused for background artwork (no duplicate upload UI)", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));
  expect(screen.getByTestId("hero-artwork-panel")).toBeInTheDocument();
});

test("selecting a seasonal preset with a suggested schedule shows a one-click 'use suggested dates' action", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-syncmode-independent"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-preset-khmerNewYear"));

  const suggestBtn = screen.getByTestId("winnerthemeexp-use-suggested-dates");
  fireEvent.click(suggestBtn);

  expect(screen.getByTestId("winnerthemeexp-starts-at").value).toMatch(/-04-13T/);
  expect(screen.getByTestId("winnerthemeexp-ends-at").value).toMatch(/-04-16T/);
  expect(screen.getByTestId("winnerthemeexp-recurring-annual")).toHaveTextContent(/Repeat every year/i);
});

test("a non-seasonal preset shows no 'use suggested dates' shortcut", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-syncmode-independent"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-preset-goldenCelebration"));

  expect(screen.queryByTestId("winnerthemeexp-use-suggested-dates")).not.toBeInTheDocument();
});

test("recurring-annual checkbox toggles independently of the date fields", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  const toggle = screen.getByTestId("winnerthemeexp-recurring-annual");
  expect(toggle).toHaveTextContent("Repeat every year");
  fireEvent.click(toggle);
  expect(toggle).toBeInTheDocument();
});

test("creating a config calls createExperienceConfig with syncMode, preset, and scheduling incl. recurringAnnual", async () => {
  api.createExperienceConfig.mockResolvedValue({ config: DRAFT_CONFIG });
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

  fireEvent.click(screen.getByTestId("winnerthemeexp-syncmode-independent"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-preset-halloween"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-recurring-annual"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-save"));

  await waitFor(() => expect(api.createExperienceConfig).toHaveBeenCalledTimes(1));
  const payload = api.createExperienceConfig.mock.calls[0][0];
  expect(payload.experienceType).toBe("winner_showcase_theme");
  expect(payload.appearance.syncMode).toBe("independent");
  expect(payload.appearance.themeId).toBe("halloween");
  expect(payload.activeWindow.recurringAnnual).toBe(true);
});

test("editing an existing config calls updateExperienceConfig with its id, not createExperienceConfig", async () => {
  api.listExperienceConfigs.mockResolvedValue({ configs: [DRAFT_CONFIG] });
  api.updateExperienceConfig.mockResolvedValue({ config: DRAFT_CONFIG });
  render(<WinnerShowcaseThemeStudio />);

  fireEvent.click(await screen.findByTestId(`winnerthemeexp-edit-${DRAFT_CONFIG.id}`));
  fireEvent.click(await screen.findByTestId("winnerthemeexp-save"));

  await waitFor(() => expect(api.updateExperienceConfig).toHaveBeenCalledWith(DRAFT_CONFIG.id, expect.any(Object)));
  expect(api.createExperienceConfig).not.toHaveBeenCalled();
});

test("Publish/Unpublish/Duplicate/Delete all call the shared generic experience-config API with the row's id", async () => {
  api.listExperienceConfigs.mockResolvedValue({ configs: [DRAFT_CONFIG, PUBLISHED_KNY] });
  api.publishExperienceConfig.mockResolvedValue({ config: DRAFT_CONFIG });
  api.unpublishExperienceConfig.mockResolvedValue({ config: PUBLISHED_KNY });
  api.duplicateExperienceConfig.mockResolvedValue({ config: { ...DRAFT_CONFIG, id: "wst-3" } });
  api.deleteExperienceConfig.mockResolvedValue({ ok: true });
  render(<WinnerShowcaseThemeStudio />);

  fireEvent.click(await screen.findByTestId(`winnerthemeexp-publish-${DRAFT_CONFIG.id}`));
  await waitFor(() => expect(api.publishExperienceConfig).toHaveBeenCalledWith(DRAFT_CONFIG.id));

  fireEvent.click(screen.getByTestId(`winnerthemeexp-unpublish-${PUBLISHED_KNY.id}`));
  await waitFor(() => expect(api.unpublishExperienceConfig).toHaveBeenCalledWith(PUBLISHED_KNY.id));

  fireEvent.click(screen.getByTestId(`winnerthemeexp-duplicate-${DRAFT_CONFIG.id}`));
  await waitFor(() => expect(api.duplicateExperienceConfig).toHaveBeenCalledWith(DRAFT_CONFIG.id));

  fireEvent.click(screen.getByTestId(`winnerthemeexp-delete-${DRAFT_CONFIG.id}`));
  fireEvent.click(screen.getByTestId(`winnerthemeexp-delete-confirm-${DRAFT_CONFIG.id}`));
  await waitFor(() => expect(api.deleteExperienceConfig).toHaveBeenCalledWith(DRAFT_CONFIG.id, { force: false }));
});

test("live preview renders the real FridaySpeakingWinnersPanel reflecting the current preset", async () => {
  render(<WinnerShowcaseThemeStudio />);
  fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-syncmode-independent"));
  fireEvent.click(screen.getByTestId("winnerthemeexp-preset-christmas"));

  const preview = screen.getByTestId("winnerthemeexp-preview");
  const panel = within(preview).getByTestId("friday-speaking-winners-panel");
  expect(panel).toHaveAttribute("data-winner-preset", "christmas");
  // The REAL live winner showcase data is shown — not a mock-up.
  expect(within(preview).getByTestId("friday-winner-card-0")).toHaveTextContent("Sok Dara");
});

describe("Next Session Countdown controls — additive to the Achievement twin", () => {
  test("shown by default and reveals weekday/hour/minute fields", async () => {
    render(<WinnerShowcaseThemeStudio />);
    fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

    expect(screen.getByTestId("winnerthemeexp-countdown-toggle")).toHaveTextContent(/Shown on the Dashboard panel/i);
    expect(screen.getByTestId("winnerthemeexp-countdown-weekday").tagName).toBe("SELECT");
    expect(screen.getByTestId("winnerthemeexp-countdown-hour")).toHaveValue(15);
    expect(screen.getByTestId("winnerthemeexp-countdown-minute")).toHaveValue(0);
  });

  test("disabling the countdown hides the weekday/hour/minute fields", async () => {
    render(<WinnerShowcaseThemeStudio />);
    fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

    fireEvent.click(screen.getByTestId("winnerthemeexp-countdown-toggle"));
    expect(screen.getByTestId("winnerthemeexp-countdown-toggle")).toHaveTextContent(/Hidden/i);
    expect(screen.queryByTestId("winnerthemeexp-countdown-weekday")).not.toBeInTheDocument();
  });

  test("changing weekday/hour/minute updates the create payload's nextSessionCountdown", async () => {
    api.createExperienceConfig.mockResolvedValue({ config: DRAFT_CONFIG });
    render(<WinnerShowcaseThemeStudio />);
    fireEvent.click(await screen.findByTestId("winnerthemeexp-new"));

    fireEvent.change(screen.getByTestId("winnerthemeexp-countdown-weekday"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("winnerthemeexp-countdown-hour"), { target: { value: "9" } });
    fireEvent.change(screen.getByTestId("winnerthemeexp-countdown-minute"), { target: { value: "30" } });
    fireEvent.click(screen.getByTestId("winnerthemeexp-save"));

    await waitFor(() => expect(api.createExperienceConfig).toHaveBeenCalledTimes(1));
    const payload = api.createExperienceConfig.mock.calls[0][0];
    expect(payload.appearance.nextSessionCountdown).toEqual({ enabled: true, weekday: 3, hour: 9, minute: 30 });
  });
});
