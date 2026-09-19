/**
 * WinnerShowcaseStudio.test.jsx — Author Studio admin controls for
 * Dashboard Polish Round 2, Feature 1. Mocks ./api entirely (network layer
 * covered by the backend's own experience-config tests). Asserts on the
 * UI's CONTRACT: filters to content.source === "speaking_lab_classroom_draw"
 * only, unpublish calls the existing unpublish route with the right id,
 * and removing a winner saves via the existing PUT route with the FULL
 * content object (only topWinners changed) — never any wallet/grant field.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WinnerShowcaseStudio from "../WinnerShowcaseStudio";
import * as api from "../api";

jest.mock("../api", () => ({
  listExperienceConfigs: jest.fn(),
  updateExperienceConfig: jest.fn(),
  unpublishExperienceConfig: jest.fn(),
}));

const CLASSROOM_SHOWCASE = {
  id: "ws-1",
  experienceType: "winner_showcase",
  key: "sl:sess-1",
  status: "published",
  version: 1,
  updatedAt: "2026-09-05T10:00:00Z",
  activeWindow: { startsAt: null, endsAt: "2026-09-12T10:00:00Z", recurringAnnual: false },
  content: {
    eventId: "sl:sess-1",
    eventName: "Friday Speaking Lab",
    source: "speaking_lab_classroom_draw",
    distributionCompleted: true,
    payoutStatus: "paid",
    celebrationBanner: true,
    settledAt: "2026-09-05T09:55:00Z",
    topWinners: [
      { student_id: "stu1", display_name: "Sok", amount: 300 },
      { student_id: "stu2", display_name: "Dara", amount: 180 },
      { student_id: "stu3", display_name: "Vuthy", amount: 120 },
    ],
  },
};

const OTHER_SHOWCASE = {
  id: "ws-2",
  experienceType: "winner_showcase",
  key: "event:xyz",
  status: "published",
  version: 1,
  updatedAt: "2026-09-04T10:00:00Z",
  activeWindow: { startsAt: null, endsAt: "2026-09-11T10:00:00Z", recurringAnnual: false },
  content: {
    eventId: "event:xyz",
    eventName: "Term Quiz Bowl",
    source: "event_engine",
    topWinners: [{ student_id: "stu9", display_name: "Ratanak", amount: 500 }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.listExperienceConfigs.mockResolvedValue({ configs: [CLASSROOM_SHOWCASE, OTHER_SHOWCASE] });
  api.unpublishExperienceConfig.mockResolvedValue({ ok: true });
  api.updateExperienceConfig.mockResolvedValue({ ok: true });
});

test("lists only classroom Speaking Lab showcases, excluding other winner_showcase sources", async () => {
  render(<WinnerShowcaseStudio />);
  await waitFor(() => expect(screen.getByTestId("winnershowcase-row-ws-1")).toBeInTheDocument());
  expect(screen.queryByTestId("winnershowcase-row-ws-2")).not.toBeInTheDocument();
  expect(screen.getByTestId("winnershowcase-row-ws-1")).toHaveTextContent("Sok");
  expect(api.listExperienceConfigs).toHaveBeenCalledWith("winner_showcase");
});

test("shows the empty state when there are no classroom showcases", async () => {
  api.listExperienceConfigs.mockResolvedValue({ configs: [OTHER_SHOWCASE] });
  render(<WinnerShowcaseStudio />);
  await waitFor(() => expect(screen.getByTestId("winnershowcase-empty")).toBeInTheDocument());
});

test("Unpublish now requires a confirm click, then calls the existing unpublish route with the config id", async () => {
  render(<WinnerShowcaseStudio />);
  await waitFor(() => screen.getByTestId("winnershowcase-row-ws-1"));

  fireEvent.click(screen.getByTestId("winnershowcase-unpublish-ws-1"));
  expect(api.unpublishExperienceConfig).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("winnershowcase-unpublish-confirm-ws-1"));
  await waitFor(() => expect(api.unpublishExperienceConfig).toHaveBeenCalledWith("ws-1"));
});

test("removing a winner and saving sends the FULL content object via the existing PUT route, with only topWinners changed", async () => {
  render(<WinnerShowcaseStudio />);
  await waitFor(() => screen.getByTestId("winnershowcase-row-ws-1"));

  fireEvent.click(screen.getByTestId("winnershowcase-edit-ws-1"));
  const editor = await screen.findByTestId("winnershowcase-editor-ws-1");
  expect(editor).toHaveTextContent("Sok");
  expect(editor).toHaveTextContent("Dara");
  expect(editor).toHaveTextContent("Vuthy");

  // Remove the #2 winner (Dara).
  fireEvent.click(screen.getByTestId("winnershowcase-remove-winner-1"));
  expect(editor).not.toHaveTextContent("Dara");
  expect(editor).toHaveTextContent("Sok");
  expect(editor).toHaveTextContent("Vuthy");

  fireEvent.click(screen.getByTestId("winnershowcase-save-ws-1"));
  await waitFor(() => expect(api.updateExperienceConfig).toHaveBeenCalledTimes(1));

  const [id, payload] = api.updateExperienceConfig.mock.calls[0];
  expect(id).toBe("ws-1");
  // Every other content field must round-trip untouched (PUT replaces the
  // whole content domain, not a per-field merge) — this is also the proof
  // no reward/wallet field is anywhere in this payload, since the payload
  // is provably just the original content object minus one topWinners entry.
  expect(payload).toEqual({
    content: {
      ...CLASSROOM_SHOWCASE.content,
      topWinners: [
        { student_id: "stu1", display_name: "Sok", amount: 300 },
        { student_id: "stu3", display_name: "Vuthy", amount: 120 },
      ],
    },
  });
});
