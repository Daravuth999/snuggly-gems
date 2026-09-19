/**
 * StudentManager.scheduleAssignment.test.jsx — Teacher Studio round, item 1.
 *
 * The new Schedule A/B assignment UI is a thin client for the EXISTING
 * teacher_admission.py endpoints — this file mounts the real component and
 * proves the UI branches correctly on every outcome those endpoints can
 * return (updated / confirmation_required / blocked_active_elsewhere),
 * especially that "blocked" can NEVER be bypassed via a confirm click
 * (there is no such button for it) — the server-side safety check must
 * never be weakened by this new surface.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentManager from "../StudentManager";
import {
  listStudents,
  assignStudentSchedule,
  bulkAssignStudentSchedule,
  listPasswordResetRequests,
  listScheduleTimeWindows,
} from "../../../eduhub/auth/studentAuthService";
import { useStudioAuth } from "../../StudioAuth";

jest.mock("../../../eduhub/auth/studentAuthService", () => ({
  listStudents: jest.fn(),
  createStudent: jest.fn(),
  deactivateStudent: jest.fn(),
  resetStudentPassword: jest.fn(),
  generateSmartLoginCredential: jest.fn(),
  revokeSmartLoginCredential: jest.fn(),
  forceLogoutAllUsers: jest.fn(),
  assignStudentSchedule: jest.fn(),
  bulkAssignStudentSchedule: jest.fn(),
  listPasswordResetRequests: jest.fn(),
  dismissPasswordResetRequest: jest.fn(),
  listScheduleTimeWindows: jest.fn(() => Promise.resolve([])),
  setScheduleTimeWindow: jest.fn(),
  getScheduleTimeWindowHistory: jest.fn(),
}));

jest.mock("../../StudioAuth", () => ({
  useStudioAuth: jest.fn(),
}));

const ALICE = { student_id: "stu_alice", clean_id: "stu001", display_name: "Alice", group: "A", is_active: true };
const BOB = { student_id: "stu_bob", clean_id: "stu002", display_name: "Bob", group: "", is_active: true };

async function renderList(students = [ALICE, BOB]) {
  listStudents.mockResolvedValue(students);
  render(<StudentManager />);
  await waitFor(() => expect(listStudents).toHaveBeenCalled());
  // wait for the table to actually paint the seeded rows
  await screen.findByTestId(`student-row-${students[0].clean_id}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  useStudioAuth.mockReturnValue({ signOut: jest.fn() });
  listPasswordResetRequests.mockResolvedValue([]);
  // ScheduleTimeWindowsPanel (rendered by StudentManager alongside the
  // Schedule A/B assignment controls under test) fetches on mount — CRA's
  // jest config resets mock implementations before each test, so this
  // must be set here, not in the jest.mock() factory above.
  listScheduleTimeWindows.mockResolvedValue([]);
});

describe("StudentManager — Schedule A/B assignment (item 1)", () => {
  test("changing a student's schedule to an updated outcome calls the real endpoint and refreshes", async () => {
    assignStudentSchedule.mockResolvedValue({ outcome: "updated", new_schedule: "B" });
    await renderList();

    fireEvent.change(screen.getByTestId("student-schedule-select-stu002"), { target: { value: "B" } });

    await waitFor(() => expect(assignStudentSchedule).toHaveBeenCalledWith(
      "stu_bob", { schedule: "B", confirm: false },
    ));
    await waitFor(() => expect(listStudents).toHaveBeenCalledTimes(2)); // initial + refresh
  });

  test("a no-op (same value) never calls the endpoint at all", async () => {
    await renderList();
    fireEvent.change(screen.getByTestId("student-schedule-select-stu001"), { target: { value: "A" } });
    expect(assignStudentSchedule).not.toHaveBeenCalled();
  });

  test("confirmation_required shows a confirm dialog, and confirming retries with confirm:true", async () => {
    assignStudentSchedule
      .mockResolvedValueOnce({ outcome: "confirmation_required", new_schedule: "B" })
      .mockResolvedValueOnce({ outcome: "updated", new_schedule: "B" });
    await renderList();

    fireEvent.change(screen.getByTestId("student-schedule-select-stu001"), { target: { value: "B" } });
    expect(await screen.findByTestId("confirm-schedule-reassign")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confirm-schedule-reassign-confirm"));

    await waitFor(() => expect(assignStudentSchedule).toHaveBeenLastCalledWith(
      "stu_alice", { schedule: "B", confirm: true },
    ));
    await waitFor(() => expect(screen.queryByTestId("confirm-schedule-reassign")).not.toBeInTheDocument());
  });

  test("blocked_active_elsewhere shows an info-only dialog with NO confirm/bypass button", async () => {
    assignStudentSchedule.mockResolvedValue({
      outcome: "blocked_active_elsewhere", reason: "active_entry_in_session:sess_123",
    });
    await renderList();

    fireEvent.change(screen.getByTestId("student-schedule-select-stu001"), { target: { value: "B" } });
    expect(await screen.findByTestId("student-schedule-blocked")).toBeInTheDocument();

    // The safety-critical assertion: there is no "confirm anyway" path for
    // this outcome — only a plain dismiss button exists.
    expect(screen.queryByTestId("student-schedule-blocked-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-schedule-blocked-dismiss")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("student-schedule-blocked-dismiss"));
    expect(screen.queryByTestId("student-schedule-blocked")).not.toBeInTheDocument();
    // still only the ONE original call — confirm was never retried automatically
    expect(assignStudentSchedule).toHaveBeenCalledTimes(1);
  });

  test("bulk: selecting students and applying calls the bulk endpoint with the right ids/schedule", async () => {
    bulkAssignStudentSchedule.mockResolvedValue({
      results: [
        { student_id: "stu_alice", outcome: "updated" },
        { student_id: "stu_bob", outcome: "updated" },
      ],
    });
    await renderList();

    fireEvent.click(screen.getByTestId("student-select-stu001"));
    fireEvent.click(screen.getByTestId("student-select-stu002"));
    expect(screen.getByTestId("student-bulk-schedule-bar")).toHaveTextContent("2 selected");

    fireEvent.change(screen.getByTestId("student-bulk-schedule-select"), { target: { value: "B" } });
    fireEvent.click(screen.getByTestId("student-bulk-schedule-apply"));

    await waitFor(() => expect(bulkAssignStudentSchedule).toHaveBeenCalledWith({
      studentIds: expect.arrayContaining(["stu_alice", "stu_bob"]),
      schedule: "B", confirm: false,
    }));
    expect(await screen.findByTestId("student-bulk-schedule-result")).toBeInTheDocument();
  });

  test("bulk: some students needing confirmation shows a bulk confirm dialog before retrying", async () => {
    bulkAssignStudentSchedule
      .mockResolvedValueOnce({ results: [{ student_id: "stu_alice", outcome: "confirmation_required" }] })
      .mockResolvedValueOnce({ results: [{ student_id: "stu_alice", outcome: "updated" }] });
    await renderList();

    fireEvent.click(screen.getByTestId("student-select-stu001"));
    fireEvent.click(screen.getByTestId("student-bulk-schedule-apply"));

    expect(await screen.findByTestId("confirm-bulk-schedule-reassign")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-bulk-schedule-reassign-confirm"));

    await waitFor(() => expect(bulkAssignStudentSchedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirm: true }),
    ));
    expect(await screen.findByTestId("student-bulk-schedule-result")).toBeInTheDocument();
  });

  test("bulk result summary reports blocked students by clean_id, never silently drops them", async () => {
    bulkAssignStudentSchedule.mockResolvedValue({
      results: [
        { student_id: "stu_alice", outcome: "updated" },
        { student_id: "stu_bob", outcome: "blocked_active_elsewhere", reason: "active_entry_in_session:s1" },
      ],
    });
    await renderList();
    fireEvent.click(screen.getByTestId("student-select-stu001"));
    fireEvent.click(screen.getByTestId("student-select-stu002"));
    fireEvent.click(screen.getByTestId("student-bulk-schedule-apply"));

    const summary = await screen.findByTestId("student-bulk-schedule-result");
    expect(within(summary).getByText(/1 blocked/i)).toBeInTheDocument();
    expect(within(summary).getByText(/stu002/)).toBeInTheDocument();
  });
});
