/**
 * SpeakingLabVaultStudio.test.jsx — Author Studio's Friday Vault panel.
 * Mocks ./api entirely (the backend's own vault-config CRUD is covered by
 * eduhub-backend's test_speaking_lab_vault.py) and asserts the UI
 * CONTRACT: loads the one config document, shows plain-language mechanic
 * labels (never raw rule-type strings), and saves edits through the real
 * API function with the values the admin actually set.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SpeakingLabVaultStudio from "../SpeakingLabVaultStudio";
import * as api from "../api";

jest.mock("../api", () => ({
  getSpeakingLabVaultConfig: jest.fn(),
  updateSpeakingLabVaultConfig: jest.fn(),
}));

const BASE_CONFIG = {
  enabled_types: ["box_boost", "risk_reward"],
  rotation_mode: "auto",
  manual_rule_type: null,
  base_min: 5,
  base_max: 15,
  multiplier: 1.5,
  risk_win_probability: 0.5,
  team_vault_threshold: 3,
  team_vault_bonus: 5,
  types: [
    { type: "double_ticket", label: "Double Spark", enabled: false },
    { type: "multiplier", label: "Vault Multiplier", enabled: false },
    { type: "box_boost", label: "Mystery Box Boost", enabled: true },
    { type: "team_vault", label: "Team Vault", enabled: false },
    { type: "risk_reward", label: "Risk & Reward", enabled: true },
    { type: "lucky_protection", label: "Lucky Protection", enabled: false },
  ],
  this_week_rule_type: "box_boost",
  enabled: false,
  env_flag_set: false,
  fully_enabled: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getSpeakingLabVaultConfig.mockResolvedValue(BASE_CONFIG);
});

test("loads the config and shows plain-language mechanic names, never raw rule-type strings", async () => {
  const { container } = render(<SpeakingLabVaultStudio />);
  await screen.findByTestId("speaking-lab-vault-studio");

  // "Mystery Box Boost" legitimately appears twice — once as "This
  // Week's Surprise" and once as its own mechanic card title.
  expect((await screen.findAllByText("Mystery Box Boost")).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("Double Ticket")).toBeInTheDocument();
  expect(screen.getAllByText("Team Vault").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("Risk & Reward")).toBeInTheDocument();
  expect(screen.getByText("Lucky Protection")).toBeInTheDocument();

  // No raw backend enum leaks into the rendered text anywhere.
  expect(container.textContent).not.toMatch(/box_boost|double_ticket|team_vault|risk_reward|lucky_protection/);
});

test("shows the infra-setup notice when the env flag is not yet set, even if the DB toggle is enabled", async () => {
  api.getSpeakingLabVaultConfig.mockResolvedValue({
    ...BASE_CONFIG, enabled: true, env_flag_set: false, fully_enabled: false,
  });
  render(<SpeakingLabVaultStudio />);
  expect(await screen.findByText(/one-time setup step from engineering/i)).toBeInTheDocument();
});

test("shows 'Live for students now' only once both halves of the gate are on", async () => {
  api.getSpeakingLabVaultConfig.mockResolvedValue({
    ...BASE_CONFIG, enabled: true, env_flag_set: true, fully_enabled: true,
  });
  render(<SpeakingLabVaultStudio />);
  expect(await screen.findByText(/Live for students now/i)).toBeInTheDocument();
});

test("toggling a mechanic and saving sends the updated enabled_types list", async () => {
  api.updateSpeakingLabVaultConfig.mockResolvedValue({ ...BASE_CONFIG, enabled_types: ["box_boost", "risk_reward", "team_vault"] });
  render(<SpeakingLabVaultStudio />);
  await screen.findByTestId("speaking-lab-vault-studio");

  fireEvent.click(screen.getByTestId("vault-mechanic-toggle-team_vault"));
  fireEvent.click(screen.getByTestId("vault-save"));

  await waitFor(() => expect(api.updateSpeakingLabVaultConfig).toHaveBeenCalled());
  const payload = api.updateSpeakingLabVaultConfig.mock.calls[0][0];
  expect(payload.enabled_types).toEqual(expect.arrayContaining(["box_boost", "risk_reward", "team_vault"]));
});

test("switching to Manual rotation reveals a mechanic picker", async () => {
  render(<SpeakingLabVaultStudio />);
  await screen.findByTestId("speaking-lab-vault-studio");

  fireEvent.click(screen.getByTestId("vault-rotation-manual"));
  expect(await screen.findByTestId("vault-manual-rule-select")).toBeInTheDocument();
});

test("the Enabled toggle is included in the saved payload", async () => {
  api.updateSpeakingLabVaultConfig.mockResolvedValue(BASE_CONFIG);
  render(<SpeakingLabVaultStudio />);
  await screen.findByTestId("speaking-lab-vault-studio");

  fireEvent.click(screen.getByTestId("vault-enabled-toggle"));
  fireEvent.click(screen.getByTestId("vault-save"));

  await waitFor(() => expect(api.updateSpeakingLabVaultConfig).toHaveBeenCalled());
  const payload = api.updateSpeakingLabVaultConfig.mock.calls[0][0];
  expect(payload.enabled).toBe(true);
});
