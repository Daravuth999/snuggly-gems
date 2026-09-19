/**
 * StudentManager.reuseSlotPurge.test.jsx — Teacher Studio round, item 3.
 *
 * The CreateForm "different, new student — wipe history" checkbox only
 * appears when reusing a genuinely inactive slot, defaults to unchecked
 * (today's existing "same student returning" behavior stays the default),
 * and its value is threaded through to createStudent() exactly as checked.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentManager from "../StudentManager";
import {
  listStudents,
  createStudent,
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
const RETIRED = { student_id: "stu_old", clean_id: "stu003", display_name: "Charlie (left)", group: "B", is_active: false };

async function renderList(students = [ALICE, RETIRED]) {
  listStudents.mockResolvedValue(students);
  render(<StudentManager />);
  await waitFor(() => expect(listStudents).toHaveBeenCalled());
  await screen.findByTestId(`student-row-${students[0].clean_id}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  useStudioAuth.mockReturnValue({ signOut: jest.fn() });
  listPasswordResetRequests.mockResolvedValue([]);
  // ScheduleTimeWindowsPanel (rendered by StudentManager alongside the
  // Schedule A/B assignment controls) fetches on mount — CRA's jest
  // config resets mock implementations before each test, so this must
  // be set here, not in the jest.mock() factory above.
  listScheduleTimeWindows.mockResolvedValue([]);
});

describe("StudentManager — CreateForm reuse-slot purge checkbox (item 3)", () => {
  test("the notice and checkbox only appear when the typed ID matches an INACTIVE student", async () => {
    await renderList();
    fireEvent.click(screen.getByTestId("student-new-btn"));

    expect(screen.queryByTestId("student-reuse-slot-notice")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: RETIRED.clean_id } });
    expect(await screen.findByTestId("student-reuse-slot-notice")).toBeInTheDocument();
    expect(screen.getByTestId("student-create-purge-checkbox")).not.toBeChecked();
  });

  test("typing an ACTIVE student's id never shows the reuse notice", async () => {
    await renderList();
    fireEvent.click(screen.getByTestId("student-new-btn"));
    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: ALICE.clean_id } });
    expect(screen.queryByTestId("student-reuse-slot-notice")).not.toBeInTheDocument();
  });

  test("submitting with the checkbox UNCHECKED (default) passes purgePreviousHistory:false", async () => {
    createStudent.mockResolvedValue({ student_id: "stu_new", clean_id: "stu003", display_name: "New Person", password: "x" });
    await renderList();
    fireEvent.click(screen.getByTestId("student-new-btn"));
    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: RETIRED.clean_id } });
    fireEvent.change(screen.getByTestId("student-create-name"), { target: { value: "New Person" } });
    await screen.findByTestId("student-reuse-slot-notice");

    fireEvent.click(screen.getByTestId("student-create-submit"));

    await waitFor(() => expect(createStudent).toHaveBeenCalledWith(expect.objectContaining({
      purgePreviousHistory: false,
    })));
  });

  test("checking the box and submitting passes purgePreviousHistory:true", async () => {
    createStudent.mockResolvedValue({ student_id: "stu_new", clean_id: "stu003", display_name: "New Person", password: "x" });
    await renderList();
    fireEvent.click(screen.getByTestId("student-new-btn"));
    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: RETIRED.clean_id } });
    fireEvent.change(screen.getByTestId("student-create-name"), { target: { value: "New Person" } });
    await screen.findByTestId("student-reuse-slot-notice");
    fireEvent.click(screen.getByTestId("student-create-purge-checkbox"));

    fireEvent.click(screen.getByTestId("student-create-submit"));

    await waitFor(() => expect(createStudent).toHaveBeenCalledWith(expect.objectContaining({
      purgePreviousHistory: true,
    })));
  });

  test("clearing the ID after checking the box resets the choice, never silently carrying it over", async () => {
    await renderList();
    fireEvent.click(screen.getByTestId("student-new-btn"));
    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: RETIRED.clean_id } });
    await screen.findByTestId("student-reuse-slot-notice");
    fireEvent.click(screen.getByTestId("student-create-purge-checkbox"));
    expect(screen.getByTestId("student-create-purge-checkbox")).toBeChecked();

    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: "brand-new-id" } });
    await waitFor(() => expect(screen.queryByTestId("student-reuse-slot-notice")).not.toBeInTheDocument());

    fireEvent.change(screen.getByTestId("student-create-id"), { target: { value: RETIRED.clean_id } });
    await screen.findByTestId("student-reuse-slot-notice");
    expect(screen.getByTestId("student-create-purge-checkbox")).not.toBeChecked();
  });
});
