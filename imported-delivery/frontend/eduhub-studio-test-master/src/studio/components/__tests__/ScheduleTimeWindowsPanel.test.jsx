/**
 * ScheduleTimeWindowsPanel.test.jsx — Author Studio admin control for the
 * new admin-configurable Schedule A/B time windows (schedule_time_windows.py).
 * Mounts the real component; proves it renders the real backend-reported
 * labels/windows, never a guessed time for an unconfigured label, and that
 * the edit/save/history flows call the real service functions correctly.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ScheduleTimeWindowsPanel from "../ScheduleTimeWindowsPanel";
import {
  listScheduleTimeWindows,
  setScheduleTimeWindow,
  getScheduleTimeWindowHistory,
} from "../../../eduhub/auth/studentAuthService";

jest.mock("../../../eduhub/auth/studentAuthService", () => ({
  listScheduleTimeWindows: jest.fn(),
  setScheduleTimeWindow: jest.fn(),
  getScheduleTimeWindowHistory: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders each known label with its real formatted window", async () => {
  listScheduleTimeWindows.mockResolvedValue([
    { label: "A", window: { start: "19:00", end: "20:00", timezone: "Asia/Phnom_Penh" } },
    { label: "B", window: null },
  ]);
  render(<ScheduleTimeWindowsPanel />);

  expect(await screen.findByTestId("schedule-time-window-display-A")).toHaveTextContent("7:00 PM – 8:00 PM");
  expect(screen.getByTestId("schedule-time-window-display-B")).toHaveTextContent("Time not yet set");
});

test("an unconfigured label never shows an invented/guessed time — only the honest message", async () => {
  listScheduleTimeWindows.mockResolvedValue([{ label: "A", window: null }]);
  render(<ScheduleTimeWindowsPanel />);

  const display = await screen.findByTestId("schedule-time-window-display-A");
  expect(display).toHaveTextContent("Time not yet set");
  expect(display).not.toHaveTextContent(/\d/);
});

test("a fetch failure shows an error, not a blank or fabricated list", async () => {
  listScheduleTimeWindows.mockRejectedValue(new Error("network down"));
  render(<ScheduleTimeWindowsPanel />);
  expect(await screen.findByTestId("schedule-time-windows-error")).toHaveTextContent("network down");
});

test("editing an unset label: Set time -> fill start/end -> Save calls setScheduleTimeWindow and refreshes", async () => {
  listScheduleTimeWindows
    .mockResolvedValueOnce([{ label: "A", window: null }])
    .mockResolvedValueOnce([{ label: "A", window: { start: "07:00", end: "08:00", timezone: "Asia/Phnom_Penh" } }]);
  setScheduleTimeWindow.mockResolvedValue({ ok: true, label: "A", window: { start: "07:00", end: "08:00" } });
  render(<ScheduleTimeWindowsPanel />);

  fireEvent.click(await screen.findByTestId("schedule-time-window-edit-A"));
  fireEvent.change(screen.getByTestId("schedule-time-window-start-A"), { target: { value: "07:00" } });
  fireEvent.change(screen.getByTestId("schedule-time-window-end-A"), { target: { value: "08:00" } });
  fireEvent.click(screen.getByTestId("schedule-time-window-save-A"));

  await waitFor(() => expect(setScheduleTimeWindow).toHaveBeenCalledWith("A", { start: "07:00", end: "08:00" }));
  await waitFor(() => expect(listScheduleTimeWindows).toHaveBeenCalledTimes(2)); // initial + refresh after save
  await waitFor(() => expect(screen.queryByTestId("schedule-time-window-start-A")).not.toBeInTheDocument());
});

test("Cancel discards the edit without calling setScheduleTimeWindow", async () => {
  listScheduleTimeWindows.mockResolvedValue([{ label: "A", window: null }]);
  render(<ScheduleTimeWindowsPanel />);

  fireEvent.click(await screen.findByTestId("schedule-time-window-edit-A"));
  fireEvent.click(screen.getByTestId("schedule-time-window-cancel-A"));

  expect(setScheduleTimeWindow).not.toHaveBeenCalled();
  expect(screen.queryByTestId("schedule-time-window-start-A")).not.toBeInTheDocument();
});

test("submitting with a blank field shows an inline error and never calls the backend", async () => {
  listScheduleTimeWindows.mockResolvedValue([{ label: "A", window: null }]);
  render(<ScheduleTimeWindowsPanel />);

  fireEvent.click(await screen.findByTestId("schedule-time-window-edit-A"));
  fireEvent.change(screen.getByTestId("schedule-time-window-start-A"), { target: { value: "07:00" } });
  fireEvent.click(screen.getByTestId("schedule-time-window-save-A"));

  expect(await screen.findByTestId("schedule-time-window-form-error-A")).toHaveTextContent(/required/i);
  expect(setScheduleTimeWindow).not.toHaveBeenCalled();
});

test("a rejected save (e.g. end before start, per backend validation) surfaces the real backend error inline", async () => {
  listScheduleTimeWindows.mockResolvedValue([{ label: "A", window: null }]);
  setScheduleTimeWindow.mockRejectedValue(new Error("end time must be after start time"));
  render(<ScheduleTimeWindowsPanel />);

  fireEvent.click(await screen.findByTestId("schedule-time-window-edit-A"));
  fireEvent.change(screen.getByTestId("schedule-time-window-start-A"), { target: { value: "20:00" } });
  fireEvent.change(screen.getByTestId("schedule-time-window-end-A"), { target: { value: "07:00" } });
  fireEvent.click(screen.getByTestId("schedule-time-window-save-A"));

  expect(await screen.findByTestId("schedule-time-window-form-error-A")).toHaveTextContent(
    "end time must be after start time",
  );
  // the list is never optimistically corrupted by a failed save
  expect(screen.getByTestId("schedule-time-window-display-A")).toHaveTextContent("Time not yet set");
});

test("History toggle fetches and displays the real audit trail for that label only", async () => {
  listScheduleTimeWindows.mockResolvedValue([
    { label: "A", window: { start: "19:00", end: "20:00" } },
    { label: "B", window: null },
  ]);
  getScheduleTimeWindowHistory.mockResolvedValue([
    { by: "admin@eduhub.com", old_value: null, new_value: { start: "19:00", end: "20:00" }, at: "2026-09-01T00:00:00Z" },
  ]);
  render(<ScheduleTimeWindowsPanel />);

  fireEvent.click(await screen.findByTestId("schedule-time-window-history-toggle-A"));

  expect(getScheduleTimeWindowHistory).toHaveBeenCalledWith("A");
  const history = await screen.findByTestId("schedule-time-window-history-A");
  expect(history).toHaveTextContent("admin@eduhub.com");
  expect(history).toHaveTextContent("7:00 PM – 8:00 PM");
  // toggling label A's history never fetches or shows label B's history
  expect(screen.queryByTestId("schedule-time-window-history-B")).not.toBeInTheDocument();
});

test("an empty label list shows an honest empty state, not a fabricated A/B row", async () => {
  listScheduleTimeWindows.mockResolvedValue([]);
  render(<ScheduleTimeWindowsPanel />);
  expect(await screen.findByText(/No schedule labels found yet/i)).toBeInTheDocument();
});
